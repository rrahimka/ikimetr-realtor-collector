import type { createRepositories } from '@ikimetr/database';

type Repositories = ReturnType<typeof createRepositories>;
const HOUR_MS = 60 * 60 * 1_000;
const BLOCKED_COOLDOWN_MS = 24 * HOUR_MS;
const CHECK_INTERVAL_MS = 60_000;

export interface BinaScheduleConfig {
  enabled: boolean;
  permissionConfirmed: boolean;
  maxListings: number;
  delayMs: number;
  cycleHours: number;
}

export interface SchedulerTickResult {
  enqueued: number;
  skippedActive: number;
  skippedCooldown: number;
  skippedBlocked: number;
  permissionsDisabled: boolean;
}

export interface SchedulerClock {
  now: () => Date;
  setTimeout: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

function finiteInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function readBinaScheduleConfig(env: NodeJS.ProcessEnv): BinaScheduleConfig {
  return {
    enabled: env.BINA_ENABLED === 'true',
    permissionConfirmed: env.BINA_PERMISSION_CONFIRMED === 'true',
    maxListings: Math.min(100, Math.max(1, finiteInteger(env.BINA_MAX_LISTINGS, 100))),
    delayMs: Math.max(10_000, finiteInteger(env.BINA_DELAY_MS, 10_000)),
    cycleHours: Math.max(6, finiteInteger(env.BINA_CYCLE_HOURS, 6)),
  };
}

function elapsedSince(value: string | null, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? now.getTime() - timestamp : Number.POSITIVE_INFINITY;
}

export function runSchedulerTick(repos: Repositories, env: NodeJS.ProcessEnv, now = new Date()): SchedulerTickResult {
  const result: SchedulerTickResult = { enqueued: 0, skippedActive: 0, skippedCooldown: 0, skippedBlocked: 0, permissionsDisabled: false };
  const config = readBinaScheduleConfig(env);
  if (!config.enabled || !config.permissionConfirmed) {
    result.permissionsDisabled = true;
    return result;
  }

  for (const source of repos.sources.list()) {
    if (source.type !== 'bina_agency' || !source.enabled || source.killSwitch) continue;
    if (repos.runs.hasActive(source.id)) {
      result.skippedActive += 1;
      continue;
    }
    const latest = repos.runs.latestTerminal(source.id);
    const elapsed = latest ? elapsedSince(latest.finishedAt, now) : Number.POSITIVE_INFINITY;
    if (latest?.status === 'blocked' && elapsed < BLOCKED_COOLDOWN_MS) {
      result.skippedBlocked += 1;
      continue;
    }
    if (latest?.status === 'completed' && elapsed < config.cycleHours * HOUR_MS) {
      result.skippedCooldown += 1;
      continue;
    }
    repos.runs.enqueue(source.id);
    result.enqueued += 1;
  }
  return result;
}

const systemClock: SchedulerClock = {
  now: () => new Date(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function startBinaScheduler(options: {
  repos: Repositories;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  clock?: SchedulerClock;
}) {
  const clock = options.clock ?? systemClock;
  let timer: unknown;
  let stopped = false;
  options.repos.runs.recoverAbandoned();

  const stop = () => {
    stopped = true;
    if (timer !== undefined) clock.clearTimeout(timer);
  };
  const tick = () => {
    if (stopped || options.signal.aborted) return;
    runSchedulerTick(options.repos, options.env, clock.now());
    if (!stopped && !options.signal.aborted) timer = clock.setTimeout(tick, CHECK_INTERVAL_MS);
  };
  options.signal.addEventListener('abort', stop, { once: true });
  tick();
  const firstTick = Promise.resolve();
  return { firstTick, stop };
}
