import { describe, it, expect } from 'vitest';

const { getProcessStats, getListeningPorts, checkHealth } = await import('../../../src/services/monitoring.js');

describe('getProcessStats', () => {
  it('returns stats for the current process', () => {
    const stats = getProcessStats(process.pid);
    expect(stats).not.toBeNull();
    expect(stats).toHaveProperty('memMB');
    expect(stats).toHaveProperty('cpu');
    expect(typeof stats.memMB).toBe('number');
    expect(typeof stats.cpu).toBe('number');
    expect(stats.memMB).toBeGreaterThan(0);
  });

  it('returns null for non-existent process', () => {
    const stats = getProcessStats(999999);
    expect(stats).toBeNull();
  });
});

describe('getListeningPorts', () => {
  it('returns an array', () => {
    const ports = getListeningPorts();
    expect(Array.isArray(ports)).toBe(true);
  });

  it('returns objects with port, process, pid', () => {
    const ports = getListeningPorts();
    if (ports.length > 0) {
      expect(ports[0]).toHaveProperty('port');
      expect(ports[0]).toHaveProperty('process');
      expect(ports[0]).toHaveProperty('pid');
      expect(typeof ports[0].port).toBe('number');
    }
  });

  it('returns sorted by port number', () => {
    const ports = getListeningPorts();
    for (let i = 1; i < ports.length; i++) {
      expect(ports[i].port).toBeGreaterThanOrEqual(ports[i - 1].port);
    }
  });
});

describe('checkHealth', () => {
  it('returns health result object', async () => {
    // Test against a non-existent address (should fail fast)
    const result = await checkHealth('http://localhost:1');
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('statusCode');
    expect(result).toHaveProperty('responseTime');
    expect(result.ok).toBe(false);
  });
});
