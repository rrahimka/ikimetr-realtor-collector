import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle/0000_initial.sql');
export type CollectorDatabase = Database.Database;

export function createDatabase(path = process.env.DATABASE_URL ?? './data/collector.db'): CollectorDatabase {
  const db = new Database(path);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
  db.exec(readFileSync(migrationPath, 'utf8'));
  return db;
}
