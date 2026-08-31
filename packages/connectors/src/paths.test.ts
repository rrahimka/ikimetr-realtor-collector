import { describe, it, expect } from 'vitest';
import { isAbsolute, resolve } from 'node:path';
import { resolveDataPath, resolveConnectionsStorePath, DEFAULT_DATA_DIR } from './paths';

describe('shared data path resolution', () => {
  it('resolves to an absolute path inside the project data directory', () => {
    const path = resolveConnectionsStorePath();
    expect(isAbsolute(path)).toBe(true);
    expect(path).toBe(resolve(DEFAULT_DATA_DIR, 'connections.json'));
  });

  it('is independent of process.cwd()', () => {
    // The web process runs with cwd=apps/web and the worker with cwd=<root>.
    // Both must resolve to the same absolute file.
    const original = process.cwd();
    try {
      const fromRoot = resolveConnectionsStorePath();
      process.chdir(resolve(DEFAULT_DATA_DIR, '../apps/web'));
      const fromWeb = resolveConnectionsStorePath();
      expect(fromWeb).toBe(fromRoot);
    } finally {
      process.chdir(original);
    }
  });

  it('honours the IKIMETR_DATA_DIR override for isolated test runs', () => {
    expect(resolveDataPath('connections.json', { IKIMETR_DATA_DIR: '/tmp/ikimetr-test' }))
      .toBe(resolve('/tmp/ikimetr-test', 'connections.json'));
  });

  it('ignores an empty or whitespace override', () => {
    expect(resolveDataPath('connections.json', { IKIMETR_DATA_DIR: '   ' }))
      .toBe(resolve(DEFAULT_DATA_DIR, 'connections.json'));
  });
});
