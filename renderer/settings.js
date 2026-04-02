// ── Settings & Theme ──────────────────────────────────────────────
(function () {
  const S = App.state;
  const { esc } = App.utils;

  function applyTheme(theme) {
    S.currentThemeSetting = theme || 'system';
    if (theme === 'system' || !theme) {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (S.terminalThemeSetting === 'system') App.terminal.applyTerminalTheme();
  }

  // ── OS theme change listener ────────────────────────────────────
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (S.currentThemeSetting === 'system') {
      applyTheme('system');
    }
  });

  // ── Initial theme load ──────────────────────────────────────────
  window.api.getSettings().then(function (s) {
    S.terminalThemeSetting = s.terminalTheme || 'system';
    applyTheme(s.theme);
    App.terminal.applyTerminalTheme();
  });

  function exportConfig() {
    window.api.exportConfig().then(function (data) {
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'local-dev-manager-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function importConfig() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = JSON.parse(e.target.result);
          window.api.importConfig(data).then(function () {
            return Promise.all([window.api.getProjects(), window.api.getProfiles()]);
          }).then(function (results) {
            S.projects = results[0] || [];
            S.profiles = results[1] || [];
            App.sidebar.renderSidebar();
            App.sidebar.renderProfiles();
            if (S.projects.length > 0) {
              S.selectedId = S.projects[0].id;
              App.sidebar.renderSidebar();
            }
          });
        } catch (err) {
          console.error('Import failed:', err);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  App.settings = { applyTheme: applyTheme, exportConfig: exportConfig, importConfig: importConfig };
})();
