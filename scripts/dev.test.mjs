import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDevArgs, loadEnvFile } from './dev.mjs';

/** @type {string[]} */
const tempDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ikimetr-dev-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('loadEnvFile', () => {
  it('loads variables from the given env file', () => {
    const file = join(makeTempDir(), '.env');
    writeFileSync(file, 'LOCAL_AUTH_PASSWORD=test-password\nSESSION_SECRET=test-secret\n');
    const target = {};
    const result = loadEnvFile(file, target);
    expect(result.loaded).toBe(true);
    expect(target.LOCAL_AUTH_PASSWORD).toBe('test-password');
    expect(target.SESSION_SECRET).toBe('test-secret');
  });

  it('does not override variables already present in the target', () => {
    const file = join(makeTempDir(), '.env');
    writeFileSync(file, 'LOCAL_AUTH_PASSWORD=from-file\n');
    const target = { LOCAL_AUTH_PASSWORD: 'from-env' };
    loadEnvFile(file, target);
    expect(target.LOCAL_AUTH_PASSWORD).toBe('from-env');
  });

  it('returns loaded:false for a missing file without throwing', () => {
    const result = loadEnvFile(join(makeTempDir(), 'missing.env'), {});
    expect(result.loaded).toBe(false);
    expect(result.keys).toEqual([]);
  });

  it('does not write secret values to stdout or stderr', () => {
    const file = join(makeTempDir(), '.env');
    const secret = 'super-secret-value';
    writeFileSync(file, `LOCAL_AUTH_PASSWORD=${secret}\n`);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let printed = '';
    try {
      loadEnvFile(file, {});
      for (const spy of [logSpy, warnSpy, errorSpy]) {
        for (const call of spy.mock.calls) printed += call.map(String).join(' ');
      }
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
    expect(printed).not.toContain(secret);
  });
});

describe('buildDevArgs', () => {
  it('runs web and worker with kill-on-exit', () => {
    expect(buildDevArgs()).toEqual([
      '-k',
      '-n',
      'web,worker',
      '-c',
      'cyan,magenta',
      'pnpm --filter @ikimetr/web dev',
      'pnpm --filter @ikimetr/worker dev',
    ]);
  });
});
