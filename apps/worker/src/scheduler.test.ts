import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from '@ikimetr/database';
import { readBinaScheduleConfig, runSchedulerTick, startBinaScheduler } from './scheduler';

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

describe('readBinaScheduleConfig', () => {
  it('hard-clamps max listings, delay, and cycle interval', () => {
    expect(readBinaScheduleConfig({
      ...enabledEnv,
      BINA_MAX_LISTINGS: '999',
      BINA_DELAY_MS: '1',
      BINA_CYCLE_HOURS: '1',
    })).toMatchObject({ enabled: true, permissionConfirmed: true, maxListings: 100, delayMs: 10_000, cycleHours: 6 });
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

  it('waits six hours after a completed cycle and becomes eligible from SQLite time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    const { repos, source } = setup();
    runSchedulerTick(repos, enabledEnv, new Date());
    const run = repos.runs.claimNext()!;
    repos.runs.finish(run.id, 'completed');

    expect(runSchedulerTick(repos, enabledEnv, new Date(Date.now() + 6 * HOUR - 1))).toMatchObject({ enqueued: 0, skippedCooldown: 1 });
    expect(runSchedulerTick(repos, enabledEnv, new Date(Date.now() + 6 * HOUR))).toMatchObject({ enqueued: 1 });
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

  it('applies the normal cooldown after an unexpected failed cycle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    const { repos, source } = setup();
    const queued = repos.runs.enqueue(source.id);
    repos.runs.claimNext();
    repos.runs.finish(queued.id, 'failed', undefined, 'Bina connector failed');

    expect(runSchedulerTick(repos, enabledEnv, new Date(Date.now() + 6 * HOUR - 1))).toMatchObject({ enqueued: 0, skippedCooldown: 1 });
    expect(runSchedulerTick(repos, enabledEnv, new Date(Date.now() + 6 * HOUR))).toMatchObject({ enqueued: 1 });
  });

  it('treats a concurrent manual enqueue race as an active-run skip', () => {
    const { repos } = setup();
    vi.spyOn(repos.runs, 'hasActive').mockReturnValue(false);
    vi.spyOn(repos.runs, 'enqueue').mockImplementation(() => { throw new Error('source already has an active run'); });

    expect(runSchedulerTick(repos, enabledEnv, new Date())).toMatchObject({ enqueued: 0, skippedActive: 1 });
  });

  it('does not enqueue when either permission flag is disabled', () => {
    const { repos } = setup();
    expect(runSchedulerTick(repos, { BINA_ENABLED: 'true', BINA_PERMISSION_CONFIRMED: 'false' }, new Date())).toMatchObject({ enqueued: 0, permissionsDisabled: true });
    expect(repos.runs.list()).toHaveLength(0);
  });
});

describe('startBinaScheduler', () => {
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
});
