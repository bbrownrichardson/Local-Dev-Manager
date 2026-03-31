const { BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

/**
 * Create the main application window.
 * @returns {BrowserWindow} The created window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 800, minHeight: 550,
    titleBarStyle: 'hiddenInset', backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
  return mainWindow;
}

/**
 * Get the current main window instance.
 * @returns {BrowserWindow|null}
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Set the main window reference (used after creation in main.js).
 * @param {BrowserWindow} win
 */
function setMainWindow(win) {
  mainWindow = win;
}

module.exports = { createWindow, getMainWindow, setMainWindow };
