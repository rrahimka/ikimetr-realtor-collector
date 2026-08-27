import type { createRepositories } from '@ikimetr/database';

type Repositories = ReturnType<typeof createRepositories>;
type Source = NonNullable<ReturnType<Repositories['sources']['get']>>;
type Run = NonNullable<ReturnType<Repositories['runs']['get']>>;

export const HOUR_MS = 60 * 60 * 1_000;
export const BLOCKED_COOLDOWN_MS = 24 * HOUR_MS;
export const CHECK_INTERVAL_MS = 60_000;
export const SCHEDULER_TIMEZONE = 'Asia/Baku';

export interface BinaScheduleConfig {
  enabled: boolean;
  permissionConfirmed: boolean;
  maxListings: number;
  delayMs: number;
  cycleHours: number;
  continuous: boolean;
}

export interface ProductionScheduleConfig {
  globalKillSwitch: boolean;
  defaultCycleHours: number;
  timezone: string;
  bina: BinaScheduleConfig;
}

export interface SchedulerTickResult {
  enqueued: number;
  skippedActive: number;
  skippedCooldown: number;
  skippedBlocked: number;
  permissionsDisabled: boolean;
  globalKillSwitchActive?: boolean;
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
  const maxListingsRaw = env.BINA_MAX_LISTINGS;
  const parsedMax = Number(maxListingsRaw);
  const maxListings = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.trunc(parsedMax) : 0;
  const continuous = env.BINA_CONTINUOUS_MODE === 'false' ? false : (maxListings === 0 || env.BINA_CONTINUOUS_MODE === 'true');
  return {
    enabled: env.BINA_ENABLED === 'true',
    permissionConfirmed: env.BINA_PERMISSION_CONFIRMED === 'true',
    maxListings,
    delayMs: Math.max(10_000, finiteInteger(env.BINA_DELAY_MS, 10_000)),
    cycleHours: Math.max(1, finiteInteger(env.BINA_CYCLE_HOURS, 6)),
    continuous,
  };
}

export function readProductionScheduleConfig(env: NodeJS.ProcessEnv): ProductionScheduleConfig {
  const globalKillSwitch = env.GLOBAL_KILL_SWITCH === 'true' || env.KILL_SWITCH === 'true';
  const defaultCycleHours = Math.max(1, finiteInteger(env.SCHEDULER_CYCLE_HOURS, 6));
  return {
    globalKillSwitch,
    defaultCycleHours,
    timezone: SCHEDULER_TIMEZONE,
    bina: readBinaScheduleConfig(env),
  };
}

export function elapsedSince(value: string | null, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? now.getTime() - timestamp : Number.POSITIVE_INFINITY;
}

/**
 * Calculates the exact next scheduled execution time for a given source.
 */
export function calculateNextRunTime(
  source: Source,
  env: NodeJS.ProcessEnv,
  latestTerminal?: { finishedAt?: string | null; status?: string } | Run | null,
  now = new Date()
): Date {
  const config = readProductionScheduleConfig(env);
  if (!latestTerminal || !latestTerminal.finishedAt) {
    return now;
  }

  const finishedTimestamp = Date.parse(latestTerminal.finishedAt);
  if (!Number.isFinite(finishedTimestamp)) {
    return now;
  }

  if (latestTerminal.status === 'blocked') {
    return new Date(finishedTimestamp + BLOCKED_COOLDOWN_MS);
  }

  if (source.type === 'bina_agency') {
    if (config.bina.continuous) {
      return new Date(finishedTimestamp);
    }
    return new Date(finishedTimestamp + config.bina.cycleHours * HOUR_MS);
  }

  return new Date(finishedTimestamp + config.defaultCycleHours * HOUR_MS);
}

export function runSchedulerTick(repos: Repositories, env: NodeJS.ProcessEnv, now = new Date()): SchedulerTickResult {
  const result: SchedulerTickResult = {
    enqueued: 0,
    skippedActive: 0,
    skippedCooldown: 0,
    skippedBlocked: 0,
    permissionsDisabled: false,
    globalKillSwitchActive: false,
  };

  const config = readProductionScheduleConfig(env);
  if (config.globalKillSwitch) {
    result.globalKillSwitchActive = true;
    return result;
  }

  for (const source of repos.sources.list()) {
    // 1. Check Source Enable / Disable and Source Kill Switch
    if (!source.enabled || source.killSwitch) continue;

    // 2. Connector Permission Gates
    if (source.type === 'bina_agency') {
      if (!config.bina.enabled || !config.bina.permissionConfirmed) {
        result.permissionsDisabled = true;
        continue;
      }
    } else if (source.type === 'test_fixture') {
      if (env.ALLOW_TEST_CONNECTOR !== 'true') {
        continue;
      }
    }

    // 3. Overlapping-run prevention
    if (repos.runs.hasActive(source.id)) {
      result.skippedActive += 1;
      continue;
    }

    // 4. Cadence & Cooldown
    const latest = repos.runs.latestTerminal(source.id);
    const elapsed = latest ? elapsedSince(latest.finishedAt, now) : Number.POSITIVE_INFINITY;

    if (latest?.status === 'blocked' && elapsed < BLOCKED_COOLDOWN_MS) {
      result.skippedBlocked += 1;
      continue;
    }

    if (source.type === 'bina_agency') {
      if (!config.bina.continuous) {
        if ((latest?.status === 'completed' || (latest?.status === 'failed' && !latest.needsReview)) && elapsed < config.bina.cycleHours * HOUR_MS) {
          result.skippedCooldown += 1;
          continue;
        }
      }
    } else {
      const cycleHours = config.defaultCycleHours;
      if ((latest?.status === 'completed' || (latest?.status === 'failed' && !latest.needsReview)) && elapsed < cycleHours * HOUR_MS) {
        result.skippedCooldown += 1;
        continue;
      }
    }

    // 5. Enqueue exactly one run (Missed-Run policy: 1 run maximum, no run storms)
    try {
      repos.runs.enqueue(source.id);
      result.enqueued += 1;
    } catch (error) {
      if (error instanceof Error && error.message === 'source already has an active run') {
        result.skippedActive += 1;
        continue;
      }
      throw error;
    }
  }

  return result;
}

const systemClock: SchedulerClock = {
  now: () => new Date(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function startProductionScheduler(options: {
  repos: Repositories;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  clock?: SchedulerClock;
}) {
  const clock = options.clock ?? systemClock;
  let timer: unknown;
  let stopped = false;

  // Restart recovery: recover any abandoned running runs
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

// Backward-compatible alias
export const startBinaScheduler = startProductionScheduler;
