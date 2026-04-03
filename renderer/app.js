// ── App Orchestrator ──────────────────────────────────────────────
// NOTE: All dynamic content in innerHTML is sanitized through esc() which
// uses textContent assignment for XSS-safe HTML escaping.
(function () {
  const S = App.state;
  const { esc, linkifyLog, showCtxMenu, formatTimeAgo, getCommandsSummary } = App.utils;
  const icons = App.icons;

  async function init() {
    S.projects = await window.api.getProjects();
    S.profiles = await window.api.getProfiles();
    const runningIds = await window.api.getRunningIds();
    runningIds.forEach(id => { S.statuses[id] = 'running'; });
    App.sidebar.renderSidebar();
    App.sidebar.renderProfiles();
    if (S.projects.length > 0) selectProject(S.projects[0].id);

    refreshGitStatuses();
    setInterval(refreshGitStatuses, 30000);
    setInterval(refreshResources, 5000);
  }

  async function refreshGitStatuses() {
    for (const p of S.projects) {
      if (p.path) {
        const git = await window.api.getGitStatus(p.path);
        if (git) S.gitCache[p.id] = git;
      }
    }
    App.sidebar.renderSidebar();
  }

  async function refreshResources() {
    for (const p of S.projects) {
      if (S.statuses[p.id] === 'running') {
        const stats = await window.api.getResourceStats(p.id);
        if (stats) S.resourceCache[p.id] = stats;
      } else {
        delete S.resourceCache[p.id];
      }
    }
    if (S.selectedId && S.statuses[S.selectedId] === 'running') renderDetailMeta();
  }

  function selectProject(id) { S.selectedId = id; App.sidebar.renderSidebar(); renderDetail(); }

  function renderDetailMeta() {
    const metaEl = document.getElementById('detail-meta');
    if (!metaEl) return;
    const p = S.projects.find(p => p.id === S.selectedId);
    if (!p) return;
    const stats = S.resourceCache[p.id];
    const statsHtml = stats ? '<div class="meta-item"><span class="resource-badge ' + (stats.cpu > 80 ? 'warn' : '') + '">CPU ' + stats.cpu + '%</span><span class="resource-badge ' + (stats.memMB > 500 ? 'warn' : '') + '">MEM ' + stats.memMB + 'MB</span></div>' : '';
    const git = S.gitCache[p.id];
    const gitHtml = git ? '<div class="meta-item"><span class="meta-label">Git:</span><span>' + esc(git.branch) + (git.dirty ? ' (' + git.changes + ' changes)' : '') + '</span></div>' : '';
    metaEl.innerHTML =
      '<div class="meta-item"><span class="meta-label">Path:</span><span>' + esc(p.path) + '</span></div>' +
      '<div class="meta-item"><span class="meta-label">Cmds:</span><span>' + esc(getCommandsSummary(p)) + '</span></div>' +
      (p.url ? '<div class="meta-item"><span class="meta-label">URL:</span><span>' + esc(p.url) + '</span></div>' : '') +
      (p.lastStarted ? '<div class="meta-item"><span class="meta-label">Last started:</span><span>' + formatTimeAgo(p.lastStarted) + '</span></div>' : '') +
      gitHtml + statsHtml +
      ((p.url && S.statuses[p.id] === 'running') ? '<div class="meta-item" id="health-indicator"><span class="meta-label">Health:</span><span style="color:var(--text-dim);">checking...</span></div>' : '');
  }

  function renderDetail() {
    const p = S.projects.find(p => p.id === S.selectedId);
    if (!p) return;
    const hasCommand = !!(p.command || (p.commands && p.commands.length > 0));
    const status = S.statuses[p.id] || 'stopped';
    const isRunning = status === 'running';
    if (!hasCommand && S.activeDetailTab === 'output') S.activeDetailTab = 'terminal';
    const panel = document.getElementById('project-detail');

    panel.innerHTML =
      '<div class="detail-header">' +
        '<h1>' + (p.icon ? '<span style="margin-right:6px;">' + p.icon + '</span>' : '') + esc(p.name) + '</h1>' +
        (hasCommand ? '<span class="status-badge ' + status + '"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>' + status.charAt(0).toUpperCase() + status.slice(1) + '</span>' : '<span class="status-badge" style="opacity:0.45;">Workspace</span>') +
        '<div class="detail-actions">' +
          (hasCommand ? (isRunning
            ? '<button class="btn btn-stop" id="btn-toggle">' + icons.stop + ' Stop</button>'
            : '<button class="btn btn-start" id="btn-toggle">' + icons.play + ' Start</button>') : '') +
          (hasCommand && isRunning ? '<button class="btn btn-restart" id="btn-restart">' + icons.restart + ' Restart</button>' : '') +
          '<div class="action-divider"></div>' +
          (p.url ? '<button class="btn btn-open" id="btn-open"' + (!isRunning ? ' disabled' : '') + '>' + icons.open + ' Open</button>' : '') +
          '<div class="action-divider"></div>' +
          '<div class="btn-group">' +
            '<button class="btn" id="btn-edit-project">' + icons.edit + ' Edit</button>' +
            '<button class="btn" id="btn-clone-project">' + icons.clone + ' Clone</button>' +
            '<button class="btn btn-danger" id="btn-delete-project">' + icons.trash + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-meta" id="detail-meta"></div>' +
      (p.url ? '<div class="tunnel-bar" id="tunnel-bar">' +
        '<button class="btn tunnel-btn" id="btn-tunnel"' + (!isRunning ? ' disabled title="Start the project first"' : '') + '>' +
          '<span class="tunnel-icon">&#x1F310;</span> <span id="tunnel-btn-label">Tunnel</span>' +
        '</button>' +
        '<div class="tunnel-url-area" id="tunnel-url-area" style="display:none;">' +
          '<span class="tunnel-status-dot" id="tunnel-dot"></span>' +
          '<code class="tunnel-url" id="tunnel-url"></code>' +
          '<button class="tunnel-copy" id="tunnel-copy" title="Copy URL">Copy</button>' +
          '<button class="tunnel-open" id="tunnel-open" title="Open in browser">&#x2197;</button>' +
        '</div>' +
      '</div>' : '') +
      '<div class="detail-tabs">' +
        (hasCommand ? '<button class="detail-tab ' + (S.activeDetailTab === 'output' ? 'active' : '') + '" data-tab="output">' + icons.play + ' Output' + (p.autoRestart ? ' (auto-restart)' : '') + '</button>' : '') +
        '<button class="detail-tab ' + (S.activeDetailTab === 'terminal' ? 'active' : '') + '" data-tab="terminal">' + icons.terminal + ' Terminal</button>' +
        '<button class="detail-tab ' + (S.activeDetailTab === 'scripts' ? 'active' : '') + '" data-tab="scripts">&#x26A1; Scripts</button>' +
        '<button class="detail-tab ' + (S.activeDetailTab === 'deps' ? 'active' : '') + '" data-tab="deps">&#x1F4E6; Deps</button>' +
        '<button class="detail-tab ' + (S.activeDetailTab === 'git' ? 'active' : '') + '" data-tab="git">' + (icons.git || '&#x238B;') + ' Git</button>' +
        '<button class="detail-tab ' + (S.activeDetailTab === 'env' ? 'active' : '') + '" data-tab="env">&#x1F527; Env</button>' +
        '<div style="flex:1;"></div>' +
        '<div class="tab-controls" id="tab-controls"></div>' +
      '</div>' +
      '<div class="tab-content" id="tab-content-output" style="display:' + (S.activeDetailTab === 'output' ? 'flex' : 'none') + ';">' +
        '<div class="log-viewer" id="log-viewer"></div>' +
      '</div>' +
      '<div class="tab-content" id="tab-content-terminal" style="display:' + (S.activeDetailTab === 'terminal' ? 'flex' : 'none') + ';">' +
        '<div class="terminal-tabs-bar" id="terminal-tabs-bar"></div>' +
        '<div class="terminal-search-bar" id="terminal-search-bar" style="display:none;">' +
          '<input type="text" id="terminal-search-input" placeholder="Find in terminal..." spellcheck="false" />' +
          '<span class="terminal-search-count" id="terminal-search-count"></span>' +
          '<button id="terminal-search-prev" title="Previous (Shift+Enter)">&#x25B2;</button>' +
          '<button id="terminal-search-next" title="Next (Enter)">&#x25BC;</button>' +
          '<button id="terminal-search-close" title="Close (Esc)">&times;</button>' +
        '</div>' +
        '<div class="terminal-container" id="terminal-container"></div>' +
      '</div>' +
      '<div class="tab-content" id="tab-content-scripts" style="display:' + (S.activeDetailTab === 'scripts' ? 'flex' : 'none') + ';">' +
        '<div class="scripts-panel" id="scripts-panel"><div class="terminal-placeholder">Loading scripts...</div></div>' +
      '</div>' +
      '<div class="tab-content" id="tab-content-deps" style="display:' + (S.activeDetailTab === 'deps' ? 'flex' : 'none') + ';">' +
        '<div class="deps-panel" id="deps-panel"><div class="terminal-placeholder">Loading dependencies...</div></div>' +
      '</div>' +
      '<div class="tab-content" id="tab-content-git" style="display:' + (S.activeDetailTab === 'git' ? 'flex' : 'none') + ';">' +
        '<div class="git-panel" id="git-panel"><div class="terminal-placeholder">Loading git status...</div></div>' +
      '</div>' +
      '<div class="tab-content" id="tab-content-env" style="display:' + (S.activeDetailTab === 'env' ? 'flex' : 'none') + ';">' +
        '<div class="env-panel" id="env-panel"><div class="terminal-placeholder">Loading environment...</div></div>' +
      '</div>';

    renderDetailMeta();
    if (p.url && isRunning) runHealthCheck(p.url);

    renderTabControls(p);

    // Tab switching
    panel.querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        S.activeDetailTab = tab.dataset.tab;
        panel.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === S.activeDetailTab));
        ['output', 'terminal', 'scripts', 'deps', 'git', 'env'].forEach(t => {
          const el = document.getElementById('tab-content-' + t);
          if (el) el.style.display = S.activeDetailTab === t ? 'flex' : 'none';
        });
        renderTabControls(p);
        if (S.activeDetailTab === 'terminal') requestAnimationFrame(() => App.terminal.initTerminal(p));
        if (S.activeDetailTab === 'output') {
          const viewer = document.getElementById('log-viewer');
          if (viewer) App.logs.renderLogs(p.id, viewer);
        }
        if (S.activeDetailTab === 'scripts') App.scripts.renderScriptsPanel(p);
        if (S.activeDetailTab === 'deps') App.deps.renderDepsPanel(p);
        if (S.activeDetailTab === 'git') App.git.renderGitPanel(p);
        if (S.activeDetailTab === 'env') App.env.renderEnvPanel(p);
      });
    });

    const viewer = document.getElementById('log-viewer');
    App.logs.renderLogs(p.id, viewer);

    if (viewer) {
      viewer.addEventListener('click', (e) => {
        const link = e.target.closest('.log-link');
        if (link) { e.preventDefault(); window.api.openUrl(link.dataset.url); }
      });
    }

    if (viewer) {
      viewer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const selected = window.getSelection().toString();
        showCtxMenu(e.clientX, e.clientY, [
          ...(selected ? [{ label: 'Copy Selected', action: () => navigator.clipboard.writeText(selected) }] : []),
          { label: 'Copy All', action: () => navigator.clipboard.writeText(viewer.textContent) },
          '---',
          { label: 'Clear', action: () => { S.logBuffers[p.id] = []; viewer.innerHTML = ''; }},
        ]);
      });
    }

    if (S.activeDetailTab === 'terminal') App.terminal.initTerminal(p);
    if (S.activeDetailTab === 'scripts') App.scripts.renderScriptsPanel(p);
    if (S.activeDetailTab === 'deps') App.deps.renderDepsPanel(p);
    if (S.activeDetailTab === 'git') App.git.renderGitPanel(p);
    if (S.activeDetailTab === 'env') App.env.renderEnvPanel(p);

    App.ports.checkPortConflicts();

    const btnToggle = document.getElementById('btn-toggle');
    if (btnToggle) btnToggle.addEventListener('click', async () => {
      if (isRunning) { await window.api.stopProject(p.id); }
      else { S.logBuffers[p.id] = []; if (viewer) viewer.textContent = ''; await window.api.startProject(p); }
    });

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) btnRestart.addEventListener('click', async () => {
      await window.api.stopProject(p.id);
      S.logBuffers[p.id] = [];
      setTimeout(async () => { await window.api.startProject(p); }, 500);
    });

    const btnOpen = document.getElementById('btn-open');
    if (btnOpen) btnOpen.addEventListener('click', () => window.api.openUrl(p.url));

    document.getElementById('btn-edit-project').addEventListener('click', () => App.modal.openModal(p));
    document.getElementById('btn-clone-project').addEventListener('click', () => App.modal.cloneProject(p));
    document.getElementById('btn-delete-project').addEventListener('click', () => App.modal.deleteProject(p.id));

    // Tunnel
    const btnTunnel = document.getElementById('btn-tunnel');
    if (btnTunnel) {
      window.api.getTunnelStatus(p.id).then(s => {
        if (s.active) App.ports.updateTunnelUI(s.url, s.provider, 'connected');
      });
      window.api.detectTunnelProvider().then(r => {
        const label = document.getElementById('tunnel-btn-label');
        if (label && !label.textContent.includes('...')) {
          if (r.provider) label.textContent = 'Tunnel (' + r.provider + ')';
          else { label.textContent = 'Tunnel (none)'; btnTunnel.disabled = true; btnTunnel.title = 'Install cloudflared or ngrok to use tunnels'; }
        }
      });

      btnTunnel.addEventListener('click', async () => {
        const label = document.getElementById('tunnel-btn-label');
        const tunnelStatus = await window.api.getTunnelStatus(p.id);
        if (tunnelStatus.active) {
          await window.api.stopTunnel(p.id);
          App.ports.updateTunnelUI(null, null, 'disconnected');
        } else {
          let port = 3000;
          try { port = new URL(p.url).port || 3000; } catch (_) {}
          label.textContent = 'Connecting...';
          btnTunnel.disabled = true;
          const result = await window.api.startTunnel(p.id, port);
          btnTunnel.disabled = false;
          if (result.error) {
            label.textContent = '\u26A0 ' + result.error;
            label.style.color = 'var(--red)';
            setTimeout(() => { label.textContent = 'Tunnel'; label.style.color = ''; }, 4000);
          } else {
            App.ports.updateTunnelUI(null, result.provider, 'connecting');
          }
        }
      });

      var copyBtn = document.getElementById('tunnel-copy');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        var url = document.getElementById('tunnel-url').textContent;
        if (url) {
          navigator.clipboard.writeText(url);
          copyBtn.textContent = '\u2713';
          copyBtn.style.color = 'var(--green)';
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = ''; }, 1500);
        }
      });

      var openBtn = document.getElementById('tunnel-open');
      if (openBtn) openBtn.addEventListener('click', () => {
        var url = document.getElementById('tunnel-url').textContent;
        if (url) window.api.openUrl(url);
      });
    }
  }

  function renderTabControls(p) {
    const controls = document.getElementById('tab-controls');
    if (!controls) return;
    if (S.activeDetailTab === 'output') {
      controls.innerHTML =
        '<input class="log-search" id="log-search" placeholder="Filter logs..." value="' + esc(S.logFilter) + '" />' +
        '<button class="btn btn-edit" id="btn-clear-logs" style="padding:4px 10px;font-size:10px;">Clear</button>';
      document.getElementById('btn-clear-logs').addEventListener('click', () => {
        S.logBuffers[p.id] = [];
        var lv = document.getElementById('log-viewer');
        if (lv) lv.innerHTML = '';
      });
      document.getElementById('log-search').addEventListener('input', (e) => {
        S.logFilter = e.target.value;
        var lv = document.getElementById('log-viewer');
        App.logs.renderLogs(p.id, lv);
      });
    } else if (S.activeDetailTab === 'terminal') {
      var state = App.terminal.ensureProjectTabs(p.id);
      var activeTermId = state.activeTab;
      controls.innerHTML =
        '<button class="btn btn-edit" id="btn-kill-terminal" style="padding:4px 10px;font-size:10px;">Kill</button>' +
        '<button class="btn btn-edit" id="btn-restart-terminal" style="padding:4px 10px;font-size:10px;">Restart</button>';
      document.getElementById('btn-kill-terminal').addEventListener('click', async () => {
        await window.api.destroyTerminal(activeTermId);
        if (S.activeTerminals[activeTermId]) {
          try { S.activeTerminals[activeTermId].term.dispose(); } catch (_) {}
          if (S.activeTerminals[activeTermId].resizeObserver) S.activeTerminals[activeTermId].resizeObserver.disconnect();
          delete S.activeTerminals[activeTermId];
        }
        var container = document.getElementById('terminal-container');
        if (container) container.innerHTML = '<div class="terminal-placeholder">Terminal killed. Click <b>Restart</b> or add a new tab.</div>';
      });
      document.getElementById('btn-restart-terminal').addEventListener('click', async () => {
        await window.api.destroyTerminal(activeTermId);
        if (S.activeTerminals[activeTermId]) {
          try { S.activeTerminals[activeTermId].term.dispose(); } catch (_) {}
          if (S.activeTerminals[activeTermId].resizeObserver) S.activeTerminals[activeTermId].resizeObserver.disconnect();
          delete S.activeTerminals[activeTermId];
        }
        await App.terminal.mountTerminal(p, activeTermId);
      });
    } else if (S.activeDetailTab === 'scripts') {
      controls.innerHTML = '<button class="btn btn-edit" id="btn-refresh-scripts" style="padding:4px 10px;font-size:10px;">Refresh</button>';
      document.getElementById('btn-refresh-scripts').addEventListener('click', () => App.scripts.renderScriptsPanel(p));
    } else if (S.activeDetailTab === 'deps') {
      controls.innerHTML = '';
    } else if (S.activeDetailTab === 'git') {
      controls.innerHTML = '<button class="btn btn-edit" id="btn-refresh-git" style="padding:4px 10px;font-size:10px;">Refresh</button>';
      document.getElementById('btn-refresh-git').addEventListener('click', () => App.git.renderGitPanel(p));
    } else if (S.activeDetailTab === 'env') {
      controls.innerHTML = '<button class="btn btn-edit" id="btn-refresh-env" style="padding:4px 10px;font-size:10px;">Refresh</button>';
      document.getElementById('btn-refresh-env').addEventListener('click', () => App.env.renderEnvPanel(p));
    }
  }

  function updateView() {
    ['projects', 'logs', 'ports', 'syslog'].forEach(view => {
      var btn = document.getElementById('btn-view-' + view);
      if (!btn) return;
      var active = S.currentView === view;
      btn.style.background = active ? 'var(--accent)' : '';
      btn.style.borderColor = active ? 'var(--accent)' : '';
      btn.style.color = active ? '#fff' : '';
    });

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('project-detail').style.display = S.currentView === 'projects' && S.projects.length ? 'flex' : 'none';
    document.getElementById('ports-panel').style.display = S.currentView === 'ports' ? 'block' : 'none';
    document.getElementById('unified-logs-panel').style.display = S.currentView === 'logs' ? 'flex' : 'none';
    document.getElementById('syslog-panel').style.display = S.currentView === 'syslog' ? 'flex' : 'none';
    if (!S.projects.length && S.currentView === 'projects') document.getElementById('empty-state').style.display = 'flex';
    if (S.currentView === 'ports') App.ports.renderPortsPanel();
    if (S.currentView === 'syslog') App.logs.renderSyslog();
  }

  async function runHealthCheck(url) {
    var el = document.getElementById('health-indicator');
    if (!el) return;
    try {
      var result = await window.api.checkHealth(url);
      if (result && result.ok) {
        el.innerHTML = '<span class="meta-label">Health:</span><span class="resource-badge" style="color:var(--green);">UP ' + result.responseTime + 'ms</span>';
      } else if (result) {
        el.innerHTML = '<span class="meta-label">Health:</span><span class="resource-badge" style="color:var(--red);">DOWN ' + (result.statusCode || '') + '</span>';
      }
    } catch (_) {
      el.innerHTML = '<span class="meta-label">Health:</span><span class="resource-badge" style="color:var(--text-dim);">unknown</span>';
    }
  }

  // ── IPC listeners ───────────────────────────────────────────────
  window.api.onProjectStatus(async ({ id, status }) => {
    S.statuses[id] = status;
    if (status === 'running') S.projects = await window.api.getProjects();
    App.sidebar.renderSidebar();
    if (id === S.selectedId) renderDetail();
  });

  window.api.onProjectLog(({ id, line }) => {
    if (!S.logBuffers[id]) S.logBuffers[id] = [];
    S.logBuffers[id].push(line);
    if (S.logBuffers[id].length > 1000) S.logBuffers[id].shift();
    if (id === S.selectedId) {
      var lv = document.getElementById('log-viewer');
      if (lv) {
        if (!S.logFilter) { lv.innerHTML += linkifyLog(esc(line)); }
        else { App.logs.renderLogs(id, lv); }
        lv.scrollTop = lv.scrollHeight;
      }
    }
    var proj = S.projects.find(p => p.id === id);
    if (proj) {
      S.unifiedLogs.push({ projectName: proj.name, projectColor: proj.color || 'var(--accent)', text: line });
      if (S.unifiedLogs.length > 2000) S.unifiedLogs.shift();
      if (S.currentView === 'logs') App.logs.renderUnifiedLogs();
    }
  });

  // ── Static event bindings ───────────────────────────────────────
  document.getElementById('project-search').addEventListener('input', (e) => { S.projectSearch = e.target.value; App.sidebar.renderSidebar(); });

  document.getElementById('btn-start-all').addEventListener('click', async () => {
    for (const p of S.projects) {
      if (S.statuses[p.id] !== 'running') { S.logBuffers[p.id] = []; await window.api.startProject(p); }
    }
  });

  document.getElementById('btn-stop-all').addEventListener('click', async () => {
    for (const p of S.projects) { if (S.statuses[p.id] === 'running') await window.api.stopProject(p.id); }
  });

  document.getElementById('btn-view-projects').addEventListener('click', () => { S.currentView = 'projects'; updateView(); if (S.selectedId) renderDetail(); });
  document.getElementById('btn-view-logs').addEventListener('click', () => { S.currentView = 'logs'; updateView(); App.logs.renderUnifiedLogs(); });
  document.getElementById('btn-view-ports').addEventListener('click', () => { S.currentView = 'ports'; updateView(); });
  document.getElementById('btn-view-syslog').addEventListener('click', () => { S.currentView = 'syslog'; updateView(); });

  document.getElementById('btn-onboard-add')?.addEventListener('click', () => App.modal.openModal());

  document.getElementById('unified-log-search').addEventListener('input', (e) => { S.unifiedLogFilter = e.target.value; App.logs.renderUnifiedLogs(); });
  document.getElementById('btn-clear-unified-logs').addEventListener('click', () => { S.unifiedLogs.length = 0; App.logs.renderUnifiedLogs(); });

  // Settings modal
  document.getElementById('btn-settings').addEventListener('click', async () => {
    var settings = await window.api.getSettings();
    document.getElementById('settings-terminal').value = settings.terminal || 'Terminal';
    document.getElementById('settings-theme').value = settings.theme || 'dark';
    document.getElementById('settings-terminal-theme').value = settings.terminalTheme || 'system';
    document.getElementById('settings-notification-sound').checked = settings.notificationSound !== false;
    // Show app version
    window.api.getAppVersion().then(function (v) {
      var el = document.getElementById('settings-version');
      if (el) el.textContent = 'v' + v;
    });
    document.getElementById('settings-update-status').textContent = '';
    document.getElementById('settings-modal').style.display = 'flex';
  });
  document.getElementById('settings-check-update').addEventListener('click', function () {
    App.updater.checkUpdateFromSettings();
  });
  document.getElementById('settings-export').addEventListener('click', () => { App.settings.exportConfig(); });
  document.getElementById('settings-import').addEventListener('click', () => { App.settings.importConfig(); });
  document.getElementById('settings-cancel').addEventListener('click', () => { document.getElementById('settings-modal').style.display = 'none'; });
  document.getElementById('settings-save').addEventListener('click', async () => {
    var settings = await window.api.getSettings();
    settings.terminal = document.getElementById('settings-terminal').value;
    settings.theme = document.getElementById('settings-theme').value;
    settings.terminalTheme = document.getElementById('settings-terminal-theme').value;
    settings.notificationSound = document.getElementById('settings-notification-sound').checked;
    await window.api.saveSettings(settings);
    App.settings.applyTheme(settings.theme);
    S.terminalThemeSetting = settings.terminalTheme || 'system';
    App.terminal.applyTerminalTheme();
    document.getElementById('settings-modal').style.display = 'none';
  });

  App.app = { init, selectProject, renderDetail, renderDetailMeta, renderTabControls, updateView, runHealthCheck, refreshGitStatuses, refreshResources };

  // ── Bootstrap ───────────────────────────────────────────────────
  init();
})();
