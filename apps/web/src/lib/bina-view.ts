export type BinaSummary = {
  accepted: number;
  duplicates: number;
  privateSellers: number;
  blocked: number;
  cancelled: number;
  newContacts: number;
  agenciesFound: number;
};

function counter(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function readBinaSummary(details: unknown): BinaSummary {
  const root = details && typeof details === 'object' ? details as Record<string, unknown> : {};
  const outcomes = root.outcomes && typeof root.outcomes === 'object' ? root.outcomes as Record<string, unknown> : {};
  return {
    accepted: counter(outcomes.accepted),
    duplicates: counter(root.duplicates),
    privateSellers: counter(outcomes.private_seller),
    blocked: counter(outcomes.blocked),
    cancelled: counter(outcomes.cancelled),
    newContacts: counter(root.newContacts),
    agenciesFound: counter(root.agenciesFound),
  };
}

export function readBinaCycleHours(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 6;
}

export function isContinuousBinaMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const max = Number(env.BINA_MAX_LISTINGS);
  return env.BINA_CONTINUOUS_MODE === 'false' ? false : (!Number.isFinite(max) || max <= 0 || env.BINA_CONTINUOUS_MODE === 'true');
}

export function nextBinaRunAt(
  run: { status: string; finishedAt: string | null | undefined; needsReview?: boolean },
  cycleHours = 6,
  continuous = false,
): string | undefined {
  if (!run.finishedAt || !['completed', 'blocked', 'failed'].includes(run.status)) return undefined;
  const finished = new Date(run.finishedAt);
  if (Number.isNaN(finished.getTime())) return undefined;
  if (run.status === 'failed' && run.needsReview) return finished.toISOString();
  if (run.status === 'blocked') {
    finished.setUTCHours(finished.getUTCHours() + 24);
    return finished.toISOString();
  }
  if (continuous) {
    return new Date(Date.now() + 60_000).toISOString();
  }
  finished.setUTCHours(finished.getUTCHours() + Math.max(1, Math.trunc(cycleHours)));
  return finished.toISOString();
}
