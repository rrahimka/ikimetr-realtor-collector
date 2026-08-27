import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabasePath, DEFAULT_DATABASE_PATH, createDatabase, type CollectorDatabase } from './client';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultBackupDir = resolve(packageRoot, '../../data/backups');

export interface BackupResult {
  backupPath: string;
  timestamp: string;
  tableCounts: Record<string, number>;
  bytes: number;
}

export interface RestoreResult {
  restoredPath: string;
  integrity: string;
  tableCounts: Record<string, number>;
}

/**
 * Creates a consistent SQLite backup using better-sqlite3's online backup API.
 */
export async function createDatabaseBackup(
  dbPath = process.env.DATABASE_URL ?? DEFAULT_DATABASE_PATH,
  backupDir = defaultBackupDir
): Promise<BackupResult> {
  const resolvedDbPath = resolveDatabasePath(dbPath);
  if (!existsSync(resolvedDbPath)) {
    throw new Error(`Database file not found: ${resolvedDbPath}`);
  }

  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const backupFileName = `collector-${timestamp}.db`;
  const backupPath = join(backupDir, backupFileName);

  const db: CollectorDatabase = createDatabase(resolvedDbPath);
  try {
    // Perform consistent online backup
    await db.backup(backupPath);

    // Verify backup integrity
    const backupDb: CollectorDatabase = createDatabase(backupPath);
    try {
      const integrity = backupDb.pragma('integrity_check', { simple: true }) as string;
      if (integrity !== 'ok') {
        throw new Error(`Backup integrity check failed: ${integrity}`);
      }

      const tableCounts: Record<string, number> = {};
      const tables = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
      for (const { name } of tables) {
        const row = backupDb.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
        tableCounts[name] = row.c;
      }

      const bytes = statSync(backupPath).size;

      // Clean up old backups based on retention policy
      pruneOldBackups(backupDir);

      return {
        backupPath,
        timestamp,
        tableCounts,
        bytes,
      };
    } finally {
      backupDb.close();
    }
  } finally {
    db.close();
  }
}

/**
 * Prunes backups keeping at most 7 daily and 4 weekly backups.
 */
export function pruneOldBackups(backupDir = defaultBackupDir, maxBackups = 14): void {
  if (!existsSync(backupDir)) return;

  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith('collector-') && f.endsWith('.db'))
    .map((f) => {
      const fullPath = join(backupDir, f);
      return {
        name: f,
        path: fullPath,
        mtime: statSync(fullPath).mtime.getTime(),
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > maxBackups) {
    const toDelete = files.slice(maxBackups);
    for (const f of toDelete) {
      try {
        unlinkSync(f.path);
      } catch {
        // ignore deletion errors
      }
    }
  }
}

/**
 * Restores a backup file into a specified target database path for verification or disaster recovery.
 */
export async function restoreDatabaseBackup(
  backupPath: string,
  targetPath: string
): Promise<RestoreResult> {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const resolvedTarget = resolveDatabasePath(targetPath);
  mkdirSync(dirname(resolvedTarget), { recursive: true });

  const backupDb: CollectorDatabase = createDatabase(backupPath);
  try {
    await backupDb.backup(resolvedTarget);

    const targetDb: CollectorDatabase = createDatabase(resolvedTarget);
    try {
      const integrity = targetDb.pragma('integrity_check', { simple: true }) as string;
      if (integrity !== 'ok') {
        throw new Error(`Restored database integrity check failed: ${integrity}`);
      }

      const tableCounts: Record<string, number> = {};
      const tables = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
      for (const { name } of tables) {
        const row = targetDb.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
        tableCounts[name] = row.c;
      }

      return {
        restoredPath: resolvedTarget,
        integrity,
        tableCounts,
      };
    } finally {
      targetDb.close();
    }
  } finally {
    backupDb.close();
  }
}
