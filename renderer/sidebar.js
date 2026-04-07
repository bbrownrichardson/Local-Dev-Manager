// ── Sidebar & Profiles ────────────────────────────────────────────
(function () {
  const S = App.state;
  const { esc, getCommandsSummary, showCtxMenu } = App.utils;

  function renderSidebar() {
    const list = document.getElementById('project-list');
    const filtered = S.projectSearch ? S.projects.filter(p => p.name.toLowerCase().includes(S.projectSearch.toLowerCase())) : S.projects;
    list.innerHTML = filtered.map((p) => {
      const i = S.projects.indexOf(p);
      const git = S.gitCache[p.id];
      const gitHtml = git ? '<span class="git-badge ' + (git.dirty ? 'dirty' : '') + '">' + esc(git.branch) + (git.dirty ? ' +' + git.changes : '') + '</span>' : '';
      const isRunning = (S.statuses[p.id] || 'stopped') === 'running';
      return '\
      <div class="project-item ' + (p.id === S.selectedId ? 'active' : '') + '" data-id="' + p.id + '" data-idx="' + i + '" draggable="true">\
        ' + (p.color ? '<div class="project-color-dot" style="background:' + p.color + '"></div>' : '') + '\
        <div class="project-dot ' + ((!p.command && !(p.commands && p.commands.length)) ? 'workspace' : (S.statuses[p.id] || 'stopped')) + '"></div>\
        <div class="project-item-info">\
          <div class="project-item-row-top">\
            <div class="project-item-name">' + (p.icon ? '<span style="font-size:14px;margin-right:6px;">' + p.icon + '</span>' : '') + esc(p.name) + '</div>\
            <div class="project-item-btns">\
              ' + (p.command ? (isRunning
                ? '<button class="pib pib-stop" data-action="stop" title="Stop">&#9632;</button>\
                   <button class="pib pib-restart" data-action="restart" title="Restart">\u21BA</button>'
                : '<button class="pib pib-start" data-action="start" title="Start">&#9654;</button>') : '') + '\
              ' + (p.url && isRunning ? '<button class="pib pib-open" data-action="open" title="Open in browser">\u2197</button>' : '') + '\
              <button class="pib pib-terminal" data-action="terminal" title="Terminal">$</button>\
              ' + (S.aiTool ? '<button class="pib pib-ai" data-action="ai" title="Launch ' + esc((App.aiTools[S.aiTool] || {}).name || S.aiCustomTool.name || 'AI') + '">' + ((App.aiTools[S.aiTool] || {}).logo || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12h8M12 8v8"/></svg>') + '</button>' : '') + '\
            </div>\
          </div>\
          ' + (gitHtml ? '<div class="project-item-branch">' + gitHtml + '</div>' : '') + '\
          <div class="project-item-cmd">' + esc(getCommandsSummary(p)) + '</div>\
        </div>\
      </div>';
    }).join('');

    list.querySelectorAll('.project-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.project-item-btns')) return;
        S.currentView = 'projects'; App.app.updateView(); App.app.selectProject(el.dataset.id);
      });
      el.querySelectorAll('.pib').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const p = S.projects.find(p => p.id === el.dataset.id);
          if (!p) return;
          const action = btn.dataset.action;
          if (action === 'start') { S.logBuffers[p.id] = []; await window.api.startProject(p); }
          else if (action === 'stop') { await window.api.stopProject(p.id); }
          else if (action === 'restart') {
            await window.api.stopProject(p.id);
            S.logBuffers[p.id] = [];
            setTimeout(() => window.api.startProject(p), 500);
          }
          else if (action === 'open' && p.url) { window.api.openUrl(p.url); }
          else if (action === 'terminal') {
            S.currentView = 'projects'; App.app.updateView(); App.app.selectProject(p.id);
            S.activeDetailTab = 'terminal';
            App.app.renderDetail();
          }
          else if (action === 'ai' && S.aiTool) {
            S.currentView = 'projects'; App.app.updateView(); App.app.selectProject(p.id);
            App.app.launchAiSession(p, S.aiTool);
          }
        });
      });
      el.addEventListener('dragstart', (e) => { S.dragSrcIdx = parseInt(el.dataset.idx); e.dataTransfer.effectAllowed = 'move'; });
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault(); el.classList.remove('drag-over');
        const targetIdx = parseInt(el.dataset.idx);
        if (S.dragSrcIdx !== null && S.dragSrcIdx !== targetIdx) {
          const [moved] = S.projects.splice(S.dragSrcIdx, 1);
          S.projects.splice(targetIdx, 0, moved);
          await window.api.saveProjects(S.projects);
          renderSidebar();
        }
        S.dragSrcIdx = null;
      });
    });

    document.getElementById('empty-state').style.display = (S.projects.length && S.currentView === 'projects') ? 'none' : (S.currentView === 'projects' ? 'flex' : 'none');
    document.getElementById('project-detail').style.display = (S.projects.length && S.currentView === 'projects') ? 'flex' : 'none';
    document.getElementById('ports-panel').style.display = S.currentView === 'ports' ? 'block' : 'none';
  }

  function renderProfiles() {
    const sec = document.getElementById('profiles-section');
    if (S.profiles.length === 0) { sec.innerHTML = '<div style="font-size:11px;color:var(--text-dim);cursor:pointer;" id="btn-new-profile">+ Save a startup profile</div>'; }
    else {
      sec.innerHTML = S.profiles.map((pr, i) =>
        '<span class="profile-chip" data-idx="' + i + '">' + esc(pr.name) + ' <span class="x" data-delidx="' + i + '">&times;</span></span>'
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
        S.profiles.splice(parseInt(el.dataset.delidx), 1);
        await window.api.saveProfiles(S.profiles);
        renderProfiles();
      });
    });
    const newBtn = document.getElementById('btn-new-profile');
    if (newBtn) newBtn.addEventListener('click', App.modal.openProfileModal);
  }

  async function launchProfile(idx) {
    const profile = S.profiles[idx];
    if (!profile) return;
    for (const pid of profile.projectIds) {
      const p = S.projects.find(p => p.id === pid);
      if (p && S.statuses[p.id] !== 'running') {
        S.logBuffers[p.id] = [];
        await window.api.startProject(p);
      }
    }
  }

  App.sidebar = { renderSidebar, renderProfiles, launchProfile };
})();
