// ── Keyboard Shortcuts ───────────────────────────────────────────
(function () {
  const S = App.state;

  document.addEventListener('keydown', function (e) {
    /* Escape closes all modals */
    if (e.key === 'Escape') {
      App.modal.closeModal();
      document.getElementById('profile-modal').style.display = 'none';
      document.getElementById('settings-modal').style.display = 'none';
    }

    /* Enter saves the project modal (unless in a cmd-row or textarea) */
    if (e.key === 'Enter' && document.getElementById('modal').style.display === 'flex'
        && !e.target.closest('.cmd-row') && e.target.tagName !== 'TEXTAREA') {
      App.modal.saveModal();
    }

    /* Skip shortcuts when typing in form fields */
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    var meta = e.metaKey || e.ctrlKey;

    /* Cmd+1-9 jump to project */
    if (meta && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      var idx = parseInt(e.key) - 1;
      if (S.projects[idx]) {
        S.currentView = 'projects';
        App.app.updateView();
        App.app.selectProject(S.projects[idx].id);
      }
    }

    /* Cmd+R restart selected project */
    if (meta && e.key === 'r' && S.selectedId) {
      e.preventDefault();
      var p = S.projects.find(function (proj) { return proj.id === S.selectedId; });
      if (p && S.statuses[p.id] === 'running') {
        window.api.stopProject(p.id).then(function () {
          S.logBuffers[p.id] = [];
          setTimeout(function () { window.api.startProject(p); }, 500);
        });
      } else if (p) {
        S.logBuffers[p.id] = [];
        window.api.startProject(p);
      }
    }

    /* Cmd+F search */
    if (meta && e.key === 'f') {
      e.preventDefault();
      if (S.activeDetailTab === 'terminal' && S.selectedId) {
        App.terminal.openTerminalSearch();
      } else {
        document.getElementById('project-search').focus();
      }
    }

    /* Cmd+N new project */
    if (meta && e.key === 'n') {
      e.preventDefault();
      App.modal.openModal();
    }

    /* Cmd+K clear terminal */
    if (meta && e.key === 'k' && S.activeDetailTab === 'terminal' && S.selectedId) {
      e.preventDefault();
      var state = S.projectTerminalTabs[S.selectedId];
      if (state && S.activeTerminals[state.activeTab]) {
        S.activeTerminals[state.activeTab].term.clear();
      }
    }

    /* Terminal font zoom */
    if (meta && S.activeDetailTab === 'terminal' && S.selectedId) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        S.terminalFontSize = Math.min(S.terminalFontSize + 1, 24);
        App.terminal.applyTerminalFontSize();
      }
      if (e.key === '-') {
        e.preventDefault();
        S.terminalFontSize = Math.max(S.terminalFontSize - 1, 8);
        App.terminal.applyTerminalFontSize();
      }
      if (e.key === '0') {
        e.preventDefault();
        S.terminalFontSize = 13;
        App.terminal.applyTerminalFontSize();
      }
    }
  });

  /* ── Exports ────────────────────────────────────────────────── */

  App.shortcuts = {};
})();
