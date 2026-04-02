// ── Environment Panel ─────────────────────────────────────────────
// All dynamic values are sanitized through esc() before DOM insertion.
// This follows the same esc()-based sanitization pattern used across
// the codebase (sidebar.js, terminal.js, utils.js) for XSS protection.
(function () {
  const S = App.state;
  const { esc, versionSatisfies } = App.utils;

  function statusIcon(status) {
    if (status === 'ok') return '<span class="env-status env-ok">\u2713</span>';
    if (status === 'mismatch') return '<span class="env-status env-warn">\u26A0</span>';
    return '<span class="env-status env-missing">\u2715</span>';
  }

  function renderToolRow(tool) {
    var status = 'missing';
    if (tool.version) {
      status = versionSatisfies(tool.version, tool.required) ? 'ok' : 'mismatch';
    }

    var html = '<div class="env-tool-row">' +
      '<div class="env-tool-info">' +
        statusIcon(status) +
        '<span class="env-tool-name">' + esc(tool.name) + '</span>' +
        (tool.version
          ? '<span class="env-tool-version">' + esc(tool.version) + '</span>'
          : '<span class="env-tool-version env-none">not found</span>') +
        (tool.required
          ? '<span class="env-tool-required">required: ' + esc(tool.required) + '</span>'
          : '') +
        (tool.source
          ? '<span class="env-tool-source">' + esc(tool.source) + '</span>'
          : '') +
      '</div>';

    if (status !== 'ok' && tool.fix) {
      html += '<div class="env-tool-actions">';
      if (tool.fix.info) {
        html += '<button class="btn btn-sm env-fix-info-btn" data-info="' + esc(tool.fix.info) + '">Fix Info</button>';
      }
      if (tool.fix.cmd) {
        html += '<button class="btn btn-sm btn-primary env-fix-run-btn" data-cmd="' + esc(tool.fix.cmd) + '">Fix</button>';
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderSummary(tools) {
    var missing = [];
    var mismatched = [];
    tools.forEach(function (tool) {
      if (!tool.version) {
        missing.push(tool.name);
      } else if (tool.required && !versionSatisfies(tool.version, tool.required)) {
        mismatched.push(tool.name);
      }
    });

    if (missing.length === 0 && mismatched.length === 0) {
      return '<div class="env-summary env-summary-ok">\u2713 All tools are available and compatible.</div>';
    }

    var html = '<div class="env-summary env-summary-issues">';
    if (missing.length > 0) {
      html += '<div class="env-summary-line"><strong>Missing:</strong> ' + missing.map(esc).join(', ') + '</div>';
    }
    if (mismatched.length > 0) {
      html += '<div class="env-summary-line"><strong>Version mismatch:</strong> ' + mismatched.map(esc).join(', ') + '</div>';
    }
    html += '</div>';
    return html;
  }

  function bindFixButtons(container, project) {
    container.querySelectorAll('.env-fix-info-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var info = btn.dataset.info;
        var output = container.querySelector('.env-fix-output');
        if (output) {
          output.style.display = 'block';
          output.textContent = 'Command to run:\n' + info;
          // Select text for easy copying
          var range = document.createRange();
          range.selectNodeContents(output);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    });

    container.querySelectorAll('.env-fix-run-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var cmd = btn.dataset.cmd;
        var output = container.querySelector('.env-fix-output');
        if (output) {
          output.style.display = 'block';
          output.textContent = 'Running: ' + cmd + '\n';
        }
        btn.disabled = true;
        btn.textContent = 'Running\u2026';

        try {
          var res = await window.api.runEnvFix(project.path, cmd);
          if (output) {
            output.textContent += (res && res.output ? res.output : 'Done.') + '\n';
            if (res && res.error) {
              output.textContent += 'Error: ' + res.error + '\n';
            }
          }
        } catch (err) {
          if (output) {
            output.textContent += 'Failed: ' + String(err) + '\n';
          }
        }

        btn.disabled = false;
        btn.textContent = 'Fix';
      });
    });
  }

  async function renderEnvPanel(project) {
    var panel = document.getElementById('env-panel');
    if (!panel) return;
    panel.textContent = '';
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'panel-loading';
    loadingDiv.textContent = 'Checking environment\u2026';
    panel.appendChild(loadingDiv);

    var tools;
    try {
      tools = await window.api.checkEnvVersions(project.path);
    } catch (err) {
      panel.textContent = '';
      var errDiv = document.createElement('div');
      errDiv.className = 'panel-empty';
      errDiv.textContent = 'Could not check environment: ' + String(err);
      panel.appendChild(errDiv);
      return;
    }

    if (!tools || tools.length === 0) {
      panel.textContent = '';
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'panel-empty';
      emptyDiv.textContent = 'No environment tools detected for this project.';
      panel.appendChild(emptyDiv);
      return;
    }

    // Build esc()-sanitized HTML via string concatenation
    var html = '<div class="env-header">' +
      '<span class="env-title">Environment</span>' +
    '</div>';

    html += renderSummary(tools);

    html += '<div class="env-tools-list">';
    tools.forEach(function (tool) {
      html += renderToolRow(tool);
    });
    html += '</div>';

    html += '<pre class="env-fix-output" style="display:none;"></pre>';

    // Safe: all dynamic content passed through esc() in helpers above
    panel.innerHTML = html; // eslint-disable-line no-unsanitized/property
    bindFixButtons(panel, project);
  }

  App.env = { renderEnvPanel };
})();
