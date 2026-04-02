// This script loads xterm.js modules and exposes them as globals
// for use in the renderer. It runs before renderer.js.
(function() {
  try {
    // Try loading from node_modules (works in Electron with nodeIntegration or via preload)
    // Since we can't require() in renderer with contextIsolation, we dynamically load the UMD builds
    const basePath = document.currentScript ? document.currentScript.src.replace(/[^/]*$/, '') : '';

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    function loadCSS(href) {
      return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = resolve; // Don't block on CSS failure
        document.head.appendChild(link);
      });
    }

    // Try local node_modules first, fall back to CDN
    const localBase = './node_modules/@xterm';
    const cdnBase = 'https://cdn.jsdelivr.net/npm';

    async function init() {
      // Load CSS
      await loadCSS(`${localBase}/xterm/css/xterm.css`).catch(() =>
        loadCSS(`${cdnBase}/@xterm/xterm@5.5.0/css/xterm.min.css`)
      );

      // Load xterm.js
      await loadScript(`${localBase}/xterm/lib/xterm.js`).catch(() =>
        loadScript(`${cdnBase}/@xterm/xterm@5.5.0/lib/xterm.js`)
      );

      // Load fit addon
      await loadScript(`${localBase}/addon-fit/lib/addon-fit.js`).catch(() =>
        loadScript(`${cdnBase}/@xterm/addon-fit@0.10.0/lib/addon-fit.js`)
      );

      // Load web-links addon
      await loadScript(`${localBase}/addon-web-links/lib/addon-web-links.js`).catch(() =>
        loadScript(`${cdnBase}/@xterm/addon-web-links@0.11.0/lib/addon-web-links.js`)
      );

      // Load search addon
      await loadScript(`${localBase}/addon-search/lib/addon-search.js`).catch(() =>
        loadScript(`${cdnBase}/@xterm/addon-search@0.15.0/lib/addon-search.js`)
      );
    }

    // Store promise for renderer to await
    window.__xtermReady = init();
  } catch (e) {
    console.warn('Failed to load xterm:', e);
    window.__xtermReady = Promise.resolve();
  }
})();
