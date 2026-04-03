// ── Auto-Update UI ───────────────────────────────────────────────
(function () {
  const S = App.state;

  // Check for updates on launch (after short delay)
  setTimeout(checkForUpdate, 5000);

  async function checkForUpdate() {
    try {
      const result = await window.api.checkForUpdate();
      S.updateInfo = result;
      if (result.available) showUpdateBanner(result.version);
    } catch (_) {}
  }

  function showUpdateBanner(version) {
    const banner = document.getElementById('update-banner');
    if (!banner) return;
    document.getElementById('update-banner-text').textContent =
      'Version ' + version + ' is available';
    banner.style.display = 'flex';

    document.getElementById('update-banner-btn').onclick = startUpdate;
    document.getElementById('update-banner-close').onclick = function () {
      banner.style.display = 'none';
    };
  }

  async function startUpdate() {
    if (!S.updateInfo || !S.updateInfo.downloadUrl) return;
    var btn = document.getElementById('update-banner-btn');
    var text = document.getElementById('update-banner-text');
    btn.disabled = true;
    btn.textContent = 'Updating...';
    text.textContent = 'Downloading update...';

    try {
      var result = await window.api.installUpdate(S.updateInfo.downloadUrl);
      if (result.error) {
        text.textContent = 'Update failed: ' + result.error;
        btn.textContent = 'Retry';
        btn.disabled = false;
      }
    } catch (e) {
      text.textContent = 'Update failed: ' + e.message;
      btn.textContent = 'Retry';
      btn.disabled = false;
    }
  }

  // Listen for progress events
  window.api.onUpdateProgress(function (data) {
    var text = document.getElementById('update-banner-text');
    var btn = document.getElementById('update-banner-btn');
    if (!text) return;
    if (data.stage === 'downloading') {
      text.textContent = 'Downloading... ' + data.percent + '%';
    } else if (data.stage === 'installing') {
      text.textContent = 'Installing update...';
    } else if (data.stage === 'done') {
      text.textContent = 'Update installed! Restart to apply.';
      btn.textContent = 'Restart Now';
      btn.disabled = false;
      btn.onclick = function () { window.api.relaunchApp(); };
    }
  });

  // Settings modal integration
  async function checkUpdateFromSettings() {
    var statusEl = document.getElementById('settings-update-status');
    var checkBtn = document.getElementById('settings-check-update');
    if (!statusEl || !checkBtn) return;
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking...';
    statusEl.textContent = '';
    try {
      var result = await window.api.checkForUpdate();
      S.updateInfo = result;
      if (result.available) {
        statusEl.textContent = 'Version ' + result.version + ' is available!';
        statusEl.style.color = 'var(--green)';
        showUpdateBanner(result.version);
      } else if (result.reason === 'not-configured') {
        statusEl.textContent = 'Auto-update not configured for this build.';
        statusEl.style.color = 'var(--text-dim)';
      } else {
        statusEl.textContent = 'You are on the latest version.';
        statusEl.style.color = 'var(--text-dim)';
      }
    } catch (e) {
      statusEl.textContent = 'Failed to check: ' + e.message;
      statusEl.style.color = 'var(--red)';
    }
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check for Updates';
  }

  App.updater = { checkForUpdate: checkForUpdate, checkUpdateFromSettings: checkUpdateFromSettings };
})();
