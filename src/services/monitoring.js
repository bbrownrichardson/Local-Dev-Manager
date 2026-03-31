const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

function getProcessStats(pid) {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const out = execSync(`ps -o rss=,pcpu= -p ${pid} 2>/dev/null`, { encoding: 'utf-8', timeout: 2000 }).trim();
      if (!out) return null;
      const [rss, cpu] = out.trim().split(/\s+/);
      return { memMB: Math.round(parseInt(rss) / 1024), cpu: parseFloat(cpu) };
    }
  } catch (_) {}
  return null;
}

function getGitStatus(dirPath) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dirPath, encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const status = execSync('git status --porcelain', { cwd: dirPath, encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const dirty = status.length > 0;
    const changes = status ? status.split('\n').length : 0;
    return { branch, dirty, changes };
  } catch (_) {
    return null;
  }
}

function getListeningPorts() {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const out = execSync("lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null | grep -v '^COMMAND'", { encoding: 'utf-8', timeout: 3000 });
      const ports = [];
      const seen = new Set();
      for (const line of out.split('\n')) {
        const match = line.match(/:(\d+)\s/);
        if (match) {
          const port = parseInt(match[1]);
          const cmd = line.split(/\s+/)[0];
          const pid = line.split(/\s+/)[1];
          const key = `${port}`;
          if (!seen.has(key)) {
            seen.add(key);
            ports.push({ port, process: cmd, pid: parseInt(pid) });
          }
        }
      }
      return ports.sort((a, b) => a.port - b.port);
    }
  } catch (_) {}
  return [];
}

function checkHealth(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { timeout: 5000 }, (res) => {
      const responseTime = Date.now() - startTime;
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, responseTime });
      res.resume();
      res.on('end', () => {});
    });
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, statusCode: 0, responseTime: Date.now() - startTime });
    });
    request.on('error', () => {
      resolve({ ok: false, statusCode: 0, responseTime: Date.now() - startTime });
    });
  });
}

module.exports = { getProcessStats, getGitStatus, getListeningPorts, checkHealth };
