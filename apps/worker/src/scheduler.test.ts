import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from '@ikimetr/database';
import {
  readBinaScheduleConfig,
  readProductionScheduleConfig,
  calculateNextRunTime,
  runSchedulerTick,
  startProductionScheduler,
  startBinaScheduler,
  SCHEDULER_TIMEZONE,
} from './scheduler';

const HOUR = 60 * 60 * 1_000;
const enabledEnv = { BINA_ENABLED: 'true', BINA_PERMISSION_CONFIRMED: 'true' };
let db: CollectorDatabase | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
  vi.useRealTimers();
});

function setup() {
  db = createDatabase(':memory:');
  const repos = createRepositories(db);
  const source = repos.sources.create({
    name: 'Bina.az Agentlik',
    type: 'bina_agency',
    locator: 'https://bina.az/search',
    language: 'AZ',
    maxPages: 100,
    maxDepth: 0,
    delayMs: 10_000,
    enabled: true,
    killSwitch: false,
  });
  return { repos, source };
}

describe('Production & Bina Schedule Config', () => {
  it('parses max listings, delay, and continuous mode', () => {
    expect(readBinaScheduleConfig({
      ...enabledEnv,
      BINA_MAX_LISTINGS: '999',
      BINA_DELAY_MS: '1',
      BINA_CYCLE_HOURS: '0',
    })).toMatchObject({ enabled: true, permissionConfirmed: true, maxListings: 999, delayMs: 10_000, cycleHours: 1 });

    expect(readBinaScheduleConfig({
      ...enabledEnv,
    })).toMatchObject({ enabled: true, permissionConfirmed: true, maxListings: 0, continuous: true });
  });

  it('parses global kill switch and default cycle hours', () => {
    expect(readProductionScheduleConfig({
      GLOBAL_KILL_SWITCH: 'true',
      SCHEDULER_CYCLE_HOURS: '12',
    })).toMatchObject({
      globalKillSwitch: true,
      defaultCycleHours: 12,
      timezone: 'Asia/Baku',
    });
  });
});

describe('calculateNextRunTime', () => {
  it('calculates next run for new source immediately', () => {
    const { source } = setup();
    const now = new Date('2026-08-27T12:00:00.000Z');
    const next = calculateNextRunTime(source, enabledEnv, undefined, now);
    expect(next.toISOString()).toBe(now.toISOString());
  });

  it('calculates next run with cycle cooldown', () => {
    const { source } = setup();
    const mockRun = {
      id: 1,
      sourceId: source.id,
      status: 'completed' as const,
      pagesChecked: 10,
      phonesFound: 5,
      uniquePhones: 5,
      cancellationRequested: false,
      needsReview: false,
      createdAt: '2026-08-27T10:00:00.000Z',
      finishedAt: '2026-08-27T10:30:00.000Z',
    };
    const next = calculateNextRunTime(source, { ...enabledEnv, BINA_CONTINUOUS_MODE: 'false', BINA_CYCLE_HOURS: '6' }, mockRun);
    expect(next.getTime()).toBe(Date.parse('2026-08-27T10:30:00.000Z') + 6 * HOUR);
  });
});

describe('runSchedulerTick', () => {
  it('enqueues the first eligible cycle immediately and never overlaps it', () => {
    const { repos, source } = setup();
    const now = new Date('2026-08-25T00:00:00.000Z');
    expect(runSchedulerTick(repos, enabledEnv, now)).toMatchObject({ enqueued: 1, skippedActive: 0 });
    expect(repos.runs.hasActive(source.id)).toBe(true);
    expect(runSchedulerTick(repos, enabledEnv, now)).toMatchObject({ enqueued: 0, skippedActive: 1 });
  });

  it('respects global kill switch completely', () => {
    const { repos } = setup();
    const result = runSchedulerTick(repos, { ...enabledEnv, GLOBAL_KILL_SWITCH: 'true' }, new Date());
    expect(result.globalKillSwitchActive).toBe(true);
    expect(result.enqueued).toBe(0);
    expect(repos.runs.list()).toHaveLength(0);
  });

  it('respects source-level kill switch while other sources run', () => {
    const { repos, source } = setup();
    const tapSource = repos.sources.create({
      name: 'Tap.az',
      type: 'tap_az',
      locator: 'https://tap.az',
      language: 'AZ',
      maxPages: 10,
      maxDepth: 1,
      delayMs: 1000,
      enabled: true,
      killSwitch: false,
    });
    // Disable source 1 with killSwitch
    repos.sources.update(source.id, { killSwitch: true });

    const result = runSchedulerTick(repos, enabledEnv, new Date());
    expect(result.enqueued).toBe(1);
    expect(repos.runs.hasActive(source.id)).toBe(false);
    expect(repos.runs.hasActive(tapSource.id)).toBe(true);
  });

  it('skips disabled source', () => {
    const { repos, source } = setup();
    repos.sources.update(source.id, { enabled: false });
    const result = runSchedulerTick(repos, enabledEnv, new Date());
    expect(result.enqueued).toBe(0);
    expect(repos.runs.list()).toHaveLength(0);
  });

  it('handles missed run after downtime by enqueuing exactly one run (no storm)', () => {
    const { repos, source } = setup();
    // Simulate past run 3 days ago
    const pastRun = repos.runs.enqueue(source.id);
    repos.runs.claimNext();
    repos.runs.finish(pastRun.id, 'completed');
    db!.prepare('UPDATE runs SET finished_at=? WHERE id=?').run('2026-08-24T00:00:00.000Z', pastRun.id);

    const now = new Date('2026-08-27T00:00:00.000Z');
    const result = runSchedulerTick(repos, { ...enabledEnv, BINA_CONTINUOUS_MODE: 'false', BINA_CYCLE_HOURS: '6' }, now);
    expect(result.enqueued).toBe(1);
    // Exactly 2 runs total (1 past + 1 current), not dozens
    expect(repos.runs.list()).toHaveLength(2);
  });

  it('enqueues next batch immediately in continuous mode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    const { repos, source } = setup();
    runSchedulerTick(repos, { ...enabledEnv, BINA_CONTINUOUS_MODE: 'true' }, new Date());
    const run = repos.runs.claimNext()!;
    repos.runs.finish(run.id, 'completed');

    expect(runSchedulerTick(repos, { ...enabledEnv, BINA_CONTINUOUS_MODE: 'true' }, new Date(Date.now() + 1_000))).toMatchObject({ enqueued: 1 });
    expect(repos.runs.hasActive(source.id)).toBe(true);
  });

  it('waits six hours after a completed cycle in non-continuous mode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    const { repos, source } = setup();
    const scheduledEnv = { ...enabledEnv, BINA_CONTINUOUS_MODE: 'false', BINA_CYCLE_HOURS: '6' };
    runSchedulerTick(repos, scheduledEnv, new Date());
    const run = repos.runs.claimNext()!;
    repos.runs.finish(run.id, 'completed');

    expect(runSchedulerTick(repos, scheduledEnv, new Date(Date.now() + 6 * HOUR - 1))).toMatchObject({ enqueued: 0, skippedCooldown: 1 });
    expect(runSchedulerTick(repos, scheduledEnv, new Date(Date.now() + 6 * HOUR))).toMatchObject({ enqueued: 1 });
    expect(repos.runs.hasActive(source.id)).toBe(true);
  });

  it('applies a 24-hour cooldown after a blocked cycle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    const { repos } = setup();
    const queued = repos.runs.enqueue(repos.sources.list()[0]!.id);
    repos.runs.claimNext();
    repos.runs.finishBina(queued.id, 'blocked', { pagesChecked: 0, phonesFound: 0, uniquePhones: 0 }, 'captcha', { outcomes: {}, newContacts: 0, duplicates: 0 });

    expect(runSchedulerTick(repos, enabledEnv, new Date(Date.now() + 24 * HOUR - 1))).toMatchObject({ enqueued: 0, skippedBlocked: 1 });
    expect(runSchedulerTick(repos, enabledEnv, new Date(Date.now() + 24 * HOUR))).toMatchObject({ enqueued: 1 });
  });

  it('treats a concurrent manual enqueue race as an active-run skip', () => {
    const { repos } = setup();
    vi.spyOn(repos.runs, 'hasActive').mockReturnValue(false);
    vi.spyOn(repos.runs, 'enqueue').mockImplementation(() => { throw new Error('source already has an active run'); });

    expect(runSchedulerTick(repos, enabledEnv, new Date())).toMatchObject({ enqueued: 0, skippedActive: 1 });
  });

  it('does not enqueue when either permission flag is disabled for bina_agency', () => {
    const { repos } = setup();
    expect(runSchedulerTick(repos, { BINA_ENABLED: 'true', BINA_PERMISSION_CONFIRMED: 'false' }, new Date())).toMatchObject({ enqueued: 0, permissionsDisabled: true });
    expect(repos.runs.list()).toHaveLength(0);
  });
});

describe('startProductionScheduler & startBinaScheduler', () => {
  it('recovers an abandoned run and schedules replacement eligibility from SQLite', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    const { repos, source } = setup();
    const abandoned = repos.runs.enqueue(source.id);
    repos.runs.claimNext();
    vi.setSystemTime(new Date('2026-08-25T01:00:00.000Z'));
    const controller = new AbortController();
    const handle = startBinaScheduler({
      repos,
      env: enabledEnv,
      signal: controller.signal,
      clock: { now: () => new Date(), setTimeout: () => 1, clearTimeout: () => undefined },
    });
    await handle.firstTick;
    controller.abort();
    handle.stop();

    expect(repos.runs.get(abandoned.id)).toMatchObject({ status: 'failed', needsReview: true });
    expect(repos.runs.list().filter((run) => run.status === 'queued')).toHaveLength(1);
  });

  it('verifies startProductionScheduler alias is identical to startBinaScheduler', () => {
    expect(startProductionScheduler).toBe(startBinaScheduler);
  });

  it('uses Asia/Baku timezone constant', () => {
    expect(SCHEDULER_TIMEZONE).toBe('Asia/Baku');
  });
});
