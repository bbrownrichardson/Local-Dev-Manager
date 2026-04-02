// ── Terminal (xterm.js) -- Multi-tab ───────────────────────────────
(function () {
  const S = App.state;
  const { showCtxMenu } = App.utils;

  const terminalThemes = {
    dark: {
      background: '#0a0a0a', foreground: '#cccccc', cursor: '#6c5ce7',
      selectionBackground: 'rgba(108, 92, 231, 0.3)',
      black: '#0a0a0a', red: '#e17055', green: '#00b894', yellow: '#fdcb6e',
      blue: '#74b9ff', magenta: '#a29bfe', cyan: '#81ecec', white: '#dfe6e9',
      brightBlack: '#636e72', brightRed: '#ff7675', brightGreen: '#55efc4',
      brightYellow: '#ffeaa7', brightBlue: '#74b9ff', brightMagenta: '#a29bfe',
      brightCyan: '#81ecec', brightWhite: '#ffffff',
    },
    light: {
      background: '#f8f8f8', foreground: '#383a42', cursor: '#6c5ce7',
      selectionBackground: 'rgba(108, 92, 231, 0.2)',
      black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
      blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#a0a1a7',
      brightBlack: '#4f525e', brightRed: '#e06c75', brightGreen: '#98c379',
      brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
      brightCyan: '#56b6c2', brightWhite: '#ffffff',
    },
  };

  function resolveTerminalTheme() {
    if (S.terminalThemeSetting === 'system') {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    return S.terminalThemeSetting;
  }

  function getTerminalTheme() {
    return terminalThemes[resolveTerminalTheme()] || terminalThemes.dark;
  }

  function applyTerminalTheme() {
    const theme = getTerminalTheme();
    Object.values(S.activeTerminals).forEach(({ term, _mounted }) => {
      if (term && _mounted) term.options.theme = theme;
    });
    document.querySelectorAll('.terminal-container').forEach(el => {
      el.style.background = theme.background;
    });
    document.documentElement.style.setProperty('--log-bg', theme.background);
    document.documentElement.style.setProperty('--log-text', theme.foreground);
  }

  function applyTerminalFontSize() {
    Object.values(S.activeTerminals).forEach(({ term, fitAddon, _mounted }) => {
      if (term && _mounted) {
        term.options.fontSize = S.terminalFontSize;
        try { fitAddon.fit(); } catch (_) {}
      }
    });
  }

  function makeTerminalInstance() {
    return new Terminal({
      cursorBlink: true,
      fontSize: S.terminalFontSize,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
      theme: getTerminalTheme(),
      allowProposedApi: true,
    });
  }

  function ensureProjectTabs(projectId) {
    if (!S.projectTerminalTabs[projectId]) {
      const firstId = projectId + ':0';
      S.projectTerminalTabs[projectId] = { tabs: [{ id: firstId, label: '1' }], activeTab: firstId, nextIdx: 1 };
    }
    return S.projectTerminalTabs[projectId];
  }

  function renderTerminalTabsBar(project) {
    const bar = document.getElementById('terminal-tabs-bar');
    if (!bar) return;
    const state = ensureProjectTabs(project.id);
    const canAdd = state.tabs.length < S.MAX_TERMINALS;
    bar.innerHTML = state.tabs.map((t, i) =>
      '<button class="term-tab ' + (t.id === state.activeTab ? 'active' : '') + '" data-tid="' + t.id + '">' +
        '<span>' + (i + 1) + '</span>' + (state.tabs.length > 1 ? '<span class="term-tab-close" data-tid="' + t.id + '">&times;</span>' : '') +
      '</button>'
    ).join('') + (canAdd ? '<button class="term-tab term-tab-add" id="btn-add-term">+</button>' : '');

    bar.querySelectorAll('.term-tab:not(.term-tab-add)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('term-tab-close')) return;
        const tid = btn.dataset.tid;
        if (tid !== state.activeTab) {
          state.activeTab = tid;
          switchToTerminal(project, tid);
        }
      });
    });

    bar.querySelectorAll('.term-tab-close').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await closeTerminalTab(project, btn.dataset.tid);
      });
    });

    const addBtn = document.getElementById('btn-add-term');
    if (addBtn) addBtn.addEventListener('click', () => addTerminalTab(project));
  }

  async function addTerminalTab(project) {
    const state = ensureProjectTabs(project.id);
    if (state.tabs.length >= S.MAX_TERMINALS) return;
    const newId = project.id + ':' + state.nextIdx;
    state.tabs.push({ id: newId, label: '' + (state.nextIdx + 1) });
    state.nextIdx++;
    state.activeTab = newId;
    renderTerminalTabsBar(project);
    await mountTerminal(project, newId);
  }

  async function closeTerminalTab(project, terminalId) {
    const state = ensureProjectTabs(project.id);
    if (state.tabs.length <= 1) return;

    await window.api.destroyTerminal(terminalId);
    if (S.activeTerminals[terminalId]) {
      try { S.activeTerminals[terminalId].term.dispose(); } catch (_) {}
      if (S.activeTerminals[terminalId].resizeObserver) S.activeTerminals[terminalId].resizeObserver.disconnect();
      delete S.activeTerminals[terminalId];
    }

    state.tabs = state.tabs.filter(t => t.id !== terminalId);
    if (state.activeTab === terminalId) {
      state.activeTab = state.tabs[state.tabs.length - 1].id;
    }
    renderTerminalTabsBar(project);
    await switchToTerminal(project, state.activeTab);
  }

  async function switchToTerminal(project, terminalId) {
    const state = ensureProjectTabs(project.id);
    state.activeTab = terminalId;
    renderTerminalTabsBar(project);
    await mountTerminal(project, terminalId);
  }

  async function mountTerminal(project, terminalId) {
    const container = document.getElementById('terminal-container');
    if (!container) return;

    if (window.__xtermReady) await window.__xtermReady;
    if (typeof Terminal === 'undefined') {
      container.textContent = 'xterm.js not loaded. Run: npm install @xterm/xterm @xterm/addon-fit';
      return;
    }

    for (const [tid, entry] of Object.entries(S.activeTerminals)) {
      if (entry._mounted) {
        try { entry.term.dispose(); } catch (_) {}
        if (entry.resizeObserver) entry.resizeObserver.disconnect();
        entry._mounted = false;
      }
    }

    container.innerHTML = '';

    const existing = S.activeTerminals[terminalId];
    if (existing) {
      try { existing.term.dispose(); } catch (_) {}
      if (existing.resizeObserver) existing.resizeObserver.disconnect();
    }

    const term = makeTerminalInstance();
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    if (typeof Unicode11Addon !== 'undefined') {
      try {
        const unicode11 = new Unicode11Addon.Unicode11Addon();
        term.loadAddon(unicode11);
        term.unicode.activeVersion = '11';
      } catch (_) {}
    }

    term.open(container);
    requestAnimationFrame(() => { fitAddon.fit(); term.focus(); });

    let searchAddon = null;
    if (typeof SearchAddon !== 'undefined') {
      try {
        searchAddon = new SearchAddon.SearchAddon();
        term.loadAddon(searchAddon);
      } catch (_) {}
    }

    if (typeof WebLinksAddon !== 'undefined') {
      try {
        const webLinks = new WebLinksAddon.WebLinksAddon((e, url) => {
          if (e.metaKey || e.ctrlKey) window.api.openUrl(url);
        });
        term.loadAddon(webLinks);
      } catch (_) {}
    }

    container.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      const paths = files.map(f => {
        const p = f.path;
        return p.includes(' ') ? '"' + p + '"' : p;
      }).join(' ');
      window.api.writeTerminal(terminalId, paths);
      term.focus();
    });

    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const selected = term.getSelection();
      showCtxMenu(e.clientX, e.clientY, [
        ...(selected ? [{ label: 'Copy', action: () => navigator.clipboard.writeText(selected) }] : []),
        { label: 'Paste', action: async () => {
          try {
            const t = await navigator.clipboard.readText();
            if (t) { window.api.writeTerminal(terminalId, t); term.focus(); }
          } catch (_) {}
        }},
        '---',
        { label: 'Clear', action: () => term.clear() },
      ]);
    });

    const result = await window.api.createTerminal(terminalId, project.id, project.path);
    if (result && result.error) {
      term.writeln('\r\n\x1b[31m' + result.error + '\x1b[0m');
      S.activeTerminals[terminalId] = { term, fitAddon, searchAddon, projectId: project.id, _mounted: true };
      return;
    }

    if (result && result.alreadyRunning && result.buffer) {
      term.write(result.buffer);
    }

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        window.api.writeTerminal(terminalId, '\n');
        return false;
      }
      if (meta && e.key === 'f') { e.preventDefault(); openTerminalSearch(); return false; }
      if (meta && e.key === 'k') { e.preventDefault(); term.clear(); return false; }
      if (meta && e.key === 'n') { e.preventDefault(); App.modal.openModal(); return false; }
      // Font zoom (Cmd+Plus/Minus/0) is handled by the global shortcuts handler in shortcuts.js
      // so that it works whether xterm has focus or not. Let these events bubble.
      return true;
    });
    term.onData((data) => { window.api.writeTerminal(terminalId, data); });
    term.onResize(({ cols, rows }) => { window.api.resizeTerminal(terminalId, cols, rows); });
    window.api.resizeTerminal(terminalId, term.cols, term.rows);

    const resizeObserver = new ResizeObserver(() => {
      if (S.activeDetailTab === 'terminal' && S.activeTerminals[terminalId] && S.activeTerminals[terminalId]._mounted) {
        try { fitAddon.fit(); } catch (_) {}
      }
    });
    resizeObserver.observe(container);

    S.activeTerminals[terminalId] = { term, fitAddon, searchAddon, resizeObserver, projectId: project.id, _mounted: true };
  }

  async function initTerminal(project) {
    const state = ensureProjectTabs(project.id);
    renderTerminalTabsBar(project);
    await mountTerminal(project, state.activeTab);
  }

  // ── Terminal Search ──────────────────────────────────────────────
  function getActiveSearchAddon() {
    if (!S.selectedId) return null;
    const state = S.projectTerminalTabs[S.selectedId];
    if (!state) return null;
    const entry = S.activeTerminals[state.activeTab];
    return entry && entry.searchAddon ? entry.searchAddon : null;
  }

  function openTerminalSearch() {
    const bar = document.getElementById('terminal-search-bar');
    const input = document.getElementById('terminal-search-input');
    if (!bar || !input) return;
    bar.style.display = 'flex';
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeTerminalSearch(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doTerminalSearch('next'); }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); doTerminalSearch('prev'); }
    };
    input.focus();
    input.select();
  }

  function closeTerminalSearch() {
    const bar = document.getElementById('terminal-search-bar');
    const input = document.getElementById('terminal-search-input');
    const count = document.getElementById('terminal-search-count');
    if (bar) bar.style.display = 'none';
    if (input) input.value = '';
    if (count) count.textContent = '';
    const addon = getActiveSearchAddon();
    if (addon) addon.clearDecorations();
    const state = S.projectTerminalTabs[S.selectedId];
    if (state && S.activeTerminals[state.activeTab]) S.activeTerminals[state.activeTab].term.focus();
  }

  function doTerminalSearch(direction) {
    const addon = getActiveSearchAddon();
    const input = document.getElementById('terminal-search-input');
    if (!addon || !input || !input.value) return;
    const opts = {
      regex: false, wholeWord: false, caseSensitive: false,
      incremental: direction === 'next',
      decorations: {
        matchBackground: '#7c4dff40', matchBorder: '#7c4dff', matchOverviewRuler: '#7c4dff',
        activeMatchBackground: '#ffb86c', activeMatchBorder: '#ff9500', activeMatchColorOverviewRuler: '#ff9500',
      }
    };
    if (direction === 'prev') addon.findPrevious(input.value, opts);
    else addon.findNext(input.value, opts);
  }

  // Wire up search bar events (delegated)
  document.addEventListener('click', (e) => {
    if (e.target.id === 'terminal-search-next') doTerminalSearch('next');
    if (e.target.id === 'terminal-search-prev') doTerminalSearch('prev');
    if (e.target.id === 'terminal-search-close') closeTerminalSearch();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'terminal-search-input') doTerminalSearch('next');
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'terminal-search-input') {
      if (e.key === 'Escape') { e.preventDefault(); closeTerminalSearch(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doTerminalSearch('next'); }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); doTerminalSearch('prev'); }
    }
  });

  // Listen for PTY output
  window.api.onTerminalData(({ id, data }) => {
    if (S.activeTerminals[id] && S.activeTerminals[id].term) {
      S.activeTerminals[id].term.write(data);
    }
  });

  window.api.onTerminalExit(({ id }) => {
    if (S.activeTerminals[id] && S.activeTerminals[id].term) {
      S.activeTerminals[id].term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m');
    }
  });

  App.terminal = {
    initTerminal, mountTerminal, addTerminalTab, closeTerminalTab, switchToTerminal,
    ensureProjectTabs, renderTerminalTabsBar,
    applyTerminalFontSize, applyTerminalTheme, resolveTerminalTheme, getTerminalTheme,
    openTerminalSearch, closeTerminalSearch, doTerminalSearch,
    makeTerminalInstance, getActiveSearchAddon,
  };
})();
