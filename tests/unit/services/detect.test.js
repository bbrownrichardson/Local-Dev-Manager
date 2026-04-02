import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { detectProjectType } = await import('../../../src/services/detect.js');

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldm-test-'));
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

describe('detectProjectType (real fs)', () => {
  it('detects node project', () => {
    const dir = makeProject({ 'package.json': { name: 'my-app', scripts: { start: 'node index.js' } } });
    const result = detectProjectType(dir);
    expect(result.type).toBe('node');
    expect(result.command).toBe('npm start');
  });

  it('detects vite project', () => {
    const dir = makeProject({ 'package.json': { name: 'vite-app', scripts: { dev: 'vite' } } });
    const result = detectProjectType(dir);
    expect(result.url).toBe('http://localhost:5173');
  });

  it('detects next.js project', () => {
    const dir = makeProject({ 'package.json': { name: 'next-app', scripts: { dev: 'next dev' } } });
    const result = detectProjectType(dir);
    expect(result.url).toBe('http://localhost:3000');
  });

  it('detects angular project', () => {
    const dir = makeProject({ 'package.json': { name: 'ng-app', scripts: { start: 'ng serve' } } });
    const result = detectProjectType(dir);
    expect(result.url).toBe('http://localhost:4200');
  });

  it('extracts custom port', () => {
    const dir = makeProject({ 'package.json': { name: 'app', scripts: { dev: 'vite --port 4000' } } });
    const result = detectProjectType(dir);
    expect(result.url).toBe('http://localhost:4000');
  });

  it('detects monorepo', () => {
    const dir = makeProject({
      'package.json': { name: 'mono', scripts: { start: 'node server.js' } },
      'client/package.json': { name: 'client', scripts: { dev: 'vite' } },
    });
    const result = detectProjectType(dir);
    expect(result.type).toBe('node (monorepo)');
    expect(result.commands).toHaveLength(2);
  });

  it('detects docker project', () => {
    const dir = makeProject({ 'docker-compose.yml': 'version: "3"' });
    const result = detectProjectType(dir);
    expect(result.type).toBe('docker');
  });

  it('detects go project', () => {
    const dir = makeProject({ 'go.mod': 'module example.com/test' });
    const result = detectProjectType(dir);
    expect(result.type).toBe('go');
    expect(result.command).toBe('go run .');
  });

  it('detects rust project', () => {
    const dir = makeProject({ 'Cargo.toml': '[package]\nname = "test"' });
    const result = detectProjectType(dir);
    expect(result.type).toBe('rust');
  });

  it('detects django project', () => {
    const dir = makeProject({ 'manage.py': '#!/usr/bin/env python3' });
    const result = detectProjectType(dir);
    expect(result.type).toBe('python');
    expect(result.url).toBe('http://localhost:8000');
  });

  it('detects makefile project', () => {
    const dir = makeProject({ 'Makefile': 'run:\n\techo hi' });
    const result = detectProjectType(dir);
    expect(result.type).toBe('make');
  });

  it('returns null for empty directory', () => {
    const dir = makeProject({});
    const result = detectProjectType(dir);
    expect(result).toBeNull();
  });
});
