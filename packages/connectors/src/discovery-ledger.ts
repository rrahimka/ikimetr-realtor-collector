import type { DiscoveryCandidateRecord, DiscoveryCandidateStatus } from '@ikimetr/database';

/**
 * Minimal surface the orchestrator needs from the persistence layer. The real
 * implementation is `repos.discovery` (from `@ikimetr/database`), but the
 * orchestrator depends only on this interface so it can be exercised with an
 * in-memory repository in tests.
 */
export interface DiscoveryRepositoryLike {
  upsertCandidate(input: {
    candidateKey: string;
    platform: string;
    strategy: string;
    seed: string;
    title?: string;
    url?: string;
    username?: string;
    relevanceScore?: number;
    relevanceReasons?: string[];
    status?: DiscoveryCandidateStatus;
  }): DiscoveryCandidateRecord | undefined;
  get(candidateKey: string): DiscoveryCandidateRecord | undefined;
  listByStatus(status: DiscoveryCandidateStatus): DiscoveryCandidateRecord[];
  updateStatus(
    candidateKey: string,
    status: DiscoveryCandidateStatus,
    extra?: { error?: string; sourceId?: number; username?: string; url?: string },
  ): DiscoveryCandidateRecord | undefined;
  recordJoin(candidateKey: string, sourceId: number): DiscoveryCandidateRecord | undefined;
  counts(): Record<string, number>;
}

/**
 * Persistent mirror of the in-memory social `DiscoveryLedger`. The orchestrator
 * records discovered sources here so discovery and enrichment share one surface
 * and survive restarts (the social pipeline keeps its own in-memory ledger).
 */
export class PersistentDiscoveryLedger {
  constructor(private readonly repo: DiscoveryRepositoryLike) {}

  async upsert(candidate: {
    candidateKey: string;
    platform: string;
    strategy: string;
    seed: string;
    title?: string;
    url?: string;
    username?: string;
    relevanceScore?: number;
    relevanceReasons?: string[];
    status?: DiscoveryCandidateStatus;
  }): Promise<DiscoveryCandidateRecord | undefined> {
    return await Promise.resolve(this.repo.upsertCandidate(candidate));
  }

  async get(candidateKey: string): Promise<DiscoveryCandidateRecord | undefined> {
    return await Promise.resolve(this.repo.get(candidateKey));
  }

  async listByStatus(status: DiscoveryCandidateStatus): Promise<DiscoveryCandidateRecord[]> {
    return await Promise.resolve(this.repo.listByStatus(status));
  }

  async setStatus(
    candidateKey: string,
    status: DiscoveryCandidateStatus,
    extra?: { error?: string; sourceId?: number; username?: string; url?: string },
  ): Promise<DiscoveryCandidateRecord | undefined> {
    return await Promise.resolve(this.repo.updateStatus(candidateKey, status, extra));
  }

  async markJoined(candidateKey: string, sourceId: number): Promise<DiscoveryCandidateRecord | undefined> {
    return await Promise.resolve(this.repo.recordJoin(candidateKey, sourceId));
  }

  async counts(): Promise<Record<string, number>> {
    return await Promise.resolve(this.repo.counts());
  }
}
