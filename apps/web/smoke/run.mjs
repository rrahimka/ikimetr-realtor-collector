import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const smokeDir = import.meta.dirname;
const webDir = resolve(smokeDir, '..');
const projectRoot = resolve(smokeDir, '..', '..');

const tempDir = mkdtempSync(join(tmpdir(), 'ikimetr-smoke-'));
const dbPath = join(tempDir, 'collector.db');

const baseEnv = {
  ...process.env,
  DATABASE_URL: dbPath,
  LOCAL_AUTH_PASSWORD: 'smoke-test-password',
  SESSION_SECRET: 'smoke-test-secret-at-least-16-chars',
  BINA_ENABLED: 'false',
  BINA_PERMISSION_CONFIRMED: 'false',
};

const workerEnv = {
  ...baseEnv,
  ALLOW_TEST_CONNECTOR: 'true',
};
delete workerEnv.NODE_ENV;

const webEnv = { ...baseEnv };
delete webEnv.NODE_ENV;
delete webEnv.ALLOW_TEST_CONNECTOR;

/** @type {Set<import('node:child_process').ChildProcess>} */
const children = new Set();
let exitCode = 1;

/**
 * @param {import('node:child_process').ChildProcess} child
 * @returns {import('node:child_process').ChildProcess}
 */
function track(child) {
  children.add(child);
  // `close` fires only after the child's stdio streams are closed, i.e. after
  // every descendant that inherited the pipes has exited, so membership in
  // `children` means the whole tree is still running.
  child.on('close', () => children.delete(child));
  return child;
}

/**
 * Send a signal to a child and every descendant it spawned.
 * The worker is launched with `detached: true`, which on POSIX makes it the
 * leader of its own process group, so a negative pid (`-child.pid`) targets
 * the entire group (pnpm → sh → tsx → node loader). For a non-detached child
 * the group lookup fails and we fall back to signaling the direct child only.
 * @param {import('node:child_process').ChildProcess} child
 * @param {NodeJS.Signals} signal
 */
function signalTree(child, signal) {
  try {
    if (child.pid === undefined) throw new Error('Child process has no pid');
    process.kill(-child.pid, signal);
  } catch {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<void>}
 */
function stopChild(child) {
  return new Promise((resolve) => {
    if (!children.has(child)) {
      resolve();
      return;
    }
    const killTimer = setTimeout(() => {
      signalTree(child, 'SIGKILL');
    }, 10_000);
    child.once('close', () => {
      clearTimeout(killTimer);
      resolve();
    });
    signalTree(child, 'SIGTERM');
  });
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<void>}
 */
function waitForWorkerReady(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Worker did not become ready within 120s')), 120_000);
    /**
     * @param {Buffer} chunk
     */
    function onStdoutData(chunk) {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      if (output.includes('Worker started')) {
        clearTimeout(timer);
        resolve();
      }
    }

    /**
     * @param {Buffer} chunk
     */
    function onStderrData(chunk) {
      process.stderr.write(chunk);
    }

    child.stdout.on('data', onStdoutData);
    child.stderr.on('data', onStderrData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Worker exited early with code ${code}`));
    });
  });
}

try {
  const worker = track(spawn('pnpm', ['--filter', '@ikimetr/worker', 'start'], {
    cwd: projectRoot,
    env: workerEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  }));
  worker.on('error', (error) => {
    console.error(`Failed to spawn worker: ${error.message}`);
  });

  await waitForWorkerReady(worker);

  const playwright = track(spawn('pnpm', ['exec', 'playwright', 'test'], {
    cwd: webDir,
    env: webEnv,
    stdio: 'inherit',
  }));
  playwright.on('error', (error) => {
    console.error(`Failed to spawn playwright: ${error.message}`);
  });

  exitCode = await new Promise((resolve) => {
    playwright.once('close', (code) => resolve(code ?? 1));
  });

  await stopChild(worker);
} catch (error) {
  console.error(`Smoke runner failed: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  for (const child of children) {
    signalTree(child, 'SIGKILL');
  }
  rmSync(tempDir, { recursive: true, force: true });
  process.exitCode = exitCode;
}
