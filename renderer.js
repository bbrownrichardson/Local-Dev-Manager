  // ── State ────────────────────────────────────────────────────────
  let projects = [];
  let profiles = [];
  let selectedId = null;
  let editingId = null;
  let currentView = 'projects'; // 'projects' | 'ports'
  const statuses = {};
  const logBuffers = {};
  const gitCache = {};
  const resourceCache = {};
  let logFilter = '';
  let selectedColor = '';
  let autoRestart = false;
  let modalCommands = [];
  let dragSrcIdx = null;
  let projectSearch = '';
  let activeDetailTab = 'output'; // 'output' | 'terminal' | 'scripts' | 'deps' | 'git'
  const activeTerminals = {}; // terminalId -> { term, fitAddon, resizeObserver, projectId }
  const projectTerminalTabs = {}; // projectId -> { tabs: [{ id, label }], activeTab: terminalId, nextIdx: 1 }
  const MAX_TERMINALS = 5;
  const scriptOutputs = {}; // projectId:scriptName -> string
  const runningScriptKeys = new Set();
  const unifiedLogs = [];
  let unifiedLogFilter = '';

  // ── Context menu (shared) ────────────────────────────────────
  const ctxMenu = document.createElement('div');
  ctxMenu.id = 'ctx-menu';
  ctxMenu.className = 'ctx-menu';
  ctxMenu.style.display = 'none';
  document.body.appendChild(ctxMenu);

  function showCtxMenu(x, y, items) {
    ctxMenu.innerHTML = items.map((item, i) =>
      item === '---'
        ? `<div class="ctx-sep"></div>`
        : `<div class="ctx-item" data-idx="${i}">${item.label}</div>`
    ).join('');
    ctxMenu.style.display = 'block';
    // Position and clamp to viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = 180, h = items.length * 28 + 8;
    ctxMenu.style.left = (x + w > vw ? vw - w - 8 : x) + 'px';
    ctxMenu.style.top  = (y + h > vh ? vh - h - 8 : y) + 'px';
    ctxMenu.querySelectorAll('.ctx-item').forEach(el => {
      el.addEventListener('click', () => {
        hideCtxMenu();
        const item = items[parseInt(el.dataset.idx)];
        if (item && item.action) item.action();
      });
    });
  }
  function hideCtxMenu() { ctxMenu.style.display = 'none'; }
  document.addEventListener('click', hideCtxMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu(); });

  // ── Init ─────────────────────────────────────────────────────
  async function init() {
    projects = await window.api.getProjects();
    profiles = await window.api.getProfiles();
    const runningIds = await window.api.getRunningIds();
    runningIds.forEach(id => { statuses[id] = 'running'; });
    renderSidebar();
    renderProfiles();
    if (projects.length > 0) selectProject(projects[0].id);

    // Refresh git status + resources periodically
    refreshGitStatuses();
    setInterval(refreshGitStatuses, 30000);
    setInterval(refreshResources, 5000);
  }

  async function refreshGitStatuses() {
    for (const p of projects) {
      if (p.path) {
        const git = await window.api.getGitStatus(p.path);
        if (git) gitCache[p.id] = git;
      }
    }
    renderSidebar();
  }

  async function refreshResources() {
    for (const p of projects) {
      if (statuses[p.id] === 'running') {
        const stats = await window.api.getResourceStats(p.id);
        if (stats) resourceCache[p.id] = stats;
      } else {
        delete resourceCache[p.id];
      }
    }
    if (selectedId && statuses[selectedId] === 'running') renderDetailMeta();
  }

  // ── Sidebar ─────────────────────────────────────────────────
  function renderSidebar() {
    const list = document.getElementById('project-list');
    const filtered = projectSearch ? projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase())) : projects;
    list.innerHTML = filtered.map((p) => {
      const i = projects.indexOf(p);
      const git = gitCache[p.id];
      const gitHtml = git ? `<span class="git-badge ${git.dirty ? 'dirty' : ''}">${esc(git.branch)}${git.dirty ? ` +${git.changes}` : ''}</span>` : '';
      const isRunning = (statuses[p.id] || 'stopped') === 'running';
      return `
      <div class="project-item ${p.id === selectedId ? 'active' : ''}" data-id="${p.id}" data-idx="${i}" draggable="true">
        ${p.color ? `<div class="project-color-dot" style="background:${p.color}"></div>` : ''}
        <div class="project-dot ${(!p.command && !(p.commands && p.commands.length)) ? 'workspace' : (statuses[p.id] || 'stopped')}"></div>
        <div class="project-item-info">
          <div class="project-item-row-top">
            <div class="project-item-name">${p.icon ? `<span style="font-size:14px;margin-right:6px;">${p.icon}</span>` : ''}${esc(p.name)}</div>
            <div class="project-item-btns">
              ${p.command ? (isRunning
                ? `<button class="pib pib-stop" data-action="stop" title="Stop">&#9632;</button>
                   <button class="pib pib-restart" data-action="restart" title="Restart">↺</button>`
                : `<button class="pib pib-start" data-action="start" title="Start">&#9654;</button>`) : ''}
              ${p.url && isRunning ? `<button class="pib pib-open" data-action="open" title="Open in browser">↗</button>` : ''}
              <button class="pib pib-terminal" data-action="terminal" title="Terminal">$</button>
            </div>
          </div>
          ${gitHtml ? `<div class="project-item-branch">${gitHtml}</div>` : ''}
          <div class="project-item-cmd">${esc(getCommandsSummary(p))}</div>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.project-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.project-item-btns')) return; // don't select when clicking buttons
        currentView = 'projects'; updateView(); selectProject(el.dataset.id);
      });
      el.querySelectorAll('.pib').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = projects.find(p => p.id === el.dataset.id);
          if (!p) return;
          const action = btn.dataset.action;
          if (action === 'start') { logBuffers[p.id] = []; await window.api.startProject(p); }
          else if (action === 'stop') { await window.api.stopProject(p.id); }
          else if (action === 'restart') {
            await window.api.stopProject(p.id);
            logBuffers[p.id] = [];
            setTimeout(() => window.api.startProject(p), 500);
          }
          else if (action === 'open' && p.url) { window.api.openUrl(p.url); }
          else if (action === 'terminal') {
            currentView = 'projects'; updateView(); selectProject(p.id);
            activeDetailTab = 'terminal';
            renderDetail();
          }
        });
      });
      el.addEventListener('dragstart', (e) => { dragSrcIdx = parseInt(el.dataset.idx); e.dataTransfer.effectAllowed = 'move'; });
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault(); el.classList.remove('drag-over');
        const targetIdx = parseInt(el.dataset.idx);
        if (dragSrcIdx !== null && dragSrcIdx !== targetIdx) {
          const [moved] = projects.splice(dragSrcIdx, 1);
          projects.splice(targetIdx, 0, moved);
          await window.api.saveProjects(projects);
          renderSidebar();
        }
        dragSrcIdx = null;
      });
    });

    document.getElementById('empty-state').style.display = (projects.length && currentView === 'projects') ? 'none' : (currentView === 'projects' ? 'flex' : 'none');
    document.getElementById('project-detail').style.display = (projects.length && currentView === 'projects') ? 'flex' : 'none';
    document.getElementById('ports-panel').style.display = currentView === 'ports' ? 'block' : 'none';
  }

  // ── Profiles ────────────────────────────────────────────────
  function renderProfiles() {
    const sec = document.getElementById('profiles-section');
    if (profiles.length === 0) { sec.innerHTML = '<div style="font-size:11px;color:var(--text-dim);cursor:pointer;" id="btn-new-profile">+ Save a startup profile</div>'; }
    else {
      sec.innerHTML = profiles.map((pr, i) =>
        `<span class="profile-chip" data-idx="${i}">${esc(pr.name)} <span class="x" data-delidx="${i}">&times;</span></span>`
      ).join('') + ' <span class="profile-chip" id="btn-new-profile" style="color:var(--text-dim);">+</span>';
    }

    sec.querySelectorAll('.profile-chip[data-idx]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('x')) return;
        launchProfile(parseInt(el.dataset.idx));
      });
    });
    sec.querySelectorAll('.x[data-delidx]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        profiles.splice(parseInt(el.dataset.delidx), 1);
        await window.api.saveProfiles(profiles);
        renderProfiles();
      });
    });
    const newBtn = document.getElementById('btn-new-profile');
    if (newBtn) newBtn.addEventListener('click', openProfileModal);
  }

  async function launchProfile(idx) {
    const profile = profiles[idx];
    if (!profile) return;
    for (const pid of profile.projectIds) {
      const p = projects.find(p => p.id === pid);
      if (p && statuses[p.id] !== 'running') {
        logBuffers[p.id] = [];
        await window.api.startProject(p);
      }
    }
  }

  function openProfileModal() {
    document.getElementById('profile-name').value = '';
    const list = document.getElementById('profile-project-list');
    list.innerHTML = projects.map(p =>
      `<label class="profile-check-item">
        <input type="checkbox" value="${p.id}" />
        <span>${p.icon ? `<span style="margin-right:4px;">${p.icon}</span>` : ''}${esc(p.name)}</span>
      </label>`
    ).join('');
    document.getElementById('profile-modal').style.display = 'flex';
  }

  // ── Detail panel ────────────────────────────────────────────────
  function selectProject(id) { selectedId = id; renderSidebar(); renderDetail(); }

  function renderDetailMeta() {
    const metaEl = document.getElementById('detail-meta');
    if (!metaEl) return;
    const p = projects.find(p => p.id === selectedId);
    if (!p) return;
    const stats = resourceCache[p.id];
    const statsHtml = stats ? `<div class="meta-item"><span class="resource-badge ${stats.cpu > 80 ? 'warn' : ''}">CPU ${stats.cpu}%</span><span class="resource-badge ${stats.memMB > 500 ? 'warn' : ''}">MEM ${stats.memMB}MB</span></div>` : '';
    const git = gitCache[p.id];
    const gitHtml = git ? `<div class="meta-item"><span class="meta-label">Git:</span><span>${esc(git.branch)}${git.dirty ? ` (${git.changes} changes)` : ''}</span></div>` : '';
    metaEl.innerHTML = `
      <div class="meta-item"><span class="meta-label">Path:</span><span>${esc(p.path)}</span></div>
      <div class="meta-item"><span class="meta-label">Cmds:</span><span>${esc(getCommandsSummary(p))}</span></div>
      ${p.url ? `<div class="meta-item"><span class="meta-label">URL:</span><span>${esc(p.url)}</span></div>` : ''}
      ${p.lastStarted ? `<div class="meta-item"><span class="meta-label">Last started:</span><span>${formatTimeAgo(p.lastStarted)}</span></div>` : ''}
      ${gitHtml}${statsHtml}
      ${(p.url && statuses[p.id] === 'running') ? `<div class="meta-item" id="health-indicator"><span class="meta-label">Health:</span><span style="color:var(--text-dim);">checking...</span></div>` : ''}
    `;
  }

  const icons = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><polygon points="4,2 14,8 4,14"/></svg>',
    stop: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>',
    restart: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 8a6 6 0 0 1 10.3-4.2M14 8a6 6 0 0 1-10.3 4.2"/><polyline points="12 1 12.5 4 9.5 4.5" /><polyline points="4 12 3.5 15 6.5 14.5" /></svg>',
    open: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3H3v10h10v-3"/><path d="M9 2h5v5"/><path d="M14 2L7 9"/></svg>',
    terminal: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="2" width="14" height="12" rx="2"/><polyline points="4 6 7 9 4 12"/><line x1="9" y1="12" x2="12" y2="12"/></svg>',
    edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>',
    clone: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="1" width="9" height="11" rx="1.5"/><rect x="2" y="4" width="9" height="11" rx="1.5"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4"/><path d="M3.5 4l.8 10.1a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L12.5 4"/></svg>',
    git: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="3.5" r="1.5"/><circle cx="8" cy="12.5" r="1.5"/><circle cx="12.5" cy="8" r="1.5"/><line x1="8" y1="5" x2="8" y2="11"/><path d="M9.2 4.5L11.2 7"/></svg>',
  };

  function renderDetail() {
    const p = projects.find(p => p.id === selectedId);
    if (!p) return;
    const hasCommand = !!(p.command || (p.commands && p.commands.length > 0));
    const status = statuses[p.id] || 'stopped';
    const isRunning = status === 'running';
    // Workspace projects (no command) default to terminal tab
    if (!hasCommand && activeDetailTab === 'output') activeDetailTab = 'terminal';
    const panel = document.getElementById('project-detail');

    panel.innerHTML = `
      <div class="detail-header">
        <h1>${p.icon ? `<span style="margin-right:6px;">${p.icon}</span>` : ''}${esc(p.name)}</h1>
        ${hasCommand ? `<span class="status-badge ${status}"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>${status.charAt(0).toUpperCase() + status.slice(1)}</span>` : '<span class="status-badge" style="opacity:0.45;">Workspace</span>'}
        <div class="detail-actions">
          ${hasCommand ? (isRunning
            ? `<button class="btn btn-stop" id="btn-toggle">${icons.stop} Stop</button>`
            : `<button class="btn btn-start" id="btn-toggle">${icons.play} Start</button>`) : ''}
          ${hasCommand && isRunning ? `<button class="btn btn-restart" id="btn-restart">${icons.restart} Restart</button>` : ''}

          <div class="action-divider"></div>

          ${p.url ? `<button class="btn btn-open" id="btn-open" ${!isRunning ? 'disabled' : ''}>${icons.open} Open</button>` : ''}

          <div class="action-divider"></div>

          <div class="btn-group">
            <button class="btn" id="btn-edit-project">${icons.edit} Edit</button>
            <button class="btn" id="btn-clone-project">${icons.clone} Clone</button>
            <button class="btn btn-danger" id="btn-delete-project">${icons.trash}</button>
          </div>
        </div>
      </div>
      <div class="detail-meta" id="detail-meta"></div>
      ${p.url ? `<div class="tunnel-bar" id="tunnel-bar">
        <button class="btn tunnel-btn" id="btn-tunnel" ${!isRunning ? 'disabled title="Start the project first"' : ''}>
          <span class="tunnel-icon">🌐</span> <span id="tunnel-btn-label">Tunnel</span>
        </button>
        <div class="tunnel-url-area" id="tunnel-url-area" style="display:none;">
          <span class="tunnel-status-dot" id="tunnel-dot"></span>
          <code class="tunnel-url" id="tunnel-url"></code>
          <button class="tunnel-copy" id="tunnel-copy" title="Copy URL">Copy</button>
          <button class="tunnel-open" id="tunnel-open" title="Open in browser">↗</button>
        </div>
      </div>` : ''}
      <div class="detail-tabs">
        ${hasCommand ? `<button class="detail-tab ${activeDetailTab === 'output' ? 'active' : ''}" data-tab="output">
          ${icons.play} Output${p.autoRestart ? ' (auto-restart)' : ''}
        </button>` : ''}
        <button class="detail-tab ${activeDetailTab === 'terminal' ? 'active' : ''}" data-tab="terminal">
          ${icons.terminal} Terminal
        </button>
        <button class="detail-tab ${activeDetailTab === 'scripts' ? 'active' : ''}" data-tab="scripts">
          ⚡ Scripts
        </button>
        <button class="detail-tab ${activeDetailTab === 'deps' ? 'active' : ''}" data-tab="deps">
          📦 Deps
        </button>
        <button class="detail-tab ${activeDetailTab === 'git' ? 'active' : ''}" data-tab="git">
          ${icons.git || '⎇'} Git
        </button>
        <button class="detail-tab ${activeDetailTab === 'env' ? 'active' : ''}" data-tab="env">
          🔧 Env
        </button>
        <div style="flex:1;"></div>
        <div class="tab-controls" id="tab-controls"></div>
      </div>
      <div class="tab-content" id="tab-content-output" style="display:${activeDetailTab === 'output' ? 'flex' : 'none'};">
        <div class="log-viewer" id="log-viewer"></div>
      </div>
      <div class="tab-content" id="tab-content-terminal" style="display:${activeDetailTab === 'terminal' ? 'flex' : 'none'};">
        <div class="terminal-tabs-bar" id="terminal-tabs-bar"></div>
        <div class="terminal-search-bar" id="terminal-search-bar" style="display:none;">
          <input type="text" id="terminal-search-input" placeholder="Find in terminal..." spellcheck="false" />
          <span class="terminal-search-count" id="terminal-search-count"></span>
          <button id="terminal-search-prev" title="Previous (Shift+Enter)">&#x25B2;</button>
          <button id="terminal-search-next" title="Next (Enter)">&#x25BC;</button>
          <button id="terminal-search-close" title="Close (Esc)">&times;</button>
        </div>
        <div class="terminal-container" id="terminal-container"></div>
      </div>
      <div class="tab-content" id="tab-content-scripts" style="display:${activeDetailTab === 'scripts' ? 'flex' : 'none'};">
        <div class="scripts-panel" id="scripts-panel"><div class="terminal-placeholder">Loading scripts...</div></div>
      </div>
      <div class="tab-content" id="tab-content-deps" style="display:${activeDetailTab === 'deps' ? 'flex' : 'none'};">
        <div class="deps-panel" id="deps-panel"><div class="terminal-placeholder">Loading dependencies...</div></div>
      </div>
      <div class="tab-content" id="tab-content-git" style="display:${activeDetailTab === 'git' ? 'flex' : 'none'};">
        <div class="git-panel" id="git-panel"><div class="terminal-placeholder">Loading git status...</div></div>
      </div>
      <div class="tab-content" id="tab-content-env" style="display:${activeDetailTab === 'env' ? 'flex' : 'none'};">
        <div class="env-panel" id="env-panel"><div class="terminal-placeholder">Loading environment...</div></div>
      </div>`;

    renderDetailMeta();
    if (p.url && isRunning) runHealthCheck(p.url);

    // Tab controls (context-sensitive)
    renderTabControls(p);

    // Tab switching
    panel.querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeDetailTab = tab.dataset.tab;
        panel.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeDetailTab));
        ['output', 'terminal', 'scripts', 'deps', 'git', 'env'].forEach(t => {
          const el = document.getElementById(`tab-content-${t}`);
          if (el) el.style.display = activeDetailTab === t ? 'flex' : 'none';
        });
        renderTabControls(p);
        if (activeDetailTab === 'terminal') requestAnimationFrame(() => initTerminal(p));
        if (activeDetailTab === 'output') {
          const viewer = document.getElementById('log-viewer');
          if (viewer) renderLogs(p.id, viewer);
        }
        if (activeDetailTab === 'scripts') renderScriptsPanel(p);
        if (activeDetailTab === 'deps') renderDepsPanel(p);
        if (activeDetailTab === 'git') renderGitPanel(p);
        if (activeDetailTab === 'env') renderEnvPanel(p);
      });
    });

    const viewer = document.getElementById('log-viewer');
    renderLogs(p.id, viewer);

    // Clickable links in log viewer
    if (viewer) {
      viewer.addEventListener('click', (e) => {
        const link = e.target.closest('.log-link');
        if (link) { e.preventDefault(); window.api.openUrl(link.dataset.url); }
      });
    }

    // Right-click context menu on log viewer
    if (viewer) {
      viewer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const selected = window.getSelection().toString();
        showCtxMenu(e.clientX, e.clientY, [
          ...(selected ? [{ label: 'Copy Selected', action: () => navigator.clipboard.writeText(selected) }] : []),
          { label: 'Copy All', action: () => navigator.clipboard.writeText(viewer.textContent) },
          '---',
          { label: 'Clear', action: () => { logBuffers[p.id] = []; viewer.innerHTML = ''; }},
        ]);
      });
    }

    // Init terminal or scripts if active tab
    if (activeDetailTab === 'terminal') initTerminal(p);
    if (activeDetailTab === 'scripts') renderScriptsPanel(p);
    if (activeDetailTab === 'deps') renderDepsPanel(p);
    if (activeDetailTab === 'git') renderGitPanel(p);
    if (activeDetailTab === 'env') renderEnvPanel(p);

    // Port conflict check
    checkPortConflicts();

    const btnToggle = document.getElementById('btn-toggle');
    if (btnToggle) btnToggle.addEventListener('click', async () => {
      if (isRunning) { await window.api.stopProject(p.id); }
      else { logBuffers[p.id] = []; if (viewer) viewer.textContent = ''; await window.api.startProject(p); }
    });

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) btnRestart.addEventListener('click', async () => {
      await window.api.stopProject(p.id);
      logBuffers[p.id] = [];
      setTimeout(async () => { await window.api.startProject(p); }, 500);
    });

    const btnOpen = document.getElementById('btn-open');
    if (btnOpen) btnOpen.addEventListener('click', () => window.api.openUrl(p.url));

    document.getElementById('btn-edit-project').addEventListener('click', () => openModal(p));
    document.getElementById('btn-clone-project').addEventListener('click', () => cloneProject(p));
    document.getElementById('btn-delete-project').addEventListener('click', () => deleteProject(p.id));

    // Tunnel
    const btnTunnel = document.getElementById('btn-tunnel');
    if (btnTunnel) {
      // Check existing tunnel state
      window.api.getTunnelStatus(p.id).then(s => {
        if (s.active) updateTunnelUI(s.url, s.provider, 'connected');
      });
      // Detect provider and update label
      window.api.detectTunnelProvider().then(r => {
        const label = document.getElementById('tunnel-btn-label');
        if (label && !label.textContent.includes('...')) {
          if (r.provider) label.textContent = `Tunnel (${r.provider})`;
          else { label.textContent = 'Tunnel (none)'; btnTunnel.disabled = true; btnTunnel.title = 'Install cloudflared or ngrok to use tunnels'; }
        }
      });

      btnTunnel.addEventListener('click', async () => {
        const label = document.getElementById('tunnel-btn-label');
        const status = await window.api.getTunnelStatus(p.id);
        if (status.active) {
          await window.api.stopTunnel(p.id);
          updateTunnelUI(null, null, 'disconnected');
        } else {
          // Extract port from project URL
          let port = 3000;
          try { port = new URL(p.url).port || 3000; } catch (_) {}
          label.textContent = 'Connecting...';
          btnTunnel.disabled = true;
          const result = await window.api.startTunnel(p.id, port);
          btnTunnel.disabled = false;
          if (result.error) {
            label.textContent = `⚠ ${result.error}`;
            label.style.color = 'var(--red)';
            setTimeout(() => { label.textContent = 'Tunnel'; label.style.color = ''; }, 4000);
          } else {
            updateTunnelUI(null, result.provider, 'connecting');
          }
        }
      });

      const copyBtn = document.getElementById('tunnel-copy');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        const url = document.getElementById('tunnel-url').textContent;
        if (url) {
          navigator.clipboard.writeText(url);
          copyBtn.textContent = '✓';
          copyBtn.style.color = 'var(--green)';
          setTimeout(() => { copyBtn.textContent = '⎘'; copyBtn.style.color = ''; }, 1500);
        }
      });

      const openBtn = document.getElementById('tunnel-open');
      if (openBtn) openBtn.addEventListener('click', () => {
        const url = document.getElementById('tunnel-url').textContent;
        if (url) window.api.openUrl(url);
      });
    }
  }

  function updateTunnelUI(url, provider, status) {
    const label = document.getElementById('tunnel-btn-label');
    const urlArea = document.getElementById('tunnel-url-area');
    const urlEl = document.getElementById('tunnel-url');
    const dot = document.getElementById('tunnel-dot');
    const btn = document.getElementById('btn-tunnel');
    if (!label) return;

    if (status === 'connected' && url) {
      label.textContent = 'Stop Tunnel';
      if (btn) btn.classList.add('tunnel-active');
      if (urlArea) urlArea.style.display = 'flex';
      if (urlEl) urlEl.textContent = url;
      if (dot) { dot.style.background = 'var(--green)'; dot.title = `via ${provider}`; }
    } else if (status === 'connecting') {
      label.textContent = 'Connecting...';
      if (btn) btn.classList.add('tunnel-active');
      if (urlArea) urlArea.style.display = 'flex';
      if (urlEl) urlEl.textContent = 'waiting for tunnel URL...';
      if (dot) { dot.style.background = 'var(--yellow)'; }
    } else {
      label.textContent = 'Tunnel';
      if (btn) btn.classList.remove('tunnel-active');
      if (urlArea) urlArea.style.display = 'none';
      if (urlEl) urlEl.textContent = '';
    }
  }

  function renderTabControls(p) {
    const controls = document.getElementById('tab-controls');
    if (!controls) return;
    if (activeDetailTab === 'output') {
      controls.innerHTML = `
        <input class="log-search" id="log-search" placeholder="Filter logs..." value="${esc(logFilter)}" />
        <button class="btn btn-edit" id="btn-clear-logs" style="padding:4px 10px;font-size:10px;">Clear</button>`;
      document.getElementById('btn-clear-logs').addEventListener('click', () => {
        logBuffers[p.id] = [];
        const viewer = document.getElementById('log-viewer');
        if (viewer) viewer.innerHTML = '';
      });
      document.getElementById('log-search').addEventListener('input', (e) => {
        logFilter = e.target.value;
        const viewer = document.getElementById('log-viewer');
        renderLogs(p.id, viewer);
      });
    } else if (activeDetailTab === 'terminal') {
      const state = ensureProjectTabs(p.id);
      const activeTermId = state.activeTab;
      controls.innerHTML = `
        <button class="btn btn-edit" id="btn-kill-terminal" style="padding:4px 10px;font-size:10px;">Kill</button>
        <button class="btn btn-edit" id="btn-restart-terminal" style="padding:4px 10px;font-size:10px;">Restart</button>`;
      document.getElementById('btn-kill-terminal').addEventListener('click', async () => {
        await window.api.destroyTerminal(activeTermId);
        if (activeTerminals[activeTermId]) {
          try { activeTerminals[activeTermId].term.dispose(); } catch (_) {}
          if (activeTerminals[activeTermId].resizeObserver) activeTerminals[activeTermId].resizeObserver.disconnect();
          delete activeTerminals[activeTermId];
        }
        const container = document.getElementById('terminal-container');
        if (container) container.innerHTML = '<div class="terminal-placeholder">Terminal killed. Click <b>Restart</b> or add a new tab.</div>';
      });
      document.getElementById('btn-restart-terminal').addEventListener('click', async () => {
        await window.api.destroyTerminal(activeTermId);
        if (activeTerminals[activeTermId]) {
          try { activeTerminals[activeTermId].term.dispose(); } catch (_) {}
          if (activeTerminals[activeTermId].resizeObserver) activeTerminals[activeTermId].resizeObserver.disconnect();
          delete activeTerminals[activeTermId];
        }
        await mountTerminal(p, activeTermId);
      });
    } else if (activeDetailTab === 'scripts') {
      controls.innerHTML = `<button class="btn btn-edit" id="btn-refresh-scripts" style="padding:4px 10px;font-size:10px;">Refresh</button>`;
      document.getElementById('btn-refresh-scripts').addEventListener('click', () => renderScriptsPanel(p));
    } else if (activeDetailTab === 'deps') {
      controls.innerHTML = '';
    } else if (activeDetailTab === 'git') {
      controls.innerHTML = `<button class="btn btn-edit" id="btn-refresh-git" style="padding:4px 10px;font-size:10px;">Refresh</button>`;
      document.getElementById('btn-refresh-git').addEventListener('click', () => renderGitPanel(p));
    } else if (activeDetailTab === 'env') {
      controls.innerHTML = `<button class="btn btn-edit" id="btn-refresh-env" style="padding:4px 10px;font-size:10px;">Refresh</button>`;
      document.getElementById('btn-refresh-env').addEventListener('click', () => renderEnvPanel(p));
    }
  }

  // ── Interactive Terminal (xterm.js) — Multi-tab ──────────────────
  let terminalFontSize = 13;

  function applyTerminalFontSize() {
    Object.values(activeTerminals).forEach(({ term, fitAddon, _mounted }) => {
      if (term && _mounted) {
        term.options.fontSize = terminalFontSize;
        try { fitAddon.fit(); } catch (_) {}
      }
    });
  }

  const terminalThemes = {
    dark: {
      background: '#0a0a0a', foreground: '#cccccc', cursor: '#6c5ce7',
      selectionBackground: 'rgba(108, 92, 231, 0.3)',
      black: '#0a0a0a', red: '#e17055', green: '#00b894', yellow: '#fdcb6e',
      blue: '#74b9ff', magenta: '#a29bfe', cyan: '#81ecec', white: '#dfe6e9',
      brightBlack: '#636e72', brightRed: '#ff7675', brightGreen: '#55efc4',
      brightYellow: '#ffeaa7', brightBlue: '#74b9ff', brightMagenta: '#a29bfe',
      brightCyan: '#81ecec', brightWhite: '#ffffff',
    },
    light: {
      background: '#f8f8f8', foreground: '#383a42', cursor: '#6c5ce7',
      selectionBackground: 'rgba(108, 92, 231, 0.2)',
      black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
      blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#a0a1a7',
      brightBlack: '#4f525e', brightRed: '#e06c75', brightGreen: '#98c379',
      brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
      brightCyan: '#56b6c2', brightWhite: '#ffffff',
    },
  };
  let terminalThemeSetting = 'dark';

  function resolveTerminalTheme() {
    if (terminalThemeSetting === 'system') {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    return terminalThemeSetting;
  }

  function getTerminalTheme() {
    return terminalThemes[resolveTerminalTheme()] || terminalThemes.dark;
  }

  function applyTerminalTheme() {
    const theme = getTerminalTheme();
    Object.values(activeTerminals).forEach(({ term, _mounted }) => {
      if (term && _mounted) term.options.theme = theme;
    });
    document.querySelectorAll('.terminal-container').forEach(el => {
      el.style.background = theme.background;
    });
    // Sync output log viewer colors
    document.documentElement.style.setProperty('--log-bg', theme.background);
    document.documentElement.style.setProperty('--log-text', theme.foreground);
  }

  function makeTerminalInstance() {
    return new Terminal({
      cursorBlink: true,
      fontSize: terminalFontSize,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
      theme: getTerminalTheme(),
      allowProposedApi: true,
    });
  }

  function ensureProjectTabs(projectId) {
    if (!projectTerminalTabs[projectId]) {
      const firstId = `${projectId}:0`;
      projectTerminalTabs[projectId] = { tabs: [{ id: firstId, label: '1' }], activeTab: firstId, nextIdx: 1 };
    }
    return projectTerminalTabs[projectId];
  }

  function renderTerminalTabsBar(project) {
    const bar = document.getElementById('terminal-tabs-bar');
    if (!bar) return;
    const state = ensureProjectTabs(project.id);
    const canAdd = state.tabs.length < MAX_TERMINALS;
    bar.innerHTML = state.tabs.map((t, i) =>
      `<button class="term-tab ${t.id === state.activeTab ? 'active' : ''}" data-tid="${t.id}">
        <span>${i + 1}</span>${state.tabs.length > 1 ? `<span class="term-tab-close" data-tid="${t.id}">&times;</span>` : ''}
      </button>`
    ).join('') + (canAdd ? `<button class="term-tab term-tab-add" id="btn-add-term">+</button>` : '');

    // Tab click handlers
    bar.querySelectorAll('.term-tab:not(.term-tab-add)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('term-tab-close')) return;
        const tid = btn.dataset.tid;
        if (tid !== state.activeTab) {
          state.activeTab = tid;
          switchToTerminal(project, tid);
        }
      });
    });

    // Close tab
    bar.querySelectorAll('.term-tab-close').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tid = btn.dataset.tid;
        await closeTerminalTab(project, tid);
      });
    });

    // Add tab
    const addBtn = document.getElementById('btn-add-term');
    if (addBtn) addBtn.addEventListener('click', () => addTerminalTab(project));
  }

  async function addTerminalTab(project) {
    const state = ensureProjectTabs(project.id);
    if (state.tabs.length >= MAX_TERMINALS) return;
    const newId = `${project.id}:${state.nextIdx}`;
    state.tabs.push({ id: newId, label: `${state.nextIdx + 1}` });
    state.nextIdx++;
    state.activeTab = newId;
    renderTerminalTabsBar(project);
    await mountTerminal(project, newId);
  }

  async function closeTerminalTab(project, terminalId) {
    const state = ensureProjectTabs(project.id);
    if (state.tabs.length <= 1) return; // keep at least one

    // Destroy PTY and xterm instance
    await window.api.destroyTerminal(terminalId);
    if (activeTerminals[terminalId]) {
      try { activeTerminals[terminalId].term.dispose(); } catch (_) {}
      if (activeTerminals[terminalId].resizeObserver) activeTerminals[terminalId].resizeObserver.disconnect();
      delete activeTerminals[terminalId];
    }

    state.tabs = state.tabs.filter(t => t.id !== terminalId);
    // If we closed the active tab, switch to the last one
    if (state.activeTab === terminalId) {
      state.activeTab = state.tabs[state.tabs.length - 1].id;
    }
    renderTerminalTabsBar(project);
    await switchToTerminal(project, state.activeTab);
  }

  async function switchToTerminal(project, terminalId) {
    const state = ensureProjectTabs(project.id);
    state.activeTab = terminalId;
    renderTerminalTabsBar(project);
    await mountTerminal(project, terminalId);
  }

  async function mountTerminal(project, terminalId) {
    const container = document.getElementById('terminal-container');
    if (!container) return;

    if (window.__xtermReady) await window.__xtermReady;
    if (typeof Terminal === 'undefined') {
      container.innerHTML = '<div class="terminal-placeholder">xterm.js not loaded. Run: <code>npm install @xterm/xterm @xterm/addon-fit</code></div>';
      return;
    }

    // Dispose currently displayed xterm (DOM gets replaced)
    for (const [tid, entry] of Object.entries(activeTerminals)) {
      if (entry._mounted) {
        try { entry.term.dispose(); } catch (_) {}
        if (entry.resizeObserver) entry.resizeObserver.disconnect();
        entry._mounted = false;
      }
    }

    container.innerHTML = '';

    // If we already have an xterm for this terminal, recreate it (xterm can't reattach)
    const existing = activeTerminals[terminalId];
    if (existing) {
      try { existing.term.dispose(); } catch (_) {}
      if (existing.resizeObserver) existing.resizeObserver.disconnect();
    }

    const term = makeTerminalInstance();
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    requestAnimationFrame(() => { fitAddon.fit(); term.focus(); });

    // Search addon
    let searchAddon = null;
    if (typeof SearchAddon !== 'undefined') {
      try {
        searchAddon = new SearchAddon.SearchAddon();
        term.loadAddon(searchAddon);
      } catch (_) {}
    }

    // Clickable links — Cmd+click (Mac) or Ctrl+click opens in default browser
    if (typeof WebLinksAddon !== 'undefined') {
      try {
        const webLinks = new WebLinksAddon.WebLinksAddon((e, url) => {
          if (e.metaKey || e.ctrlKey) window.api.openUrl(url);
        });
        term.loadAddon(webLinks);
      } catch (_) {}
    }

    // Drag-and-drop files → insert quoted path(s) at cursor
    container.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      const paths = files.map(f => {
        const p = f.path;
        return p.includes(' ') ? `"${p}"` : p;
      }).join(' ');
      window.api.writeTerminal(terminalId, paths);
      term.focus();
    });

    // Right-click context menu
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const selected = term.getSelection();
      showCtxMenu(e.clientX, e.clientY, [
        ...(selected ? [{ label: 'Copy', action: () => navigator.clipboard.writeText(selected) }] : []),
        { label: 'Paste', action: async () => {
          try {
            const t = await navigator.clipboard.readText();
            if (t) { window.api.writeTerminal(terminalId, t); term.focus(); }
          } catch (_) {}
        }},
        '---',
        { label: 'Clear', action: () => term.clear() },
      ]);
    });

    // Create or reconnect to PTY
    const result = await window.api.createTerminal(terminalId, project.id, project.path);
    if (result && result.error) {
      term.writeln(`\r\n\x1b[31m${result.error}\x1b[0m`);
      activeTerminals[terminalId] = { term, fitAddon, searchAddon, projectId: project.id, _mounted: true };
      return;
    }

    if (result && result.alreadyRunning && result.buffer) {
      term.write(result.buffer);
    }

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const meta = e.metaKey || e.ctrlKey;

      // Shift+Enter → soft newline
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        window.api.writeTerminal(terminalId, '\n');
        return false;
      }

      // ⌘F → open terminal search
      if (meta && e.key === 'f') {
        e.preventDefault();
        openTerminalSearch();
        return false;
      }

      // ⌘K → clear scrollback
      if (meta && e.key === 'k') {
        e.preventDefault();
        term.clear();
        return false;
      }

      // ⌘+/⌘-/⌘0 → font zoom
      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        terminalFontSize = Math.min(terminalFontSize + 1, 24);
        applyTerminalFontSize();
        return false;
      }
      if (meta && e.key === '-') {
        e.preventDefault();
        terminalFontSize = Math.max(terminalFontSize - 1, 8);
        applyTerminalFontSize();
        return false;
      }
      if (meta && e.key === '0') {
        e.preventDefault();
        terminalFontSize = 13;
        applyTerminalFontSize();
        return false;
      }

      return true;
    });
    term.onData((data) => { window.api.writeTerminal(terminalId, data); });
    term.onResize(({ cols, rows }) => { window.api.resizeTerminal(terminalId, cols, rows); });
    window.api.resizeTerminal(terminalId, term.cols, term.rows);

    const resizeObserver = new ResizeObserver(() => {
      if (activeDetailTab === 'terminal' && activeTerminals[terminalId] && activeTerminals[terminalId]._mounted) {
        try { fitAddon.fit(); } catch (_) {}
      }
    });
    resizeObserver.observe(container);

    activeTerminals[terminalId] = { term, fitAddon, searchAddon, resizeObserver, projectId: project.id, _mounted: true };
  }

  async function initTerminal(project) {
    const state = ensureProjectTabs(project.id);
    renderTerminalTabsBar(project);
    await mountTerminal(project, state.activeTab);
  }

  // ── Terminal Search ──────────────────────────────────────────────
  function getActiveSearchAddon() {
    if (!selectedId) return null;
    const state = projectTerminalTabs[selectedId];
    if (!state) return null;
    const entry = activeTerminals[state.activeTab];
    return entry && entry.searchAddon ? entry.searchAddon : null;
  }

  function openTerminalSearch() {
    const bar = document.getElementById('terminal-search-bar');
    const input = document.getElementById('terminal-search-input');
    if (!bar || !input) return;
    bar.style.display = 'flex';
    // Attach Escape handler directly (delegation can miss it when input has focus)
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeTerminalSearch(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doTerminalSearch('next'); }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); doTerminalSearch('prev'); }
    };
    input.focus();
    input.select();
  }

  function closeTerminalSearch() {
    const bar = document.getElementById('terminal-search-bar');
    const input = document.getElementById('terminal-search-input');
    const count = document.getElementById('terminal-search-count');
    if (bar) bar.style.display = 'none';
    if (input) input.value = '';
    if (count) count.textContent = '';
    const addon = getActiveSearchAddon();
    if (addon) addon.clearDecorations();
    // Re-focus terminal
    const state = projectTerminalTabs[selectedId];
    if (state && activeTerminals[state.activeTab]) activeTerminals[state.activeTab].term.focus();
  }

  function doTerminalSearch(direction) {
    const addon = getActiveSearchAddon();
    const input = document.getElementById('terminal-search-input');
    if (!addon || !input || !input.value) return;
    const opts = {
      regex: false,
      wholeWord: false,
      caseSensitive: false,
      incremental: direction === 'next',
      decorations: {
        matchBackground: '#7c4dff40',
        matchBorder: '#7c4dff',
        matchOverviewRuler: '#7c4dff',
        activeMatchBackground: '#ffb86c',
        activeMatchBorder: '#ff9500',
        activeMatchColorOverviewRuler: '#ff9500',
      }
    };
    if (direction === 'prev') {
      addon.findPrevious(input.value, opts);
    } else {
      addon.findNext(input.value, opts);
    }
  }

  // Wire up search bar events (delegated — elements created during render)
  document.addEventListener('click', (e) => {
    if (e.target.id === 'terminal-search-next') doTerminalSearch('next');
    if (e.target.id === 'terminal-search-prev') doTerminalSearch('prev');
    if (e.target.id === 'terminal-search-close') closeTerminalSearch();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'terminal-search-input') doTerminalSearch('next');
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'terminal-search-input') {
      if (e.key === 'Escape') { e.preventDefault(); closeTerminalSearch(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doTerminalSearch('next'); }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); doTerminalSearch('prev'); }
    }
  });

  // Listen for PTY output
  window.api.onTerminalData(({ id, data }) => {
    if (activeTerminals[id] && activeTerminals[id].term) {
      activeTerminals[id].term.write(data);
    }
  });

  window.api.onTerminalExit(({ id }) => {
    if (activeTerminals[id] && activeTerminals[id].term) {
      activeTerminals[id].term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m');
    }
  });

  // Tunnel status updates
  window.api.onTunnelStatus(({ id, url, provider, status }) => {
    // Only update if we're viewing this project
    if (selectedId === id) {
      updateTunnelUI(url, provider, status);
    }
  });

  // ── Script runner ───────────────────────────────────────────────
  async function renderScriptsPanel(project) {
    const panel = document.getElementById('scripts-panel');
    if (!panel) return;

    const result = await window.api.getProjectScripts(project.path);

    // Normalize into groups array
    let groups;
    if (result.multi) {
      groups = result.groups;
    } else if (result.scripts && Object.keys(result.scripts).length > 0) {
      groups = [{ type: result.type, label: result.label || result.type, scripts: result.scripts }];
    } else {
      panel.innerHTML = '<div class="terminal-placeholder">No scripts found in this project.</div>';
      return;
    }

    const commonNames = ['dev', 'start', 'serve', 'watch', 'run'];
    const testNames = ['test', 'test:watch', 'test:cov', 'test:e2e', 'lint', 'lint:fix', 'typecheck', 'check', 'vet', 'clippy', 'fmt'];
    const buildNames = ['build', 'compile', 'bundle', 'dist', 'generate', 'deploy', 'preview', 'tidy'];

    const renderScriptItem = (name, cmd, type) => {
      const key = `${project.id}:${name}`;
      const isRunning = runningScriptKeys.has(key);
      return `<div class="script-item">
        <button class="script-run-btn ${isRunning ? 'running' : ''}" data-script="${esc(name)}" data-type="${esc(type)}" data-cmd="${esc(typeof cmd === 'string' ? cmd : name)}">
          ${isRunning ? '■' : '▶'}
        </button>
        <div class="script-info">
          <span class="script-name">${esc(name)}</span>
          <span class="script-cmd">${esc(typeof cmd === 'string' ? cmd : name)}</span>
        </div>
      </div>`;
    };

    const renderCategorized = (scripts, type) => {
      const entries = Object.entries(scripts);
      const cats = { common: [], test: [], build: [], other: [] };
      for (const [name, cmd] of entries) {
        if (commonNames.includes(name)) cats.common.push([name, cmd]);
        else if (testNames.some(t => name.startsWith(t))) cats.test.push([name, cmd]);
        else if (buildNames.some(b => name.startsWith(b))) cats.build.push([name, cmd]);
        else cats.other.push([name, cmd]);
      }
      let h = '';
      const renderCat = (title, items) => {
        if (items.length === 0) return '';
        let s = `<div class="scripts-subgroup"><div class="scripts-subgroup-title">${title}</div>`;
        for (const [name, cmd] of items) s += renderScriptItem(name, cmd, type);
        s += '</div>';
        return s;
      };
      h += renderCat('Dev', cats.common);
      h += renderCat('Test & Lint', cats.test);
      h += renderCat('Build & Deploy', cats.build);
      h += renderCat('Other', cats.other);
      return h;
    };

    let html = '<div class="scripts-list">';
    for (const group of groups) {
      html += `<div class="scripts-group">`;
      if (groups.length > 1) {
        html += `<div class="scripts-group-title">${esc(group.label || group.type)}</div>`;
      }
      html += renderCategorized(group.scripts, group.type);
      html += '</div>';
    }
    html += '</div>';

    // ── Script output viewer
    html += `<div class="script-output-viewer" id="script-output-viewer" style="display:none;">
      <div class="script-output-header">
        <span id="script-output-title">Output</span>
        <div>
          <button class="git-file-btn" id="script-output-clear" title="Clear">⌫</button>
          <button class="git-file-btn" id="script-output-close" title="Close">✕</button>
        </div>
      </div>
      <pre class="script-output-content" id="script-output-content"></pre>
    </div>`;

    // ── Inline message area for script errors
    html += '<div id="script-msg-area"></div>';

    panel.innerHTML = html;

    // Helper: show inline script message
    function scriptMsg(text, isError) {
      const area = document.getElementById('script-msg-area');
      if (!area) return;
      const el = document.createElement('div');
      el.style.cssText = `font-size:11px;padding:6px 10px;border-radius:6px;margin-top:6px;background:${isError ? 'var(--red-dim, #3a1111)' : 'var(--green-dim, #113a11)'};color:${isError ? 'var(--red, #ff6b6b)' : 'var(--green, #6bff6b)'};`;
      el.textContent = text;
      area.appendChild(el);
      setTimeout(() => el.remove(), 5000);
    }

    // Show script output viewer for a specific script
    function showScriptOutput(scriptName) {
      const key = `${project.id}:${scriptName}`;
      const viewer = document.getElementById('script-output-viewer');
      const content = document.getElementById('script-output-content');
      const title = document.getElementById('script-output-title');
      if (!viewer || !content) return;
      viewer.style.display = 'block';
      title.textContent = `Output: ${scriptName}`;
      content.textContent = scriptOutputs[key] || '(no output yet)';
      content.scrollTop = content.scrollHeight;
      // Store active script key for live updates
      viewer.dataset.activeKey = key;
    }

    document.getElementById('script-output-close')?.addEventListener('click', () => {
      const viewer = document.getElementById('script-output-viewer');
      if (viewer) { viewer.style.display = 'none'; viewer.dataset.activeKey = ''; }
    });
    document.getElementById('script-output-clear')?.addEventListener('click', () => {
      const viewer = document.getElementById('script-output-viewer');
      const content = document.getElementById('script-output-content');
      if (viewer && content) {
        const key = viewer.dataset.activeKey;
        if (key) scriptOutputs[key] = '';
        content.textContent = '';
      }
    });

    // Script button handlers
    panel.querySelectorAll('.script-run-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scriptName = btn.dataset.script;
        const scriptType = btn.dataset.type;
        const scriptCmd = btn.dataset.cmd || scriptName;
        const key = `${project.id}:${scriptName}`;

        if (runningScriptKeys.has(key)) {
          await window.api.stopScript(project.id, scriptName);
          runningScriptKeys.delete(key);
          btn.classList.remove('running');
          btn.textContent = '▶';
          scriptMsg(`Stopped: ${scriptName}`, false);
        } else {
          scriptOutputs[key] = ''; // Clear previous output
          const res = await window.api.runScript(project.id, project.path, scriptName, scriptType, scriptCmd);
          if (res.error) {
            scriptMsg(`Failed to start ${scriptName}: ${res.error}`, true);
            return;
          }
          runningScriptKeys.add(key);
          btn.classList.add('running');
          btn.textContent = '■';
          scriptMsg(`Started: ${scriptName}`, false);
          showScriptOutput(scriptName);
        }
      });
    });

    // Click on script name/info to view output
    panel.querySelectorAll('.script-info').forEach(info => {
      info.style.cursor = 'pointer';
      info.addEventListener('click', () => {
        const scriptName = info.closest('.script-item')?.querySelector('.script-run-btn')?.dataset.script;
        if (scriptName) showScriptOutput(scriptName);
      });
    });
  }

  // ── Deps tab ───────────────────────────────────────────────────
  const ecoLabels = { npm: 'npm', pip: 'pip', pipenv: 'Pipenv', poetry: 'Poetry', go: 'Go', ruby: 'Ruby', rust: 'Cargo', php: 'Composer', dart: 'Dart', swift: 'Swift', maven: 'Maven', gradle: 'Gradle' };
  const ecoIcons = { npm: '📦', pip: '🐍', pipenv: '🐍', poetry: '🐍', go: '🔵', ruby: '💎', rust: '🦀', php: '🐘', dart: '🎯', swift: '🍎', maven: '☕', gradle: '🐘' };

  async function renderDepsPanel(project) {
    const panel = document.getElementById('deps-panel');
    if (!panel) return;

    panel.innerHTML = '<div class="deps-panel-inner"><div class="terminal-placeholder">Scanning dependencies...</div></div>';

    const result = await window.api.checkOutdated(project.path);
    if (result.error) {
      panel.innerHTML = `<div class="deps-panel-inner"><div class="terminal-placeholder" style="color:var(--red);">${esc(result.error)}</div></div>`;
      return;
    }

    const { ecosystems, results } = result;
    if (!ecosystems || ecosystems.length === 0) {
      panel.innerHTML = '<div class="deps-panel-inner"><div class="terminal-placeholder">No recognized package manager found in this project.</div></div>';
      return;
    }

    let html = '<div class="deps-panel-inner">';
    html += `<div class="deps-summary">
      <span class="deps-eco-tags">${ecosystems.map(e => `<span class="deps-eco-tag">${ecoIcons[e] || '📦'} ${ecoLabels[e] || e}</span>`).join('')}</span>
      <button class="btn btn-edit" id="btn-refresh-deps" style="padding:4px 10px;font-size:10px;margin-left:auto;">Refresh</button>
    </div>`;

    let totalOutdated = 0;

    for (const eco of ecosystems) {
      const ecoResult = results[eco];
      if (!ecoResult) continue;

      if (ecoResult.note) {
        html += `<div class="deps-eco-section">
          <div class="deps-eco-header">${ecoIcons[eco] || '📦'} ${ecoLabels[eco] || eco}</div>
          <div style="font-size:12px;color:var(--text-dim);padding:8px 0;">${esc(ecoResult.note)}</div>
        </div>`;
        continue;
      }

      if (ecoResult.error) {
        html += `<div class="deps-eco-section">
          <div class="deps-eco-header">${ecoIcons[eco] || '📦'} ${ecoLabels[eco] || eco}</div>
          <div style="font-size:12px;color:var(--red);padding:8px 0;">${esc(ecoResult.error)}</div>
        </div>`;
        continue;
      }

      const deps = Object.entries(ecoResult.outdated || {});
      totalOutdated += deps.length;

      if (deps.length === 0) {
        html += `<div class="deps-eco-section">
          <div class="deps-eco-header">${ecoIcons[eco] || '📦'} ${ecoLabels[eco] || eco} <span class="deps-eco-count ok">✓ up to date</span></div>
        </div>`;
        continue;
      }

      deps.sort((a, b) => {
        const aMajor = (a[1].current || '').split('.')[0] !== (a[1].latest || '').split('.')[0];
        const bMajor = (b[1].current || '').split('.')[0] !== (b[1].latest || '').split('.')[0];
        if (aMajor && !bMajor) return -1;
        if (!aMajor && bMajor) return 1;
        return 0;
      });

      const majorCount = deps.filter(([, info]) => (info.current || '').split('.')[0] !== (info.latest || '').split('.')[0]).length;

      html += `<div class="deps-eco-section">
        <div class="deps-eco-header">${ecoIcons[eco] || '📦'} ${ecoLabels[eco] || eco}
          <span class="deps-eco-count">${deps.length} outdated</span>
          ${majorCount > 0 ? `<span class="deps-badge major">${majorCount} major</span>` : ''}
        </div>
        <div class="deps-table">
          <div class="deps-header"><span>Package</span><span>Current</span><span>Wanted</span><span>Latest</span></div>
          ${deps.map(([name, info]) => {
            const isMajor = (info.current || '').split('.')[0] !== (info.latest || '').split('.')[0];
            return `<div class="deps-row ${isMajor ? 'major' : 'minor'}">
              <span class="dep-name">${esc(name)}</span>
              <span class="dep-current">${esc(info.current || '?')}</span>
              <span class="dep-wanted">${esc(info.wanted || '?')}</span>
              <span class="dep-latest">${esc(info.latest || '?')}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    html += '</div>';
    panel.innerHTML = html;

    document.getElementById('btn-refresh-deps').addEventListener('click', () => renderDepsPanel(project));
  }

  // ── Git Panel ────────────────────────────────────────────────
  let gitDiffExpanded = {}; // filePath -> bool

  async function renderGitPanel(project) {
    const panel = document.getElementById('git-panel');
    if (!panel) return;

    if (!project || !project.path) {
      panel.innerHTML = '<div class="terminal-placeholder">No project path configured — set a path to use Git.</div>';
      return;
    }

    panel.innerHTML = '<div class="terminal-placeholder">Loading git status...</div>';

    let status;
    try {
      status = await window.api.gitFullStatus(project.path);
    } catch (e) {
      panel.innerHTML = `<div class="terminal-placeholder" style="color:var(--red);">Git error: ${esc(e.message || String(e))}</div>`;
      return;
    }

    if (!status) {
      panel.innerHTML = '<div class="terminal-placeholder" style="color:var(--red);">No response from git — check System logs.</div>';
      return;
    }

    if (status.error) {
      const isNotRepo = status.error.toLowerCase().includes('not a git repository');
      if (isNotRepo) {
        panel.innerHTML = `<div class="git-init-prompt">
          <div class="git-init-icon">${icons.git}</div>
          <div class="git-init-text">Not a git repository</div>
          <button class="btn btn-start" id="git-init-btn">git init</button>
        </div>`;
        document.getElementById('git-init-btn')?.addEventListener('click', async () => {
          const btn = document.getElementById('git-init-btn');
          btn.textContent = 'Initializing...';
          btn.disabled = true;
          try {
            const result = await window.api.gitInit(project.path);
            if (result && result.error) {
              btn.textContent = 'Failed — retry';
              btn.disabled = false;
            } else {
              renderGitPanel(project);
            }
          } catch (e) {
            btn.textContent = 'Failed — retry';
            btn.disabled = false;
          }
        });
      } else {
        panel.innerHTML = `<div class="terminal-placeholder" style="color:var(--text-dim);">${esc(status.error)}</div>`;
      }
      return;
    }

    const branch = status.branch || 'main';
    const ahead = status.ahead || 0;
    const behind = status.behind || 0;
    const staged = status.staged || [];
    const unstaged = status.unstaged || [];
    const untracked = status.untracked || [];
    const stashCount = status.stashCount || 0;
    const conflicts = status.conflicts || [];
    const commits = status.commits || [];
    const branches = status.branches || [];
    const hasCommits = status.hasCommits || false;
    const hasRemote = status.hasRemote || false;
    const hasTracking = status.hasTracking || false;
    const hasChanges = staged.length + unstaged.length + untracked.length > 0;

    let html = '<div class="git-panel-inner">';

    // ── Branch bar
    const showBranchSelect = branches.length > 1;
    html += `<div class="git-branch-bar">
      <div class="git-branch-info">
        <span class="git-branch-icon">${icons.git}</span>
        <strong>${esc(branch)}</strong>
        ${!hasCommits ? '<span class="git-sync-badge" style="background:var(--yellow-dim,#3a3511);color:var(--yellow,#f0c040);">no commits yet</span>' : ''}
        ${!hasRemote && hasCommits ? '<span class="git-sync-badge" style="background:var(--text-dim);color:var(--bg);opacity:0.5;">local only</span>' : ''}
        ${ahead > 0 ? `<span class="git-sync-badge ahead">↑${ahead}</span>` : ''}
        ${behind > 0 ? `<span class="git-sync-badge behind">↓${behind}</span>` : ''}
        ${conflicts.length > 0 ? `<span class="git-sync-badge conflict">⚠ ${conflicts.length} conflicts</span>` : ''}
        ${stashCount > 0 ? `<span class="git-sync-badge stash">📦 ${stashCount}</span>` : ''}
      </div>
      <div class="git-branch-actions">
        ${showBranchSelect ? `<select class="git-branch-select" id="git-branch-select">
          ${branches.map(b => `<option value="${esc(b)}" ${b === branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}
        </select>` : ''}
        <button class="btn btn-edit git-btn" id="git-new-branch" title="New branch" ${!hasCommits ? 'disabled title="Make a commit first"' : ''}>+ Branch</button>
      </div>
    </div>
    <div class="git-new-branch-row" id="git-new-branch-row" style="display:none;">
      <input type="text" class="git-commit-input" id="git-new-branch-input" placeholder="new-branch-name" style="flex:1;" />
      <button class="btn btn-start git-btn" id="git-new-branch-ok" style="padding:5px 12px!important;">Create</button>
      <button class="btn btn-edit git-btn" id="git-new-branch-cancel" style="padding:5px 10px!important;">Cancel</button>
    </div>`;

    // ── Git identity indicator
    if (project.gitIdentity && (project.gitIdentity.name || project.gitIdentity.email)) {
      const idName = esc(project.gitIdentity.name || '');
      const idEmail = esc(project.gitIdentity.email || '');
      html += `<div class="git-identity-bar">
        <span class="git-identity-label">Identity:</span>
        <span class="git-identity-value">${idName}${idName && idEmail ? ' ' : ''}${idEmail ? '&lt;' + idEmail + '&gt;' : ''}</span>
      </div>`;
    }

    // ── Quick actions — disable buttons based on actual state
    const canPull = hasTracking;
    const canPush = hasRemote && hasCommits;
    const canStash = hasCommits && hasChanges;
    const canStageAll = unstaged.length + untracked.length > 0;
    const canUnstageAll = staged.length > 0;

    html += `<div class="git-actions-bar">
      <button class="btn btn-edit git-btn" id="git-pull" ${!canPull ? `disabled title="${!hasRemote ? 'No remote configured' : 'No upstream tracking branch'}"` : ''}>↓ Pull</button>
      <button class="btn btn-edit git-btn" id="git-push" ${!canPush ? `disabled title="${!hasRemote ? 'No remote configured' : 'No commits to push'}"` : ''}>↑ Push</button>
      <button class="btn btn-edit git-btn" id="git-stash" ${!canStash ? `disabled title="${!hasCommits ? 'Need at least one commit' : 'No changes to stash'}"` : ''}>Stash</button>
      ${stashCount > 0 ? `<button class="btn btn-edit git-btn" id="git-stash-pop">Pop Stash</button>` : ''}
      <button class="btn btn-edit git-btn" id="git-stage-all" ${!canStageAll ? 'disabled title="Nothing to stage"' : ''}>Stage All</button>
      <button class="btn btn-edit git-btn" id="git-unstage-all" ${!canUnstageAll ? 'disabled title="Nothing staged"' : ''}>Unstage All</button>
    </div>`;

    // ── Staged files
    html += `<div class="git-section">
      <div class="git-section-header">Staged Changes <span class="git-count">${staged.length}</span></div>`;
    if (staged.length > 0) {
      html += staged.map(f => `<div class="git-file staged" data-path="${esc(f.path)}">
        <span class="git-file-status git-status-${f.status.toLowerCase()}">${esc(f.status)}</span>
        <span class="git-file-path">${esc(f.path)}</span>
        <div class="git-file-actions">
          <button class="git-file-btn" data-action="unstage" title="Unstage">−</button>
          <button class="git-file-btn" data-action="diff-staged" title="View diff">◑</button>
        </div>
      </div>`).join('');
    } else {
      html += '<div class="git-empty">No staged changes</div>';
    }
    html += '</div>';

    // ── Unstaged files
    html += `<div class="git-section">
      <div class="git-section-header">Changes <span class="git-count">${unstaged.length + untracked.length}</span></div>`;
    if (unstaged.length > 0 || untracked.length > 0) {
      html += unstaged.map(f => `<div class="git-file unstaged" data-path="${esc(f.path)}">
        <span class="git-file-status git-status-${f.status.toLowerCase()}">${esc(f.status)}</span>
        <span class="git-file-path">${esc(f.path)}</span>
        <div class="git-file-actions">
          <button class="git-file-btn" data-action="stage" title="Stage">+</button>
          <button class="git-file-btn" data-action="discard" title="Discard">✕</button>
          <button class="git-file-btn" data-action="diff" title="View diff">◑</button>
        </div>
      </div>`).join('');
      html += untracked.map(f => `<div class="git-file untracked" data-path="${esc(f)}">
        <span class="git-file-status git-status-new">?</span>
        <span class="git-file-path">${esc(f)}</span>
        <div class="git-file-actions">
          <button class="git-file-btn" data-action="stage" title="Stage">+</button>
          <button class="git-file-btn" data-action="discard" title="Delete">✕</button>
        </div>
      </div>`).join('');
    } else {
      html += '<div class="git-empty">Working tree clean</div>';
    }
    html += '</div>';

    // ── Commit form
    const canCommit = staged.length > 0;
    html += `<div class="git-commit-form">
      <input type="text" class="git-commit-input" id="git-commit-msg" placeholder="${canCommit ? 'Commit message...' : 'Stage changes first...'}" ${!canCommit ? 'disabled' : ''} />
      <button class="btn btn-start git-commit-btn" id="git-commit-btn" ${!canCommit ? 'disabled' : ''}>Commit</button>
    </div>`;

    // ── Recent commits
    const remoteUrl = status.remoteUrl || null;
    html += `<div class="git-section">
      <div class="git-section-header">Recent Commits</div>`;
    if (commits && commits.length > 0) {
      html += commits.slice(0, 10).map(c => {
        const commitUrl = remoteUrl ? `${remoteUrl}/commit/${c.hash}` : null;
        return `<div class="git-commit">
          ${commitUrl
            ? `<a class="git-commit-hash git-link" href="#" data-url="${esc(commitUrl)}">${esc(c.hash)}</a>`
            : `<span class="git-commit-hash">${esc(c.hash)}</span>`}
          <span class="git-commit-msg">${esc(c.message)}</span>
          <span class="git-commit-meta">${esc(c.author)} · ${esc(c.date)}</span>
        </div>`;
      }).join('');
    } else {
      html += '<div class="git-empty">No commits</div>';
    }
    html += '</div>';


    // ── Diff viewer (hidden by default)
    html += `<div class="git-diff-viewer" id="git-diff-viewer" style="display:none;">
      <div class="git-diff-header">
        <span id="git-diff-title"></span>
        <button class="git-file-btn" id="git-diff-close">✕</button>
      </div>
      <pre class="git-diff-content" id="git-diff-content"></pre>
    </div>`;

    html += '</div>';
    panel.innerHTML = html;

    // ── Wire up events
    const dir = project.path;

    // Helper: show inline status message
    function gitMsg(text, isError) {
      const el = document.createElement('div');
      el.className = 'git-inline-msg';
      el.style.cssText = `font-size:11px;padding:6px 10px;border-radius:6px;margin-top:-6px;background:${isError ? 'var(--red-dim)' : 'var(--green-dim)'};color:${isError ? 'var(--red)' : 'var(--green)'};`;
      el.textContent = text;
      panel.querySelector('.git-panel-inner')?.prepend(el);
      setTimeout(() => el.remove(), 4000);
    }

    async function gitAction(fn, label, btnId) {
      const btn = btnId ? document.getElementById(btnId) : null;
      const origText = btn ? btn.textContent : '';
      if (btn) { btn.textContent = label + '...'; btn.disabled = true; }
      try {
        const result = await fn();
        if (result && result.error) {
          gitMsg(`${label} failed: ${result.error}`, true);
          if (btn) { btn.textContent = origText; btn.disabled = false; }
        } else {
          gitMsg(`${label} — done`, false);
          renderGitPanel(project);
        }
      } catch (e) {
        const msg = e?.error || e?.message || String(e);
        gitMsg(`${label} failed: ${msg}`, true);
        if (btn) { btn.textContent = origText; btn.disabled = false; }
      }
    }

    // Branch switching
    document.getElementById('git-branch-select')?.addEventListener('change', async (e) => {
      const b = e.target.value;
      if (b && b !== branch) gitAction(() => window.api.gitCheckoutBranch(dir, b), 'Checkout');
    });

    // New branch — inline input
    const newBranchRow = document.getElementById('git-new-branch-row');
    const newBranchInput = document.getElementById('git-new-branch-input');
    document.getElementById('git-new-branch')?.addEventListener('click', () => {
      newBranchRow.style.display = 'flex';
      newBranchInput.focus();
    });
    document.getElementById('git-new-branch-cancel')?.addEventListener('click', () => {
      newBranchRow.style.display = 'none';
      newBranchInput.value = '';
    });
    const doCreateBranch = async () => {
      const name = newBranchInput?.value?.trim();
      if (!name) return;
      const result = await window.api.gitCreateBranch(dir, name);
      if (result && result.error) {
        gitMsg('Create branch failed: ' + result.error, true);
      } else {
        renderGitPanel(project);
      }
    };
    document.getElementById('git-new-branch-ok')?.addEventListener('click', doCreateBranch);
    newBranchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreateBranch();
      if (e.key === 'Escape') { newBranchRow.style.display = 'none'; newBranchInput.value = ''; }
    });

    // Quick actions
    document.getElementById('git-pull')?.addEventListener('click', () => gitAction(() => window.api.gitPull(dir), 'Pull', 'git-pull'));
    document.getElementById('git-push')?.addEventListener('click', () => gitAction(() => window.api.gitPush(dir), 'Push', 'git-push'));
    document.getElementById('git-stash')?.addEventListener('click', () => gitAction(() => window.api.gitStash(dir), 'Stash', 'git-stash'));
    document.getElementById('git-stash-pop')?.addEventListener('click', () => gitAction(() => window.api.gitStashPop(dir), 'Stash pop', 'git-stash-pop'));
    document.getElementById('git-stage-all')?.addEventListener('click', () => gitAction(() => window.api.gitStageAll(dir), 'Stage all', 'git-stage-all'));
    document.getElementById('git-unstage-all')?.addEventListener('click', () => gitAction(() => window.api.gitUnstageAll(dir), 'Unstage all', 'git-unstage-all'));

    // Commit
    document.getElementById('git-commit-btn')?.addEventListener('click', async () => {
      const msgInput = document.getElementById('git-commit-msg');
      const commitBtn = document.getElementById('git-commit-btn');
      const msg = msgInput?.value?.trim();
      if (!msg) { msgInput?.focus(); return; }
      commitBtn.textContent = 'Committing...';
      commitBtn.disabled = true;
      const result = await window.api.gitCommit(dir, msg);
      if (result && result.error) {
        gitMsg('Commit failed: ' + result.error, true);
        commitBtn.textContent = 'Commit';
        commitBtn.disabled = false;
      } else {
        gitMsg('Committed: ' + msg, false);
        renderGitPanel(project);
      }
    });
    document.getElementById('git-commit-msg')?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('git-commit-btn')?.click();
      }
    });

    // Commit links — open in browser
    panel.querySelectorAll('.git-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.url;
        if (url) window.api.openUrl(url);
      });
    });

    // File actions
    panel.querySelectorAll('.git-file-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fileEl = btn.closest('.git-file');
        const filePath = fileEl?.dataset.path;
        if (!filePath) return;
        const action = btn.dataset.action;

        if (action === 'stage') {
          await window.api.gitStage(dir, filePath);
          renderGitPanel(project);
        } else if (action === 'unstage') {
          await window.api.gitUnstage(dir, filePath);
          renderGitPanel(project);
        } else if (action === 'discard') {
          // Toggle a confirm state on the button instead of using confirm()
          if (btn.dataset.confirming === 'true') {
            await window.api.gitDiscardFile(dir, filePath);
            renderGitPanel(project);
          } else {
            btn.dataset.confirming = 'true';
            btn.textContent = '⚠';
            btn.title = 'Click again to confirm discard';
            btn.style.background = 'var(--red-dim)';
            btn.style.color = 'var(--red)';
            setTimeout(() => {
              btn.dataset.confirming = 'false';
              btn.textContent = '✕';
              btn.title = 'Discard';
              btn.style.background = '';
              btn.style.color = '';
            }, 3000);
          }
        } else if (action === 'diff' || action === 'diff-staged') {
          const isStaged = action === 'diff-staged';
          try {
            const diff = await window.api.gitDiff(dir, filePath, isStaged);
            showGitDiff(filePath, diff, isStaged);
          } catch (err) {
            gitMsg('Diff error: ' + (err.message || err), true);
          }
        }
      });
    });


    // Diff close
    document.getElementById('git-diff-close')?.addEventListener('click', () => {
      const viewer = document.getElementById('git-diff-viewer');
      if (viewer) viewer.style.display = 'none';
    });
  }

  function showGitDiff(filePath, diff, isStaged) {
    const viewer = document.getElementById('git-diff-viewer');
    const title = document.getElementById('git-diff-title');
    const content = document.getElementById('git-diff-content');
    if (!viewer || !content) return;

    title.textContent = `${isStaged ? '[STAGED] ' : ''}${filePath}`;
    // Color the diff
    const lines = (diff || 'No diff available').split('\n');
    content.innerHTML = lines.map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="diff-add">${esc(line)}</span>`;
      if (line.startsWith('-') && !line.startsWith('---')) return `<span class="diff-del">${esc(line)}</span>`;
      if (line.startsWith('@@')) return `<span class="diff-hunk">${esc(line)}</span>`;
      if (line.startsWith('diff ') || line.startsWith('index ')) return `<span class="diff-meta">${esc(line)}</span>`;
      return esc(line);
    }).join('\n');
    viewer.style.display = 'flex';
  }

  // ── Environment Panel ────────────────────────────────────────
  async function renderEnvPanel(project) {
    const panel = document.getElementById('env-panel');
    if (!panel) return;

    if (!project || !project.path) {
      panel.innerHTML = '<div class="terminal-placeholder">No project path configured.</div>';
      return;
    }

    panel.innerHTML = '<div class="env-panel-inner"><div class="terminal-placeholder">Checking tool versions...</div></div>';

    try {
      const results = await window.api.checkEnvVersions(project.path);
      if (!results || results.length === 0) {
        panel.innerHTML = '<div class="env-panel-inner"><div class="terminal-placeholder">No recognized tools for this project.</div></div>';
        return;
      }

      let html = '<div class="env-panel-inner">';
      html += `<div class="deps-summary"><span style="font-size:13px;font-weight:600;">Tool Versions</span></div>`;

      html += '<div class="git-section">';
      html += `<div class="git-section-header">Detected Tools <span class="git-count">${results.length}</span></div>`;
      html += results.map((r, idx) => {
        const mismatch = r.required && !versionSatisfies(r.current, r.required);
        const needsFix = !r.ok || mismatch;
        const statusIcon = !r.ok ? '✕' : mismatch ? '⚠' : '✓';
        const statusColor = !r.ok ? 'var(--red)' : mismatch ? 'var(--yellow)' : 'var(--green)';
        const fixes = r.fixes || [];

        let row = `<div class="env-row-wrap">
          <div class="env-row">
            <span class="env-status" style="color:${statusColor};">${statusIcon}</span>
            <span class="env-tool">${esc(r.tool)}</span>
            <span class="env-version">${esc(r.current)}</span>
            ${r.required ? `<span class="env-required">needs <strong>${esc(r.required)}</strong></span>` : '<span class="env-required"></span>'}
            ${r.source ? `<span class="env-source">${esc(r.source)}</span>` : '<span class="env-source"></span>'}
          </div>`;

        if (fixes.length > 0 && needsFix) {
          row += `<div class="env-fix-row">`;
          row += fixes.map((fix, fi) =>
            `<button class="env-fix-btn ${fix.info ? 'env-fix-info' : ''}" data-idx="${idx}" data-fix="${fi}" title="${esc(fix.cmd)}">${esc(fix.label)}</button>`
          ).join('');
          row += `</div>`;
        }

        row += '</div>';
        return row;
      }).join('');
      html += '</div>';

      // Summary
      const missing = results.filter(r => !r.ok);
      const mismatched = results.filter(r => r.ok && r.required && !versionSatisfies(r.current, r.required));
      if (missing.length > 0 || mismatched.length > 0) {
        html += '<div class="env-warnings">';
        if (missing.length > 0) {
          html += `<div class="env-warn-item" style="color:var(--red);">✕ Missing: ${missing.map(r => r.tool).join(', ')}</div>`;
        }
        if (mismatched.length > 0) {
          html += `<div class="env-warn-item" style="color:var(--yellow);">⚠ Version mismatch: ${mismatched.map(r => `${r.tool} (have ${r.current}, need ${r.required})`).join(', ')}</div>`;
        }
        html += '</div>';
      } else {
        html += '<div class="env-warnings" style="color:var(--green);">✓ All tools installed and versions look good</div>';
      }

      // Fix output area (hidden until a fix is run)
      html += `<div class="env-fix-output" id="env-fix-output" style="display:none;">
        <div class="env-fix-output-header"><span id="env-fix-output-title"></span><button class="git-file-btn" id="env-fix-output-close" style="opacity:1;">✕</button></div>
        <pre class="env-fix-output-content" id="env-fix-output-content"></pre>
      </div>`;

      html += '</div>';
      panel.innerHTML = html;

      // Wire up fix buttons
      panel.querySelectorAll('.env-fix-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.idx);
          const fi = parseInt(btn.dataset.fix);
          const fix = results[idx]?.fixes?.[fi];
          if (!fix) return;

          const outputEl = document.getElementById('env-fix-output');
          const titleEl = document.getElementById('env-fix-output-title');
          const contentEl = document.getElementById('env-fix-output-content');

          if (fix.info) {
            // Info-only — just show the command to copy
            outputEl.style.display = 'flex';
            titleEl.textContent = 'Run this in your terminal:';
            contentEl.textContent = fix.cmd;
            contentEl.style.userSelect = 'text';
            contentEl.style.webkitUserSelect = 'text';
            return;
          }

          // Run the fix
          btn.disabled = true;
          btn.textContent = 'Running...';
          btn.disabled = true;
          outputEl.style.display = 'flex';
          titleEl.textContent = `Running: ${fix.label}`;
          contentEl.textContent = `$ ${fix.cmd}\n\n`;
          contentEl.style.color = '';

          try {
            const result = await window.api.runEnvFix(project.path, fix.cmd);
            if (result.success) {
              contentEl.textContent += (result.output || '') + '\n✓ Done';
              contentEl.style.color = 'var(--green)';
              setTimeout(() => renderEnvPanel(project), 1500);
            } else {
              contentEl.textContent += (result.error || 'Unknown error');
              contentEl.style.color = 'var(--red)';
              btn.disabled = false;
              btn.textContent = fix.label;
            }
          } catch (err) {
            contentEl.textContent += (err.message || 'Unknown error');
            contentEl.style.color = 'var(--red)';
            btn.disabled = false;
            btn.textContent = fix.label;
          }
        });
      });

      // Close output
      document.getElementById('env-fix-output-close')?.addEventListener('click', () => {
        document.getElementById('env-fix-output').style.display = 'none';
      });

    } catch (e) {
      panel.innerHTML = `<div class="env-panel-inner"><div class="terminal-placeholder" style="color:var(--red);">Error: ${esc(e.message || String(e))}</div></div>`;
    }
  }

  // Script event listeners
  window.api.onScriptOutput(({ projectId, script, data }) => {
    const key = `${projectId}:${script}`;
    scriptOutputs[key] = (scriptOutputs[key] || '') + data;
    // Live-update the output viewer if it's showing this script
    const viewer = document.getElementById('script-output-viewer');
    const content = document.getElementById('script-output-content');
    if (viewer && content && viewer.dataset.activeKey === key) {
      content.textContent = scriptOutputs[key];
      content.scrollTop = content.scrollHeight;
    }
  });

  window.api.onScriptExit(({ projectId, script, code }) => {
    const key = `${projectId}:${script}`;
    runningScriptKeys.delete(key);
    // Re-render scripts panel if viewing this project
    if (selectedId === projectId && activeDetailTab === 'scripts') {
      const p = projects.find(p => p.id === projectId);
      if (p) renderScriptsPanel(p);
    }
  });

  // ── Port conflict detection ────────────────────────────────────
  async function checkPortConflicts() {
    const conflicts = await window.api.detectPortConflicts(projects);
    const existing = document.getElementById('port-conflict-warning');
    if (existing) existing.remove();

    const entries = Object.entries(conflicts);
    if (entries.length === 0) return;

    const p = projects.find(p => p.id === selectedId);
    if (!p) return;

    // Only show warning if current project is involved in a conflict
    let relevant = false;
    let warningText = '';
    for (const [port, projs] of entries) {
      if (projs.some(pr => pr.id === p.id)) {
        relevant = true;
        const others = projs.filter(pr => pr.id !== p.id).map(pr => pr.name).join(', ');
        warningText = `Port ${port} is also used by: ${others}`;
      }
    }
    if (!relevant) return;

    const metaEl = document.getElementById('detail-meta');
    if (metaEl) {
      const warning = document.createElement('div');
      warning.id = 'port-conflict-warning';
      warning.className = 'port-conflict-warning';
      warning.innerHTML = `⚠️ ${esc(warningText)}`;
      metaEl.after(warning);
    }
  }

  const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;
  function linkifyLog(escapedLine) {
    return escapedLine.replace(URL_RE, (url) =>
      `<a class="log-link" href="#" data-url="${url}">${url}</a>`
    );
  }

  function renderLogs(projectId, viewer) {
    if (!viewer) return;
    const logs = logBuffers[projectId] || [];
    if (!logFilter) {
      viewer.innerHTML = logs.map(line => linkifyLog(esc(line))).join('');
    } else {
      const re = new RegExp(`(${logFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      viewer.innerHTML = logs.map(line => linkifyLog(esc(line)).replace(re, '<span class="log-highlight">$1</span>')).join('');
    }
    viewer.scrollTop = viewer.scrollHeight;
  }

  // ── Ports view ──────────────────────────────────────────────────
  async function renderPortsPanel() {
    const panel = document.getElementById('ports-panel');
    panel.innerHTML = '<div class="ports-header"><h2>Listening Ports</h2><button class="btn" id="ports-refresh" style="font-size:12px;padding:3px 10px;">↻ Refresh</button></div><div style="color:var(--text-dim);font-size:13px;">Scanning...</div>';
    document.getElementById('ports-refresh')?.addEventListener('click', renderPortsPanel);

    const ports = await window.api.getPorts();
    if (ports.length === 0) {
      panel.innerHTML = '<div class="ports-header"><h2>Listening Ports</h2><button class="btn" id="ports-refresh" style="font-size:12px;padding:3px 10px;">↻ Refresh</button></div><div style="color:var(--text-dim);font-size:13px;">No ports currently in use.</div>';
      document.getElementById('ports-refresh')?.addEventListener('click', renderPortsPanel);
      return;
    }

    // Common HTTP/dev ports — show Open button for these
    const httpLikePorts = new Set([80, 443, 3000, 3001, 3002, 4000, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8443, 8888, 9000, 9229]);
    const isHttpPort = (port) => httpLikePorts.has(port) || (port >= 3000 && port <= 9999);

    panel.innerHTML = '<div class="ports-header"><h2>Listening Ports</h2><button class="btn" id="ports-refresh" style="font-size:12px;padding:3px 10px;">↻ Refresh</button></div>' +
      ports.map(p =>
        `<div class="port-row" data-pid="${p.pid}" data-port="${p.port}">
          <span class="port-number">:${p.port}</span>
          <span class="port-process">${esc(p.process)} <span class="port-pid">pid ${p.pid}</span></span>
          <div class="port-actions">
            ${isHttpPort(p.port) ? `<button class="port-open btn" data-port="${p.port}" title="Open in browser">↗ Open</button>` : ''}
            <button class="port-kill btn btn-danger" data-pid="${p.pid}" data-port="${p.port}" title="Kill process">✕ Kill</button>
          </div>
        </div>`
      ).join('');

    document.getElementById('ports-refresh')?.addEventListener('click', renderPortsPanel);

    panel.querySelectorAll('.port-open').forEach(btn => {
      btn.addEventListener('click', () => window.api.openUrl(`http://localhost:${btn.dataset.port}`));
    });

    panel.querySelectorAll('.port-kill').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = parseInt(btn.dataset.pid);
        const port = btn.dataset.port;
        btn.textContent = 'Killing...';
        btn.disabled = true;
        const result = await window.api.killPort(pid, port);
        if (result.success) {
          const row = btn.closest('.port-row');
          row.style.opacity = '0.4';
          row.style.pointerEvents = 'none';
          setTimeout(renderPortsPanel, 800);
        } else {
          btn.textContent = '✕ Kill';
          btn.disabled = false;
          btn.title = result.error || 'Failed to kill';
        }
      });
    });
  }

  // ── System Logs ──────────────────────────────────────────────────
  let sysLogs = [];
  let syslogLevelFilter = 'all';
  let syslogSearch = '';
  let syslogsFetched = false;

  async function renderSyslog() {
    const viewer = document.getElementById('syslog-viewer');
    if (!viewer) return;

    // Load existing logs on first render (only once, not after clear)
    if (!syslogsFetched) {
      sysLogs = await window.api.getAppLogs() || [];
      syslogsFetched = true;
    }

    const filtered = sysLogs.filter(log => {
      if (syslogLevelFilter !== 'all' && log.level !== syslogLevelFilter) return false;
      if (syslogSearch && !log.msg.toLowerCase().includes(syslogSearch.toLowerCase())) return false;
      return true;
    });

    if (filtered.length === 0) {
      viewer.innerHTML = '<div style="padding:20px;color:var(--text-dim);font-size:13px;text-align:center;">No logs to display.</div>';
      return;
    }

    const levelColors = { info: 'var(--blue)', warn: 'var(--yellow)', error: 'var(--red)' };
    const levelLabels = { info: 'INF', warn: 'WRN', error: 'ERR' };

    viewer.innerHTML = filtered.map(log => {
      const time = new Date(log.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const color = levelColors[log.level] || 'var(--text-dim)';
      const label = levelLabels[log.level] || log.level;
      return `<div class="syslog-entry ${log.level}">
        <span class="syslog-time">${time}</span>
        <span class="syslog-level" style="color:${color};">${label}</span>
        <span class="syslog-msg">${esc(log.msg)}</span>
      </div>`;
    }).join('');

    viewer.scrollTop = viewer.scrollHeight;
  }

  // Live log streaming
  window.api.onAppLog((entry) => {
    sysLogs.push(entry);
    if (sysLogs.length > 500) sysLogs.splice(0, sysLogs.length - 500);
    if (currentView === 'syslog') renderSyslog();
  });

  // Syslog controls
  setTimeout(() => {
    const levelFilter = document.getElementById('syslog-level-filter');
    if (levelFilter) levelFilter.addEventListener('change', (e) => { syslogLevelFilter = e.target.value; renderSyslog(); });

    const searchInput = document.getElementById('syslog-search');
    if (searchInput) searchInput.addEventListener('input', (e) => { syslogSearch = e.target.value; renderSyslog(); });

    const clearBtn = document.getElementById('btn-clear-syslog');
    if (clearBtn) clearBtn.addEventListener('click', async () => {
      sysLogs = [];
      await window.api.clearAppLogs();
      const viewer = document.getElementById('syslog-viewer');
      if (viewer) viewer.innerHTML = '<div style="padding:20px;color:var(--text-dim);font-size:13px;text-align:center;">Logs cleared.</div>';
    });
  }, 100);

  function updateView() {
    ['projects', 'logs', 'ports', 'syslog'].forEach(view => {
      const btn = document.getElementById(`btn-view-${view}`);
      if (!btn) return;
      const active = currentView === view;
      btn.style.background = active ? 'var(--accent)' : '';
      btn.style.borderColor = active ? 'var(--accent)' : '';
      btn.style.color = active ? '#fff' : '';
    });

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('project-detail').style.display = currentView === 'projects' && projects.length ? 'flex' : 'none';
    document.getElementById('ports-panel').style.display = currentView === 'ports' ? 'block' : 'none';
    document.getElementById('unified-logs-panel').style.display = currentView === 'logs' ? 'flex' : 'none';
    document.getElementById('syslog-panel').style.display = currentView === 'syslog' ? 'flex' : 'none';
    if (!projects.length && currentView === 'projects') document.getElementById('empty-state').style.display = 'flex';
    if (currentView === 'ports') renderPortsPanel();
    if (currentView === 'syslog') renderSyslog();
  }

  // ── Modal ───────────────────────────────────────────────────────
  function getCommandsSummary(p) {
    if (p.commands && p.commands.length > 0) return p.commands.map(c => c.cmd).join(' + ');
    return p.command || '';
  }

  function renderCommandRows() {
    const list = document.getElementById('commands-list');
    list.innerHTML = modalCommands.map((c, i) => `
      <div class="cmd-row">
        <input class="cmd-label" type="text" placeholder="label" value="${esc(c.label)}" data-idx="${i}" data-field="label" />
        <input class="cmd-input" type="text" placeholder="npm run dev" value="${esc(c.cmd)}" data-idx="${i}" data-field="cmd" />
        <input class="cmd-cwd" type="text" placeholder="(subdir)" value="${esc(c.cwd || '')}" data-idx="${i}" data-field="cwd" />
        ${modalCommands.length > 1 ? `<button class="btn-remove-cmd" data-idx="${i}">&times;</button>` : ''}
      </div>`).join('');
    list.querySelectorAll('input').forEach(el => {
      el.addEventListener('input', () => { modalCommands[parseInt(el.dataset.idx)][el.dataset.field] = el.value; });
    });
    list.querySelectorAll('.btn-remove-cmd').forEach(el => {
      el.addEventListener('click', () => { modalCommands.splice(parseInt(el.dataset.idx), 1); renderCommandRows(); });
    });
  }

  function openModal(project = null) {
    editingId = project ? project.id : null;
    document.getElementById('modal-title').textContent = project ? 'Edit Project' : 'Add Project';
    // Show mode tabs only when adding, not editing
    document.getElementById('modal-mode-tabs').style.display = project ? 'none' : '';
    setModalMode('existing');
    // Reset clone/scaffold fields
    ['clone-url','clone-dest','clone-cmd','scaffold-name','scaffold-dest'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['clone-status','scaffold-status'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.getElementById('btn-clone').disabled = false; document.getElementById('btn-clone').textContent = 'Clone & Add';
    document.getElementById('btn-scaffold').disabled = false; document.getElementById('btn-scaffold').textContent = 'Create & Add';
    document.getElementById('input-name').value = project ? project.name : '';
    document.getElementById('input-path').value = project ? project.path : '';
    document.getElementById('input-url').value = project ? (project.url || '') : '';
    document.getElementById('input-icon').value = project ? (project.icon || '') : '';
    document.getElementById('input-env').value = project ? (project.envVars || '') : '';
    autoRestart = project ? !!project.autoRestart : false;
    selectedColor = project ? (project.color || '') : '';
    document.getElementById('toggle-autorestart').className = 'toggle' + (autoRestart ? ' on' : '');
    document.getElementById('input-git-name').value = project && project.gitIdentity ? (project.gitIdentity.name || '') : '';
    document.getElementById('input-git-email').value = project && project.gitIdentity ? (project.gitIdentity.email || '') : '';
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === selectedColor));

    if (project && project.commands && project.commands.length > 0) modalCommands = project.commands.map(c => ({ ...c }));
    else if (project && project.command) modalCommands = [{ label: 'main', cmd: project.command, cwd: '' }];
    else modalCommands = [{ label: 'main', cmd: '', cwd: '' }];
    renderCommandRows();
    document.getElementById('modal').style.display = 'flex';
    document.getElementById('input-name').focus();
  }

  function closeModal() { document.getElementById('modal').style.display = 'none'; editingId = null; }

  async function saveModal() {
    const name = document.getElementById('input-name').value.trim();
    const projPath = document.getElementById('input-path').value.trim();
    const url = document.getElementById('input-url').value.trim();
    const icon = document.getElementById('input-icon').value.trim();
    const envVars = document.getElementById('input-env').value;
    const commands = modalCommands.filter(c => c.cmd.trim()).map(c => ({
      label: c.label.trim() || 'main', cmd: c.cmd.trim(),
      cwd: c.cwd.trim() ? (c.cwd.trim().startsWith('/') ? c.cwd.trim() : projPath + '/' + c.cwd.trim()) : projPath,
    }));
    if (!name || !projPath) return;
    const gitName = document.getElementById('input-git-name').value.trim();
    const gitEmail = document.getElementById('input-git-email').value.trim();
    const gitIdentity = (gitName || gitEmail) ? { name: gitName, email: gitEmail } : null;
    const command = commands.length > 0 ? commands[0].cmd : '';
    const data = { name, path: projPath, command, commands, url, icon, color: selectedColor, autoRestart, envVars, gitIdentity };
    if (editingId) { const p = projects.find(p => p.id === editingId); if (p) Object.assign(p, data); }
    else projects.push({ id: crypto.randomUUID(), ...data });
    await window.api.saveProjects(projects);
    // Apply git identity to the repo's local config
    if (gitIdentity && projPath) window.api.gitSetIdentity(projPath, gitIdentity);
    closeModal(); renderSidebar();
    if (editingId || projects.length === 1) selectProject(editingId || projects[projects.length - 1].id);
    refreshGitStatuses();
  }

  async function deleteProject(id) {
    if (statuses[id] === 'running') await window.api.stopProject(id);
    await window.api.destroyProjectTerminals(id);
    projects = projects.filter(p => p.id !== id);
    await window.api.saveProjects(projects);
    delete statuses[id]; delete logBuffers[id]; delete gitCache[id]; delete resourceCache[id];
    if (selectedId === id) selectedId = projects.length ? projects[0].id : null;
    renderSidebar();
    if (selectedId) renderDetail();
  }

  // ── IPC listeners ───────────────────────────────────────────────
  window.api.onProjectStatus(async ({ id, status }) => {
    statuses[id] = status;
    // Reload projects to pick up lastStarted timestamps
    if (status === 'running') projects = await window.api.getProjects();
    renderSidebar();
    if (id === selectedId) renderDetail();
  });

  window.api.onProjectLog(({ id, line }) => {
    if (!logBuffers[id]) logBuffers[id] = [];
    logBuffers[id].push(line);
    if (logBuffers[id].length > 1000) logBuffers[id].shift();
    if (id === selectedId) {
      const viewer = document.getElementById('log-viewer');
      if (viewer) {
        if (!logFilter) { viewer.innerHTML += linkifyLog(esc(line)); }
        else { renderLogs(id, viewer); }
        viewer.scrollTop = viewer.scrollHeight;
      }
    }
    // Feed unified logs
    const proj = projects.find(p => p.id === id);
    if (proj) {
      unifiedLogs.push({ projectName: proj.name, projectColor: proj.color || 'var(--accent)', text: line });
      if (unifiedLogs.length > 2000) unifiedLogs.shift();
      if (currentView === 'logs') renderUnifiedLogs();
    }
  });

  // ── Event bindings ──────────────────────────────────────────────
  document.getElementById('project-search').addEventListener('input', (e) => { projectSearch = e.target.value; renderSidebar(); });
  document.getElementById('btn-add').addEventListener('click', () => openModal());
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-save').addEventListener('click', saveModal);
  document.getElementById('btn-add-cmd').addEventListener('click', () => { modalCommands.push({ label: '', cmd: '', cwd: '' }); renderCommandRows(); });
  // Emoji picker
  const emojiList = ['🚀','💻','🌐','🔥','⚡','🎨','🛠️','📦','🧪','🐍','🐳','☕','💎','🎯','📡','🔒','🤖','📊','🎮','💬','🛒','📱','🗄️','🧠','⭐','🔔','🌙','☁️','🍃','❤️'];
  const dropdown = document.getElementById('emoji-picker-dropdown');
  emojiList.forEach(e => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.emoji = e;
    btn.textContent = e;
    dropdown.appendChild(btn);
  });
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'emoji-clear';
  clearBtn.dataset.emoji = '';
  clearBtn.textContent = 'Clear icon';
  dropdown.appendChild(clearBtn);

  // Auto-select content on focus so new emoji replaces the old one
  document.getElementById('input-icon').addEventListener('focus', (e) => { e.target.select(); });

  document.getElementById('btn-emoji-picker').addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'grid' : 'none';
  });
  dropdown.addEventListener('click', (e) => {
    const emoji = e.target.dataset.emoji;
    if (emoji !== undefined) {
      document.getElementById('input-icon').value = emoji;
      dropdown.style.display = 'none';
    }
  });
  document.addEventListener('click', () => { dropdown.style.display = 'none'; });

  // ── Modal mode tabs ──────────────────────────────────────────────
  let currentModalMode = 'existing';
  function setModalMode(mode) {
    currentModalMode = mode;
    document.querySelectorAll('.modal-mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    document.getElementById('modal-existing-section').style.display = mode === 'existing' ? '' : 'none';
    document.getElementById('modal-clone-section').style.display   = mode === 'clone'    ? '' : 'none';
    document.getElementById('modal-scaffold-section').style.display = mode === 'scaffold' ? '' : 'none';
  }
  document.querySelectorAll('.modal-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => setModalMode(tab.dataset.mode));
  });

  // ── Clone mode ───────────────────────────────────────────────────
  document.getElementById('btn-cancel-clone').addEventListener('click', closeModal);
  document.getElementById('btn-browse-clone').addEventListener('click', async () => {
    const folder = await window.api.pickFolder();
    if (folder) document.getElementById('clone-dest').value = folder;
  });
  document.getElementById('btn-clone').addEventListener('click', async () => {
    const url  = document.getElementById('clone-url').value.trim();
    const dest = document.getElementById('clone-dest').value.trim();
    const cmd  = document.getElementById('clone-cmd').value.trim();
    if (!url || !dest) return;
    const btn = document.getElementById('btn-clone');
    const status = document.getElementById('clone-status');
    btn.disabled = true; btn.textContent = 'Cloning...';
    status.style.display = ''; status.className = 'clone-status'; status.textContent = `Cloning ${url}...`;
    const result = await window.api.gitClone(url, dest);
    if (result.error) {
      status.className = 'clone-status error'; status.textContent = result.error;
      btn.disabled = false; btn.textContent = 'Clone & Add';
      return;
    }
    status.className = 'clone-status success'; status.textContent = `Cloned into ${result.path}`;
    // Auto-detect and add as project
    const detected = await window.api.detectProject(result.path);
    const name = result.name;
    const commands = cmd ? [{ label: 'main', cmd, cwd: result.path }]
      : (detected && detected.commands && detected.commands.length > 0 ? detected.commands.map(c => ({ ...c, cwd: result.path })) : []);
    const command = commands.length > 0 ? commands[0].cmd : '';
    const newProject = { id: crypto.randomUUID(), name, path: result.path, command, commands, url: '', color: '', autoRestart: false, envVars: '' };
    projects.push(newProject);
    await window.api.saveProjects(projects);
    closeModal(); renderSidebar(); selectProject(newProject.id);
  });

  // ── Scaffold mode ────────────────────────────────────────────────
  let selectedTpl = 'vite-react';
  document.querySelectorAll('.scaffold-tpl').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTpl = btn.dataset.tpl;
      document.querySelectorAll('.scaffold-tpl').forEach(b => b.classList.toggle('active', b.dataset.tpl === selectedTpl));
    });
  });
  document.getElementById('btn-cancel-scaffold').addEventListener('click', closeModal);
  document.getElementById('btn-browse-scaffold').addEventListener('click', async () => {
    const folder = await window.api.pickFolder();
    if (folder) document.getElementById('scaffold-dest').value = folder;
  });
  document.getElementById('btn-scaffold').addEventListener('click', async () => {
    const name = document.getElementById('scaffold-name').value.trim();
    const dest = document.getElementById('scaffold-dest').value.trim();
    if (!name || !dest) return;
    const btn = document.getElementById('btn-scaffold');
    const status = document.getElementById('scaffold-status');
    btn.disabled = true; btn.textContent = 'Creating...';
    status.style.display = ''; status.className = 'clone-status'; status.textContent = `Scaffolding ${name}...`;
    const result = await window.api.scaffoldProject(selectedTpl, name, dest);
    if (result.error) {
      status.className = 'clone-status error'; status.textContent = result.error;
      btn.disabled = false; btn.textContent = 'Create & Add';
      return;
    }
    status.className = 'clone-status success'; status.textContent = `Created at ${result.path}`;
    const tplCmds = { 'vite-react': 'npm run dev', 'nextjs': 'npm run dev', 'node': 'node index.js', 'python': 'python3 main.py', 'go': 'go run .' };
    const command = tplCmds[selectedTpl] || '';
    const commands = command ? [{ label: 'main', cmd: command, cwd: result.path }] : [];
    const newProject = { id: crypto.randomUUID(), name, path: result.path, command, commands, url: '', color: '', autoRestart: false, envVars: '' };
    projects.push(newProject);
    await window.api.saveProjects(projects);
    closeModal(); renderSidebar(); selectProject(newProject.id);
  });

  document.getElementById('toggle-autorestart').addEventListener('click', (e) => {
    autoRestart = !autoRestart;
    e.currentTarget.className = 'toggle' + (autoRestart ? ' on' : '');
  });

  document.querySelectorAll('.color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      selectedColor = s.dataset.color;
      document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.color === selectedColor));
    });
  });

  document.getElementById('btn-start-all').addEventListener('click', async () => {
    for (const p of projects) {
      if (statuses[p.id] !== 'running') { logBuffers[p.id] = []; await window.api.startProject(p); }
    }
  });

  document.getElementById('btn-stop-all').addEventListener('click', async () => {
    for (const p of projects) { if (statuses[p.id] === 'running') await window.api.stopProject(p.id); }
  });

  document.getElementById('btn-view-projects').addEventListener('click', () => { currentView = 'projects'; updateView(); if (selectedId) renderDetail(); });
  document.getElementById('btn-view-logs').addEventListener('click', () => { currentView = 'logs'; updateView(); renderUnifiedLogs(); });
  document.getElementById('btn-view-ports').addEventListener('click', () => { currentView = 'ports'; updateView(); });
  document.getElementById('btn-view-syslog').addEventListener('click', () => { currentView = 'syslog'; updateView(); });

  // Onboarding button
  document.getElementById('btn-onboard-add')?.addEventListener('click', () => openModal());

  // Unified log controls
  document.getElementById('unified-log-search').addEventListener('input', (e) => { unifiedLogFilter = e.target.value; renderUnifiedLogs(); });
  document.getElementById('btn-clear-unified-logs').addEventListener('click', () => { unifiedLogs.length = 0; renderUnifiedLogs(); });

  document.getElementById('btn-browse').addEventListener('click', async () => {
    const folder = await window.api.pickFolder();
    if (!folder) return;
    document.getElementById('input-path').value = folder;
    const hint = document.getElementById('detect-hint');
    hint.textContent = 'Detecting project type...'; hint.style.color = 'var(--yellow)';
    const detected = await window.api.detectProject(folder);
    if (detected) {
      if (!document.getElementById('input-name').value) document.getElementById('input-name').value = detected.name;
      if (detected.commands && detected.commands.length > 0) {
        modalCommands = detected.commands.map(c => ({ label: c.label, cmd: c.cmd, cwd: c.cwd.replace(folder + '/', '').replace(folder, '') || '' }));
      } else if (detected.command && modalCommands.length === 1 && !modalCommands[0].cmd) {
        modalCommands = [{ label: 'main', cmd: detected.command, cwd: '' }];
      }
      renderCommandRows();
      if (!document.getElementById('input-url').value && detected.url) document.getElementById('input-url').value = detected.url;
      hint.textContent = `Auto-detected: ${detected.type} project`; hint.style.color = 'var(--green)';
    } else { hint.textContent = 'Could not auto-detect — enter the start command manually'; hint.style.color = 'var(--text-dim)'; }
  });

  // Profile modal
  document.getElementById('profile-cancel').addEventListener('click', () => { document.getElementById('profile-modal').style.display = 'none'; });
  document.getElementById('profile-save').addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim();
    const checks = document.querySelectorAll('#profile-project-list input:checked');
    const ids = Array.from(checks).map(c => c.value);
    if (!name || ids.length === 0) return;
    profiles.push({ name, projectIds: ids });
    await window.api.saveProfiles(profiles);
    document.getElementById('profile-modal').style.display = 'none';
    renderProfiles();
  });

  // Settings modal
  document.getElementById('btn-settings').addEventListener('click', async () => {
    const settings = await window.api.getSettings();
    document.getElementById('settings-terminal').value = settings.terminal || 'Terminal';
    document.getElementById('settings-theme').value = settings.theme || 'dark';
    document.getElementById('settings-terminal-theme').value = settings.terminalTheme || 'system';
    document.getElementById('settings-notification-sound').checked = settings.notificationSound !== false;
    document.getElementById('settings-modal').style.display = 'flex';
  });
  document.getElementById('settings-export').addEventListener('click', () => { exportConfig(); });
  document.getElementById('settings-import').addEventListener('click', () => { importConfig(); });
  document.getElementById('settings-cancel').addEventListener('click', () => { document.getElementById('settings-modal').style.display = 'none'; });
  document.getElementById('settings-save').addEventListener('click', async () => {
    const settings = await window.api.getSettings();
    settings.terminal = document.getElementById('settings-terminal').value;
    settings.theme = document.getElementById('settings-theme').value;
    settings.terminalTheme = document.getElementById('settings-terminal-theme').value;
    settings.notificationSound = document.getElementById('settings-notification-sound').checked;
    await window.api.saveSettings(settings);
    applyTheme(settings.theme);
    terminalThemeSetting = settings.terminalTheme || 'system';
    applyTerminalTheme();
    document.getElementById('settings-modal').style.display = 'none';
  });

  let currentThemeSetting = 'system';

  function applyTheme(theme) {
    currentThemeSetting = theme || 'system';
    if (theme === 'system' || !theme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (terminalThemeSetting === 'system') applyTerminalTheme();
  }

  // Listen for OS theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentThemeSetting === 'system') applyTheme('system');
  });

  // Apply saved theme on load
  window.api.getSettings().then(s => {
    terminalThemeSetting = s.terminalTheme || 'system';
    applyTheme(s.theme);
    applyTerminalTheme();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); document.getElementById('profile-modal').style.display = 'none'; document.getElementById('settings-modal').style.display = 'none'; }
    if (e.key === 'Enter' && document.getElementById('modal').style.display === 'flex' && !e.target.closest('.cmd-row') && e.target.tagName !== 'TEXTAREA') saveModal();

    // Skip shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    const meta = e.metaKey || e.ctrlKey;

    // ⌘1-9 jump to project
    if (meta && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (projects[idx]) { currentView = 'projects'; updateView(); selectProject(projects[idx].id); }
    }

    // ⌘R restart selected project
    if (meta && e.key === 'r' && selectedId) {
      e.preventDefault();
      const p = projects.find(p => p.id === selectedId);
      if (p && statuses[p.id] === 'running') {
        window.api.stopProject(p.id).then(() => { logBuffers[p.id] = []; setTimeout(() => window.api.startProject(p), 500); });
      } else if (p) {
        logBuffers[p.id] = []; window.api.startProject(p);
      }
    }

    // ⌘F search — terminal search when terminal tab active, otherwise project search
    if (meta && e.key === 'f') {
      e.preventDefault();
      if (activeDetailTab === 'terminal' && selectedId) {
        openTerminalSearch();
      } else {
        document.getElementById('project-search').focus();
      }
    }

    // ⌘N new project
    if (meta && e.key === 'n') {
      e.preventDefault();
      openModal();
    }

    // ⌘K clear terminal
    if (meta && e.key === 'k' && activeDetailTab === 'terminal' && selectedId) {
      e.preventDefault();
      const state = projectTerminalTabs[selectedId];
      if (state && activeTerminals[state.activeTab]) {
        activeTerminals[state.activeTab].term.clear();
      }
    }

    // Terminal font zoom: ⌘+/⌘-/⌘0
    if (meta && activeDetailTab === 'terminal' && selectedId) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        terminalFontSize = Math.min(terminalFontSize + 1, 24);
        applyTerminalFontSize();
      }
      if (e.key === '-') {
        e.preventDefault();
        terminalFontSize = Math.max(terminalFontSize - 1, 8);
        applyTerminalFontSize();
      }
      if (e.key === '0') {
        e.preventDefault();
        terminalFontSize = 13;
        applyTerminalFontSize();
      }
    }
  });

  // ── Clone project ──────────────────────────────────────────────
  async function cloneProject(p) {
    const clone = { ...p, id: crypto.randomUUID(), name: p.name + ' (copy)' };
    if (clone.commands) clone.commands = clone.commands.map(c => ({ ...c }));
    delete clone.lastStarted;
    projects.push(clone);
    await window.api.saveProjects(projects);
    renderSidebar();
    selectProject(clone.id);
  }

  // ── Health check ──────────────────────────────────────────────
  async function runHealthCheck(url) {
    const el = document.getElementById('health-indicator');
    if (!el) return;
    try {
      const result = await window.api.checkHealth(url);
      if (result && result.ok) {
        el.innerHTML = `<span class="meta-label">Health:</span><span class="resource-badge" style="color:var(--green);">UP ${result.responseTime}ms</span>`;
      } else if (result) {
        el.innerHTML = `<span class="meta-label">Health:</span><span class="resource-badge" style="color:var(--red);">DOWN ${result.statusCode || ''}</span>`;
      }
    } catch (_) {
      el.innerHTML = `<span class="meta-label">Health:</span><span class="resource-badge" style="color:var(--text-dim);">unknown</span>`;
    }
  }

  // ── Unified logs view ─────────────────────────────────────────
  function renderUnifiedLogs() {
    const viewer = document.getElementById('unified-log-viewer');
    if (!viewer) return;
    const filtered = unifiedLogFilter
      ? unifiedLogs.filter(l => l.text.toLowerCase().includes(unifiedLogFilter.toLowerCase()))
      : unifiedLogs;
    viewer.innerHTML = filtered.map(l => {
      const color = l.projectColor || 'var(--accent)';
      return `<span style="color:${color};font-weight:600;">[${esc(l.projectName)}]</span> ${esc(l.text)}`;
    }).join('');
    viewer.scrollTop = viewer.scrollHeight;
  }

  // ── Export/Import config ──────────────────────────────────────
  async function exportConfig() {
    const data = await window.api.exportConfig();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'local-dev-manager-config.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async function importConfig() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        await window.api.importConfig(data);
        projects = await window.api.getProjects();
        profiles = await window.api.getProfiles();
        renderSidebar(); renderProfiles();
        if (projects.length) selectProject(projects[0].id);
      } catch (err) { console.error('Import failed:', err); }
    };
    input.click();
  }

  function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  // Simple version check — just compares major.minor, not full semver range
  function versionSatisfies(current, required) {
    if (!current || !required) return true;
    // Strip leading v
    const c = current.replace(/^v/, '');
    const r = required.replace(/^[>=<~^ ]+/, '').replace(/^v/, '');
    const cp = c.split('.').map(Number);
    const rp = r.split('.').map(Number);
    // If required has >= prefix, check that
    if (required.startsWith('>=')) return cp[0] > rp[0] || (cp[0] === rp[0] && (cp[1] || 0) >= (rp[1] || 0));
    // Rough match — same major
    return cp[0] === rp[0];
  }

  function formatTimeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  init();
