const { Tray, Menu, nativeImage } = require('electron');
const { getRunningProcesses, stopProject } = require('./process-manager');

let tray;
let getMainWindow;

/**
 * Initialize the tray module.
 * @param {Function} mainWindowGetter - Function that returns the main window
 */
function init(mainWindowGetter) {
  getMainWindow = mainWindowGetter;
}

/**
 * Create the macOS tray icon with a ">_" glyph.
 * No-op on non-macOS platforms.
 */
function createTrayIcon() {
  const isMac = process.platform === 'darwin';
  if (!isMac) return;

  // Pixel-perfect ">_" glyph on transparent background
  // 16x16 (1x) + 32x32 (2x retina) for crisp rendering at all DPIs
  // macOS template images: black pixels auto-adapt to light/dark menu bar
  const img1x = nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVR4nGNgGFbgPxSPGkKiIUyU2kKR7YNDMyOaZnQxdDlceocyAABtgRH0uBRaggAAAABJRU5ErkJggg==', 'base64'),
    { width: 16, height: 16, scaleFactor: 1.0 }
  );
  const img2x = nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAVUlEQVR4nO2WMQoAIAgArf//uSaXiHDQTLobQysPLEUAfqdt1oYhxo0eubmFU3VXTDxtQAk1UcKAEmKilAHF1US6AS5AF/AS8ht6TkRrnunMdAMAMAE1IQogB7t9lgAAAABJRU5ErkJggg==', 'base64'),
    { width: 32, height: 32, scaleFactor: 2.0 }
  );
  const trayIcon = nativeImage.createEmpty();
  trayIcon.addRepresentation({ buffer: img1x.toPNG(), width: 16, height: 16, scaleFactor: 1.0 });
  trayIcon.addRepresentation({ buffer: img2x.toPNG(), width: 32, height: 32, scaleFactor: 2.0 });
  trayIcon.setTemplateImage(true);

  tray = new Tray(trayIcon);
  updateTrayMenu();

  tray.on('click', () => {
    const win = getMainWindow();
    if (win) { win.show(); win.focus(); }
  });
}

/**
 * Rebuild the tray context menu based on current running projects.
 */
function updateTrayMenu() {
  if (!tray) return;

  const running = Array.from(getRunningProcesses().entries()).map(([id, entry]) => ({
    label: entry.project?.name || id,
    enabled: false,
  }));

  const { app } = require('electron');
  const template = [
    { label: 'Show Window', click: () => {
      const win = getMainWindow();
      if (win) { win.show(); win.focus(); }
    }},
    { type: 'separator' },
    ...(running.length > 0 ? [
      { label: 'Running Projects', enabled: false },
      ...running,
      { type: 'separator' },
    ] : []),
    { label: 'Quit', click: () => {
      for (const [id] of getRunningProcesses()) stopProject(id);
      app.quit();
    }},
  ];

  const menu = Menu.buildFromTemplate(template);
  tray.setContextMenu(menu);
}

/**
 * Get the tray instance (for close-to-tray logic).
 * @returns {Tray|null}
 */
function getTray() { return tray; }

module.exports = { init, createTrayIcon, updateTrayMenu, getTray };
