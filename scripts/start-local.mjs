import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from './dev.mjs';

export { loadEnvFile };

const COMMANDS = [
  ['--filter', '@ikimetr/web', 'start'],
  ['--filter', '@ikimetr/worker', 'start'],
];

export function createLocalSupervisor({ spawnImpl = spawn, cwd, env = process.env }) {
  const children = [];
  const active = new Set();
  let shuttingDown = false;
  let requestedCode = 0;
  let settled = false;
  let resolveDone;
  const done = new Promise((resolveDonePromise) => { resolveDone = resolveDonePromise; });

  const finishIfStopped = () => {
    if (!settled && shuttingDown && active.size === 0) {
      settled = true;
      resolveDone(requestedCode);
    }
  };
  const stopChildren = (signal, except) => {
    for (const child of active) {
      if (child !== except) child.kill(signal);
    }
  };
  const failFromChild = (child, code) => {
    active.delete(child);
    if (!shuttingDown) {
      shuttingDown = true;
      requestedCode = typeof code === 'number' && code !== 0 ? code : 1;
      stopChildren('SIGTERM', child);
    }
    finishIfStopped();
  };

  for (const args of COMMANDS) {
    const child = spawnImpl('pnpm', args, { cwd, env, stdio: 'inherit' });
    children.push(child);
    active.add(child);
    child.once('error', () => failFromChild(child, 1));
    child.once('close', (code) => failFromChild(child, code));
  }

  const forwardSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    requestedCode = 0;
    stopChildren(signal);
    finishIfStopped();
  };

  return { children, done, forwardSignal };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function main() {
  loadEnvFile(resolve(root, '.env'), process.env);
  const supervisor = createLocalSupervisor({ cwd: root, env: process.env });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => supervisor.forwardSignal(signal));
  process.exitCode = await supervisor.done;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await main();
