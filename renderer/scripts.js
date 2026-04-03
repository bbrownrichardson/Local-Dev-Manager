// ── Scripts Panel ─────────────────────────────────────────────────
// All dynamic values are sanitized through esc() before insertion.
(function () {
  const S = App.state;
  const { esc } = App.utils;

  const commonNames = ['dev', 'start', 'serve', 'watch', 'run'];
  const testNames = ['test', 'test:watch', 'test:cov', 'test:e2e', 'lint', 'lint:fix', 'typecheck', 'check', 'vet', 'clippy', 'fmt'];
  const buildNames = ['build', 'compile', 'bundle', 'dist', 'generate', 'deploy', 'preview', 'tidy'];

  function categorize(scripts) {
    var dev = [], testLint = [], buildDeploy = [], other = [];
    Object.keys(scripts).forEach(function (name) {
      var lower = name.toLowerCase();
      if (commonNames.indexOf(lower) !== -1) dev.push(name);
      else if (testNames.indexOf(lower) !== -1) testLint.push(name);
      else if (buildNames.indexOf(lower) !== -1) buildDeploy.push(name);
      else other.push(name);
    });
    return { dev: dev, testLint: testLint, buildDeploy: buildDeploy, other: other };
  }

  function scriptKey(projectId, eco, name) {
    return projectId + ':' + (eco ? eco + ':' : '') + name;
  }

  function scriptMsg(key) {
    var out = S.scriptOutputs[key];
    if (!out) return '';
    return '<pre class="script-output-pre">' + esc(out) + '</pre>';
  }

  function showScriptOutput(key) {
    var viewer = document.getElementById('script-output-viewer');
    if (!viewer) return;
    viewer.style.display = 'block';
    // All content inserted via esc()-sanitized string concatenation
    viewer.innerHTML =
      '<div class="script-output-header">' +
        '<span class="script-output-title">Output: ' + esc(key) + '</span>' +
        '<button class="btn btn-sm script-output-close">Close</button>' +
      '</div>' +
      '<div class="script-output-body" id="script-output-body">' +
        scriptMsg(key) +
      '</div>';
    viewer.querySelector('.script-output-close').addEventListener('click', function () {
      viewer.style.display = 'none';
      viewer.innerHTML = '';
    });
  }

  function renderScriptItem(projectId, name, cmd, eco) {
    var key = scriptKey(projectId, eco, name);
    var isRunning = S.runningScriptKeys.has(key);
    var hasOutput = !!S.scriptOutputs[key];

    return '<div class="script-item" data-key="' + esc(key) + '">' +
      '<div class="script-item-info">' +
        '<span class="script-name">' + esc(name) + '</span>' +
        '<span class="script-cmd">' + esc(cmd) + '</span>' +
      '</div>' +
      '<div class="script-item-actions">' +
        (hasOutput
          ? '<button class="btn btn-sm script-view-btn" data-key="' + esc(key) + '">View Output</button>'
          : '') +
        (isRunning
          ? '<button class="btn btn-sm btn-danger script-stop-btn" data-key="' + esc(key) + '" data-name="' + esc(name) + '" data-eco="' + esc(eco || '') + '">Stop</button>'
          : '<button class="btn btn-sm btn-primary script-run-btn" data-key="' + esc(key) + '" data-name="' + esc(name) + '" data-eco="' + esc(eco || '') + '">Run</button>') +
      '</div>' +
    '</div>';
  }

  function renderCategorized(projectId, scripts, eco) {
    var cats = categorize(scripts);
    var html = '';
    var sections = [
      { label: 'Dev', items: cats.dev },
      { label: 'Test & Lint', items: cats.testLint },
      { label: 'Build & Deploy', items: cats.buildDeploy },
      { label: 'Other', items: cats.other }
    ];
    sections.forEach(function (sec) {
      if (sec.items.length === 0) return;
      html += '<div class="script-category">' +
        '<div class="script-category-label">' + esc(sec.label) + '</div>';
      sec.items.forEach(function (name) {
        html += renderScriptItem(projectId, name, scripts[name], eco);
      });
      html += '</div>';
    });
    return html;
  }

  function resolveScriptCommand(name, scriptType, scripts) {
    if (scriptType === 'npm' || scriptType === 'make') return undefined;
    // For shell types, the command is the value in the scripts map
    return scripts[name] || name;
  }

  function bindScriptButtons(container, project, scriptGroups) {
    container.querySelectorAll('.script-run-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.key;
        var name = btn.dataset.name;
        var eco = btn.dataset.eco || '';
        var group = scriptGroups.find(function (g) { return g.label === eco; });
        var scriptType = group ? group.type : 'npm';
        var scriptCmd = group ? resolveScriptCommand(name, scriptType, group.scripts) : undefined;
        S.runningScriptKeys.add(key);
        S.scriptOutputs[key] = '';
        window.api.runScript(project.id, project.path, name, scriptType, scriptCmd);
        renderScriptsPanel(project);
      });
    });
    container.querySelectorAll('.script-stop-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.key;
        var name = btn.dataset.name;
        window.api.stopScript(project.id, name);
        S.runningScriptKeys.delete(key);
        renderScriptsPanel(project);
      });
    });
    container.querySelectorAll('.script-view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showScriptOutput(btn.dataset.key);
      });
    });
  }

  async function renderScriptsPanel(project) {
    var panel = document.getElementById('scripts-panel');
    if (!panel) return;
    panel.innerHTML = '<div class="panel-loading">Discovering scripts\u2026</div>';

    var result;
    try {
      result = await window.api.getProjectScripts(project.path);
    } catch (err) {
      panel.innerHTML = '<div class="panel-empty">Could not load scripts: ' + esc(String(err)) + '</div>';
      return;
    }

    if (!result || (!result.scripts && !result.groups)) {
      panel.innerHTML = '<div class="panel-empty">No scripts found for this project.</div>';
      return;
    }

    // Normalize backend response into an array of { type, label, scripts }
    var groups;
    if (result.multi && result.groups) {
      groups = result.groups;
    } else if (result.scripts) {
      groups = [{ type: result.type, label: result.label || result.type, scripts: result.scripts }];
    } else {
      panel.innerHTML = '<div class="panel-empty">No scripts found.</div>';
      return;
    }

    var html = '';

    if (groups.length === 1) {
      var group = groups[0];
      if (!group.scripts || Object.keys(group.scripts).length === 0) {
        panel.innerHTML = '<div class="panel-empty">No scripts found.</div>';
        return;
      }
      html += renderCategorized(project.id, group.scripts, group.label);
    } else {
      groups.forEach(function (group) {
        if (!group.scripts || Object.keys(group.scripts).length === 0) return;
        html += '<div class="script-ecosystem">' +
          '<div class="script-ecosystem-label">' + esc(group.label) + '</div>' +
          renderCategorized(project.id, group.scripts, group.label) +
        '</div>';
      });
    }

    if (!html) {
      panel.innerHTML = '<div class="panel-empty">No scripts found.</div>';
      return;
    }

    html += '<div id="script-output-viewer" class="script-output-viewer" style="display:none;"></div>';
    // All dynamic values sanitized via esc() before insertion
    panel.innerHTML = html;
    bindScriptButtons(panel, project, groups);
  }

  // ── Script IPC listeners ────────────────────────────────────────
  window.api.onScriptOutput(function (data) {
    // Backend sends { projectId, script, data }
    // Match against all tracked keys that end with the script name for this project
    var suffix = ':' + data.script;
    var matched = false;
    Object.keys(S.scriptOutputs).forEach(function (k) {
      if (k.indexOf(data.projectId) === 0 && k.slice(-(suffix.length)) === suffix) {
        S.scriptOutputs[k] += data.data;
        matched = true;

        // Update live output viewer if visible
        var body = document.getElementById('script-output-body');
        if (body) {
          body.innerHTML = scriptMsg(k);
          body.scrollTop = body.scrollHeight;
        }
      }
    });
    if (!matched) {
      // Fallback: use projectId:script as key
      var fallbackKey = data.projectId + ':' + data.script;
      if (!S.scriptOutputs[fallbackKey]) S.scriptOutputs[fallbackKey] = '';
      S.scriptOutputs[fallbackKey] += data.data;
    }
  });

  window.api.onScriptExit(function (data) {
    // Backend sends { projectId, script, code }
    var suffix = ':' + data.script;
    var key = null;
    S.runningScriptKeys.forEach(function (k) {
      if (k.indexOf(data.projectId) === 0 && k.slice(-(suffix.length)) === suffix) {
        key = k;
      }
    });
    if (key) S.runningScriptKeys.delete(key);

    // Re-render panel if viewing the project that owns this script
    var project = S.projects.find(function (p) { return p.id === S.selectedId; });
    if (project && S.activeDetailTab === 'scripts' && key && key.indexOf(project.id) === 0) {
      renderScriptsPanel(project);
    }
  });

  App.scripts = { renderScriptsPanel };
})();
