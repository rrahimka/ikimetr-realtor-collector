import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from './dev.mjs';

export { loadEnvFile };

/**
 * @typedef {{
 *   kill: (signal: NodeJS.Signals) => boolean,
 *   once: (event: string, listener: (value: unknown) => void) => unknown
 * }} SupervisorChild
 */

/**
 * @typedef {(command: string, args: string[], options: {
 *   cwd: string,
 *   env: NodeJS.ProcessEnv,
 *   stdio: 'inherit'
 * }) => SupervisorChild} SupervisorSpawn
 */

const COMMANDS = [
  ['--filter', '@ikimetr/web', 'start'],
  ['--filter', '@ikimetr/worker', 'start'],
];

/**
 * @param {{ spawnImpl?: SupervisorSpawn, cwd: string, env?: NodeJS.ProcessEnv }} options
 * @returns {{ children: SupervisorChild[], done: Promise<number>, forwardSignal: (signal: NodeJS.Signals) => void }}
 */
export function createLocalSupervisor(options) {
  const { cwd, env = process.env } = options;
  /** @type {SupervisorSpawn} */
  const spawnImpl = options.spawnImpl ?? ((command, args, spawnOptions) => /** @type {SupervisorChild} */ (spawn(command, args, spawnOptions)));
  /** @type {SupervisorChild[]} */
  const children = [];
  /** @type {Set<SupervisorChild>} */
  const active = new Set();
  let shuttingDown = false;
  let requestedCode = 0;
  let settled = false;
  /** @type {(code: number) => void} */
  let resolveDone = () => undefined;
  /** @type {Promise<number>} */
  const done = new Promise((resolveDonePromise) => { resolveDone = resolveDonePromise; });

  const finishIfStopped = () => {
    if (!settled && shuttingDown && active.size === 0) {
      settled = true;
      resolveDone(requestedCode);
    }
  };
  /** @param {NodeJS.Signals} signal @param {SupervisorChild | undefined} [except] */
  const stopChildren = (signal, except) => {
    for (const child of active) {
      if (child !== except) child.kill(signal);
    }
  };
  /** @param {SupervisorChild} child @param {unknown} code */
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

  /** @param {NodeJS.Signals} signal */
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
  /** @type {NodeJS.Signals[]} */
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) process.once(signal, () => supervisor.forwardSignal(signal));
  process.exitCode = await supervisor.done;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await main();
