import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from '@ikimetr/database';
import { runCollectorTick, isSourceEligibleForContinuous } from './collector.js';

let db: CollectorDatabase | undefined;
afterEach(() => db?.close());

function setup(env: NodeJS.ProcessEnv = { ALLOW_TEST_CONNECTOR: 'true' }) {
  db = createDatabase(':memory:');
  const repos = createRepositories(db);
  const website = repos.sources.create({ name: 'Site A', type: 'website', locator: 'https://example.com', language: 'AZ', maxPages: 2, maxDepth: 0, delayMs: 0, enabled: true, killSwitch: false });
  const broken = repos.sources.create({ name: 'Broken', type: 'website', locator: 'https://broken.example', language: 'AZ', maxPages: 1, maxDepth: 0, delayMs: 0, enabled: true, killSwitch: false });
  const disabled = repos.sources.create({ name: 'Disabled', type: 'website', locator: 'https://off.example', language: 'AZ', maxPages: 1, maxDepth: 0, delayMs: 0, enabled: false, killSwitch: false });
  return { repos, env, website, broken, disabled };
}

describe('isSourceEligibleForContinuous', () => {
  it('gates the test fixture behind the explicit connector flag', () => {
    const { repos } = setup();
    const fixture = repos.sources.create({ name: 'Fixture', type: 'test_fixture', locator: 'fixture://contacts', language: 'mixed', maxPages: 1, maxDepth: 0, delayMs: 0, enabled: true, killSwitch: false });
    expect(isSourceEligibleForContinuous(fixture, { ALLOW_TEST_CONNECTOR: 'true' })).toBe(true);
    expect(isSourceEligibleForContinuous(fixture, {})).toBe(false);
  });
});

describe('runCollectorTick — continuous mode', () => {
  it('does nothing without an active session', () => {
    const { repos } = setup();
    expect(runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true' })).toMatchObject({ active: false });
  });

  it('enqueues runs for eligible sources while the session is alive', () => {
    const { repos } = setup();
    const session = repos.collectorSessions.create('web');
    const result = runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true' });
    expect(result.active).toBe(true);
    expect(result.enqueued).toBeGreaterThanOrEqual(2);
    expect(repos.runs.list()).toHaveLength(result.enqueued ?? 0);
    expect(repos.collectorSessions.get(session.id)?.status).toBe('running');
  });

  it('keeps the run alive after a single source batch completes (no premature stop)', () => {
    const { repos } = setup();
    const session = repos.collectorSessions.create('web');
    // First tick enqueues the website source.
    runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true' });
    const run = repos.runs.list()[0]!;
    repos.runs.claimNext();
    repos.runs.finish(run.id, 'completed', { pagesChecked: 1, phonesFound: 1, uniquePhones: 1 }, undefined, { newContacts: 1, duplicates: 0 });
    // The session must still be running and must schedule further work.
    expect(repos.collectorSessions.get(session.id)?.status).toBe('running');
    const counters = repos.collectorSessions.computeCounters(session.id);
    expect(counters.runsCompleted).toBe(1);
    expect(counters.newContacts).toBe(1);
  });

  it('stops the session after a missed heartbeat beyond the grace period', () => {
    const { repos } = setup();
    repos.collectorSessions.create('web');
    // Simulate a stale heartbeat: set last_heartbeat_at far in the past.
    const active = repos.collectorSessions.getActive()!;
    repos.collectorSessions.heartbeat(active.id);
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const row = (db as CollectorDatabase).prepare('UPDATE collector_sessions SET last_heartbeat_at=? WHERE id=?').run(stale.toISOString(), active.id);
    void row;
    const result = runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true', HEARTBEAT_GRACE_MS: '45000' }, new Date());
    expect(result).toMatchObject({ active: true, stopped: 'heartbeat_timeout' });
    expect(repos.collectorSessions.getActive()).toBeUndefined();
  });

  it('does not re-enqueue a source inside its revisit interval (no hammering)', () => {
    const { repos, website } = setup();
    repos.collectorSessions.create('web');
    runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true', CONTINUOUS_REVISIT_MINUTES: '5' });
    expect(repos.runs.hasActive(website.id)).toBe(true);
    // Immediately tick again: the recent enqueue should not spawn a second run.
    const before = repos.runs.list().length;
    runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true', CONTINUOUS_REVISIT_MINUTES: '5' }, new Date());
    expect(repos.runs.list().length).toBe(before);
  });

  it('isolates a failing source and keeps collecting the healthy ones', () => {
    const { repos, website, broken } = setup();
    repos.collectorSessions.create('web');
    // Mark the broken source as having failed recently.
    const brokenRun = repos.runs.enqueue(broken.id);
    repos.runs.claimNext();
    repos.runs.finish(brokenRun.id, 'failed', undefined, 'connector exploded');
    // website has no terminal run yet, so it should still be enqueued.
    runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true' });
    expect(repos.runs.hasActive(website.id)).toBe(true);
    expect(repos.collectorSessions.getActive()?.status).toBe('running');
  });

  it('respects per-source kill switch and disabled state', () => {
    const { repos, disabled } = setup();
    repos.collectorSessions.create('web');
    runCollectorTick(repos, { ALLOW_TEST_CONNECTOR: 'true' });
    expect(repos.runs.hasActive(disabled.id)).toBe(false);
  });
});
