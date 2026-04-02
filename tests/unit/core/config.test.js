import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// electron mock returns '/tmp/test-ldm' for app.getPath — ensure it exists
const BASE = '/tmp/test-ldm';
beforeAll(() => { fs.mkdirSync(BASE, { recursive: true }); });
afterAll(() => { fs.rmSync(BASE, { recursive: true, force: true }); });

// Clean slate before each test so tests don't bleed into each other
beforeEach(() => {
  for (const f of ['projects.json', 'profiles.json', 'settings.json']) {
    try { fs.unlinkSync(path.join(BASE, f)); } catch (_) {}
  }
  try { fs.rmSync(path.join(BASE, 'logs'), { recursive: true, force: true }); } catch (_) {}
});

const {
  loadProjects, saveProjects,
  loadProfiles, saveProfiles,
  loadSettings, saveSettings,
  loadPersistedLogs, appendLog,
} = await import('../../../src/core/config.js');

describe('config — projects', () => {
  it('returns empty array when no config file exists', () => {
    expect(loadProjects()).toEqual([]);
  });

  it('round-trips projects through save/load', () => {
    const projects = [{ id: 'abc', name: 'Test App', path: '/tmp/app' }];
    saveProjects(projects);
    expect(loadProjects()).toEqual(projects);
  });

  it('handles corrupt config file gracefully', () => {
    fs.writeFileSync(path.join(BASE, 'projects.json'), 'NOT JSON');
    expect(loadProjects()).toEqual([]);
  });
});

describe('config — profiles', () => {
  it('returns empty array when no profiles file exists', () => {
    expect(loadProfiles()).toEqual([]);
  });

  it('round-trips profiles through save/load', () => {
    const profiles = [{ name: 'Dev', projectIds: ['abc', 'def'] }];
    saveProfiles(profiles);
    expect(loadProfiles()).toEqual(profiles);
  });
});

describe('config — settings', () => {
  it('returns empty object when no settings file exists', () => {
    expect(loadSettings()).toEqual({});
  });

  it('round-trips settings through save/load', () => {
    const settings = { theme: 'dark', terminalTheme: 'dark' };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });
});

describe('config — log persistence', () => {
  it('returns empty array when no log file exists', () => {
    expect(loadPersistedLogs('no-such-project')).toEqual([]);
  });

  it('appendLog writes lines that loadPersistedLogs reads back', () => {
    appendLog('proj-1', 'hello world');
    appendLog('proj-1', 'second line');
    const lines = loadPersistedLogs('proj-1');
    expect(lines).toContain('hello world');
    expect(lines).toContain('second line');
  });
});
