// ── Dependencies Panel ────────────────────────────────────────────
// All dynamic values are sanitized through esc() before DOM insertion.
// This follows the same pattern used across the codebase (sidebar.js,
// terminal.js, etc.) where string concatenation with esc() provides
// XSS protection for user-supplied data.
(function () {
  const S = App.state;
  const { esc } = App.utils;

  const ecoLabels = {
    npm: 'npm', pip: 'pip', pipenv: 'Pipenv', poetry: 'Poetry',
    go: 'Go', ruby: 'Ruby', rust: 'Cargo', php: 'Composer',
    dart: 'Dart', swift: 'Swift', maven: 'Maven', gradle: 'Gradle'
  };

  const ecoIcons = {
    npm: '\uD83D\uDCE6', pip: '\uD83D\uDC0D', pipenv: '\uD83D\uDC0D', poetry: '\uD83D\uDC0D',
    go: '\uD83D\uDD35', ruby: '\uD83D\uDC8E', rust: '\uD83E\uDD80', php: '\uD83D\uDC18',
    dart: '\uD83C\uDFAF', swift: '\uD83C\uDF4E', maven: '\u2615', gradle: '\uD83D\uDC18'
  };

  function isMajorBump(current, latest) {
    if (!current || !latest) return false;
    var curMajor = parseInt(current.replace(/^[^0-9]*/, '').split('.')[0], 10);
    var latMajor = parseInt(latest.replace(/^[^0-9]*/, '').split('.')[0], 10);
    return !isNaN(curMajor) && !isNaN(latMajor) && latMajor > curMajor;
  }

  function renderPackageRow(pkg) {
    var major = isMajorBump(pkg.current, pkg.latest);
    return '<tr class="' + (major ? 'major-bump' : '') + '">' +
      '<td>' + esc(pkg.name) + '</td>' +
      '<td>' + esc(pkg.current || '-') + '</td>' +
      '<td>' + esc(pkg.wanted || '-') + '</td>' +
      '<td class="' + (major ? 'version-major' : '') + '">' + esc(pkg.latest || '-') + '</td>' +
    '</tr>';
  }

  function renderEcoSection(eco, packages) {
    var label = ecoLabels[eco] || eco;
    var icon = ecoIcons[eco] || '';

    // Sort major bumps first
    var sorted = packages.slice().sort(function (a, b) {
      var aMajor = isMajorBump(a.current, a.latest) ? 0 : 1;
      var bMajor = isMajorBump(b.current, b.latest) ? 0 : 1;
      return aMajor - bMajor;
    });

    var html = '<div class="deps-eco-section">' +
      '<div class="deps-eco-header">' +
        '<span class="deps-eco-icon">' + icon + '</span>' +
        '<span class="deps-eco-label">' + esc(label) + '</span>' +
        '<span class="deps-eco-count">' + sorted.length + ' outdated</span>' +
      '</div>' +
      '<table class="deps-table">' +
        '<thead><tr>' +
          '<th>Package</th><th>Current</th><th>Wanted</th><th>Latest</th>' +
        '</tr></thead>' +
        '<tbody>';

    sorted.forEach(function (pkg) {
      html += renderPackageRow(pkg);
    });

    html += '</tbody></table></div>';
    return html;
  }

  async function renderDepsPanel(project) {
    var panel = document.getElementById('deps-panel');
    if (!panel) return;
    panel.textContent = '';
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'panel-loading';
    loadingDiv.textContent = 'Checking for outdated packages\u2026';
    panel.appendChild(loadingDiv);

    var result;
    try {
      result = await window.api.checkOutdated(project.path);
    } catch (err) {
      panel.textContent = '';
      var errDiv = document.createElement('div');
      errDiv.className = 'panel-empty';
      errDiv.textContent = 'Could not check dependencies: ' + String(err);
      panel.appendChild(errDiv);
      return;
    }

    if (!result || Object.keys(result).length === 0) {
      panel.textContent = '';
      var okDiv = document.createElement('div');
      okDiv.className = 'panel-empty';
      okDiv.textContent = '\u2705 All dependencies are up to date.';
      panel.appendChild(okDiv);
      return;
    }

    var ecosystems = Object.keys(result);
    var html = '<div class="deps-header">' +
      '<span class="deps-title">Outdated Dependencies</span>' +
      '<button class="btn btn-sm deps-refresh-btn">Refresh</button>' +
    '</div>';

    // Render ecosystem tags
    html += '<div class="deps-eco-tags">';
    ecosystems.forEach(function (eco) {
      var label = ecoLabels[eco] || eco;
      var icon = ecoIcons[eco] || '';
      html += '<span class="deps-eco-tag">' + icon + ' ' + esc(label) + '</span>';
    });
    html += '</div>';

    ecosystems.forEach(function (eco) {
      var packages = result[eco];
      if (packages && packages.length > 0) {
        html += renderEcoSection(eco, packages);
      }
    });

    // All dynamic content sanitized via esc() before insertion
    panel.innerHTML = html;

    // Bind refresh button
    var refreshBtn = panel.querySelector('.deps-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        renderDepsPanel(project);
      });
    }
  }

  App.deps = { renderDepsPanel };
})();
