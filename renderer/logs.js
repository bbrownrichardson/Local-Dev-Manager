// ── Logs ──────────────────────────────────────────────────────────
// NOTE: All user-provided values are escaped via esc() before HTML insertion,
// consistent with the rest of the codebase (see git.js, sidebar.js, etc.).
(function () {
  const S = App.state;
  const { esc, linkifyLog } = App.utils;

  function renderLogs(projectId, viewer) {
    if (!viewer) return;
    const logs = S.logBuffers[projectId] || [];
    if (!S.logFilter) {
      viewer.innerHTML = logs.map(function (line) { return linkifyLog(esc(line)); }).join('');
    } else {
      var re = new RegExp('(' + S.logFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      viewer.innerHTML = logs.map(function (line) {
        return linkifyLog(esc(line)).replace(re, '<span class="log-highlight">$1</span>');
      }).join('');
    }
    viewer.scrollTop = viewer.scrollHeight;
  }

  function renderSyslog() {
    if (!S.syslogsFetched) {
      S.syslogsFetched = true;
      window.api.getAppLogs().then(function (entries) {
        S.sysLogs = entries || [];
        renderSyslog();
      });
      return;
    }
    var container = document.getElementById('syslog-viewer');
    if (!container) return;
    var levelFilter = S.syslogLevelFilter || 'all';
    var search = (S.syslogSearch || '').toLowerCase();
    var filtered = S.sysLogs.filter(function (entry) {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (search && entry.message.toLowerCase().indexOf(search) === -1) return false;
      return true;
    });
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var entry = filtered[i];
      var d = new Date(entry.time);
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      var ss = String(d.getSeconds()).padStart(2, '0');
      var timeStr = hh + ':' + mm + ':' + ss;
      var lvl = entry.level || 'info';
      var badge = '';
      if (lvl === 'warn') {
        badge = '<span class="syslog-badge syslog-warn" style="color:#e5a800;">WRN</span>';
      } else if (lvl === 'error') {
        badge = '<span class="syslog-badge syslog-error" style="color:#e53e3e;">ERR</span>';
      } else {
        badge = '<span class="syslog-badge syslog-info" style="color:#3182ce;">INF</span>';
      }
      html += '<div class="syslog-entry">'
        + '<span class="syslog-time">' + esc(timeStr) + '</span> '
        + badge + ' '
        + '<span class="syslog-msg">' + esc(entry.message) + '</span>'
        + '</div>';
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  function renderUnifiedLogs() {
    var container = document.getElementById('unified-log-viewer');
    if (!container) return;
    var filter = (S.unifiedLogFilter || '').toLowerCase();
    var logs = S.unifiedLogs || [];
    var html = '';
    for (var i = 0; i < logs.length; i++) {
      var entry = logs[i];
      if (filter && entry.line.toLowerCase().indexOf(filter) === -1
        && entry.name.toLowerCase().indexOf(filter) === -1) continue;
      html += '<div class="unified-log-line">'
        + '<span class="unified-log-project" style="color:' + esc(entry.color || '#888') + ';">'
        + esc(entry.name) + '</span> '
        + linkifyLog(esc(entry.line))
        + '</div>';
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  // ── IPC listener ────────────────────────────────────────────────
  window.api.onAppLog(function (entry) {
    S.sysLogs.push(entry);
    if (S.sysLogs.length > 500) S.sysLogs.shift();
    if (S.currentView === 'syslog') renderSyslog();
  });

  // ── Syslog control wiring ──────────────────────────────────────
  setTimeout(function () {
    var levelSelect = document.getElementById('syslog-level-filter');
    if (levelSelect) {
      levelSelect.addEventListener('change', function () {
        S.syslogLevelFilter = levelSelect.value;
        renderSyslog();
      });
    }
    var searchInput = document.getElementById('syslog-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        S.syslogSearch = searchInput.value;
        renderSyslog();
      });
    }
    var clearBtn = document.getElementById('btn-clear-syslog');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        S.sysLogs = [];
        window.api.clearAppLogs();
        var container = document.getElementById('syslog-viewer');
        if (container) container.innerHTML = '<div class="syslog-entry"><span class="syslog-msg">Logs cleared.</span></div>';
      });
    }
  }, 100);

  App.logs = { renderLogs: renderLogs, renderSyslog: renderSyslog, renderUnifiedLogs: renderUnifiedLogs };
})();
