const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function gitExec(cwd, args) {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 5000, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function gitRunSync(cwd, argStr) {
  try {
    console.log('[git] running: git ' + argStr);
    const t0 = Date.now();
    const out = execSync(`git ${argStr}`, { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    console.log('[git] done in ' + (Date.now() - t0) + 'ms: git ' + argStr.substring(0, 30));
    return out;
  } catch (e) {
    console.log('[git] failed: git ' + argStr.substring(0, 30) + ' → ' + (e.message || '').substring(0, 80));
    return null;
  }
}

function gitGetFullStatus(cwd) {
  console.log('[git] gitGetFullStatus start, cwd:', cwd);
  if (!cwd) return { error: 'No path provided' };

  // Check for .git — also check parent dirs (submodule/worktree)
  try {
    const gitCheck = execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    console.log('[git] git-dir check ok:', gitCheck);
  } catch (e) {
    console.log('[git] not a git repo:', cwd);
    return { error: 'Not a git repository' };
  }

  try {
    // Detect if repo has any commits (fresh init = no HEAD)
    let hasCommits = false;
    try {
      execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
      hasCommits = true;
    } catch (_) {}

    const branch = hasCommits
      ? (gitRunSync(cwd, 'rev-parse --abbrev-ref HEAD') || 'unknown')
      : (gitRunSync(cwd, 'symbolic-ref --short HEAD') || 'main');

    const statusOut = gitRunSync(cwd, 'status --porcelain') || '';
    const stashOut = hasCommits ? (gitRunSync(cwd, 'stash list') || '') : '';
    const logOut = hasCommits ? (gitRunSync(cwd, 'log --format=%h||%s||%an||%ar -15') || '') : '';
    const branchListOut = gitRunSync(cwd, 'branch --no-color') || '';

    // Check if any remote exists at all
    const remoteListOut = gitRunSync(cwd, 'remote') || '';
    const hasAnyRemote = remoteListOut.trim().length > 0;

    // Remote tracking — often fails, that's ok
    let ahead = 0, behind = 0, tracking = null;
    if (hasCommits && hasAnyRemote) {
      try {
        tracking = execSync('git rev-parse --abbrev-ref @{upstream}', { cwd, encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch (_) {}
      if (tracking) {
        const counts = gitRunSync(cwd, 'rev-list --left-right --count HEAD...@{upstream}');
        if (counts) {
          const parts = counts.split('\t').map(Number);
          ahead = parts[0] || 0;
          behind = parts[1] || 0;
        }
      }
    }

    // Parse status
    const staged = [];
    const unstaged = [];
    const untracked = [];
    const conflicts = [];
    for (const line of statusOut.split('\n').filter(Boolean)) {
      const ix = line[0];
      const wt = line[1];
      const fp = line.substring(3);
      if (ix === 'U' || wt === 'U') { conflicts.push(fp); unstaged.push({ path: fp, status: 'conflict' }); continue; }
      if (ix === '?' && wt === '?') { untracked.push(fp); continue; }
      if (ix !== ' ' && ix !== '?') {
        staged.push({ path: fp, status: ix === 'A' ? 'A' : ix === 'D' ? 'D' : ix === 'R' ? 'R' : ix === 'C' ? 'C' : 'M' });
      }
      if (wt !== ' ' && wt !== '?') {
        unstaged.push({ path: fp, status: wt === 'D' ? 'D' : 'M' });
      }
    }

    const stashCount = stashOut ? stashOut.split('\n').filter(Boolean).length : 0;

    const commits = logOut.split('\n').filter(Boolean).map(line => {
      const p = line.split('||');
      return { hash: p[0] || '', message: p[1] || '', author: p[2] || '', date: p[3] || '' };
    });

    const branches = branchListOut.split('\n').map(b => b.replace(/^\*?\s*/, '').trim()).filter(Boolean);

    // Get remote URL for commit links (only if a remote exists)
    let remoteUrl = null;
    if (hasAnyRemote) {
      const rawRemote = gitRunSync(cwd, 'remote get-url origin');
      if (rawRemote) {
        remoteUrl = rawRemote
          .replace(/^git@([^:]+):/, 'https://$1/')
          .replace(/\.git$/, '');
      }
    }

    return { branch, ahead, behind, staged, unstaged, untracked, conflicts, stashCount, commits, branches, hasRemote: hasAnyRemote, hasTracking: !!tracking, hasCommits, remoteUrl };
  } catch (e) {
    return { error: e.message || 'Git status failed' };
  }
}

function gitGetDiff(cwd, filePath, staged) {
  const flag = staged ? '--cached' : '';
  const diff = gitExec(cwd, `diff ${flag} -- "${filePath}"`);
  if (diff) return diff;
  // For untracked files, show the file content
  if (!staged) {
    try {
      const fullPath = path.join(cwd, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      return content.length > 10000 ? content.substring(0, 10000) + '\n... (truncated)' : content;
    } catch (_) { return '(unable to read file)'; }
  }
  return '(no diff available)';
}

module.exports = {
  gitExec,
  gitRunSync,
  gitGetFullStatus,
  gitGetDiff
};
