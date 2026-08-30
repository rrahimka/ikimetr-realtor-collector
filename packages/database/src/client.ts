import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const initialMigrationPath = resolve(packageRoot, 'drizzle/0000_initial.sql');
const binaBlockedMigrationPath = resolve(packageRoot, 'drizzle/0001_bina_blocked.sql');
const binaContinuousMigrationPath = resolve(packageRoot, 'drizzle/0002_bina_continuous.sql');
const multiSourceMigrationPath = resolve(packageRoot, 'drizzle/0003_multi_source.sql');
const fixSourceTypesMigrationPath = resolve(packageRoot, 'drizzle/0004_fix_source_types.sql');
const expandSourceTypesMigrationPath = resolve(packageRoot, 'drizzle/0005_expand_source_types.sql');
const expandTierBSourcesMigrationPath = resolve(packageRoot, 'drizzle/0006_expand_tier_b_sources.sql');
const leadsMigrationPath = resolve(packageRoot, 'drizzle/0007_leads.sql');
const sourceSoftDeleteMigrationPath = resolve(packageRoot, 'drizzle/0008_source_soft_delete.sql');
const collectorSessionsMigrationPath = resolve(packageRoot, 'drizzle/0009_collector_sessions.sql');

export type CollectorDatabase = Database.Database;
export const DEFAULT_DATABASE_PATH = './data/collector.db';

// Relative paths resolve against the database package, never process.cwd(),
// so migrate/seed/web/worker all open the same file regardless of their cwd.
export function resolveDatabasePath(path: string): string {
  if (path === ':memory:') return path;
  return isAbsolute(path) ? path : resolve(packageRoot, path);
}

export function createDatabase(path = process.env.DATABASE_URL ?? DEFAULT_DATABASE_PATH): CollectorDatabase {
  const resolved = resolveDatabasePath(path);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
  try {
    db.exec(readFileSync(initialMigrationPath, 'utf8'));
    let version = db.pragma('user_version', { simple: true }) as number;
    if (version < 1) {
      db.exec(readFileSync(binaBlockedMigrationPath, 'utf8'));
      version = db.pragma('user_version', { simple: true }) as number;
    }
    if (version < 2) {
      db.exec(readFileSync(binaContinuousMigrationPath, 'utf8'));
      version = db.pragma('user_version', { simple: true }) as number;
    }
    if (version < 3) {
      db.exec(readFileSync(multiSourceMigrationPath, 'utf8'));
      version = db.pragma('user_version', { simple: true }) as number;
    }
    if (version < 4) {
      db.exec(readFileSync(fixSourceTypesMigrationPath, 'utf8'));
      version = db.pragma('user_version', { simple: true }) as number;
    }
    if (version < 5) {
      db.exec(readFileSync(expandSourceTypesMigrationPath, 'utf8'));
      version = db.pragma('user_version', { simple: true }) as number;
    }
    if (version < 6) {
      db.exec(readFileSync(expandTierBSourcesMigrationPath, 'utf8'));
      version = db.pragma('user_version', { simple: true }) as number;
    }
    if (version < 7) {
      db.exec(readFileSync(leadsMigrationPath, 'utf8'));
      version = db.pragma('user_version', { simple: true }) as number;
    }
    if (version < 8) {
      db.exec(readFileSync(sourceSoftDeleteMigrationPath, 'utf8'));
    }
    if (version < 9) {
      db.exec(readFileSync(collectorSessionsMigrationPath, 'utf8'));
    }

    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) throw new Error('Database migration left foreign-key violations');
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
