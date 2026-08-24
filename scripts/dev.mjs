import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Load key/value pairs from a `.env` file into `target` without overriding
 * keys that are already present, matching `--env-file` precedence.
 * @param {string} filePath
 * @param {Record<string, string | undefined>} [target]
 * @returns {{ loaded: boolean, keys: string[] }}
 */
export function loadEnvFile(filePath, target = {}) {
  if (!existsSync(filePath)) return { loaded: false, keys: [] };
  const parsed = parseEnv(readFileSync(filePath, 'utf8'));
  const keys = Object.keys(parsed);
  for (const [key, value] of Object.entries(parsed)) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) target[key] = value;
  }
  return { loaded: true, keys };
}

/** @returns {string[]} */
export function buildDevArgs() {
  return [
    '-k',
    '-n',
    'web,worker',
    '-c',
    'cyan,magenta',
    'pnpm --filter @ikimetr/web dev',
    'pnpm --filter @ikimetr/worker dev',
  ];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function main() {
  const loaded = loadEnvFile(resolve(root, '.env'), process.env);
  if (!loaded.loaded) {
    console.warn('[dev] No .env file found; using the existing environment only.');
  }
  const concurrently = resolve(root, 'node_modules/.bin/concurrently');
  const child = spawn(concurrently, buildDevArgs(), { cwd: root, stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`[dev] Failed to start concurrently: ${error.message}`);
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 0));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
