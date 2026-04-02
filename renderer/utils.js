// ── Utilities ─────────────────────────────────────────────────────
(function () {
  const S = App.state;

  function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;
  function linkifyLog(escapedLine) {
    return escapedLine.replace(URL_RE, (url) =>
      `<a class="log-link" href="#" data-url="${url}">${url}</a>`
    );
  }

  function versionSatisfies(current, required) {
    if (!current || !required) return true;
    const c = current.replace(/^v/, '');
    const r = required.replace(/^[>=<~^ ]+/, '').replace(/^v/, '');
    const cp = c.split('.').map(Number);
    const rp = r.split('.').map(Number);
    if (required.startsWith('>=')) return cp[0] > rp[0] || (cp[0] === rp[0] && (cp[1] || 0) >= (rp[1] || 0));
    return cp[0] === rp[0];
  }

  function formatTimeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function getCommandsSummary(p) {
    if (p.commands && p.commands.length > 0) return p.commands.map(c => c.cmd).join(' + ');
    return p.command || '';
  }

  // ── Context menu ────────────────────────────────────────────────
  const ctxMenu = document.createElement('div');
  ctxMenu.id = 'ctx-menu';
  ctxMenu.className = 'ctx-menu';
  ctxMenu.style.display = 'none';
  document.body.appendChild(ctxMenu);

  function showCtxMenu(x, y, items) {
    // Context menu only displays esc()-sanitized content or static labels
    ctxMenu.innerHTML = items.map((item, i) =>
      item === '---'
        ? '<div class="ctx-sep"></div>'
        : '<div class="ctx-item" data-idx="' + i + '">' + item.label + '</div>'
    ).join('');
    ctxMenu.style.display = 'block';
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = 180, h = items.length * 28 + 8;
    ctxMenu.style.left = (x + w > vw ? vw - w - 8 : x) + 'px';
    ctxMenu.style.top  = (y + h > vh ? vh - h - 8 : y) + 'px';
    ctxMenu.querySelectorAll('.ctx-item').forEach(el => {
      el.addEventListener('click', () => {
        hideCtxMenu();
        const item = items[parseInt(el.dataset.idx)];
        if (item && item.action) item.action();
      });
    });
  }
  function hideCtxMenu() { ctxMenu.style.display = 'none'; }
  document.addEventListener('click', hideCtxMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu(); });

  App.utils = { esc, linkifyLog, versionSatisfies, formatTimeAgo, getCommandsSummary, showCtxMenu, hideCtxMenu };

  // Allow tests to require these as a Node module
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { esc, linkifyLog, versionSatisfies, formatTimeAgo, getCommandsSummary };
  }
})();
