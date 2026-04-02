import { describe, it, expect, beforeEach } from 'vitest';

const { init, getLogs, clearLogs } = await import('../../../src/core/logger.js');

beforeEach(() => {
  clearLogs();
});

describe('logger', () => {
  it('starts with empty log buffer', () => {
    expect(getLogs()).toEqual([]);
  });

  it('captures console.log as info', () => {
    console.log('test message');
    const logs = getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[logs.length - 1].level).toBe('info');
    expect(logs[logs.length - 1].msg).toContain('test message');
  });

  it('captures console.warn as warn', () => {
    console.warn('watch out');
    const logs = getLogs();
    const last = logs[logs.length - 1];
    expect(last.level).toBe('warn');
    expect(last.msg).toContain('watch out');
  });

  it('captures console.error as error', () => {
    console.error('something broke');
    const logs = getLogs();
    const last = logs[logs.length - 1];
    expect(last.level).toBe('error');
    expect(last.msg).toContain('something broke');
  });

  it('each log entry has ts and msg fields', () => {
    console.log('structured');
    const entry = getLogs().pop();
    expect(entry).toHaveProperty('ts');
    expect(entry).toHaveProperty('msg');
    expect(typeof entry.ts).toBe('number');
  });

  it('clearLogs empties the buffer', () => {
    console.log('one');
    console.log('two');
    clearLogs();
    expect(getLogs()).toEqual([]);
  });

  it('caps buffer at 500 entries', () => {
    clearLogs();
    for (let i = 0; i < 510; i++) console.log(`line ${i}`);
    expect(getLogs().length).toBeLessThanOrEqual(500);
  });

  it('init accepts a window getter without throwing', () => {
    expect(() => init(() => null)).not.toThrow();
  });
});
