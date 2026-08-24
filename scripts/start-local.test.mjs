import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalSupervisor, loadEnvFile } from './start-local.mjs';

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ikimetr-start-local-'));
  tempDirs.push(dir);
  return dir;
}

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.kills = [];
  }

  kill(signal) {
    this.kills.push(signal);
    queueMicrotask(() => this.finish(0, signal));
    return true;
  }

  finish(code, signal = null) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('close', code, signal);
  }
}

function setupSupervisor() {
  const calls = [];
  const children = [];
  const spawnImpl = (command, args, options) => {
    const child = new FakeChild(10_000 + children.length);
    calls.push({ command, args, options });
    children.push(child);
    return child;
  };
  const supervisor = createLocalSupervisor({ spawnImpl, cwd: '/project', env: { EXISTING: 'yes' } });
  return { calls, children, supervisor };
}

describe('loadEnvFile', () => {
  it('loads root values without overriding the existing environment', () => {
    const file = join(makeTempDir(), '.env');
    writeFileSync(file, 'EXISTING=from-file\nBINA_ENABLED=true\n');
    const target = { EXISTING: 'from-process' };
    const result = loadEnvFile(file, target);
    expect(result.loaded).toBe(true);
    expect(target).toEqual({ EXISTING: 'from-process', BINA_ENABLED: 'true' });
  });
});

describe('createLocalSupervisor', () => {
  it('starts production web and worker commands in the exact project directory', () => {
    const { calls } = setupSupervisor();
    expect(calls.map(({ command, args }) => ({ command, args }))).toEqual([
      { command: 'pnpm', args: ['--filter', '@ikimetr/web', 'start'] },
      { command: 'pnpm', args: ['--filter', '@ikimetr/worker', 'start'] },
    ]);
    expect(calls.every((call) => call.options.cwd === '/project')).toBe(true);
    expect(calls.every((call) => call.options.env.EXISTING === 'yes')).toBe(true);
  });

  it('stops the sibling and returns nonzero when one required process crashes', async () => {
    const { children, supervisor } = setupSupervisor();
    children[0].finish(2);
    expect(await supervisor.done).toBe(2);
    expect(children[1].kills).toEqual(['SIGTERM']);
  });

  it('treats an unexpected clean child exit as a supervisor failure', async () => {
    const { children, supervisor } = setupSupervisor();
    children[1].finish(0);
    expect(await supervisor.done).toBe(1);
    expect(children[0].kills).toEqual(['SIGTERM']);
  });

  it.each(['SIGINT', 'SIGTERM'])('forwards %s to both children and shuts down cleanly', async (signal) => {
    const { children, supervisor } = setupSupervisor();
    supervisor.forwardSignal(signal);
    expect(await supervisor.done).toBe(0);
    expect(children.map((child) => child.kills)).toEqual([[signal], [signal]]);
  });
});
