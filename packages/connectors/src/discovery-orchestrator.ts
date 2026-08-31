import { generateProgrammaticSeeds } from './social-scale';
import { scoreTelegramChannelRelevance, TELEGRAM_AUTO_JOIN_RELEVANCE } from './telegram-discovery';
import { PersistentDiscoveryLedger } from './discovery-ledger';

export { TELEGRAM_AUTO_JOIN_RELEVANCE };

export type RelevanceScorer = (title: string, about?: string, memberCount?: number) => { score: number; reasons: string[] };

export interface DiscoverySeed {
  platform: string;
  strategy: string;
  seed: string;
}

export interface PlannedCandidate {
  candidateKey: string;
  platform: string;
  strategy: string;
  seed: string;
  title: string;
  relevanceScore: number;
  relevanceReasons: string[];
  /** A PUBLIC Telegram candidate whose score clears the auto-join threshold. */
  eligibleForJoin: boolean;
  status: 'DISCOVERED';
}

export interface PlanDiscoveryOptions {
  scorer?: RelevanceScorer;
  autoJoinThreshold?: number;
  /** Maps a seed to its public url/username when known (e.g. `t.me/<handle>`). */
  resolveUrl?: (seed: DiscoverySeed) => string | undefined;
}

function candidateKeyFor(seed: DiscoverySeed): string {
  return `${seed.platform}:${seed.seed.toLowerCase().replace(/\s+/g, '_')}`;
}

/**
 * Pure planning step: turn discovery seeds into scored, persistable candidates.
 * No I/O, no network. Telegram seeds whose relevance clears the threshold are
 * flagged `eligibleForJoin` so the worker can later resolve+auto-join them.
 */
export function planDiscoveryCandidates(seeds: DiscoverySeed[], opts: PlanDiscoveryOptions = {}): PlannedCandidate[] {
  const scorer = opts.scorer ?? scoreTelegramChannelRelevance;
  const threshold = opts.autoJoinThreshold ?? TELEGRAM_AUTO_JOIN_RELEVANCE;

  return seeds.map((seed) => {
    const { score, reasons } = scorer(seed.seed, '');
    const candidateKey = candidateKeyFor(seed);
    const eligibleForJoin = seed.platform === 'telegram' && score >= threshold;
    return {
      candidateKey,
      platform: seed.platform,
      strategy: seed.strategy,
      seed: seed.seed,
      title: seed.seed,
      relevanceScore: score,
      relevanceReasons: reasons,
      eligibleForJoin,
      status: 'DISCOVERED' as const,
    };
  });
}

/** Persists planned candidates as `DISCOVERED`. Returns the number of unique candidates stored. */
export async function persistDiscoveryCandidates(
  ledger: PersistentDiscoveryLedger,
  candidates: PlannedCandidate[],
): Promise<number> {
  const seen = new Set<string>();
  let stored = 0;
  for (const candidate of candidates) {
    // The programmatic seed list can repeat a query under different strategies;
    // the ledger keys on candidate_key, so we persist each unique key once.
    if (seen.has(candidate.candidateKey)) continue;
    seen.add(candidate.candidateKey);
    const saved = await ledger.upsert({
      candidateKey: candidate.candidateKey,
      platform: candidate.platform,
      strategy: candidate.strategy,
      seed: candidate.seed,
      title: candidate.title,
      relevanceScore: candidate.relevanceScore,
      relevanceReasons: candidate.relevanceReasons,
      status: 'DISCOVERED',
    });
    if (saved) stored += 1;
  }
  return stored;
}

export interface RunDiscoveryOptions extends PlanDiscoveryOptions {
  seeds?: DiscoverySeed[];
  /** When true, only Telegram-platform seeds are produced from the programmatic list. */
  telegramOnly?: boolean;
}

/**
 * End-to-end (still offline) discovery: build seeds, score, persist, and report
 * which PUBLIC Telegram candidates are eligible for auto-join. The worker is
 * responsible for the actual network resolution of `eligibleForJoin` candidates.
 */
export async function runDiscovery(
  ledger: PersistentDiscoveryLedger,
  opts: RunDiscoveryOptions = {},
): Promise<{ discovered: number; eligibleForJoin: PlannedCandidate[] }> {
  const programmatic = generateProgrammaticSeeds().map((s) => ({
    platform: 'telegram',
    strategy: s.strategy,
    seed: s.query,
  }));
  const seeds = opts.seeds ?? (opts.telegramOnly === false ? programmatic : programmatic);
  const planned = planDiscoveryCandidates(seeds, opts);
  const discovered = await persistDiscoveryCandidates(ledger, planned);
  // De-duplicate eligible joins by candidate_key so the worker never tries to
  // resolve+join the same source twice.
  const eligibleForJoin = Array.from(
    new Map(planned.filter((c) => c.eligibleForJoin).map((c) => [c.candidateKey, c])).values(),
  );
  return { discovered, eligibleForJoin };
}
