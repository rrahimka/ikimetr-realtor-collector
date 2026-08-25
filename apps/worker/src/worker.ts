import { classifyEvidence, extractPhones, normalizePhone } from '@ikimetr/core';
import { BINA_OUTCOMES, type BinaConnectorResult, type BinaStopRequest, type ConnectorResult } from '@ikimetr/connectors';
import type { createRepositories } from '@ikimetr/database';
import type { ConnectorContext } from './connectors';

type Repositories = ReturnType<typeof createRepositories>;
type Source = NonNullable<ReturnType<Repositories['sources']['get']>>;
export type ConnectorRunner = (source: Source, context?: ConnectorContext) => Promise<ConnectorResult>;

function emptyBinaOutcomes(): BinaConnectorResult['outcomes'] {
  return Object.fromEntries(BINA_OUTCOMES.map((outcome) => [outcome, 0])) as BinaConnectorResult['outcomes'];
}

function isBinaResult(source: Source, result: ConnectorResult): result is BinaConnectorResult {
  return source.type === 'bina_agency' && 'outcomes' in result;
}

function stopRequest(repos: Repositories, runId: number, sourceId: number): BinaStopRequest {
  if (repos.runs.shouldCancel(runId)) return 'cancelled';
  const current = repos.sources.get(sourceId);
  if (!current?.enabled || current.killSwitch) return 'kill_switch';
  return false;
}

function finishEarlyBina(repos: Repositories, runId: number, reason: 'cancelled' | 'kill_switch'): void {
  const outcomes = emptyBinaOutcomes();
  outcomes.cancelled = 1;
  repos.runs.finishBina(
    runId,
    'cancelled',
    { pagesChecked: 0, phonesFound: 0, uniquePhones: 0 },
    reason,
    { outcomes, newContacts: 0, duplicates: 0, agenciesFound: 0 },
  );
}

export async function processRun(
  repos: Repositories,
  run: { id: number; sourceId: number },
  connector: ConnectorRunner,
): Promise<void> {
  const source = repos.sources.get(run.sourceId);
  if (!source) throw new Error('source not found');
  if (!source.enabled || source.killSwitch) {
    if (source.type === 'bina_agency') finishEarlyBina(repos, run.id, 'kill_switch');
    else repos.runs.finish(run.id, 'cancelled');
    return;
  }
  if (repos.runs.shouldCancel(run.id)) {
    if (source.type === 'bina_agency') finishEarlyBina(repos, run.id, 'cancelled');
    else repos.runs.finish(run.id, 'cancelled');
    return;
  }

  const recheckSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const result = await connector(source, {
    shouldStop: () => stopRequest(repos, run.id, source.id),
    shouldProcessUrl: (url) => !repos.evidence.wasUrlSeenSince(source.id, url, recheckSince),
  });
  const binaResult = isBinaResult(source, result) ? result : undefined;
  const terminalStop = binaResult?.stopReason;
  if (binaResult && (terminalStop === 'cancelled' || terminalStop === 'kill_switch')) {
    repos.runs.finishBina(
      run.id,
      'cancelled',
      { pagesChecked: result.pagesChecked, phonesFound: 0, uniquePhones: 0 },
      terminalStop,
      { outcomes: binaResult.outcomes, newContacts: 0, duplicates: 0, agenciesFound: 0 },
    );
    return;
  }

  let found = 0;
  let newContacts = 0;
  let duplicates = 0;
  const unique = new Set<string>();
  const agencies = new Set<string>();
  for (const item of result.items) {
    const requestedStop = stopRequest(repos, run.id, source.id);
    if (requestedStop) {
      const counters = { pagesChecked: result.pagesChecked, phonesFound: found, uniquePhones: unique.size };
      if (binaResult) {
        binaResult.outcomes.cancelled += 1;
        repos.runs.finishBina(run.id, 'cancelled', counters, requestedStop, { outcomes: binaResult.outcomes, newContacts, duplicates, agenciesFound: agencies.size });
      } else {
        repos.runs.finish(run.id, 'cancelled', counters);
      }
      return;
    }
    if (item.agency) agencies.add(item.agency);
    const extracted = extractPhones(`${item.rawPhone} ${item.excerpt}`);
    const preferred = normalizePhone(item.rawPhone);
    const phones = preferred.isValid ? [preferred] : extracted;
    for (const phone of phones) {
      if (!phone.isValid || !phone.normalized) continue;
      found += 1;
      unique.add(phone.normalized);
      const existed = Boolean(repos.contacts.byPhone(phone.normalized));
      const classification = classifyEvidence({ text: item.excerpt, occurrenceCount: extracted.length });
      repos.contacts.persistEvidence({
        normalizedPhone: phone.normalized,
        isForeign: phone.isForeign,
        evidence: {
          sourceId: source.id,
          sourceUrl: item.sourceUrl,
          locationType: item.locationType,
          excerpt: item.excerpt,
          rawPhone: phone.raw,
          name: item.name ?? null,
          agency: item.agency ?? null,
          username: item.username ?? null,
          platform: item.platform,
          fingerprint: `${item.fingerprint}-${phone.normalized}`,
        },
        classification,
      });
      if (existed) duplicates += 1;
      else newContacts += 1;
    }
  }

  const counters = { pagesChecked: result.pagesChecked, phonesFound: found, uniquePhones: unique.size };
  if (binaResult) {
    binaResult.outcomes.duplicate += duplicates;
    repos.runs.finishBina(run.id, terminalStop ? 'blocked' : 'completed', counters, terminalStop, { outcomes: binaResult.outcomes, newContacts, duplicates, agenciesFound: agencies.size });
  } else {
    repos.runs.finish(run.id, 'completed', counters);
  }
}

export async function runWorkerOnce(repos: Repositories, connector: ConnectorRunner): Promise<boolean> {
  const run = repos.runs.claimNext();
  if (!run) return false;
  try {
    await processRun(repos, run, connector);
  } catch (error) {
    const source = repos.sources.get(run.sourceId);
    const message = source?.type === 'bina_agency'
      ? 'Bina connector failed'
      : error instanceof Error ? error.message : 'Unknown connector error';
    repos.runs.finish(run.id, 'failed', undefined, message);
  }
  return true;
}

export async function runWorker(options: { repos: Repositories; connector: ConnectorRunner; signal: AbortSignal; pollMs?: number }) {
  options.repos.runs.recoverAbandoned();
  while (!options.signal.aborted) {
    const worked = await runWorkerOnce(options.repos, options.connector);
    if (!worked) await new Promise<void>((resolve) => {
      const id = setTimeout(resolve, options.pollMs ?? 1_000);
      options.signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
    });
  }
}
