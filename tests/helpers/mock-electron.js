// Patch CJS module cache so require('electron') returns our mock
// This runs before any test file imports
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const electronMock = {
  app: { getPath: () => '/tmp/test-ldm', isPackaged: false },
  Notification: { isSupported: () => false },
  ipcMain: { handle: () => {} },
};

// Register in Node's CJS module cache
require.cache[require.resolve('electron')] = {
  id: 'electron',
  filename: require.resolve('electron'),
  loaded: true,
  exports: electronMock,
};
