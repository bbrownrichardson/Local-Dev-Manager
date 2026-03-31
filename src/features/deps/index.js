const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function detectProjectEcosystem(projectPath) {
  const checks = [
    { file: 'package.json', type: 'npm' },
    { file: 'requirements.txt', type: 'pip' },
    { file: 'Pipfile', type: 'pipenv' },
    { file: 'pyproject.toml', type: 'python' },
    { file: 'go.mod', type: 'go' },
    { file: 'Gemfile', type: 'ruby' },
    { file: 'Cargo.toml', type: 'rust' },
    { file: 'composer.json', type: 'php' },
    { file: 'pubspec.yaml', type: 'dart' },
    { file: 'Package.swift', type: 'swift' },
    { file: 'pom.xml', type: 'maven' },
    { file: 'build.gradle', type: 'gradle' },
  ];
  const found = [];
  for (const c of checks) {
    if (fs.existsSync(path.join(projectPath, c.file))) found.push(c.type);
  }
  // pyproject.toml could be poetry or plain — check for poetry
  if (found.includes('python')) {
    try {
      const content = fs.readFileSync(path.join(projectPath, 'pyproject.toml'), 'utf-8');
      if (content.includes('[tool.poetry]')) {
        found[found.indexOf('python')] = 'poetry';
      }
    } catch (_) {}
  }
  return found;
}

function checkOutdated(projectPath) {
  const ecosystems = detectProjectEcosystem(projectPath);
  if (ecosystems.length === 0) return { error: 'No recognized package manager found' };

  const results = {};

  for (const eco of ecosystems) {
    try {
      switch (eco) {
        case 'npm': {
          const raw = execSync('npm outdated --json 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const parsed = JSON.parse(raw || '{}');
          const deps = {};
          for (const [name, info] of Object.entries(parsed)) {
            deps[name] = { current: info.current, wanted: info.wanted, latest: info.latest };
          }
          results.npm = { outdated: deps };
          break;
        }

        case 'pip': {
          const raw = execSync('pip list --outdated --format=json 2>/dev/null || python3 -m pip list --outdated --format=json 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const list = JSON.parse(raw || '[]');
          const deps = {};
          for (const pkg of list) {
            deps[pkg.name] = { current: pkg.version, wanted: pkg.latest_version, latest: pkg.latest_version };
          }
          results.pip = { outdated: deps };
          break;
        }

        case 'pipenv': {
          const raw = execSync('pipenv update --outdated --json 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          try {
            const list = JSON.parse(raw || '[]');
            const deps = {};
            for (const pkg of list) {
              deps[pkg.name || pkg.package] = { current: pkg.installed_version || '?', wanted: pkg.available_version || '?', latest: pkg.available_version || '?' };
            }
            results.pipenv = { outdated: deps };
          } catch (_) {
            results.pipenv = { outdated: {} };
          }
          break;
        }

        case 'poetry': {
          const raw = execSync('poetry show --outdated --no-ansi 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const deps = {};
          for (const line of raw.split('\n').filter(Boolean)) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
              deps[parts[0]] = { current: parts[1], wanted: parts[2], latest: parts[2] };
            }
          }
          results.poetry = { outdated: deps };
          break;
        }

        case 'python': {
          // Generic pyproject.toml without poetry — try pip
          const raw = execSync('pip list --outdated --format=json 2>/dev/null || python3 -m pip list --outdated --format=json 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const list = JSON.parse(raw || '[]');
          const deps = {};
          for (const pkg of list) {
            deps[pkg.name] = { current: pkg.version, wanted: pkg.latest_version, latest: pkg.latest_version };
          }
          results.pip = { outdated: deps };
          break;
        }

        case 'go': {
          const raw = execSync('go list -m -u -json all 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const deps = {};
          // Go outputs concatenated JSON objects, not an array
          const objects = raw.split('\n}\n').filter(Boolean);
          for (let obj of objects) {
            obj = obj.trim();
            if (!obj.endsWith('}')) obj += '}';
            try {
              const mod = JSON.parse(obj);
              if (mod.Update && mod.Version) {
                deps[mod.Path] = { current: mod.Version, wanted: mod.Update.Version, latest: mod.Update.Version };
              }
            } catch (_) {}
          }
          results.go = { outdated: deps };
          break;
        }

        case 'ruby': {
          const raw = execSync('bundle outdated --parseable 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const deps = {};
          for (const line of raw.split('\n').filter(Boolean)) {
            // Format: gem-name (newest X.X.X, installed X.X.X, requested ~> X.X)
            const match = line.match(/^(\S+)\s+\(newest\s+([^,]+),\s+installed\s+([^,)]+)/);
            if (match) {
              deps[match[1]] = { current: match[3], wanted: match[2], latest: match[2] };
            }
          }
          results.ruby = { outdated: deps };
          break;
        }

        case 'rust': {
          // Try cargo-outdated first, fall back to basic check
          let raw = '';
          try {
            raw = execSync('cargo outdated --format json 2>/dev/null', {
              cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
            });
          } catch (_) {
            try {
              raw = execSync('cargo outdated 2>/dev/null || true', {
                cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
              });
            } catch (_) {}
          }
          const deps = {};
          try {
            const parsed = JSON.parse(raw);
            if (parsed.dependencies) {
              for (const d of parsed.dependencies) {
                deps[d.name] = { current: d.project, wanted: d.compat, latest: d.latest };
              }
            }
          } catch (_) {
            // Parse text output: Name  Project  Compat  Latest  Kind
            for (const line of raw.split('\n').filter(Boolean)) {
              if (line.startsWith('Name') || line.startsWith('---')) continue;
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 4) {
                deps[parts[0]] = { current: parts[1], wanted: parts[2], latest: parts[3] };
              }
            }
          }
          results.rust = { outdated: deps };
          break;
        }

        case 'php': {
          const raw = execSync('composer outdated --format=json --direct 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const deps = {};
          try {
            const parsed = JSON.parse(raw || '{}');
            for (const pkg of (parsed.installed || [])) {
              if (pkg.latest && pkg.version !== pkg.latest) {
                deps[pkg.name] = { current: pkg.version, wanted: pkg.latest, latest: pkg.latest };
              }
            }
          } catch (_) {}
          results.php = { outdated: deps };
          break;
        }

        case 'dart': {
          const raw = execSync('dart pub outdated --json 2>/dev/null || flutter pub outdated --json 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          const deps = {};
          try {
            const parsed = JSON.parse(raw || '{}');
            for (const pkg of (parsed.packages || [])) {
              if (pkg.current && pkg.latest && pkg.current.version !== pkg.latest.version) {
                deps[pkg.package] = { current: pkg.current.version, wanted: pkg.resolvable?.version || '?', latest: pkg.latest.version };
              }
            }
          } catch (_) {}
          results.dart = { outdated: deps };
          break;
        }

        case 'swift': {
          const raw = execSync('swift package show-dependencies --format json 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 30000, env: process.env,
          });
          results.swift = { outdated: {}, note: 'Swift Package Manager does not have a built-in outdated check' };
          break;
        }

        case 'maven': {
          // Maven versions plugin — may not be installed
          const raw = execSync('mvn versions:display-dependency-updates -q 2>/dev/null || true', {
            cwd: projectPath, encoding: 'utf-8', timeout: 60000, env: process.env,
          });
          const deps = {};
          for (const line of raw.split('\n')) {
            const match = line.match(/(\S+:\S+)\s+\.+\s+(\S+)\s+->\s+(\S+)/);
            if (match) {
              deps[match[1]] = { current: match[2], wanted: match[3], latest: match[3] };
            }
          }
          results.maven = { outdated: deps };
          break;
        }

        case 'gradle': {
          results.gradle = { outdated: {}, note: 'Run gradle dependencyUpdates for full check' };
          break;
        }
      }
    } catch (e) {
      results[eco] = { error: e.message, outdated: {} };
    }
  }

  return { ecosystems, results };
}

module.exports = {
  detectProjectEcosystem,
  checkOutdated,
};
