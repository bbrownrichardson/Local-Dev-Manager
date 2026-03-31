const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Notification } = require('electron');
const { loadSettings } = require('../../core/config');

function notifySilent() {
  try { return loadSettings().notificationSound === false; } catch (_) { return false; }
}

let getMainWindow;
const runningScripts = new Map(); // key -> { proc, projectId, script }

/**
 * Initialize the scripts module with a function to get the main window
 * @param {Function} fn - Function that returns the main window
 */
function init(fn) {
  getMainWindow = fn;
}

/**
 * Get available scripts for a project based on its configuration files
 * @param {string} projectPath - Path to the project
 * @returns {Object} Scripts organized by type
 */
function getProjectScripts(projectPath) {
  const allScripts = [];
  try {
    // npm / Node
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
        allScripts.push({ type: 'npm', label: 'npm', scripts: pkg.scripts });
      }
    }

    // Poetry (pyproject.toml with [tool.poetry.scripts])
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const scripts = {};
      const scriptMatch = content.match(/\[tool\.poetry\.scripts\]\n([\s\S]*?)(\n\[|$)/);
      if (scriptMatch) {
        for (const line of scriptMatch[1].split('\n')) {
          const m = line.match(/^(\S+)\s*=\s*"(.+)"/);
          if (m) scripts[m[1]] = m[2];
        }
      }
      // Also check for common task runner patterns
      if (content.includes('[tool.poetry]')) {
        scripts['install'] = 'poetry install';
        scripts['update'] = 'poetry update';
        scripts['shell'] = 'poetry shell';
      }
      if (Object.keys(scripts).length > 0) {
        allScripts.push({ type: 'shell', label: 'Poetry', scripts });
      }
    }

    // Makefile
    const makePath = path.join(projectPath, 'Makefile');
    if (fs.existsSync(makePath)) {
      const content = fs.readFileSync(makePath, 'utf-8');
      const targets = {};
      for (const m of content.matchAll(/^([a-zA-Z0-9_-]+)\s*:/gm)) {
        if (!m[1].startsWith('.')) targets[m[1]] = m[1];
      }
      if (Object.keys(targets).length > 0) {
        allScripts.push({ type: 'make', label: 'Make', scripts: targets });
      }
    }

    // Cargo (Rust)
    const cargoPath = path.join(projectPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      allScripts.push({ type: 'shell', label: 'Cargo', scripts: {
        'build': 'cargo build',
        'run': 'cargo run',
        'test': 'cargo test',
        'check': 'cargo check',
        'clippy': 'cargo clippy',
        'fmt': 'cargo fmt',
      }});
    }

    // Go
    const goModPath = path.join(projectPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      allScripts.push({ type: 'shell', label: 'Go', scripts: {
        'build': 'go build ./...',
        'run': 'go run .',
        'test': 'go test ./...',
        'vet': 'go vet ./...',
        'fmt': 'gofmt -w .',
        'tidy': 'go mod tidy',
      }});
    }

    // Composer (PHP)
    const composerPath = path.join(projectPath, 'composer.json');
    if (fs.existsSync(composerPath)) {
      try {
        const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
        const scripts = {};
        if (composer.scripts) {
          for (const [name, cmd] of Object.entries(composer.scripts)) {
            if (!name.startsWith('pre-') && !name.startsWith('post-')) {
              scripts[name] = Array.isArray(cmd) ? cmd.join(' && ') : cmd;
            }
          }
        }
        if (Object.keys(scripts).length > 0) {
          allScripts.push({ type: 'shell', label: 'Composer', scripts });
        }
      } catch (_) {}
    }

    // Gemfile (Ruby)
    if (fs.existsSync(path.join(projectPath, 'Gemfile'))) {
      const scripts = { 'bundle install': 'bundle install', 'bundle update': 'bundle update' };
      // Check for Rakefile
      if (fs.existsSync(path.join(projectPath, 'Rakefile'))) {
        try {
          const content = fs.readFileSync(path.join(projectPath, 'Rakefile'), 'utf-8');
          for (const m of content.matchAll(/task\s+:(\w+)/g)) {
            scripts[m[1]] = `bundle exec rake ${m[1]}`;
          }
        } catch (_) {}
      }
      allScripts.push({ type: 'shell', label: 'Ruby', scripts });
    }

    if (allScripts.length === 0) return { type: null, scripts: {} };
    if (allScripts.length === 1) return allScripts[0];
    return { multi: true, groups: allScripts };
  } catch (e) {
    return { type: null, scripts: {}, error: e.message };
  }
}

/**
 * Run a script for a project
 * @param {string} projectId - Project ID
 * @param {string} projectPath - Path to the project
 * @param {string} scriptName - Name of the script
 * @param {string} scriptType - Type of script (npm, make, shell)
 * @param {string} scriptCmd - Command to run (for shell type)
 * @returns {Object} Result of the operation
 */
function runScript(projectId, projectPath, scriptName, scriptType, scriptCmd) {
  const key = `${projectId}:${scriptName}`;
  if (runningScripts.has(key)) return { error: 'Script already running' };

  let cmd, args;
  if (scriptType === 'npm') {
    cmd = 'npm';
    args = ['run', scriptName];
  } else if (scriptType === 'make') {
    cmd = 'make';
    args = [scriptName];
  } else if (scriptType === 'shell') {
    // Direct shell command (cargo, go, poetry, etc.)
    cmd = scriptCmd || scriptName;
    args = [];
  } else {
    return { error: 'Unknown script type' };
  }

  console.log(`[scripts] spawning: cmd="${cmd}" args=${JSON.stringify(args)} cwd="${projectPath}" type="${scriptType}"`);

  let proc;
  try {
    proc = spawn(cmd, args, {
      cwd: projectPath,
      env: { ...process.env, FORCE_COLOR: '1' },
      shell: true,
      detached: false,
    });
  } catch (e) {
    console.error('[scripts] spawn threw:', e.message);
    return { error: `Failed to spawn: ${e.message}` };
  }

  if (!proc || !proc.pid) {
    console.error('[scripts] spawn returned no pid');
  } else {
    console.log(`[scripts] spawned pid=${proc.pid}`);
  }

  const entry = { proc, projectId, script: scriptName, output: '' };
  runningScripts.set(key, entry);

  const sendToRenderer = (channel, data) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try { mw.webContents.send(channel, data); } catch (_) {}
    }
  };

  proc.stdout.on('data', (d) => {
    const text = d.toString();
    entry.output += text;
    sendToRenderer('script-output', { projectId, script: scriptName, data: text });
  });
  proc.stderr.on('data', (d) => {
    const text = d.toString();
    entry.output += text;
    sendToRenderer('script-output', { projectId, script: scriptName, data: text });
  });
  proc.on('error', (err) => {
    console.error(`[scripts] process error for ${scriptName}:`, err.message);
    runningScripts.delete(key);
    sendToRenderer('script-output', { projectId, script: scriptName, data: `\n[ERROR] ${err.message}\n` });
    sendToRenderer('script-exit', { projectId, script: scriptName, code: -1 });
  });
  proc.on('exit', (code) => {
    console.log(`[scripts] ${scriptName} exited with code ${code}`);
    runningScripts.delete(key);
    sendToRenderer('script-exit', { projectId, script: scriptName, code });
    if (Notification.isSupported()) {
      new Notification({
        title: `Script: ${scriptName}`,
        body: code === 0 ? 'Completed successfully' : `Exited with code ${code}`,
        silent: notifySilent(),
      }).show();
    }
  });

  return { success: true };
}

/**
 * Stop a running script
 * @param {string} projectId - Project ID
 * @param {string} scriptName - Name of the script
 */
function stopScript(projectId, scriptName) {
  const key = `${projectId}:${scriptName}`;
  const entry = runningScripts.get(key);
  if (entry) {
    try { process.kill(-entry.proc.pid, 'SIGTERM'); } catch (_) {
      try { entry.proc.kill(); } catch (_) {}
    }
    runningScripts.delete(key);
  }
}

/**
 * Detect port conflicts in a list of projects
 * @param {Array} projectsList - List of projects with url property
 * @returns {Object} Port conflicts (port -> [projects])
 */
function detectPortConflicts(projectsList) {
  const portMap = {}; // port -> [projectNames]
  for (const p of projectsList) {
    if (p.url) {
      try {
        const port = new URL(p.url).port;
        if (port) {
          if (!portMap[port]) portMap[port] = [];
          portMap[port].push({ id: p.id, name: p.name });
        }
      } catch (_) {}
    }
  }
  const conflicts = {};
  for (const [port, projects] of Object.entries(portMap)) {
    if (projects.length > 1) {
      conflicts[port] = projects;
    }
  }
  return conflicts;
}

module.exports = {
  init,
  getProjectScripts,
  runScript,
  stopScript,
  detectPortConflicts,
};
