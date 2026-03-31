const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Check environment and version requirements for a project
 * @param {string} projectPath - Path to the project directory
 * @returns {Array} Array of environment check results
 */
async function checkEnvVersions(projectPath) {
  const results = [];
  const exists = (f) => fs.existsSync(path.join(projectPath, f));
  const run = (cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (_) { return null; }
  };

  // Detect available version managers
  const hasNvm = !!run('bash -lc "nvm --version"');
  const hasFnm = !!run('fnm --version');
  const hasPyenv = !!run('pyenv --version');
  const hasRbenv = !!run('rbenv --version');
  const hasRustup = !!run('rustup --version');

  // Node version
  const nodeVersion = run('node -v');
  let requiredNode = null;
  let nvmrc = null;

  if (exists('.nvmrc')) {
    try { nvmrc = fs.readFileSync(path.join(projectPath, '.nvmrc'), 'utf-8').trim(); } catch (_) {}
  } else if (exists('.node-version')) {
    try { nvmrc = fs.readFileSync(path.join(projectPath, '.node-version'), 'utf-8').trim(); } catch (_) {}
  }

  if (exists('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
      if (pkg.engines && pkg.engines.node) requiredNode = pkg.engines.node;
    } catch (_) {}
  }

  const nodeReq = requiredNode || nvmrc || null;
  const nodeEntry = {
    tool: 'Node.js',
    current: nodeVersion || 'not installed',
    required: nodeReq,
    source: requiredNode ? 'package.json engines' : nvmrc ? (exists('.nvmrc') ? '.nvmrc' : '.node-version') : null,
    ok: !!nodeVersion,
    fixes: [],
  };
  if (!nodeVersion) {
    if (hasNvm) nodeEntry.fixes.push({ label: 'Install via nvm', cmd: `bash -lc "nvm install ${nvmrc || 'node'}"` });
    else if (hasFnm) nodeEntry.fixes.push({ label: 'Install via fnm', cmd: `fnm install ${nvmrc || 'latest'}` });
    else nodeEntry.fixes.push({ label: 'Install nvm first', cmd: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash', info: true });
  } else if (nvmrc) {
    if (hasNvm) nodeEntry.fixes.push({ label: 'nvm use', cmd: `bash -lc "cd '${projectPath}' && nvm use"` });
    else if (hasFnm) nodeEntry.fixes.push({ label: 'fnm use', cmd: `fnm use` });
    if (hasNvm) nodeEntry.fixes.push({ label: 'nvm install', cmd: `bash -lc "nvm install ${nvmrc}"` });
  }
  results.push(nodeEntry);

  // npm version
  const npmVersion = run('npm -v');
  let requiredNpm = null;
  if (exists('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
      if (pkg.engines && pkg.engines.npm) requiredNpm = pkg.engines.npm;
    } catch (_) {}
  }
  const npmEntry = {
    tool: 'npm',
    current: npmVersion ? 'v' + npmVersion : 'not installed',
    required: requiredNpm || null,
    source: requiredNpm ? 'package.json engines' : null,
    ok: !!npmVersion,
    fixes: [],
  };
  if (requiredNpm) {
    const ver = requiredNpm.replace(/[>=<~^ ]+/g, '');
    npmEntry.fixes.push({ label: `Install npm@${ver}`, cmd: `npm install -g npm@${ver}` });
  }
  results.push(npmEntry);

  // Yarn
  if (exists('yarn.lock')) {
    const yarnVersion = run('yarn -v');
    const yarnEntry = {
      tool: 'Yarn',
      current: yarnVersion ? 'v' + yarnVersion : 'not installed',
      required: null,
      source: 'yarn.lock detected',
      ok: !!yarnVersion,
      fixes: [],
    };
    if (!yarnVersion) {
      yarnEntry.fixes.push({ label: 'Install Yarn', cmd: 'npm install -g yarn' });
      yarnEntry.fixes.push({ label: 'Via corepack', cmd: 'corepack enable && corepack prepare yarn@stable --activate' });
    }
    results.push(yarnEntry);
  }

  // pnpm
  if (exists('pnpm-lock.yaml')) {
    const pnpmVersion = run('pnpm -v');
    const pnpmEntry = {
      tool: 'pnpm',
      current: pnpmVersion ? 'v' + pnpmVersion : 'not installed',
      required: null,
      source: 'pnpm-lock.yaml detected',
      ok: !!pnpmVersion,
      fixes: [],
    };
    if (!pnpmVersion) {
      pnpmEntry.fixes.push({ label: 'Install pnpm', cmd: 'npm install -g pnpm' });
      pnpmEntry.fixes.push({ label: 'Via corepack', cmd: 'corepack enable && corepack prepare pnpm@latest --activate' });
    }
    results.push(pnpmEntry);
  }

  // Python
  if (exists('requirements.txt') || exists('pyproject.toml') || exists('Pipfile') || exists('setup.py')) {
    const pyVersion = run('python3 --version') || run('python --version');
    let requiredPy = null;
    if (exists('pyproject.toml')) {
      try {
        const toml = fs.readFileSync(path.join(projectPath, 'pyproject.toml'), 'utf-8');
        const match = toml.match(/requires-python\s*=\s*"([^"]+)"/);
        if (match) requiredPy = match[1];
      } catch (_) {}
    }
    const pyEntry = {
      tool: 'Python',
      current: pyVersion ? pyVersion.replace('Python ', 'v') : 'not installed',
      required: requiredPy || null,
      source: requiredPy ? 'pyproject.toml' : null,
      ok: !!pyVersion,
      fixes: [],
    };
    if (!pyVersion || requiredPy) {
      const pyVer = requiredPy ? requiredPy.replace(/[>=<~^ ]+/g, '') : '3';
      if (hasPyenv) pyEntry.fixes.push({ label: `pyenv install ${pyVer}`, cmd: `pyenv install ${pyVer} && pyenv local ${pyVer}` });
      if (!pyVersion) pyEntry.fixes.push({ label: 'Install via Homebrew', cmd: 'brew install python3', info: true });
    }
    results.push(pyEntry);
  }

  // Go
  if (exists('go.mod')) {
    const goVersion = run('go version');
    let requiredGo = null;
    try {
      const gomod = fs.readFileSync(path.join(projectPath, 'go.mod'), 'utf-8');
      const match = gomod.match(/^go\s+(\S+)/m);
      if (match) requiredGo = match[1];
    } catch (_) {}
    const goEntry = {
      tool: 'Go',
      current: goVersion ? goVersion.replace(/go version go/, 'v').split(' ')[0] : 'not installed',
      required: requiredGo ? 'v' + requiredGo : null,
      source: requiredGo ? 'go.mod' : null,
      ok: !!goVersion,
      fixes: [],
    };
    if (!goVersion) goEntry.fixes.push({ label: 'Install via Homebrew', cmd: 'brew install go', info: true });
    results.push(goEntry);
  }

  // Rust
  if (exists('Cargo.toml')) {
    const rustVersion = run('rustc --version');
    const rustEntry = {
      tool: 'Rust',
      current: rustVersion ? rustVersion.replace('rustc ', 'v').split(' ')[0] : 'not installed',
      required: null,
      source: null,
      ok: !!rustVersion,
      fixes: [],
    };
    if (!rustVersion) {
      rustEntry.fixes.push({ label: 'Install Rust', cmd: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh", info: true });
    } else if (hasRustup) {
      rustEntry.fixes.push({ label: 'Update Rust', cmd: 'rustup update' });
    }
    results.push(rustEntry);
  }

  // Ruby
  if (exists('Gemfile')) {
    const rubyVersion = run('ruby -v');
    let requiredRuby = null;
    if (exists('.ruby-version')) {
      try { requiredRuby = fs.readFileSync(path.join(projectPath, '.ruby-version'), 'utf-8').trim(); } catch (_) {}
    }
    const rubyEntry = {
      tool: 'Ruby',
      current: rubyVersion ? rubyVersion.split(' ')[1] ? 'v' + rubyVersion.split(' ')[1] : rubyVersion : 'not installed',
      required: requiredRuby ? 'v' + requiredRuby : null,
      source: requiredRuby ? '.ruby-version' : null,
      ok: !!rubyVersion,
      fixes: [],
    };
    if (!rubyVersion || requiredRuby) {
      if (hasRbenv) rubyEntry.fixes.push({ label: `rbenv install ${requiredRuby || 'latest'}`, cmd: `rbenv install ${requiredRuby || '3.3.0'} && rbenv local ${requiredRuby || '3.3.0'}` });
      if (!rubyVersion) rubyEntry.fixes.push({ label: 'Install via Homebrew', cmd: 'brew install ruby', info: true });
    }
    results.push(rubyEntry);
  }

  return results;
}

/**
 * Run a fix command for the environment checker
 * @param {string} projectPath - Path to the project directory
 * @param {string} cmd - Command to execute
 * @returns {Object} Object with success flag and output or error
 */
async function runEnvFix(projectPath, cmd) {
  try {
    const out = execSync(cmd, { cwd: projectPath, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PATH: process.env.PATH } });
    return { success: true, output: out };
  } catch (e) {
    return { error: e.stderr || e.stdout || e.message };
  }
}

module.exports = {
  checkEnvVersions,
  runEnvFix,
};
