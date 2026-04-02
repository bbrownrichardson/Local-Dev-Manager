// ── Git Panel ─────────────────────────────────────────────────────
(function () {
  const S = App.state;
  const { esc } = App.utils;
  const icons = App.icons;

  async function renderGitPanel(project) {
    const panel = document.getElementById('git-panel');
    if (!panel) return;

    if (!project || !project.path) {
      panel.innerHTML = '<div class="terminal-placeholder">No project path configured — set a path to use Git.</div>';
      return;
    }

    panel.innerHTML = '<div class="terminal-placeholder">Loading git status...</div>';

    let status;
    try {
      status = await window.api.gitFullStatus(project.path);
    } catch (e) {
      panel.innerHTML = '<div class="terminal-placeholder" style="color:var(--red);">Git error: ' + esc(e.message || String(e)) + '</div>';
      return;
    }

    if (!status) {
      panel.innerHTML = '<div class="terminal-placeholder" style="color:var(--red);">No response from git — check System logs.</div>';
      return;
    }

    if (status.error) {
      const isNotRepo = status.error.toLowerCase().includes('not a git repository');
      if (isNotRepo) {
        panel.innerHTML = '<div class="git-init-prompt">' +
          '<div class="git-init-icon">' + icons.git + '</div>' +
          '<div class="git-init-text">Not a git repository</div>' +
          '<button class="btn btn-start" id="git-init-btn">git init</button>' +
        '</div>';
        document.getElementById('git-init-btn')?.addEventListener('click', async () => {
          const btn = document.getElementById('git-init-btn');
          btn.textContent = 'Initializing...';
          btn.disabled = true;
          try {
            const result = await window.api.gitInit(project.path);
            if (result && result.error) {
              btn.textContent = 'Failed — retry';
              btn.disabled = false;
            } else {
              renderGitPanel(project);
            }
          } catch (e) {
            btn.textContent = 'Failed — retry';
            btn.disabled = false;
          }
        });
      } else {
        panel.innerHTML = '<div class="terminal-placeholder" style="color:var(--text-dim);">' + esc(status.error) + '</div>';
      }
      return;
    }

    const branch = status.branch || 'main';
    const ahead = status.ahead || 0;
    const behind = status.behind || 0;
    const staged = status.staged || [];
    const unstaged = status.unstaged || [];
    const untracked = status.untracked || [];
    const stashCount = status.stashCount || 0;
    const conflicts = status.conflicts || [];
    const commits = status.commits || [];
    const branches = status.branches || [];
    const hasCommits = status.hasCommits || false;
    const hasRemote = status.hasRemote || false;
    const hasTracking = status.hasTracking || false;
    const hasChanges = staged.length + unstaged.length + untracked.length > 0;

    let html = '<div class="git-panel-inner">';

    // Branch bar
    const showBranchSelect = branches.length > 1;
    html += '<div class="git-branch-bar">' +
      '<div class="git-branch-info">' +
        '<span class="git-branch-icon">' + icons.git + '</span>' +
        '<strong>' + esc(branch) + '</strong>' +
        (!hasCommits ? '<span class="git-sync-badge" style="background:var(--yellow-dim,#3a3511);color:var(--yellow,#f0c040);">no commits yet</span>' : '') +
        (!hasRemote && hasCommits ? '<span class="git-sync-badge" style="background:var(--text-dim);color:var(--bg);opacity:0.5;">local only</span>' : '') +
        (ahead > 0 ? '<span class="git-sync-badge ahead">&uarr;' + ahead + '</span>' : '') +
        (behind > 0 ? '<span class="git-sync-badge behind">&darr;' + behind + '</span>' : '') +
        (conflicts.length > 0 ? '<span class="git-sync-badge conflict">&x26A0; ' + conflicts.length + ' conflicts</span>' : '') +
        (stashCount > 0 ? '<span class="git-sync-badge stash">&#x1F4E6; ' + stashCount + '</span>' : '') +
      '</div>' +
      '<div class="git-branch-actions">' +
        (showBranchSelect ? '<select class="git-branch-select" id="git-branch-select">' +
          branches.map(b => '<option value="' + esc(b) + '"' + (b === branch ? ' selected' : '') + '>' + esc(b) + '</option>').join('') +
        '</select>' : '') +
        '<button class="btn btn-edit git-btn" id="git-new-branch" title="New branch"' + (!hasCommits ? ' disabled title="Make a commit first"' : '') + '>+ Branch</button>' +
      '</div>' +
    '</div>' +
    '<div class="git-new-branch-row" id="git-new-branch-row" style="display:none;">' +
      '<input type="text" class="git-commit-input" id="git-new-branch-input" placeholder="new-branch-name" style="flex:1;" />' +
      '<button class="btn btn-start git-btn" id="git-new-branch-ok" style="padding:5px 12px!important;">Create</button>' +
      '<button class="btn btn-edit git-btn" id="git-new-branch-cancel" style="padding:5px 10px!important;">Cancel</button>' +
    '</div>';

    // Git identity indicator
    if (project.gitIdentity && (project.gitIdentity.name || project.gitIdentity.email)) {
      const idName = esc(project.gitIdentity.name || '');
      const idEmail = esc(project.gitIdentity.email || '');
      html += '<div class="git-identity-bar">' +
        '<span class="git-identity-label">Identity:</span>' +
        '<span class="git-identity-value">' + idName + (idName && idEmail ? ' ' : '') + (idEmail ? '&lt;' + idEmail + '&gt;' : '') + '</span>' +
      '</div>';
    }

    // Quick actions
    const canPull = hasTracking;
    const canPush = hasRemote && hasCommits;
    const canStash = hasCommits && hasChanges;
    const canStageAll = unstaged.length + untracked.length > 0;
    const canUnstageAll = staged.length > 0;

    html += '<div class="git-actions-bar">' +
      '<button class="btn btn-edit git-btn" id="git-pull"' + (!canPull ? ' disabled title="' + (!hasRemote ? 'No remote configured' : 'No upstream tracking branch') + '"' : '') + '>&darr; Pull</button>' +
      '<button class="btn btn-edit git-btn" id="git-push"' + (!canPush ? ' disabled title="' + (!hasRemote ? 'No remote configured' : 'No commits to push') + '"' : '') + '>&uarr; Push</button>' +
      '<button class="btn btn-edit git-btn" id="git-stash"' + (!canStash ? ' disabled title="' + (!hasCommits ? 'Need at least one commit' : 'No changes to stash') + '"' : '') + '>Stash</button>' +
      (stashCount > 0 ? '<button class="btn btn-edit git-btn" id="git-stash-pop">Pop Stash</button>' : '') +
      '<button class="btn btn-edit git-btn" id="git-stage-all"' + (!canStageAll ? ' disabled title="Nothing to stage"' : '') + '>Stage All</button>' +
      '<button class="btn btn-edit git-btn" id="git-unstage-all"' + (!canUnstageAll ? ' disabled title="Nothing staged"' : '') + '>Unstage All</button>' +
    '</div>';

    // Staged files
    html += '<div class="git-section">' +
      '<div class="git-section-header">Staged Changes <span class="git-count">' + staged.length + '</span></div>';
    if (staged.length > 0) {
      html += staged.map(f => '<div class="git-file staged" data-path="' + esc(f.path) + '">' +
        '<span class="git-file-status git-status-' + f.status.toLowerCase() + '">' + esc(f.status) + '</span>' +
        '<span class="git-file-path">' + esc(f.path) + '</span>' +
        '<div class="git-file-actions">' +
          '<button class="git-file-btn" data-action="unstage" title="Unstage">&minus;</button>' +
          '<button class="git-file-btn" data-action="diff-staged" title="View diff">&#x25D1;</button>' +
        '</div>' +
      '</div>').join('');
    } else {
      html += '<div class="git-empty">No staged changes</div>';
    }
    html += '</div>';

    // Unstaged files
    html += '<div class="git-section">' +
      '<div class="git-section-header">Changes <span class="git-count">' + (unstaged.length + untracked.length) + '</span></div>';
    if (unstaged.length > 0 || untracked.length > 0) {
      html += unstaged.map(f => '<div class="git-file unstaged" data-path="' + esc(f.path) + '">' +
        '<span class="git-file-status git-status-' + f.status.toLowerCase() + '">' + esc(f.status) + '</span>' +
        '<span class="git-file-path">' + esc(f.path) + '</span>' +
        '<div class="git-file-actions">' +
          '<button class="git-file-btn" data-action="stage" title="Stage">+</button>' +
          '<button class="git-file-btn" data-action="discard" title="Discard">&#x2715;</button>' +
          '<button class="git-file-btn" data-action="diff" title="View diff">&#x25D1;</button>' +
        '</div>' +
      '</div>').join('');
      html += untracked.map(f => '<div class="git-file untracked" data-path="' + esc(f) + '">' +
        '<span class="git-file-status git-status-new">?</span>' +
        '<span class="git-file-path">' + esc(f) + '</span>' +
        '<div class="git-file-actions">' +
          '<button class="git-file-btn" data-action="stage" title="Stage">+</button>' +
          '<button class="git-file-btn" data-action="discard" title="Delete">&#x2715;</button>' +
        '</div>' +
      '</div>').join('');
    } else {
      html += '<div class="git-empty">Working tree clean</div>';
    }
    html += '</div>';

    // Commit form
    const canCommit = staged.length > 0;
    html += '<div class="git-commit-form">' +
      '<input type="text" class="git-commit-input" id="git-commit-msg" placeholder="' + (canCommit ? 'Commit message...' : 'Stage changes first...') + '"' + (!canCommit ? ' disabled' : '') + ' />' +
      '<button class="btn btn-start git-commit-btn" id="git-commit-btn"' + (!canCommit ? ' disabled' : '') + '>Commit</button>' +
    '</div>';

    // Recent commits
    const remoteUrl = status.remoteUrl || null;
    html += '<div class="git-section">' +
      '<div class="git-section-header">Recent Commits</div>';
    if (commits && commits.length > 0) {
      html += commits.slice(0, 10).map(c => {
        const commitUrl = remoteUrl ? remoteUrl + '/commit/' + c.hash : null;
        return '<div class="git-commit">' +
          (commitUrl
            ? '<a class="git-commit-hash git-link" href="#" data-url="' + esc(commitUrl) + '">' + esc(c.hash) + '</a>'
            : '<span class="git-commit-hash">' + esc(c.hash) + '</span>') +
          '<span class="git-commit-msg">' + esc(c.message) + '</span>' +
          '<span class="git-commit-meta">' + esc(c.author) + ' &middot; ' + esc(c.date) + '</span>' +
        '</div>';
      }).join('');
    } else {
      html += '<div class="git-empty">No commits</div>';
    }
    html += '</div>';

    // Diff viewer (hidden by default)
    html += '<div class="git-diff-viewer" id="git-diff-viewer" style="display:none;">' +
      '<div class="git-diff-header">' +
        '<span id="git-diff-title"></span>' +
        '<button class="git-file-btn" id="git-diff-close">&#x2715;</button>' +
      '</div>' +
      '<pre class="git-diff-content" id="git-diff-content"></pre>' +
    '</div>';

    html += '</div>';
    panel.innerHTML = html;

    // Wire up events
    const dir = project.path;

    function gitMsg(text, isError) {
      const el = document.createElement('div');
      el.className = 'git-inline-msg';
      el.style.cssText = 'font-size:11px;padding:6px 10px;border-radius:6px;margin-top:-6px;background:' + (isError ? 'var(--red-dim)' : 'var(--green-dim)') + ';color:' + (isError ? 'var(--red)' : 'var(--green)') + ';';
      el.textContent = text;
      panel.querySelector('.git-panel-inner')?.prepend(el);
      setTimeout(() => el.remove(), 4000);
    }

    async function gitAction(fn, label, btnId) {
      const btn = btnId ? document.getElementById(btnId) : null;
      const origText = btn ? btn.textContent : '';
      if (btn) { btn.textContent = label + '...'; btn.disabled = true; }
      try {
        const result = await fn();
        if (result && result.error) {
          gitMsg(label + ' failed: ' + result.error, true);
          if (btn) { btn.textContent = origText; btn.disabled = false; }
        } else {
          gitMsg(label + ' — done', false);
          renderGitPanel(project);
        }
      } catch (e) {
        const msg = e?.error || e?.message || String(e);
        gitMsg(label + ' failed: ' + msg, true);
        if (btn) { btn.textContent = origText; btn.disabled = false; }
      }
    }

    // Branch switching
    document.getElementById('git-branch-select')?.addEventListener('change', async (e) => {
      const b = e.target.value;
      if (b && b !== branch) gitAction(() => window.api.gitCheckoutBranch(dir, b), 'Checkout');
    });

    // New branch
    const newBranchRow = document.getElementById('git-new-branch-row');
    const newBranchInput = document.getElementById('git-new-branch-input');
    document.getElementById('git-new-branch')?.addEventListener('click', () => {
      newBranchRow.style.display = 'flex';
      newBranchInput.focus();
    });
    document.getElementById('git-new-branch-cancel')?.addEventListener('click', () => {
      newBranchRow.style.display = 'none';
      newBranchInput.value = '';
    });
    const doCreateBranch = async () => {
      const name = newBranchInput?.value?.trim();
      if (!name) return;
      const result = await window.api.gitCreateBranch(dir, name);
      if (result && result.error) {
        gitMsg('Create branch failed: ' + result.error, true);
      } else {
        renderGitPanel(project);
      }
    };
    document.getElementById('git-new-branch-ok')?.addEventListener('click', doCreateBranch);
    newBranchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreateBranch();
      if (e.key === 'Escape') { newBranchRow.style.display = 'none'; newBranchInput.value = ''; }
    });

    // Quick actions
    document.getElementById('git-pull')?.addEventListener('click', () => gitAction(() => window.api.gitPull(dir), 'Pull', 'git-pull'));
    document.getElementById('git-push')?.addEventListener('click', () => gitAction(() => window.api.gitPush(dir), 'Push', 'git-push'));
    document.getElementById('git-stash')?.addEventListener('click', () => gitAction(() => window.api.gitStash(dir), 'Stash', 'git-stash'));
    document.getElementById('git-stash-pop')?.addEventListener('click', () => gitAction(() => window.api.gitStashPop(dir), 'Stash pop', 'git-stash-pop'));
    document.getElementById('git-stage-all')?.addEventListener('click', () => gitAction(() => window.api.gitStageAll(dir), 'Stage all', 'git-stage-all'));
    document.getElementById('git-unstage-all')?.addEventListener('click', () => gitAction(() => window.api.gitUnstageAll(dir), 'Unstage all', 'git-unstage-all'));

    // Commit
    document.getElementById('git-commit-btn')?.addEventListener('click', async () => {
      const msgInput = document.getElementById('git-commit-msg');
      const commitBtn = document.getElementById('git-commit-btn');
      const msg = msgInput?.value?.trim();
      if (!msg) { msgInput?.focus(); return; }
      commitBtn.textContent = 'Committing...';
      commitBtn.disabled = true;
      const result = await window.api.gitCommit(dir, msg);
      if (result && result.error) {
        gitMsg('Commit failed: ' + result.error, true);
        commitBtn.textContent = 'Commit';
        commitBtn.disabled = false;
      } else {
        gitMsg('Committed: ' + msg, false);
        renderGitPanel(project);
      }
    });
    document.getElementById('git-commit-msg')?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('git-commit-btn')?.click();
      }
    });

    // Commit links
    panel.querySelectorAll('.git-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.url;
        if (url) window.api.openUrl(url);
      });
    });

    // File actions
    panel.querySelectorAll('.git-file-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fileEl = btn.closest('.git-file');
        const filePath = fileEl?.dataset.path;
        if (!filePath) return;
        const action = btn.dataset.action;

        if (action === 'stage') {
          await window.api.gitStage(dir, filePath);
          renderGitPanel(project);
        } else if (action === 'unstage') {
          await window.api.gitUnstage(dir, filePath);
          renderGitPanel(project);
        } else if (action === 'discard') {
          if (btn.dataset.confirming === 'true') {
            await window.api.gitDiscardFile(dir, filePath);
            renderGitPanel(project);
          } else {
            btn.dataset.confirming = 'true';
            btn.textContent = '\u26A0';
            btn.title = 'Click again to confirm discard';
            btn.style.background = 'var(--red-dim)';
            btn.style.color = 'var(--red)';
            setTimeout(() => {
              btn.dataset.confirming = 'false';
              btn.textContent = '\u2715';
              btn.title = 'Discard';
              btn.style.background = '';
              btn.style.color = '';
            }, 3000);
          }
        } else if (action === 'diff' || action === 'diff-staged') {
          const isStaged = action === 'diff-staged';
          try {
            const diff = await window.api.gitDiff(dir, filePath, isStaged);
            showGitDiff(filePath, diff, isStaged);
          } catch (err) {
            gitMsg('Diff error: ' + (err.message || err), true);
          }
        }
      });
    });

    // Diff close
    document.getElementById('git-diff-close')?.addEventListener('click', () => {
      const viewer = document.getElementById('git-diff-viewer');
      if (viewer) viewer.style.display = 'none';
    });
  }

  function showGitDiff(filePath, diff, isStaged) {
    const viewer = document.getElementById('git-diff-viewer');
    const title = document.getElementById('git-diff-title');
    const content = document.getElementById('git-diff-content');
    if (!viewer || !content) return;

    title.textContent = (isStaged ? '[STAGED] ' : '') + filePath;
    const lines = (diff || 'No diff available').split('\n');
    content.innerHTML = lines.map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) return '<span class="diff-add">' + esc(line) + '</span>';
      if (line.startsWith('-') && !line.startsWith('---')) return '<span class="diff-del">' + esc(line) + '</span>';
      if (line.startsWith('@@')) return '<span class="diff-hunk">' + esc(line) + '</span>';
      if (line.startsWith('diff ') || line.startsWith('index ')) return '<span class="diff-meta">' + esc(line) + '</span>';
      return esc(line);
    }).join('\n');
    viewer.style.display = 'flex';
  }

  App.git = { renderGitPanel, showGitDiff };
})();
