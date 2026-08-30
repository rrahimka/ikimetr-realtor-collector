import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
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

  it('migrates the legacy runs status constraint without losing rows or foreign keys', () => {
    const dbPath = join(makeTempDir(), 'legacy.db');
    const legacy = new Database(dbPath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
        locator TEXT NOT NULL, language TEXT NOT NULL, max_pages INTEGER NOT NULL,
        max_depth INTEGER NOT NULL, delay_ms INTEGER NOT NULL, enabled INTEGER NOT NULL,
        kill_switch INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')),
        started_at TEXT, finished_at TEXT, pages_checked INTEGER NOT NULL DEFAULT 0,
        phones_found INTEGER NOT NULL DEFAULT 0, unique_phones INTEGER NOT NULL DEFAULT 0,
        error TEXT, cancellation_requested INTEGER NOT NULL DEFAULT 0,
        needs_review INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX one_active_run_per_source ON runs(source_id) WHERE status IN ('queued','running');
      INSERT INTO sources VALUES(1,'Legacy','website','https://fixture.invalid','AZ',1,0,0,1,0,'2026-08-24','2026-08-24');
      INSERT INTO runs VALUES(7,1,'completed','2026-08-24','2026-08-24',3,2,1,NULL,0,0,'2026-08-24');
    `);
    legacy.close();

    const migrated = createDatabase(dbPath);
    expect(migrated.pragma('user_version', { simple: true })).toBe(9);
    expect(migrated.prepare('SELECT id,source_id,status,pages_checked FROM runs').all()).toEqual([
      { id: 7, source_id: 1, status: 'completed', pages_checked: 3 },
    ]);
    expect((migrated.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='runs'").get() as { sql: string }).sql).toContain("'blocked'");
    expect((migrated.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='adapter_recipes'").get() as { sql: string })).toBeDefined();
    expect((migrated.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='leads'").get() as { sql: string })).toBeDefined();
    expect(migrated.pragma('foreign_key_check')).toEqual([]);
    migrated.close();

  });

  it('rolls the runs migration back before dropping legacy data when integrity validation fails', () => {
    const dbPath = join(makeTempDir(), 'invalid-legacy.db');
    const legacy = new Database(dbPath);
    legacy.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
        locator TEXT NOT NULL, language TEXT NOT NULL, max_pages INTEGER NOT NULL,
        max_depth INTEGER NOT NULL, delay_ms INTEGER NOT NULL, enabled INTEGER NOT NULL,
        kill_switch INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')),
        started_at TEXT, finished_at TEXT, pages_checked INTEGER NOT NULL DEFAULT 0,
        phones_found INTEGER NOT NULL DEFAULT 0, unique_phones INTEGER NOT NULL DEFAULT 0,
        error TEXT, cancellation_requested INTEGER NOT NULL DEFAULT 0,
        needs_review INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      INSERT INTO runs VALUES(9,999,'completed',NULL,'2026-08-24',1,0,0,NULL,0,0,'2026-08-24');
    `);
    legacy.close();

    expect(() => createDatabase(dbPath)).toThrow();
    const inspected = new Database(dbPath);
    expect(inspected.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'").get()).toEqual({ name: 'runs' });
    expect(inspected.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs_before_bina_blocked'").get()).toBeUndefined();
    expect(inspected.prepare('SELECT id,source_id,status FROM runs').all()).toEqual([{ id: 9, source_id: 999, status: 'completed' }]);
    expect(inspected.pragma('user_version', { simple: true })).toBe(0);
    inspected.close();
  });
});
