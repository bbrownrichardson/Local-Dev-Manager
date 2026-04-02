// ── Shared Application State ──────────────────────────────────────
window.App = {};

App.state = {
  projects: [],
  profiles: [],
  selectedId: null,
  editingId: null,
  currentView: 'projects', // 'projects' | 'ports' | 'logs' | 'syslog'
  statuses: {},
  logBuffers: {},
  gitCache: {},
  resourceCache: {},
  logFilter: '',
  selectedColor: '',
  autoRestart: false,
  modalCommands: [],
  dragSrcIdx: null,
  projectSearch: '',
  activeDetailTab: 'output', // 'output' | 'terminal' | 'scripts' | 'deps' | 'git' | 'env'
  activeTerminals: {}, // terminalId -> { term, fitAddon, resizeObserver, projectId }
  projectTerminalTabs: {}, // projectId -> { tabs: [{ id, label }], activeTab: terminalId, nextIdx: 1 }
  MAX_TERMINALS: 5,
  scriptOutputs: {}, // projectId:scriptName -> string
  runningScriptKeys: new Set(),
  unifiedLogs: [],
  unifiedLogFilter: '',
  sysLogs: [],
  syslogLevelFilter: 'all',
  syslogSearch: '',
  syslogsFetched: false,
  gitDiffExpanded: {},
  terminalFontSize: 13,
  terminalThemeSetting: 'dark',
  currentThemeSetting: 'system',
  currentModalMode: 'existing',
  selectedTpl: 'vite-react',
};

App.icons = {
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><polygon points="4,2 14,8 4,14"/></svg>',
  stop: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>',
  restart: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 8a6 6 0 0 1 10.3-4.2M14 8a6 6 0 0 1-10.3 4.2"/><polyline points="12 1 12.5 4 9.5 4.5" /><polyline points="4 12 3.5 15 6.5 14.5" /></svg>',
  open: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3H3v10h10v-3"/><path d="M9 2h5v5"/><path d="M14 2L7 9"/></svg>',
  terminal: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="2" width="14" height="12" rx="2"/><polyline points="4 6 7 9 4 12"/><line x1="9" y1="12" x2="12" y2="12"/></svg>',
  edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>',
  clone: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="1" width="9" height="11" rx="1.5"/><rect x="2" y="4" width="9" height="11" rx="1.5"/></svg>',
  trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4"/><path d="M3.5 4l.8 10.1a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L12.5 4"/></svg>',
  git: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="3.5" r="1.5"/><circle cx="8" cy="12.5" r="1.5"/><circle cx="12.5" cy="8" r="1.5"/><line x1="8" y1="5" x2="8" y2="11"/><path d="M9.2 4.5L11.2 7"/></svg>',
};
