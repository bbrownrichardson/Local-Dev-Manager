const { app } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

let getMainWindow = () => null;

function init(mainWindowGetter) {
  getMainWindow = mainWindowGetter;
}

function getManifestUrl() {
  try {
    const configPath = path.join(__dirname, '../../update-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.manifestUrl || null;
    }
  } catch (_) {}
  return null;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function fetch(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetch(res.headers.location, maxRedirects - 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function checkForUpdate() {
  const manifestUrl = getManifestUrl();
  if (!manifestUrl) return { available: false, reason: 'not-configured' };

  const raw = await fetch(manifestUrl);
  const manifest = JSON.parse(raw);
  const currentVersion = app.getVersion();

  if (compareVersions(manifest.version, currentVersion) > 0) {
    return {
      available: true,
      currentVersion,
      version: manifest.version,
      downloadUrl: manifest.downloadUrl,
    };
  }
  return { available: false, currentVersion, latestVersion: manifest.version };
}

function downloadFile(url, destPath, onProgress, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, destPath, onProgress, maxRedirects - 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let receivedBytes = 0;
      const file = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        receivedBytes += chunk.length;
        if (totalBytes && onProgress) {
          onProgress(Math.round((receivedBytes / totalBytes) * 100));
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
      file.on('error', (e) => {
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(e);
      });
    }).on('error', reject);
  });
}

async function downloadAndInstall(downloadUrl) {
  const win = getMainWindow();
  const send = (data) => { if (win) win.webContents.send('update-progress', data); };

  const tmpDir = path.join(os.tmpdir(), 'ldm-update');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dmgPath = path.join(tmpDir, 'Local-Dev-Manager-update.dmg');

  // Download
  send({ stage: 'downloading', percent: 0 });
  await downloadFile(downloadUrl, dmgPath, (percent) => {
    send({ stage: 'downloading', percent });
  });

  // Mount DMG
  send({ stage: 'installing', percent: 0 });
  const mountOutput = execSync(`hdiutil attach "${dmgPath}" -nobrowse`, {
    encoding: 'utf-8',
    timeout: 60000,
  });

  // Parse mount point from hdiutil output
  // Output format: "/dev/diskN\tTYPE\t/Volumes/Name" but -quiet may omit some lines
  // Look for the line containing /Volumes/ which is the actual mount point
  const lines = mountOutput.trim().split('\n');
  let mountPoint = '';
  for (const line of lines) {
    const match = line.match(/\t(\/Volumes\/.+)$/);
    if (match) {
      mountPoint = match[1].trim();
      break;
    }
  }
  if (!mountPoint) {
    // Fallback: try last line, split on tab
    const lastLine = lines[lines.length - 1] || '';
    mountPoint = lastLine.split('\t').pop().trim();
  }
  if (!mountPoint || !fs.existsSync(mountPoint)) {
    throw new Error(`Failed to mount DMG: could not determine mount point from hdiutil output`);
  }

  try {
    // Find .app in mounted DMG
    const apps = fs.readdirSync(mountPoint).filter((f) => f.endsWith('.app'));
    if (apps.length === 0) throw new Error('No .app found in DMG');

    const appName = apps[0];
    const srcApp = path.join(mountPoint, appName);
    const destApp = path.join('/Applications', appName);

    // Remove old version and copy new
    send({ stage: 'installing', percent: 50 });
    if (fs.existsSync(destApp)) {
      execSync(`rm -rf "${destApp}"`, { timeout: 30000 });
    }
    execSync(`cp -R "${srcApp}" "/Applications/"`, { timeout: 60000 });

    // Clear quarantine attribute
    execSync(`xattr -cr "${destApp}"`, { timeout: 10000 });

    send({ stage: 'done', percent: 100 });
  } finally {
    // Unmount
    try { execSync(`hdiutil detach "${mountPoint}" -quiet`, { timeout: 15000 }); } catch (_) {}
    // Clean up downloaded DMG
    try { fs.unlinkSync(dmgPath); } catch (_) {}
  }

  return { success: true };
}

function relaunchApp() {
  app.relaunch();
  app.exit(0);
}

module.exports = { init, checkForUpdate, downloadAndInstall, relaunchApp };
