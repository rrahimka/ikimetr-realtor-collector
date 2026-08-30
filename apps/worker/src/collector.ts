import type { createRepositories } from '@ikimetr/database';
import { readBinaScheduleConfig } from './scheduler';

type Repositories = ReturnType<typeof createRepositories>;
type Source = NonNullable<ReturnType<Repositories['sources']['get']>>;

export const DEFAULT_HEARTBEAT_GRACE_MS = 45_000;
export const DEFAULT_CONTINUOUS_REVISIT_MS = 5 * 60 * 1_000;

export function heartbeatGraceMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.HEARTBEAT_GRACE_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : DEFAULT_HEARTBEAT_GRACE_MS;
}

export function continuousRevisitMs(env: NodeJS.ProcessEnv): number {
  const minutes = Number(env.CONTINUOUS_REVISIT_MINUTES);
  const fallback = Number.isFinite(minutes) && minutes > 0 ? Math.trunc(minutes) : 5;
  return fallback * 60 * 1_000;
}

/**
 * A source is eligible for continuous enqueue when it is enabled, not in a kill
 * switch, and passes the same connector-permission gates used by the scheduler.
 * Cadence/active-run guards are handled separately by the tick loop.
 */
export function isSourceEligibleForContinuous(source: Source, env: NodeJS.ProcessEnv): boolean {
  if (source.type === 'bina_agency') {
    const config = readBinaScheduleConfig(env);
    return config.enabled && config.permissionConfirmed;
  }
  if (source.type === 'test_fixture') {
    return env.ALLOW_TEST_CONNECTOR === 'true';
  }
  return true;
}

export interface CollectorTickResult {
  active: boolean;
  stopped?: 'heartbeat_timeout';
  enqueued?: number;
  skippedActive?: number;
  skippedCooldown?: number;
  skippedPermission?: number;
  counters?: ReturnType<Repositories['collectorSessions']['computeCounters']>;
}

/**
 * One continuous-collector tick. Reads the active collector session, verifies its
 * heartbeat is fresh, and enqueues one run per eligible source that is free and
 * has not been revisited too recently. This is the "schedule next work" step of
 * the discover → queue → fetch → parse → normalize → dedupe → persist → repeat
 * loop; the actual fetching/parsing happens in the worker run loop.
 */
export function runCollectorTick(repos: Repositories, env: NodeJS.ProcessEnv, now: Date = new Date()): CollectorTickResult {
  const session = repos.collectorSessions.getActive();
  if (!session) return { active: false };

  if (session.status === 'starting') {
    repos.collectorSessions.setStatus(session.id, 'running');
  }

  const grace = heartbeatGraceMs(env);
  const elapsed = session.lastHeartbeatAt ? now.getTime() - Date.parse(session.lastHeartbeatAt) : Number.POSITIVE_INFINITY;
  if (elapsed > grace) {
    repos.collectorSessions.markStopped(session.id, 'heartbeat_timeout');
    return { active: true, stopped: 'heartbeat_timeout' };
  }

  const revisit = continuousRevisitMs(env);
  let enqueued = 0;
  let skippedActive = 0;
  let skippedCooldown = 0;
  let skippedPermission = 0;
  const activeSourceIds: number[] = [];

  for (const source of repos.sources.list()) {
    if (!source.enabled || source.killSwitch) continue;
    if (!isSourceEligibleForContinuous(source, env)) {
      skippedPermission += 1;
      continue;
    }
    if (repos.runs.hasActive(source.id)) {
      skippedActive += 1;
      activeSourceIds.push(source.id);
      continue;
    }
    const latest = repos.runs.latestTerminal(source.id);
    if (latest?.finishedAt) {
      const since = now.getTime() - Date.parse(latest.finishedAt);
      if (since < revisit) {
        skippedCooldown += 1;
        continue;
      }
    }
    try {
      repos.runs.enqueue(source.id, session.id);
      enqueued += 1;
    } catch {
      skippedActive += 1;
    }
  }

  repos.collectorSessions.setActiveSources(session.id, activeSourceIds);
  const counters = repos.collectorSessions.computeCounters(session.id);
  repos.collectorSessions.setCounters(session.id, counters as unknown as Record<string, number>);

  return {
    active: true,
    enqueued,
    skippedActive,
    skippedCooldown,
    skippedPermission,
    counters,
  };
}
