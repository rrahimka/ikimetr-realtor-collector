import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to this package, never to process.cwd(). The web process runs with
// cwd=apps/web while the worker runs with cwd=<repo root>, so a cwd-relative
// path would make them read and write two different files.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(packageRoot, '../..');

export const DEFAULT_DATA_DIR = resolve(monorepoRoot, 'data');

/**
 * Resolves a path inside the shared project data directory.
 *
 * Tests may point IKIMETR_DATA_DIR at a temporary directory; otherwise the
 * path is anchored to the monorepo root so every process agrees on it.
 */
export function resolveDataPath(relativePath: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.IKIMETR_DATA_DIR?.trim();
  if (override && override.length > 0) {
    return resolve(isAbsolute(override) ? override : resolve(monorepoRoot, override), relativePath);
  }
  return resolve(DEFAULT_DATA_DIR, relativePath);
}

/** Absolute path of the shared social/Telegram connections store. */
export function resolveConnectionsStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveDataPath('connections.json', env);
}
