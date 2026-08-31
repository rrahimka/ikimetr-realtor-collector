import { classifyEvidence, extractPhones, normalizePhone } from '@ikimetr/core';
import {
  BINA_OUTCOMES,
  type BinaConnectorResult,
  type BinaOutcome,
  type BinaStopRequest,
  type ConnectorResult,
  type ExplicitBinaSellerType,
} from '@ikimetr/connectors';
import type { createRepositories } from '@ikimetr/database';
import type { ConnectorContext } from './connectors';
import { runCollectorTick } from './collector';

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

  const onListingChecked = (
    url: string,
    details: { outcome: BinaOutcome; sellerType?: ExplicitBinaSellerType; phone?: string; fingerprint?: string },
  ) => {
    if (source.type !== 'bina_agency' || !repos.binaListings) return;
    const statusMap: Record<BinaOutcome, 'checked' | 'skipped_owner' | 'failed' | 'removed' | undefined> = {
      accepted: 'checked',
      private_seller: 'skipped_owner',
      page_removed: 'removed',
      missing_phone: 'failed',
      invalid_phone: 'failed',
      parse_error: 'failed',
      duplicate: 'checked',
      blocked: undefined,
      cancelled: undefined,
    };
    const status = statusMap[details.outcome];
    if (status) {
      repos.binaListings.markChecked(source.id, url, {
        sellerType: details.sellerType ?? 'unknown',
        phone: details.phone ?? null,
        fingerprint: details.fingerprint ?? null,
        status,
      });
    }
  };

  const recheckSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const isTelegramSource = source.type === 'telegram_channel' || source.type === 'telegram_group';
  const checkpoint = isTelegramSource ? repos.checkpoints.get(source.id) : undefined;
  const result = await connector(source, {
    shouldStop: () => stopRequest(repos, run.id, source.id),
    shouldProcessUrl: (url) => !repos.evidence.wasUrlSeenSince(source.id, url, recheckSince) && !repos.binaListings?.wasUrlCheckedRecently(source.id, url, recheckSince),
    onListingChecked,
    checkpoint: checkpoint ? { lastCheckpointId: checkpoint.lastCheckpointId } : undefined,
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

  // Persist client leads (buyer / seller / realtor_request) produced by
  // authorized social connectors. repos.leads.create dedupes by phone or by
  // platform+username+leadType, so repeated runs do not duplicate leads.
  for (const lead of result.leads ?? []) {
    if (stopRequest(repos, run.id, source.id)) break;
    try {
      repos.leads.create(lead);
    } catch {
      // A single malformed lead must not abort the whole run.
    }
  }

  for (const item of result.items) {
    const requestedStop = stopRequest(repos, run.id, source.id);
    if (requestedStop) {
      const counters = { pagesChecked: result.pagesChecked, phonesFound: found, uniquePhones: unique.size };
      if (binaResult) {
        binaResult.outcomes.cancelled += 1;
        repos.runs.finishBina(run.id, 'cancelled', counters, requestedStop, { outcomes: binaResult.outcomes, newContacts, duplicates, agenciesFound: agencies.size });
      } else {
        repos.runs.finish(run.id, 'cancelled', counters, undefined, { newContacts, duplicates });
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
      const existingContact = repos.contacts.byPhone(phone.normalized);
      const existed = Boolean(existingContact);
      const isApprovedWhatsAppGroup = item.platform === 'whatsapp' && item.whatsappContext?.approved === true;
      const isRealtorOnlyWhatsApp = isApprovedWhatsAppGroup && item.whatsappContext?.realtorOnly === true;
      const classification = classifyEvidence({
        text: item.excerpt,
        occurrenceCount: extracted.length,
        explicitSellerType: item.explicitSellerType,
        platform: item.platform,
        sourceType: source.type,
        sourceUrl: item.sourceUrl,
        rawPhone: phone.raw,
        normalizedPhone: phone.normalized,
        isForeign: phone.isForeign,
        isRealtorOnlyWhatsAppGroup: isRealtorOnlyWhatsApp,
        alreadyVerifiedInDb: existingContact?.verificationStatus === 'verified',
      });
      const saved = repos.contacts.persistEvidence({
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
          explicitSellerType: item.explicitSellerType,
        },
        classification,
      });
      if (source.type === 'bina_agency') {
        repos.binaListings?.markChecked(source.id, item.sourceUrl, {
          sellerType: item.explicitSellerType ?? 'agent',
          phone: phone.normalized,
          fingerprint: item.fingerprint,
          status: 'checked',
        });
      }
      if (saved) {
        if (existed) duplicates += 1;
        else newContacts += 1;
      }
    }
  }


  const counters = { pagesChecked: result.pagesChecked, phonesFound: found, uniquePhones: unique.size };
  if (binaResult) {
    binaResult.outcomes.duplicate += duplicates;
    repos.runs.finishBina(run.id, terminalStop ? 'blocked' : 'completed', counters, terminalStop, { outcomes: binaResult.outcomes, newContacts, duplicates, agenciesFound: agencies.size });
  } else {
    repos.runs.finish(run.id, 'completed', counters, undefined, { newContacts, duplicates });
  }

  // Advance the Telegram checkpoint only after the run has been persisted
  // successfully, and only from the connector-reported highest message id
  // (not parsed out of evidence URLs, which is empty when nothing matched).
  if (isTelegramSource && result.checkpointId) {
    const previous = checkpoint?.lastCheckpointId ? Number(checkpoint.lastCheckpointId) : 0;
    const next = Number(result.checkpointId);
    if (Number.isSafeInteger(next) && next > 0 && next > previous) {
      repos.checkpoints.save(source.id, 'telegram_mtproto', String(next), result.items.length);
    }
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
    try {
      runCollectorTick(options.repos, process.env, new Date());
    } catch {
      // A collector-tick failure must never kill the worker loop.
    }
    if (!worked) await new Promise<void>((resolve) => {
      const id = setTimeout(resolve, options.pollMs ?? 1_000);
      options.signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
    });
  }
}
