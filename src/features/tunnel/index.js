const { spawn, execSync } = require('child_process');

const activeTunnels = new Map(); // projectId -> { process, url, provider, projectId, port, outputBuffer }

let getMainWindow;

/**
 * Initialize the tunnel module with a function to get the main window.
 * @param {Function} fn - Function that returns the main window instance
 */
function init(fn) {
  getMainWindow = fn;
}

/**
 * Detect which tunnel provider is available (cloudflared or ngrok).
 * @returns {string|null} - 'cloudflared', 'ngrok', or null if none found
 */
function detectTunnelProvider() {
  try {
    execSync('which cloudflared', { encoding: 'utf-8' });
    return 'cloudflared';
  } catch (_) {}
  try {
    execSync('which ngrok', { encoding: 'utf-8' });
    return 'ngrok';
  } catch (_) {}
  return null;
}

/**
 * Start a tunnel for a given project.
 * @param {string} projectId - Project identifier
 * @param {number} port - Local port to tunnel
 * @returns {Object} - Result object with success/error and status
 */
function startTunnel(projectId, port) {
  if (activeTunnels.has(projectId)) {
    const existing = activeTunnels.get(projectId);
    return { success: true, url: existing.url, provider: existing.provider, alreadyRunning: true };
  }

  const provider = detectTunnelProvider();
  if (!provider) return { error: 'No tunnel provider found. Install cloudflared or ngrok.' };

  let proc;
  if (provider === 'cloudflared') {
    proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
  } else {
    proc = spawn('ngrok', ['http', String(port), '--log', 'stdout', '--log-format', 'json'], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
  }

  const entry = { process: proc, url: null, provider, projectId, port, outputBuffer: '' };
  activeTunnels.set(projectId, entry);

  const parseUrl = (chunk) => {
    const text = chunk.toString();
    entry.outputBuffer += text;

    if (provider === 'cloudflared' && !entry.url) {
      // Each chunk: check for trycloudflare URL
      const match = entry.outputBuffer.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      console.log(`[tunnel] checking buffer (${entry.outputBuffer.length} chars), match: ${match ? match[0] : 'none'}`);
      if (match) {
        entry.url = match[0];
        console.log(`[tunnel] ✅ URL found: ${entry.url}`);
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tunnel-status', { id: projectId, url: entry.url, provider, status: 'connected' });
        }
      }
    } else if (provider === 'ngrok' && !entry.url) {
      try {
        const lines = text.split('\n').filter(Boolean);
        for (const line of lines) {
          const obj = JSON.parse(line);
          if (obj.url && obj.url.startsWith('https://')) {
            entry.url = obj.url;
            console.log(`[tunnel] URL found: ${entry.url}`);
            const mainWindow = getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('tunnel-status', { id: projectId, url: entry.url, provider, status: 'connected' });
            }
          }
        }
      } catch (_) {}
    }
  };

  proc.stdout.on('data', parseUrl);
  proc.stderr.on('data', parseUrl);

  proc.on('exit', (code) => {
    activeTunnels.delete(projectId);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel-status', { id: projectId, url: null, provider, status: 'disconnected', code });
    }
  });

  return { success: true, provider, status: 'connecting' };
}

/**
 * Stop a running tunnel for a given project.
 * @param {string} projectId - Project identifier
 */
function stopTunnel(projectId) {
  const entry = activeTunnels.get(projectId);
  if (entry) {
    const pid = entry.process.pid;
    // Kill entire process group (detached)
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (_) {}
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (_) {}
    }, 2000);
    activeTunnels.delete(projectId);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel-status', { id: projectId, url: null, provider: entry.provider, status: 'disconnected' });
    }
  }
}

/**
 * Get the current status of a tunnel.
 * @param {string} projectId - Project identifier
 * @returns {Object} - Status object with active flag and tunnel details
 */
function getTunnelStatus(projectId) {
  const entry = activeTunnels.get(projectId);
  if (!entry) return { active: false };
  return { active: true, url: entry.url, provider: entry.provider };
}

module.exports = {
  init,
  detectTunnelProvider,
  startTunnel,
  stopTunnel,
  getTunnelStatus,
};
