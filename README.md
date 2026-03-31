# Local Dev Manager

A macOS desktop app for managing local development projects. Start and stop processes, tail logs, manage environment variables, monitor ports, open tunnels, and run package scripts — all from one window.

![Electron](https://img.shields.io/badge/Electron-28-blue) ![Node](https://img.shields.io/badge/Node-18+-green) ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)

## Features

- **Project management** — register projects with a name, path, and start command; color-code them for quick scanning
- **Start / Stop / Restart** — manage processes with one click or `Cmd+R`; optional auto-restart on crash
- **Live logs** — stream stdout + stderr with filtering, right-click copy, and clickable URLs
- **Interactive terminal** — embedded xterm.js shell per project, up to 5 tabs; drag-and-drop files to insert paths
- **Workspace projects** — add directories with no start command for quick shell access (monorepos, script folders, etc.)
- **Env vars** — per-project environment variables with startup profiles (Local, Staging, Production)
- **Scripts** — run `package.json` scripts or Makefile targets from within the app
- **Ports** — view all listening ports; open in browser or kill the holding process
- **Tunnels** — expose any port publicly via cloudflared, ngrok, or localtunnel; one-click URL copy
- **Git** — branch, diff, and recent commits at a glance; init repos from the app
- **Deps** — installed dependency overview with update indicators

## Repository Structure

```
├── main.js                        # Electron main process — app lifecycle, window creation
├── preload.js                     # Context bridge — exposes safe IPC API to renderer
├── renderer.js                    # Frontend logic — all UI state, rendering, and event handling
├── index.html                     # App shell HTML
├── styles.css                     # All styles
├── xterm-loader.js                # Dynamically loads xterm.js + addons before renderer runs
│
└── src/
    ├── core/
    │   ├── config.js              # Read/write projects, settings, and logs to disk
    │   ├── process-manager.js     # Spawn/stop project processes, auto-restart, notifications
    │   ├── logger.js              # App-level logging
    │   ├── tray.js                # macOS menu bar tray icon and menu
    │   └── window.js              # BrowserWindow setup and management
    │
    ├── features/
    │   ├── terminal/index.js      # node-pty PTY sessions — create, write, resize, destroy
    │   ├── tunnel/index.js        # Tunnel management — cloudflared, ngrok, localtunnel
    │   ├── git/index.js           # Git status, branch, diff, commit, init
    │   ├── scripts/index.js       # Run package.json / Makefile scripts, stream output
    │   ├── deps/index.js          # Parse and check dependency files
    │   └── env/index.js           # Per-project env var resolution and fix
    │
    ├── ipc/
    │   └── handlers.js            # All ipcMain.handle() registrations — wires features to renderer
    │
    └── services/
        ├── detect.js              # Detect installed tunnel providers and system tools
        └── monitoring.js          # Port scanning and resource usage polling
```

## Development

### Prerequisites

- Node.js 18+
- Xcode Command Line Tools (required for `node-pty`)

```bash
xcode-select --install
```

### Setup

```bash
npm install
```

### Run

```bash
npm start
```

### Build `.dmg`

```bash
npm run build
```

Output is written to `dist/`.

## Tech

- [Electron](https://www.electronjs.org/) — app shell
- [node-pty](https://github.com/microsoft/node-pty) — PTY for interactive terminals
- [xterm.js](https://xtermjs.org/) — terminal renderer

## License

MIT
