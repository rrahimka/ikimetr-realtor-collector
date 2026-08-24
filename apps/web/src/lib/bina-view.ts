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

export function nextBinaRunAt(run: { status: string; finishedAt: string | null | undefined }): string | undefined {
  if (!run.finishedAt || !['completed', 'blocked'].includes(run.status)) return undefined;
  const finished = new Date(run.finishedAt);
  if (Number.isNaN(finished.getTime())) return undefined;
  finished.setUTCHours(finished.getUTCHours() + (run.status === 'blocked' ? 24 : 6));
  return finished.toISOString();
}
