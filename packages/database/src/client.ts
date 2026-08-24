import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'drizzle/0000_initial.sql');

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
  db.exec(readFileSync(migrationPath, 'utf8'));
  return db;
}
