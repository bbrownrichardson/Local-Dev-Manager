const { app } = require('electron');
const { execSync } = require('child_process');

// ── Fix PATH for packaged app ────────────────────────────────────────
// When running as a .app, the process doesn't inherit the user's shell PATH.
if (app.isPackaged) {
  try {
    const shell = process.env.SHELL || '/bin/bash';
    const result = execSync(`${shell} -ilc 'echo $PATH'`, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) process.env.PATH = result;
  } catch (_) {}
}

// ── Core modules (load early — logger intercepts console.*) ──────────
const logger = require('./src/core/logger');
const config = require('./src/core/config');
const { startProject, stopProject, getRunningProcesses, setTunnelStopper } = require('./src/core/process-manager');
const { createWindow, getMainWindow } = require('./src/core/window');
const tray = require('./src/core/tray');

// ── Feature modules ──────────────────────────────────────────────────
const scripts = require('./src/features/scripts');
const terminal = require('./src/features/terminal');
const tunnel = require('./src/features/tunnel');
const { backfillProjects } = require('./src/services/detect');
const ipcHandlers = require('./src/ipc/handlers');

// ── Shared getMainWindow accessor ────────────────────────────────────
const mw = () => getMainWindow();

// ── Initialize modules with mainWindow getter ────────────────────────
logger.init(mw);
scripts.init(mw);
terminal.init(mw);
tunnel.init(mw);
tray.init(mw);

// Wire up tunnel stopper to break circular dependency
setTunnelStopper((projectId) => tunnel.stopTunnel(projectId));

// ── Register all IPC handlers ────────────────────────────────────────
ipcHandlers.registerAll();

// ── App lifecycle ────────────────────────────────────────────────────
let isQuitting = false;

app.on('before-quit', () => { isQuitting = true; });

app.whenReady().then(() => {
  backfillProjects(config.loadProjects, config.saveProjects);

  const win = createWindow();

  // Close-to-tray on macOS
  win.on('close', (e) => {
    if (process.platform === 'darwin' && tray.getTray() && !isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  tray.createTrayIcon();
});

app.on('window-all-closed', () => {
  // Clean up all running processes
  for (const [id] of getRunningProcesses()) stopProject(id);
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  const win = getMainWindow();
  if (win) { win.show(); win.focus(); }
  else { createWindow(); }
});

// Update tray when projects start/stop — monkey-patch the process manager
const pm = require('./src/core/process-manager');
const _origStart = pm.startProject;
const _origStop = pm.stopProject;

pm.startProject = function(project, win) {
  _origStart.call(this, project, win);
  tray.updateTrayMenu();
};

pm.stopProject = function(projectId) {
  _origStop.call(this, projectId);
  tray.updateTrayMenu();
};
