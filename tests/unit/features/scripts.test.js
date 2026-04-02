import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// electron is mocked globally via setupFiles

const { getProjectScripts } = await import('../../../src/features/scripts/index.js');

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldm-scripts-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(tmpDir, 'proj-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('getProjectScripts', () => {
  it('discovers npm scripts', () => {
    const dir = makeProject({ 'package.json': { scripts: { dev: 'vite', build: 'tsc', test: 'jest' } } });
    const result = getProjectScripts(dir);
    expect(result.type).toBe('npm');
    expect(result.scripts).toEqual({ dev: 'vite', build: 'tsc', test: 'jest' });
  });

  it('discovers cargo scripts', () => {
    const dir = makeProject({ 'Cargo.toml': '[package]\nname = "test"' });
    const result = getProjectScripts(dir);
    expect(result.scripts.build).toBe('cargo build');
    expect(result.scripts.test).toBe('cargo test');
  });

  it('discovers go scripts', () => {
    const dir = makeProject({ 'go.mod': 'module example.com/test' });
    const result = getProjectScripts(dir);
    expect(result.scripts.run).toBe('go run .');
    expect(result.scripts.test).toBe('go test ./...');
  });

  it('discovers makefile targets', () => {
    const dir = makeProject({ 'Makefile': 'build:\n\tgo build\n\ntest:\n\tgo test\n' });
    const result = getProjectScripts(dir);
    expect(result.type).toBe('make');
    expect(result.scripts).toHaveProperty('build');
    expect(result.scripts).toHaveProperty('test');
  });

  it('returns multi-ecosystem result', () => {
    const dir = makeProject({
      'package.json': { scripts: { dev: 'vite' } },
      'Makefile': 'build:\n\tmake\n'
    });
    const result = getProjectScripts(dir);
    expect(result.multi).toBe(true);
    expect(result.groups.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty result for unknown project', () => {
    const dir = makeProject({});
    const result = getProjectScripts(dir);
    expect(result.type).toBeNull();
  });

  it('discovers poetry scripts', () => {
    const dir = makeProject({
      'pyproject.toml': '[tool.poetry]\nname = "myapp"\n\n[tool.poetry.scripts]\nserve = "myapp.main:run"\n'
    });
    const result = getProjectScripts(dir);
    expect(result.scripts).toHaveProperty('serve');
    expect(result.scripts).toHaveProperty('install');
  });

  it('discovers composer scripts', () => {
    const dir = makeProject({ 'composer.json': { scripts: { test: 'phpunit', lint: 'phpcs' } } });
    const result = getProjectScripts(dir);
    expect(result.scripts).toHaveProperty('test');
    expect(result.scripts).toHaveProperty('lint');
  });

  it('discovers ruby bundle commands', () => {
    const dir = makeProject({ 'Gemfile': 'source "https://rubygems.org"' });
    const result = getProjectScripts(dir);
    expect(result.scripts).toHaveProperty('bundle install');
  });

  it('discovers rake tasks', () => {
    const dir = makeProject({
      'Gemfile': 'source "https://rubygems.org"',
      'Rakefile': "task :build do\nend\ntask :deploy do\nend\n"
    });
    const result = getProjectScripts(dir);
    expect(result.scripts).toHaveProperty('build');
    expect(result.scripts).toHaveProperty('deploy');
  });
});
