const path = require('path');
const fs = require('fs');

function detectProjectType(dirPath) {
  const exists = (file) => fs.existsSync(path.join(dirPath, file));
  const readJson = (file) => {
    try { return JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8')); } catch (_) { return null; }
  };

  if (exists('package.json')) {
    const pkg = readJson('package.json');
    const scripts = pkg?.scripts || {};
    const name = pkg?.name || path.basename(dirPath);
    const devScript = scripts.dev || scripts.start || scripts.serve || '';
    const mainCmd = scripts.dev ? 'npm run dev' : scripts.start ? 'npm start' : scripts.serve ? 'npm run serve' : 'npm start';

    const portMatch = devScript.match(/--port[= ](\d+)/) || devScript.match(/-p[= ](\d+)/);
    let url = 'http://localhost:3000';
    if (portMatch) url = `http://localhost:${portMatch[1]}`;
    else if (devScript.includes('vite')) url = 'http://localhost:5173';
    else if (devScript.includes('next')) url = 'http://localhost:3000';
    else if (devScript.includes('nuxt')) url = 'http://localhost:3000';
    else if (devScript.includes('angular') || devScript.includes('ng serve')) url = 'http://localhost:4200';

    const clientDirs = ['client', 'frontend', 'web', 'app'];
    let clientDir = null;
    for (const dir of clientDirs) { if (exists(`${dir}/package.json`)) { clientDir = dir; break; } }

    if (clientDir) {
      const clientPkg = readJson(`${clientDir}/package.json`);
      const clientScripts = clientPkg?.scripts || {};
      const clientDev = clientScripts.dev || clientScripts.start || clientScripts.serve || '';
      const clientCmd = clientScripts.dev ? 'npm run dev' : clientScripts.start ? 'npm start' : 'npm run serve';
      let clientUrl = 'http://localhost:3000';
      const clientPort = clientDev.match(/--port[= ](\d+)/) || clientDev.match(/-p[= ](\d+)/);
      if (clientPort) clientUrl = `http://localhost:${clientPort[1]}`;
      else if (clientDev.includes('vite')) clientUrl = 'http://localhost:5173';
      else if (clientDev.includes('next')) clientUrl = 'http://localhost:3000';
      else if (clientDev.includes('nuxt')) clientUrl = 'http://localhost:3000';
      else if (clientDev.includes('angular') || clientDev.includes('ng serve')) clientUrl = 'http://localhost:4200';

      return { name, type: 'node (monorepo)', url: clientUrl, commands: [
        { label: 'server', cmd: mainCmd, cwd: dirPath },
        { label: clientDir, cmd: clientCmd, cwd: path.join(dirPath, clientDir) },
      ]};
    }
    return { name, command: mainCmd, type: 'node', url };
  }

  if (exists('docker-compose.yml') || exists('docker-compose.yaml') || exists('compose.yml') || exists('compose.yaml'))
    return { name: path.basename(dirPath), command: 'docker compose up', type: 'docker' };
  if (exists('pyproject.toml') && exists('poetry.lock'))
    return { name: path.basename(dirPath), command: 'poetry run python3 main.py', type: 'python' };
  if (exists('Pipfile'))
    return { name: path.basename(dirPath), command: 'pipenv run python3 main.py', type: 'python' };
  if (exists('manage.py'))
    return { name: path.basename(dirPath), command: 'python3 manage.py runserver', type: 'python', url: 'http://localhost:8000' };
  if (exists('requirements.txt') || exists('setup.py') || exists('pyproject.toml')) {
    if (exists('app.py')) return { name: path.basename(dirPath), command: 'python3 app.py', type: 'python', url: 'http://localhost:5000' };
    if (exists('main.py')) return { name: path.basename(dirPath), command: 'python3 main.py', type: 'python', url: 'http://localhost:8000' };
    return { name: path.basename(dirPath), command: 'python3 main.py', type: 'python', url: 'http://localhost:8000' };
  }
  if (exists('go.mod')) return { name: path.basename(dirPath), command: 'go run .', type: 'go', url: 'http://localhost:8080' };
  if (exists('Cargo.toml')) return { name: path.basename(dirPath), command: 'cargo run', type: 'rust' };
  if (exists('Gemfile') && exists('bin/rails')) return { name: path.basename(dirPath), command: 'bin/rails server', type: 'ruby', url: 'http://localhost:3000' };
  if (exists('Gemfile')) return { name: path.basename(dirPath), command: 'bundle exec ruby app.rb', type: 'ruby' };
  if (exists('Makefile')) return { name: path.basename(dirPath), command: 'make run', type: 'make' };
  return null;
}

function backfillProjects(loadProjects, saveProjects) {
  const projects = loadProjects();
  let changed = false;
  for (const project of projects) {
    if (!project.path) continue;
    try {
      const detected = detectProjectType(project.path);
      if (!detected) continue;
      if (!project.url && detected.url) { project.url = detected.url; changed = true; }
      if (detected.commands && detected.commands.length > 1 && !project.commands) {
        project.commands = detected.commands; project.url = detected.url || project.url; changed = true;
      }
    } catch (_) {}
  }
  if (changed) saveProjects(projects);
}

module.exports = { detectProjectType, backfillProjects };
