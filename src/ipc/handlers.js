const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Core
const config = require('../core/config');
const { startProject, stopProject, getRunningProcesses } = require('../core/process-manager');
const logger = require('../core/logger');

// Services
const { getProcessStats, getGitStatus, getListeningPorts, checkHealth } = require('../services/monitoring');
const { detectProjectType } = require('../services/detect');

// Features
const scripts = require('../features/scripts');
const deps = require('../features/deps');
const git = require('../features/git');
const terminal = require('../features/terminal');
const tunnel = require('../features/tunnel');
const env = require('../features/env');

/**
 * Register all IPC handlers.
 * Called once from main.js after all modules are initialized.
 */
function registerAll() {
  // ── Projects ───────────────────────────────────────────────────────
  ipcMain.handle('get-projects', async () => {
    try { return config.loadProjects(); }
    catch (e) { console.error('Error in get-projects:', e); return { error: e.message }; }
  });

  ipcMain.handle('save-projects', async (_e, projects) => {
    try { config.saveProjects(projects); return true; }
    catch (e) { console.error('Error in save-projects:', e); return { error: e.message }; }
  });

  ipcMain.handle('start-project', async (e, project) => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender);
      startProject(project, win);
      return true;
    } catch (error) { console.error('Error in start-project:', error); return { error: error.message }; }
  });

  ipcMain.handle('stop-project', async (_e, projectId) => {
    try { stopProject(projectId); return true; }
    catch (e) { console.error('Error in stop-project:', e); return { error: e.message }; }
  });

  ipcMain.handle('get-logs', async (_e, projectId) => {
    try {
      const entry = getRunningProcesses().get(projectId);
      return entry ? entry.logs : [];
    } catch (e) { console.error('Error in get-logs:', e); return { error: e.message }; }
  });

  ipcMain.handle('get-persisted-logs', async (_e, projectId) => {
    try { return config.loadPersistedLogs(projectId); }
    catch (e) { console.error('Error in get-persisted-logs:', e); return { error: e.message }; }
  });

  ipcMain.handle('get-running-ids', async () => {
    try { return Array.from(getRunningProcesses().keys()); }
    catch (e) { console.error('Error in get-running-ids:', e); return { error: e.message }; }
  });

  // ── Shell / OS ─────────────────────────────────────────────────────
  ipcMain.handle('open-url', async (_e, url) => {
    try { const { shell } = require('electron'); shell.openExternal(url); return true; }
    catch (e) { console.error('Error in open-url:', e); return { error: e.message }; }
  });

  ipcMain.handle('open-terminal', async (_e, dirPath) => {
    try {
      const { spawn } = require('child_process');
      const settings = config.loadSettings();
      const termApp = settings.terminal || 'Terminal';
      if (process.platform === 'darwin') {
        spawn('open', ['-a', termApp, dirPath], { detached: true });
      } else if (process.platform === 'linux') {
        spawn('x-terminal-emulator', [], { cwd: dirPath, detached: true });
      } else {
        spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${dirPath}"`], { detached: true, shell: true });
      }
      return true;
    } catch (e) { console.error('Error in open-terminal:', e); return { error: e.message }; }
  });

  ipcMain.handle('pick-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    } catch (e) { console.error('Error in pick-folder:', e); return { error: e.message }; }
  });

  // ── Settings / Profiles / Config ───────────────────────────────────
  ipcMain.handle('get-settings', async () => {
    try { return config.loadSettings(); }
    catch (e) { console.error('Error in get-settings:', e); return { error: e.message }; }
  });

  ipcMain.handle('save-settings', async (_e, settings) => {
    try { config.saveSettings(settings); return true; }
    catch (e) { console.error('Error in save-settings:', e); return { error: e.message }; }
  });

  ipcMain.handle('get-profiles', async () => {
    try { return config.loadProfiles(); }
    catch (e) { console.error('Error in get-profiles:', e); return { error: e.message }; }
  });

  ipcMain.handle('save-profiles', async (_e, profiles) => {
    try { config.saveProfiles(profiles); return true; }
    catch (e) { console.error('Error in save-profiles:', e); return { error: e.message }; }
  });

  ipcMain.handle('export-config', async () => {
    try {
      return {
        projects: config.loadProjects(),
        profiles: config.loadProfiles(),
        settings: config.loadSettings(),
      };
    } catch (e) { console.error('Error in export-config:', e); return { error: e.message }; }
  });

  ipcMain.handle('import-config', async (_e, data) => {
    try {
      if (data.projects) config.saveProjects(data.projects);
      if (data.profiles) config.saveProfiles(data.profiles);
      if (data.settings) config.saveSettings(data.settings);
      return true;
    } catch (e) { console.error('Error in import-config:', e); return { error: e.message }; }
  });

  // ── Monitoring ─────────────────────────────────────────────────────
  ipcMain.handle('get-git-status', async (_e, dirPath) => {
    try { return getGitStatus(dirPath); }
    catch (e) { console.error('Error in get-git-status:', e); return { error: e.message }; }
  });

  ipcMain.handle('get-resource-stats', async (_e, projectId) => {
    try {
      const entry = getRunningProcesses().get(projectId);
      if (!entry || entry.pids.length === 0) return null;
      let totalMem = 0, totalCpu = 0, count = 0;
      for (const pid of entry.pids) {
        const stats = getProcessStats(pid);
        if (stats) { totalMem += stats.memMB; totalCpu += stats.cpu; count++; }
      }
      return count > 0 ? { memMB: totalMem, cpu: Math.round(totalCpu * 10) / 10 } : null;
    } catch (e) { console.error('Error in get-resource-stats:', e); return { error: e.message }; }
  });

  ipcMain.handle('get-ports', async () => {
    try { return getListeningPorts(); }
    catch (e) { console.error('Error in get-ports:', e); return { error: e.message }; }
  });

  ipcMain.handle('kill-port', async (_e, pid) => {
    try {
      process.kill(pid, 'SIGTERM');
      return { success: true };
    } catch (e) {
      // Try SIGKILL if SIGTERM failed
      try { process.kill(pid, 'SIGKILL'); return { success: true }; }
      catch (e2) { return { error: e2.message }; }
    }
  });

  ipcMain.handle('check-health', async (_e, url) => {
    try { return await checkHealth(url); }
    catch (e) { console.error('Error in check-health:', e); return { error: e.message }; }
  });

  // ── Detect ─────────────────────────────────────────────────────────
  ipcMain.handle('detect-project', async (_e, dirPath) => {
    try { return detectProjectType(dirPath); }
    catch (e) { console.error('Error in detect-project:', e); return { error: e.message }; }
  });

  // ── Scripts ────────────────────────────────────────────────────────
  ipcMain.handle('get-project-scripts', async (_e, projectPath) => {
    return scripts.getProjectScripts(projectPath);
  });

  ipcMain.handle('run-script', async (_e, projectId, projectPath, scriptName, scriptType, scriptCmd) => {
    try {
      console.log(`[ipc] run-script: ${scriptName} (${scriptType}) in ${projectPath}`);
      const result = scripts.runScript(projectId, projectPath, scriptName, scriptType, scriptCmd);
      console.log('[ipc] run-script result:', JSON.stringify(result));
      return result;
    } catch (e) {
      console.error('[ipc] run-script error:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('stop-script', async (_e, projectId, scriptName) => {
    scripts.stopScript(projectId, scriptName);
    return { success: true };
  });

  ipcMain.handle('detect-port-conflicts', async (_e, projectsList) => {
    return scripts.detectPortConflicts(projectsList);
  });

  // ── Dependencies ───────────────────────────────────────────────────
  ipcMain.handle('check-outdated', async (_e, projectPath) => {
    return deps.checkOutdated(projectPath);
  });

  // ── Git panel ──────────────────────────────────────────────────────
  ipcMain.handle('git-full-status', async (_e, cwd) => {
    console.log('[git] git-full-status called with cwd:', cwd);
    try {
      const result = git.gitGetFullStatus(cwd);
      console.log('[git] git-full-status result:', result ? 'ok, branch=' + result.branch : 'null');
      return result;
    } catch (e) {
      console.error('[git] git-full-status THREW:', e.message);
      return { error: e.message };
    }
  });

  // ── Project creation ─────────────────────────────────────────────
  ipcMain.handle('git-clone', async (_e, url, dest) => {
    try {
      if (!fs.existsSync(dest)) return { error: `Destination does not exist: ${dest}` };
      const repoName = url.replace(/\.git$/, '').split('/').pop() || 'repo';
      const targetPath = path.join(dest, repoName);
      // Run via a login shell so git inherits the full user environment —
      // SSH agent, credential helpers, PATH — exactly like a terminal would.
      const { spawn } = require('child_process');
      const shell = process.env.SHELL || '/bin/zsh';
      const cmd = `git clone ${JSON.stringify(url)} ${JSON.stringify(targetPath)}`;
      await new Promise((resolve, reject) => {
        const proc = spawn(shell, ['-l', '-c', cmd], {
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim()));
        });
        setTimeout(() => { proc.kill(); reject(new Error('Clone timed out after 2 minutes')); }, 120000);
      });
      return { path: targetPath, name: repoName };
    } catch (e) {
      const lines = e.message.split('\n').filter(Boolean);
      return { error: lines.slice(0, 3).join(' ') };
    }
  });

  ipcMain.handle('scaffold-project', async (_e, tpl, name, dest) => {
    try {
      if (!fs.existsSync(dest)) return { error: `Destination does not exist: ${dest}` };
      const targetPath = path.join(dest, name);
      const env = { ...process.env, npm_config_yes: 'true' };

      const cmds = {
        'vite-react': `npm create vite@latest "${name}" -- --template react`,
        'nextjs':     `npx create-next-app@latest "${name}" --yes`,
        'node':       null, // manual setup
        'python':     null,
        'go':         null,
      };

      if (tpl === 'node') {
        fs.mkdirSync(targetPath, { recursive: true });
        fs.writeFileSync(path.join(targetPath, 'index.js'), '// Entry point\nconsole.log("Hello!");\n');
        fs.writeFileSync(path.join(targetPath, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' } }, null, 2));
      } else if (tpl === 'python') {
        fs.mkdirSync(targetPath, { recursive: true });
        fs.writeFileSync(path.join(targetPath, 'main.py'), '# Entry point\nprint("Hello!")\n');
        fs.writeFileSync(path.join(targetPath, 'requirements.txt'), '');
        execSync(`python3 -m venv "${path.join(targetPath, 'venv')}"`, { encoding: 'utf-8', timeout: 30000, env });
      } else if (tpl === 'go') {
        fs.mkdirSync(targetPath, { recursive: true });
        execSync(`go mod init ${name}`, { cwd: targetPath, encoding: 'utf-8', timeout: 15000, env });
        fs.writeFileSync(path.join(targetPath, 'main.go'), `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello!")\n}\n`);
      } else {
        const cmd = cmds[tpl];
        if (!cmd) return { error: `Unknown template: ${tpl}` };
        execSync(cmd, { cwd: dest, encoding: 'utf-8', timeout: 120000, env });
      }

      return { path: targetPath, name };
    } catch (e) {
      return { error: e.message.split('\n').slice(0, 3).join(' ') };
    }
  });

  ipcMain.handle('git-init', async (_e, cwd) => {
    try {
      execSync('git init', { cwd, encoding: 'utf-8', timeout: 10000, env: process.env });
      return { success: true };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  ipcMain.handle('git-diff', async (_e, cwd, filePath, staged) => {
    return git.gitGetDiff(cwd, filePath, staged);
  });

  ipcMain.handle('git-stage', async (_e, cwd, filePath) => {
    const result = git.gitExec(cwd, `add -- "${filePath}"`);
    return result !== null ? { success: true } : { error: 'Failed to stage file' };
  });

  ipcMain.handle('git-unstage', async (_e, cwd, filePath) => {
    const result = git.gitExec(cwd, `reset HEAD -- "${filePath}"`);
    return result !== null ? { success: true } : { error: 'Failed to unstage file' };
  });

  ipcMain.handle('git-stage-all', async (_e, cwd) => {
    const result = git.gitExec(cwd, 'add -A');
    return result !== null ? { success: true } : { error: 'Failed to stage all' };
  });

  ipcMain.handle('git-unstage-all', async (_e, cwd) => {
    const result = git.gitExec(cwd, 'reset HEAD');
    return result !== null ? { success: true } : { error: 'Failed to unstage all' };
  });

  ipcMain.handle('git-commit', async (_e, cwd, message) => {
    try {
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd, encoding: 'utf-8', timeout: 15000, env: process.env });
      return { success: true };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  ipcMain.handle('git-pull', async (_e, cwd) => {
    try {
      const out = execSync('git pull', { cwd, encoding: 'utf-8', timeout: 30000, env: process.env });
      return { success: true, output: out };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  ipcMain.handle('git-push', async (_e, cwd) => {
    try {
      const out = execSync('git push', { cwd, encoding: 'utf-8', timeout: 30000, env: process.env });
      return { success: true, output: out };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  ipcMain.handle('git-stash', async (_e, cwd) => {
    const result = git.gitExec(cwd, 'stash');
    return result !== null ? { success: true, output: result } : { error: 'Stash failed' };
  });

  ipcMain.handle('git-stash-pop', async (_e, cwd) => {
    try {
      const out = execSync('git stash pop', { cwd, encoding: 'utf-8', timeout: 10000, env: process.env });
      return { success: true, output: out };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  ipcMain.handle('git-checkout-branch', async (_e, cwd, branch) => {
    try {
      execSync(`git checkout "${branch}"`, { cwd, encoding: 'utf-8', timeout: 10000, env: process.env });
      return { success: true };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  ipcMain.handle('git-create-branch', async (_e, cwd, branch) => {
    try {
      execSync(`git checkout -b "${branch}"`, { cwd, encoding: 'utf-8', timeout: 10000, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
      return { success: true };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  ipcMain.handle('git-discard-file', async (_e, cwd, filePath) => {
    try {
      const status = git.gitExec(cwd, `status --porcelain -- "${filePath}"`);
      if (status && status.startsWith('??')) {
        fs.unlinkSync(path.join(cwd, filePath));
      } else {
        execSync(`git checkout -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000, env: process.env });
      }
      return { success: true };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  // ── Terminal (PTY) ─────────────────────────────────────────────────
  ipcMain.handle('create-terminal', async (_e, terminalId, projectId, cwd) => {
    try { return terminal.createPty(terminalId, projectId, cwd); }
    catch (e) { console.error('Error in create-terminal:', e); return { error: e.message }; }
  });

  ipcMain.handle('write-terminal', async (_e, terminalId, data) => {
    try { terminal.writePty(terminalId, data); return true; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('resize-terminal', async (_e, terminalId, cols, rows) => {
    try { terminal.resizePty(terminalId, cols, rows); return true; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('destroy-terminal', async (_e, terminalId) => {
    try { terminal.destroyPty(terminalId); return true; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('destroy-project-terminals', async (_e, projectId) => {
    try { terminal.destroyProjectPtys(projectId); return true; }
    catch (e) { return { error: e.message }; }
  });

  // ── Tunnel ─────────────────────────────────────────────────────────
  ipcMain.handle('start-tunnel', async (_e, projectId, port) => {
    try { return tunnel.startTunnel(projectId, port); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('stop-tunnel', async (_e, projectId) => {
    try { tunnel.stopTunnel(projectId); return { success: true }; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-tunnel-status', async (_e, projectId) => {
    return tunnel.getTunnelStatus(projectId);
  });

  ipcMain.handle('detect-tunnel-provider', async () => {
    return { provider: tunnel.detectTunnelProvider() };
  });

  // ── Environment checker ────────────────────────────────────────────
  ipcMain.handle('check-env-versions', async (_e, projectPath) => {
    return env.checkEnvVersions(projectPath);
  });

  ipcMain.handle('run-env-fix', async (_e, projectPath, cmd) => {
    return env.runEnvFix(projectPath, cmd);
  });

  // ── App logs ───────────────────────────────────────────────────────
  ipcMain.handle('get-app-logs', async () => {
    return logger.getLogs();
  });

  ipcMain.handle('clear-app-logs', async () => {
    logger.clearLogs();
    return true;
  });
}

module.exports = { registerAll };
