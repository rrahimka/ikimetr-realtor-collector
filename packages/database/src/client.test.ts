import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, resolveDatabasePath } from './client.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ikimetr-db-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('resolveDatabasePath', () => {
  it('keeps the special :memory: path unchanged', () => {
    expect(resolveDatabasePath(':memory:')).toBe(':memory:');
  });

  it('keeps an absolute path unchanged', () => {
    const absolute = join(makeTempDir(), 'collector.db');
    expect(resolveDatabasePath(absolute)).toBe(absolute);
  });

  it('resolves a relative path against the database package, not process.cwd()', () => {
    const originalCwd = process.cwd();
    process.chdir(makeTempDir());
    try {
      expect(resolveDatabasePath('./data/collector.db')).toBe(resolve(packageRoot, 'data/collector.db'));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('maps one relative DATABASE_URL to one absolute path for every caller', () => {
    const first = resolveDatabasePath('data/collector.db');
    const second = resolveDatabasePath('data/collector.db');
    expect(isAbsolute(first)).toBe(true);
    expect(second).toBe(first);
    expect(first).toBe(resolve(packageRoot, 'data/collector.db'));
  });
});

describe('createDatabase', () => {
  it('creates a missing parent directory before opening the database', () => {
    const nested = join(makeTempDir(), 'a', 'b');
    const dbPath = join(nested, 'collector.db');
    const db = createDatabase(dbPath);
    db.close();
    expect(existsSync(dbPath)).toBe(true);
  });

  it('never creates a database under apps/web/data or apps/worker/data', () => {
    const resolved = resolveDatabasePath('./data/collector.db');
    expect(resolved).toBe(join(packageRoot, 'data', 'collector.db'));
    expect(resolved.includes(join('apps', 'web', 'data'))).toBe(false);
    expect(resolved.includes(join('apps', 'worker', 'data'))).toBe(false);
  });
});
