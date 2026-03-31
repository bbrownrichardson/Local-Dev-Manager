const os = require('os');
const fs = require('fs');

// Try to require node-pty, gracefully handle if not available
let pty;
try {
  pty = require('node-pty');
} catch (e) {
  pty = null;
}

// Maps for managing active PTYs and their buffers
const activePtys = new Map();   // terminalId -> { pty, projectId, terminalId }
const ptyBuffers = new Map();   // terminalId -> string (last ~50KB of output)

// Constants
const PTY_BUFFER_LIMIT = 50000;
const MAX_TERMINALS_PER_PROJECT = 5;

// Holder for getMainWindow function
let getMainWindow;

/**
 * Initialize the terminal module with a function to get the main window
 * @param {Function} fn - Function that returns the main window
 */
function init(fn) {
  getMainWindow = fn;
}

/**
 * Get all terminal IDs for a given project
 * @param {string} projectId - The project ID
 * @returns {string[]} Array of terminal IDs for the project
 */
function getProjectTerminalIds(projectId) {
  const ids = [];
  for (const [tid, entry] of activePtys) {
    if (entry.projectId === projectId) ids.push(tid);
  }
  return ids;
}

/**
 * Create a new PTY terminal
 * @param {string} terminalId - Unique identifier for the terminal
 * @param {string} projectId - The project ID this terminal belongs to
 * @param {string} cwd - Current working directory for the terminal
 * @returns {Object} Result object with success flag or error
 */
function createPty(terminalId, projectId, cwd) {
  if (!pty) return { error: 'node-pty not available' };
  if (activePtys.has(terminalId)) {
    return { success: true, alreadyRunning: true, buffer: ptyBuffers.get(terminalId) || '' };
  }

  // Enforce limit
  const existing = getProjectTerminalIds(projectId);
  if (existing.length >= MAX_TERMINALS_PER_PROJECT) {
    return { error: `Max ${MAX_TERMINALS_PER_PROJECT} terminals per project` };
  }

  // Validate cwd exists, fall back to homedir
  let resolvedCwd = cwd || os.homedir();
  try {
    if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
      resolvedCwd = os.homedir();
    }
  } catch (_) { resolvedCwd = os.homedir(); }

  const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: resolvedCwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  ptyBuffers.set(terminalId, '');
  activePtys.set(terminalId, { pty: term, projectId, terminalId });

  term.onData((data) => {
    const current = ptyBuffers.get(terminalId) || '';
    const updated = current + data;
    ptyBuffers.set(terminalId, updated.length > PTY_BUFFER_LIMIT ? updated.slice(-PTY_BUFFER_LIMIT) : updated);

    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', { id: terminalId, data });
    }
  });

  term.onExit(({ exitCode }) => {
    activePtys.delete(terminalId);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-exit', { id: terminalId, exitCode });
    }
  });

  return { success: true, alreadyRunning: false, buffer: '' };
}

/**
 * Write data to a PTY terminal
 * @param {string} terminalId - The terminal ID
 * @param {string} data - Data to write
 */
function writePty(terminalId, data) {
  const entry = activePtys.get(terminalId);
  if (entry) entry.pty.write(data);
}

/**
 * Resize a PTY terminal
 * @param {string} terminalId - The terminal ID
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 */
function resizePty(terminalId, cols, rows) {
  const entry = activePtys.get(terminalId);
  if (entry) {
    try { entry.pty.resize(cols, rows); } catch (_) {}
  }
}

/**
 * Destroy a single PTY terminal
 * @param {string} terminalId - The terminal ID
 */
function destroyPty(terminalId) {
  const entry = activePtys.get(terminalId);
  if (entry) {
    try { entry.pty.kill(); } catch (_) {}
    activePtys.delete(terminalId);
    ptyBuffers.delete(terminalId);
  }
}

/**
 * Destroy all PTY terminals for a project
 * @param {string} projectId - The project ID
 */
function destroyProjectPtys(projectId) {
  for (const tid of getProjectTerminalIds(projectId)) {
    destroyPty(tid);
  }
}

// Exports
module.exports = {
  init,
  createPty,
  writePty,
  resizePty,
  destroyPty,
  destroyProjectPtys,
  getProjectTerminalIds,
};
