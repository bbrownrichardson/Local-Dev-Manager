const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'projects.json');
const PROFILES_PATH = path.join(app.getPath('userData'), 'profiles.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const LOGS_DIR = path.join(app.getPath('userData'), 'logs');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (_) {}
  return {};
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function loadProjects() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) { console.error('Failed to load config:', e); }
  return [];
}

function saveProjects(projects) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(projects, null, 2));
}

function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_PATH)) return JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf-8'));
  } catch (_) {}
  return [];
}

function saveProfiles(profiles) {
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2));
}

// Log persistence
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getLogFilePath(projectId) {
  return path.join(LOGS_DIR, `${projectId}.log`);
}

function loadPersistedLogs(projectId) {
  try {
    const logFile = getLogFilePath(projectId);
    if (fs.existsSync(logFile)) {
      return fs.readFileSync(logFile, 'utf-8').split('\n').filter(line => line.length > 0);
    }
  } catch (e) { console.error(`Failed to load persisted logs for ${projectId}:`, e); }
  return [];
}

function appendLog(projectId, line) {
  try {
    ensureLogsDir();
    const logFile = getLogFilePath(projectId);
    fs.appendFileSync(logFile, line + '\n');
    const allLines = fs.readFileSync(logFile, 'utf-8').split('\n');
    if (allLines.length > 5000) {
      fs.writeFileSync(logFile, allLines.slice(-5000).join('\n'));
    }
  } catch (e) { console.error(`Failed to append log for ${projectId}:`, e); }
}

module.exports = {
  loadSettings, saveSettings,
  loadProjects, saveProjects,
  loadProfiles, saveProfiles,
  loadPersistedLogs, appendLog,
  LOGS_DIR,
};
