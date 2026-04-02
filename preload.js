const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProjects: (projects) => ipcRenderer.invoke('save-projects', projects),
  startProject: (project) => ipcRenderer.invoke('start-project', project),
  stopProject: (id) => ipcRenderer.invoke('stop-project', id),
  getLogs: (id) => ipcRenderer.invoke('get-logs', id),
  getPersistedLogs: (id) => ipcRenderer.invoke('get-persisted-logs', id),
  getRunningIds: () => ipcRenderer.invoke('get-running-ids'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  detectProject: (dirPath) => ipcRenderer.invoke('detect-project', dirPath),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openTerminal: (dirPath) => ipcRenderer.invoke('open-terminal', dirPath),
  getGitStatus: (dirPath) => ipcRenderer.invoke('get-git-status', dirPath),
  getResourceStats: (projectId) => ipcRenderer.invoke('get-resource-stats', projectId),
  getPorts: () => ipcRenderer.invoke('get-ports'),
  checkHealth: (url) => ipcRenderer.invoke('check-health', url),
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  saveProfiles: (profiles) => ipcRenderer.invoke('save-profiles', profiles),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: (data) => ipcRenderer.invoke('import-config', data),

  // Interactive terminal (PTY) — multi-terminal support
  createTerminal: (terminalId, projectId, cwd) => ipcRenderer.invoke('create-terminal', terminalId, projectId, cwd),
  writeTerminal: (terminalId, data) => ipcRenderer.invoke('write-terminal', terminalId, data),
  resizeTerminal: (terminalId, cols, rows) => ipcRenderer.invoke('resize-terminal', terminalId, cols, rows),
  destroyTerminal: (terminalId) => ipcRenderer.invoke('destroy-terminal', terminalId),
  destroyProjectTerminals: (projectId) => ipcRenderer.invoke('destroy-project-terminals', projectId),
  onTerminalData: (cb) => ipcRenderer.on('terminal-data', (_e, data) => cb(data)),
  onTerminalExit: (cb) => ipcRenderer.on('terminal-exit', (_e, data) => cb(data)),

  // Tunnel
  startTunnel: (projectId, port) => ipcRenderer.invoke('start-tunnel', projectId, port),
  stopTunnel: (projectId) => ipcRenderer.invoke('stop-tunnel', projectId),
  getTunnelStatus: (projectId) => ipcRenderer.invoke('get-tunnel-status', projectId),
  detectTunnelProvider: () => ipcRenderer.invoke('detect-tunnel-provider'),
  onTunnelStatus: (cb) => ipcRenderer.on('tunnel-status', (_e, data) => cb(data)),

  // Script runner
  getProjectScripts: (projectPath) => ipcRenderer.invoke('get-project-scripts', projectPath),
  runScript: (projectId, projectPath, scriptName, scriptType, scriptCmd) => ipcRenderer.invoke('run-script', projectId, projectPath, scriptName, scriptType, scriptCmd),
  stopScript: (projectId, scriptName) => ipcRenderer.invoke('stop-script', projectId, scriptName),
  onScriptOutput: (cb) => ipcRenderer.on('script-output', (_e, data) => cb(data)),
  onScriptExit: (cb) => ipcRenderer.on('script-exit', (_e, data) => cb(data)),

  // Port conflicts & dependency checker
  detectPortConflicts: (projects) => ipcRenderer.invoke('detect-port-conflicts', projects),
  killPort: (pid) => ipcRenderer.invoke('kill-port', pid),
  checkOutdated: (projectPath) => ipcRenderer.invoke('check-outdated', projectPath),

  // Git
  gitInit: (dirPath) => ipcRenderer.invoke('git-init', dirPath),
  gitFullStatus: (dirPath) => ipcRenderer.invoke('git-full-status', dirPath),
  gitDiff: (dirPath, filePath, staged) => ipcRenderer.invoke('git-diff', dirPath, filePath, staged),
  gitStage: (dirPath, filePath) => ipcRenderer.invoke('git-stage', dirPath, filePath),
  gitUnstage: (dirPath, filePath) => ipcRenderer.invoke('git-unstage', dirPath, filePath),
  gitStageAll: (dirPath) => ipcRenderer.invoke('git-stage-all', dirPath),
  gitUnstageAll: (dirPath) => ipcRenderer.invoke('git-unstage-all', dirPath),
  gitCommit: (dirPath, message) => ipcRenderer.invoke('git-commit', dirPath, message),
  gitPull: (dirPath) => ipcRenderer.invoke('git-pull', dirPath),
  gitPush: (dirPath) => ipcRenderer.invoke('git-push', dirPath),
  gitStash: (dirPath) => ipcRenderer.invoke('git-stash', dirPath),
  gitStashPop: (dirPath) => ipcRenderer.invoke('git-stash-pop', dirPath),
  gitCheckoutBranch: (dirPath, branch) => ipcRenderer.invoke('git-checkout-branch', dirPath, branch),
  gitCreateBranch: (dirPath, branch) => ipcRenderer.invoke('git-create-branch', dirPath, branch),
  gitDiscardFile: (dirPath, filePath) => ipcRenderer.invoke('git-discard-file', dirPath, filePath),
  gitSetIdentity: (dirPath, identity) => ipcRenderer.invoke('git-set-identity', dirPath, identity),
  gitGetIdentity: (dirPath) => ipcRenderer.invoke('git-get-identity', dirPath),

  // Environment checker
  checkEnvVersions: (projectPath) => ipcRenderer.invoke('check-env-versions', projectPath),
  runEnvFix: (projectPath, cmd) => ipcRenderer.invoke('run-env-fix', projectPath, cmd),

  // Project creation
  gitClone: (url, dest) => ipcRenderer.invoke('git-clone', url, dest),
  scaffoldProject: (tpl, name, dest) => ipcRenderer.invoke('scaffold-project', tpl, name, dest),

  // App logs
  getAppLogs: () => ipcRenderer.invoke('get-app-logs'),
  clearAppLogs: () => ipcRenderer.invoke('clear-app-logs'),
  onAppLog: (cb) => ipcRenderer.on('app-log', (_e, data) => cb(data)),

  onProjectStatus: (cb) => ipcRenderer.on('project-status', (_e, data) => cb(data)),
  onProjectLog: (cb) => ipcRenderer.on('project-log', (_e, data) => cb(data)),
});
