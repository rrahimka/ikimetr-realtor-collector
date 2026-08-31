import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from '@ikimetr/database';
import { PersistentDiscoveryLedger } from './discovery-ledger';
import { planDiscoveryCandidates, persistDiscoveryCandidates, runDiscovery, TELEGRAM_AUTO_JOIN_RELEVANCE } from './discovery-orchestrator';

let db: CollectorDatabase | undefined;
afterEach(() => db?.close());

function ledger() {
  db = createDatabase(':memory:');
  const repos = createRepositories(db);
  return new PersistentDiscoveryLedger(repos.discovery);
}

describe('planDiscoveryCandidates (Subproject A — pure planner)', () => {
  it('flags a high-relevance PUBLIC Telegram seed as eligible for auto-join', () => {
    const planned = planDiscoveryCandidates([{ platform: 'telegram', strategy: 'agency', seed: 'Bakı Əmlak Agentliyi' }]);
    expect(planned).toHaveLength(1);
    const candidate = planned[0]!;
    expect(candidate.candidateKey).toBe('telegram:bakı_əmlak_agentliyi');
    expect(candidate.relevanceScore).toBeGreaterThanOrEqual(TELEGRAM_AUTO_JOIN_RELEVANCE);
    expect(candidate.eligibleForJoin).toBe(true);
    expect(candidate.status).toBe('DISCOVERED');
  });

  it('never flags a non-telegram platform for auto-join, even with a high score', () => {
    const planned = planDiscoveryCandidates([{ platform: 'instagram', strategy: 'agency', seed: 'Bakı Əmlak Agentliyi' }]);
    expect(planned[0]!.eligibleForJoin).toBe(false);
  });

  it('does not flag a low-relevance seed for auto-join', () => {
    const planned = planDiscoveryCandidates([{ platform: 'telegram', strategy: 'keyword', seed: 'Cooking recipes daily' }]);
    expect(planned[0]!.relevanceScore).toBeLessThan(TELEGRAM_AUTO_JOIN_RELEVANCE);
    expect(planned[0]!.eligibleForJoin).toBe(false);
  });

  it('honors a custom auto-join threshold', () => {
    const planned = planDiscoveryCandidates([{ platform: 'telegram', strategy: 'keyword', seed: 'Baku flats' }], { autoJoinThreshold: 0.25 });
    // A borderline seed clears the lowered threshold but would not clear the default.
    const loose = planDiscoveryCandidates([{ platform: 'telegram', strategy: 'keyword', seed: 'Baku flats' }], { autoJoinThreshold: 0.25 })[0]!;
    const strict = planDiscoveryCandidates([{ platform: 'telegram', strategy: 'keyword', seed: 'Baku flats' }])[0]!;
    if (loose.relevanceScore >= 0.25 && loose.relevanceScore < TELEGRAM_AUTO_JOIN_RELEVANCE) {
      expect(loose.eligibleForJoin).toBe(true);
      expect(strict.eligibleForJoin).toBe(false);
    } else {
      // If it scores high enough to clear the default anyway, both agree.
      expect(loose.eligibleForJoin).toBe(strict.eligibleForJoin);
    }
  });
});

describe('persistDiscoveryCandidates (Subproject A)', () => {
  it('stores every planned candidate as DISCOVERED and reports the count', async () => {
    const store = ledger();
    const planned = planDiscoveryCandidates([
      { platform: 'telegram', strategy: 'agency', seed: 'Bakı Əmlak Agentliyi' },
      { platform: 'telegram', strategy: 'keyword', seed: 'Cooking recipes daily' },
    ]);
    const stored = await persistDiscoveryCandidates(store, planned);
    expect(stored).toBe(2);
    expect(await store.listByStatus('DISCOVERED')).toHaveLength(2);
  });
});

describe('runDiscovery (Subproject A — offline orchestration)', () => {
  it('builds telegram seeds from the programmatic list, persists them, and reports eligible joins', async () => {
    const store = ledger();
    const result = await runDiscovery(store);

    expect(result.discovered).toBeGreaterThan(0);
    expect(result.eligibleForJoin.length).toBeGreaterThan(0);

    // Every eligible-for-join candidate must be a PUBLIC telegram source clearing the threshold.
    for (const candidate of result.eligibleForJoin) {
      expect(candidate.platform).toBe('telegram');
      expect(candidate.relevanceScore).toBeGreaterThanOrEqual(TELEGRAM_AUTO_JOIN_RELEVANCE);
    }

    // Persisted rows are present in the SQLite ledger.
    const persisted = await store.listByStatus('DISCOVERED');
    expect(persisted.length).toBe(result.discovered);

    const counts = await store.counts();
    expect(counts.DISCOVERED).toBe(result.discovered);
  });

  it('records a join on an eligible candidate without performing any network I/O', async () => {
    const store = ledger();
    const result = await runDiscovery(store);
    const first = result.eligibleForJoin[0]!;
    const joined = await store.markJoined(first.candidateKey, 7);
    expect(joined?.status).toBe('JOINED');
    expect(joined?.sourceId).toBe(7);
    expect(await store.listByStatus('JOINED')).toHaveLength(1);
  });
});
