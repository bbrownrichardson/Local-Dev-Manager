import { describe, it, expect } from 'vitest';

// Mock minimal DOM environment for the utils module
globalThis.window = {};
globalThis.App = { state: {} };

// Factory for a mock element that supports both esc() usage (textContent→innerHTML escaping)
// and ctxMenu usage (direct innerHTML read/write).
function makeMockElement() {
  let _textContent = '';
  let _htmlOverride = null;
  return {
    set textContent(val) { _textContent = val; _htmlOverride = null; },
    get innerHTML() {
      if (_htmlOverride !== null) return _htmlOverride;
      return _textContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    set innerHTML(val) { _htmlOverride = val; _textContent = ''; },
    id: '',
    className: '',
    style: {},
    querySelectorAll: () => [],
  };
}

// _ctxMenuEl is set once when utils.js calls document.body.appendChild(ctxMenu)
let _ctxMenuEl = null;
globalThis.document = {
  createElement: () => makeMockElement(),
  body: { appendChild: (el) => { _ctxMenuEl = el; } },
  addEventListener: () => {},
};

await import('../../../renderer/utils.js');
const { esc, linkifyLog, versionSatisfies, formatTimeAgo, getCommandsSummary, showCtxMenu, hideCtxMenu } = App.utils;

describe('esc', () => {
  it('escapes HTML entities', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes ampersands', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });

  it('passes through safe strings', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

describe('versionSatisfies', () => {
  it('returns true when current matches required major', () => {
    expect(versionSatisfies('18.2.0', '18')).toBe(true);
  });

  it('returns false when major versions differ', () => {
    expect(versionSatisfies('16.0.0', '18')).toBe(false);
  });

  it('handles >= prefix', () => {
    expect(versionSatisfies('20.0.0', '>=18')).toBe(true);
    expect(versionSatisfies('18.5.0', '>=18.0')).toBe(true);
    expect(versionSatisfies('16.0.0', '>=18')).toBe(false);
  });

  it('strips leading v', () => {
    expect(versionSatisfies('v18.2.0', 'v18')).toBe(true);
  });

  it('returns true when current or required is empty', () => {
    expect(versionSatisfies('', '18')).toBe(true);
    expect(versionSatisfies('18', '')).toBe(true);
    expect(versionSatisfies(null, '18')).toBe(true);
  });
});

describe('formatTimeAgo', () => {
  it('returns "just now" for recent times', () => {
    expect(formatTimeAgo(new Date().toISOString())).toBe('just now');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatTimeAgo(fiveMinAgo)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(formatTimeAgo(twoHoursAgo)).toBe('2h ago');
  });

  it('returns days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(formatTimeAgo(threeDaysAgo)).toBe('3d ago');
  });
});

describe('getCommandsSummary', () => {
  it('returns commands joined with +', () => {
    const p = { commands: [{ cmd: 'npm run dev' }, { cmd: 'npm start' }] };
    expect(getCommandsSummary(p)).toBe('npm run dev + npm start');
  });

  it('falls back to command field', () => {
    const p = { command: 'go run .' };
    expect(getCommandsSummary(p)).toBe('go run .');
  });

  it('returns empty string when no commands', () => {
    expect(getCommandsSummary({})).toBe('');
  });
});

describe('linkifyLog', () => {
  it('wraps URLs in anchor tags', () => {
    const result = linkifyLog('visit http://localhost:3000 now');
    expect(result).toContain('class="log-link"');
    expect(result).toContain('data-url="http://localhost:3000"');
  });

  it('leaves non-URL text unchanged', () => {
    expect(linkifyLog('no urls here')).toBe('no urls here');
  });
});

describe('showCtxMenu / hideCtxMenu', () => {
  it('showCtxMenu sets display to block', () => {
    showCtxMenu(10, 20, [{ label: 'Copy', action: () => {} }]);
    expect(_ctxMenuEl.style.display).toBe('block');
  });

  it('hideCtxMenu sets display to none', () => {
    showCtxMenu(10, 20, [{ label: 'Copy', action: () => {} }]);
    hideCtxMenu();
    expect(_ctxMenuEl.style.display).toBe('none');
  });

  it('showCtxMenu renders menu items as HTML', () => {
    showCtxMenu(10, 20, [{ label: 'Copy', action: () => {} }, { label: 'Paste', action: () => {} }]);
    expect(_ctxMenuEl.innerHTML).toContain('Copy');
    expect(_ctxMenuEl.innerHTML).toContain('Paste');
  });
});
