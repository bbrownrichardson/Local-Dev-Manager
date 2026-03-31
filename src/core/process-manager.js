const { spawn, execSync } = require('child_process');
const { Notification } = require('electron');
const { loadProjects, saveProjects, appendLog, loadSettings } = require('./config');

function notifySilent() {
  try { return loadSettings().notificationSound === false; } catch (_) { return false; }
}

// ── Module state ─────────────────────────────────────────────────────
const runningProcesses = new Map(); // projectId -> { procs, logs, pids, project }
const autoRestartTimers = new Map();

// Tunnel stopper function stored to avoid circular dependency
let tunnelStopper = null;

// ── Helper functions ────────────────────────────────────────────────
function getCommands(project) {
  if (project.commands && project.commands.length > 0) return project.commands;
  if (project.command) return [{ label: 'main', cmd: project.command, cwd: project.path }];
  return [];
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Set the tunnel stopper function to avoid circular dependency
 * @param {Function} fn - Function to call stopTunnel(projectId)
 */
function setTunnelStopper(fn) {
  tunnelStopper = fn;
}

/**
 * Start a project (spawn its processes)
 * @param {Object} project - Project object with id, name, path, commands, etc.
 * @param {Object} win - Electron window for sending updates
 */
function startProject(project, win) {
  if (runningProcesses.has(project.id)) return;

  const isWin = process.platform === 'win32';
  const commands = getCommands(project);
  if (commands.length === 0) return;

  // Save last started timestamp
  try {
    const allProjects = loadProjects();
    const idx = allProjects.findIndex(p => p.id === project.id);
    if (idx !== -1) {
      allProjects[idx].lastStarted = new Date().toISOString();
      saveProjects(allProjects);
    }
  } catch (_) {}

  // Parse env vars
  const extraEnv = {};
  if (project.envVars) {
    for (const line of project.envVars.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) extraEnv[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }

  const entry = { procs: [], logs: [], pids: [], project };
  runningProcesses.set(project.id, entry);

  const send = (channel, data) => {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  };

  send('project-status', { id: project.id, status: 'running' });

  const readyPatterns = [/listening on/i, /server running/i, /started on/i, /ready on/i, /http:\/\/localhost/i, /compiled successfully/i, /VITE.*ready/i];

  for (const command of commands) {
    const cwd = command.cwd || project.path;
    const opts = {
      cwd,
      shell: isWin ? true : '/bin/bash',
      env: { ...process.env, FORCE_COLOR: '1', PYTHONUNBUFFERED: '1', ...extraEnv },
      detached: !isWin,
      stdio: ['ignore', 'pipe', 'pipe'],
    };

    const proc = spawn(command.cmd, [], opts);
    if (!isWin) proc.unref();
    entry.procs.push(proc);
    entry.pids.push(proc.pid);

    const prefix = commands.length > 1 ? `[${command.label}] ` : '';

    const handleOutput = (data) => {
      const line = prefix + data.toString();
      entry.logs.push(line);
      if (entry.logs.length > 1000) entry.logs.shift();
      appendLog(project.id, line);
      send('project-log', { id: project.id, line });

      // Check for ready notification
      if (readyPatterns.some(p => p.test(line))) {
        if (Notification.isSupported()) {
          new Notification({ title: project.name, body: 'Server is ready!', silent: notifySilent() }).show();
        }
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('close', (code) => {
      entry.procs = entry.procs.filter(p => p !== proc);
      if (entry.procs.length === 0) {
        runningProcesses.delete(project.id);
        send('project-status', { id: project.id, status: 'stopped', code });

        // Crash notification
        if (code !== 0 && code !== null) {
          if (Notification.isSupported()) {
            new Notification({ title: project.name, body: `Process exited with code ${code}`, silent: notifySilent() }).show();
          }
          // Auto-restart
          if (project.autoRestart) {
            send('project-log', { id: project.id, line: `\n--- Auto-restarting in 3s ---\n` });
            const timer = setTimeout(() => {
              autoRestartTimers.delete(project.id);
              startProject(project, win);
            }, 3000);
            autoRestartTimers.set(project.id, timer);
          }
        }
      }
    });

    proc.on('error', (err) => {
      send('project-log', { id: project.id, line: `${prefix}Error: ${err.message}\n` });
      entry.procs = entry.procs.filter(p => p !== proc);
      if (entry.procs.length === 0) {
        runningProcesses.delete(project.id);
        send('project-status', { id: project.id, status: 'error' });
      }
    });
  }
}

/**
 * Stop a project (kill its processes)
 * @param {string} projectId - Project ID to stop
 */
function stopProject(projectId) {
  // Cancel any pending auto-restart
  const timer = autoRestartTimers.get(projectId);
  if (timer) { clearTimeout(timer); autoRestartTimers.delete(projectId); }

  const entry = runningProcesses.get(projectId);
  if (!entry) return;

  for (const proc of entry.procs) {
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${proc.pid} /f /t`, { stdio: 'ignore' }); } catch (_) {}
    } else {
      try { process.kill(-proc.pid, 'SIGTERM'); } catch (_) {}
      setTimeout(() => {
        try { process.kill(-proc.pid, 'SIGKILL'); } catch (_) {}
      }, 3000);
    }
  }

  // Kill tunnel if running for this project
  if (tunnelStopper) {
    tunnelStopper(projectId);
  }
}

/**
 * Get the running processes map
 * @returns {Map} runningProcesses map
 */
function getRunningProcesses() {
  return runningProcesses;
}

// ── Exports ─────────────────────────────────────────────────────────
module.exports = {
  startProject,
  stopProject,
  getRunningProcesses,
  setTunnelStopper,
};
