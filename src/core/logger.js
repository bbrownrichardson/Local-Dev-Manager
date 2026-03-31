const appLogs = [];
const APP_LOG_LIMIT = 500;
const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;

let getMainWindow = () => null;

function init(mainWindowGetter) {
  getMainWindow = mainWindowGetter;
}

function pushAppLog(level, args) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  const entry = { ts: Date.now(), level, msg };
  appLogs.push(entry);
  if (appLogs.length > APP_LOG_LIMIT) appLogs.splice(0, appLogs.length - APP_LOG_LIMIT);
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    try { win.webContents.send('app-log', entry); } catch (_) {}
  }
}

console.log = (...args) => { _origLog(...args); pushAppLog('info', args); };
console.warn = (...args) => { _origWarn(...args); pushAppLog('warn', args); };
console.error = (...args) => { _origError(...args); pushAppLog('error', args); };

process.on('uncaughtException', (err) => {
  pushAppLog('error', [`Uncaught exception: ${err.stack || err.message}`]);
  _origError('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  pushAppLog('error', [`Unhandled rejection: ${reason}`]);
  _origError('Unhandled rejection:', reason);
});

function getLogs() { return appLogs; }

function clearLogs() { appLogs.length = 0; }

module.exports = { init, getLogs, clearLogs };
