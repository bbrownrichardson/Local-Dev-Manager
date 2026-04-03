// ── Ports & Tunnels ───────────────────────────────────────────────
// NOTE: All user-provided values are escaped via esc() before HTML insertion,
// consistent with the rest of the codebase (see git.js, sidebar.js, etc.).
(function () {
  const S = App.state;
  const { esc } = App.utils;

  var httpLikePorts = new Set([80, 443, 3000, 3001, 3002, 4000, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8443, 8888, 9000, 9229]);

  function isHttpPort(port) {
    return httpLikePorts.has(port) || (port >= 3000 && port <= 9999);
  }

  async function renderPortsPanel() {
    var panel = document.getElementById('ports-panel');
    if (!panel) return;
    var ports = await window.api.getPorts();
    var html = '<div class="ports-header">'
      + '<button id="btn-refresh-ports" class="btn-icon" title="Refresh">&#x21bb;</button>'
      + '</div>';
    if (!ports || ports.length === 0) {
      html += '<div class="ports-empty">No listening ports detected.</div>';
    } else {
      html += '<div class="ports-list">';
      for (var i = 0; i < ports.length; i++) {
        var p = ports[i];
        var rowId = 'port-row-' + p.port + '-' + i;
        html += '<div class="port-row" id="' + esc(rowId) + '">'
          + '<span class="port-number">' + esc(String(p.port)) + '</span>'
          + '<span class="port-process">' + esc(p.name || 'unknown') + '</span>'
          + '<span class="port-pid">' + esc(String(p.pid || '')) + '</span>'
          + '<span class="port-actions">';
        if (isHttpPort(p.port)) {
          html += '<button class="btn-port-open btn-icon" data-port="' + esc(String(p.port)) + '" title="Open in browser">Open</button>';
        }
        html += '<button class="btn-port-kill btn-icon" data-port="' + esc(String(p.port)) + '" data-row="' + esc(rowId) + '" title="Kill process">Kill</button>';
        html += '</span></div>';
      }
      html += '</div>';
    }
    panel.innerHTML = html;

    var refreshBtn = document.getElementById('btn-refresh-ports');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        renderPortsPanel();
      });
    }

    panel.querySelectorAll('.btn-port-open').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var port = btn.getAttribute('data-port');
        window.api.openUrl('http://localhost:' + port);
      });
    });

    panel.querySelectorAll('.btn-port-kill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var port = parseInt(btn.getAttribute('data-port'), 10);
        var rowId = btn.getAttribute('data-row');
        window.api.killPort(null, port);
        var row = document.getElementById(rowId);
        if (row) row.style.opacity = '0.3';
        setTimeout(function () { renderPortsPanel(); }, 800);
      });
    });
  }

  function updateTunnelUI(url, provider, status) {
    var label = document.getElementById('tunnel-btn-label');
    var urlArea = document.getElementById('tunnel-url-area');
    var urlEl = document.getElementById('tunnel-url');
    var dot = document.getElementById('tunnel-dot');

    if (status === 'connected') {
      if (label) label.textContent = 'Disconnect';
      if (urlArea) urlArea.style.display = '';
      if (urlEl) { urlEl.textContent = url || ''; urlEl.href = url || '#'; }
      if (dot) { dot.className = 'tunnel-dot connected'; }
    } else if (status === 'connecting') {
      if (label) label.textContent = 'Connecting\u2026';
      if (urlArea) urlArea.style.display = 'none';
      if (dot) { dot.className = 'tunnel-dot connecting'; }
    } else {
      if (label) label.textContent = 'Start Tunnel';
      if (urlArea) urlArea.style.display = 'none';
      if (dot) { dot.className = 'tunnel-dot disconnected'; }
    }
  }

  async function checkPortConflicts() {
    var conflicts = await window.api.detectPortConflicts(S.projects);
    if (!conflicts || conflicts.length === 0) return;
    var proj = S.projects.find(function (p) { return p.id === S.selectedId; });
    if (!proj) return;
    var relevant = conflicts.filter(function (c) { return c.projectId === S.selectedId; });
    if (relevant.length === 0) return;
    var meta = document.getElementById('detail-meta');
    if (!meta) return;
    var html = '<div class="port-conflict-warning">';
    for (var i = 0; i < relevant.length; i++) {
      var c = relevant[i];
      html += '<div>Port ' + esc(String(c.port)) + ' is also used by '
        + esc(c.conflictsWith) + '</div>';
    }
    html += '</div>';
    meta.insertAdjacentHTML('afterend', html);
  }

  // ── IPC listener ────────────────────────────────────────────────
  window.api.onTunnelStatus(function (data) {
    if (data.projectId === S.selectedId) {
      updateTunnelUI(data.url, data.provider, data.status);
    }
  });

  App.ports = { renderPortsPanel: renderPortsPanel, updateTunnelUI: updateTunnelUI, checkPortConflicts: checkPortConflicts };
})();
