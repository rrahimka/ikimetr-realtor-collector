import {
  BINA_OUTCOMES,
  crawlArendaAz,
  crawlCityAz,
  crawlEmlakBazariAz,
  crawlEv10Az,
  crawlFacebook,
  crawlInstagram,
  crawlIpotekaAz,
  crawlLalafoAz,
  crawlStopAz,
  crawlTapAz,
  crawlTelegram,
  crawlTikTok,
  crawlUnvanAz,
  crawlVipEmlakAz,
  crawlWebsite,
  crawlYeniEmlakAz,
  runBinaAgencyConnector,
  restoreTelegramClient,
  resolveAndEnsureTelegramSource,
  isTelegramFloodWaitError,
  type ResolvedTelegramSource,
  fetchTelegramAuthorizedMessages,
  scanResultToConnectorResult,
  type BinaConnectorResult,
  type BinaOutcome,
  type BinaStopRequest,
  type ConnectorResult,
  type ExplicitBinaSellerType,
} from '@ikimetr/connectors';
import { detectSourceTypeFromUrl, type SourceInput } from '@ikimetr/core';
import { readBinaScheduleConfig } from './scheduler';

type Source = SourceInput & { id: number };

export interface ConnectorContext {
  shouldStop: () => BinaStopRequest | Promise<BinaStopRequest>;
  shouldProcessUrl?: (url: string) => boolean | Promise<boolean>;
  onListingChecked?: (
    url: string,
    details: { outcome: BinaOutcome; sellerType?: ExplicitBinaSellerType; phone?: string; fingerprint?: string },
  ) => void | Promise<void>;
  checkpoint?: { lastCheckpointId: string } | undefined;
}

export interface ConnectorDependencies {
  runBina: typeof runBinaAgencyConnector;
  crawlWebsite?: typeof crawlWebsite;
  crawlTap?: typeof crawlTapAz;
  crawlArenda?: typeof crawlArendaAz;
  crawlStop?: typeof crawlStopAz;
  crawlYeniEmlak?: typeof crawlYeniEmlakAz;
  crawlEmlakBazari?: typeof crawlEmlakBazariAz;
  crawlIpoteka?: typeof crawlIpotekaAz;
  crawlCity?: typeof crawlCityAz;
  crawlVipEmlak?: typeof crawlVipEmlakAz;
  crawlEv10?: typeof crawlEv10Az;
  crawlLalafo?: typeof crawlLalafoAz;
  crawlUnvan?: typeof crawlUnvanAz;
  crawlInstagram?: typeof crawlInstagram;
  crawlTikTok?: typeof crawlTikTok;
  crawlTelegram?: typeof crawlTelegram;
  crawlFacebook?: typeof crawlFacebook;
}

function permissionDisabledResult(): BinaConnectorResult {
  const outcomes = Object.fromEntries(BINA_OUTCOMES.map((outcome) => [outcome, outcome === 'blocked' ? 1 : 0])) as BinaConnectorResult['outcomes'];
  return { items: [], pagesChecked: 0, estimatedItems: 0, outcomes, stopReason: 'permission_disabled' };
}

/** Upper bound on messages requested per run — keeps Telegram load bounded. */
const TELEGRAM_MAX_MESSAGES_PER_RUN = 100;

/** Capped retries for transient Telegram failures; FloodWait is not retried. */
const TELEGRAM_MAX_ATTEMPTS = 2;

/**
 * Authorized MTProto connector for Telegram channels/supergroups.
 *
 * Restores the encrypted persisted session, resolves ONLY the configured source
 * with a single targeted entity lookup (no dialog enumeration), fetches messages
 * newer than the persisted checkpoint, and processes them through the existing
 * lead/evidence extraction pipeline.
 *
 * Never prints apiHash, sessionString, OTP, or 2FA passwords, and never
 * initiates interactive authentication — the worker only consumes an
 * already-authenticated session.
 */
async function crawlTelegramAuthorizedMTProto(
  locator: string,
  sourceId: number,
  env: NodeJS.ProcessEnv,
  limit = 50,
  checkpoint?: { lastCheckpointId: string },
): Promise<ConnectorResult> {
  const restoreResult = await restoreTelegramClient(env);
  if (!restoreResult) {
    throw new Error('telegram_credentials_not_configured');
  }

  if (!restoreResult.authenticated) {
    await restoreResult.client.disconnect();
    throw new Error('telegram_not_authenticated');
  }

  const parsedCheckpoint = checkpoint?.lastCheckpointId ? Number(checkpoint.lastCheckpointId) : NaN;
  const minId = Number.isSafeInteger(parsedCheckpoint) && parsedCheckpoint > 0 ? parsedCheckpoint : undefined;
  const boundedLimit = Math.min(Math.max(limit, 1), TELEGRAM_MAX_MESSAGES_PER_RUN);

  try {
    // Resolve (and, when policy allows, auto-join) the configured source with a
    // single targeted lookup — unrelated chats in the account are never
    // enumerated, resolved or read. A PUBLIC channel the account has not joined
    // is auto-joined here; a PRIVATE/invite-only source returns needs_approval.
    let sourceEntity: ResolvedTelegramSource | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
      try {
        const ensured = await resolveAndEnsureTelegramSource(restoreResult.client, locator, {
          autoJoinPublic: true,
        });
        if (ensured.verdict === 'needs_approval') {
          throw new Error('telegram_source_requires_approval');
        }
        if (ensured.verdict === 'rejected' || ensured.verdict === 'blocked' || !ensured.source) {
          throw new Error('telegram_dialog_not_found');
        }
        sourceEntity = ensured.source;
        break;
      } catch (error) {
        lastError = error;
        const floodWait = isTelegramFloodWaitError(error);
        if (!floodWait) break; // Never retry a FloodWait immediately.
        if (attempt === TELEGRAM_MAX_ATTEMPTS) break;
        // Honour Telegram's requested wait, capped so a worker tick cannot hang.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, Math.min(floodWait.seconds, 30) * 1_000);
        });
      }
    }

    if (!sourceEntity) {
      const floodWait = isTelegramFloodWaitError(lastError);
      if (floodWait) throw new Error(`telegram_flood_wait_${floodWait.seconds}s`);
      throw lastError instanceof Error ? lastError : new Error('telegram_fetch_failed');
    }

    for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
      try {
        const { scanResult, highestMessageId } = await fetchTelegramAuthorizedMessages(restoreResult.client, {
          chatId: sourceEntity.id,
          limit: boundedLimit,
          ...(sourceId != null ? { sourceId } : {}),
          ...(minId != null ? { minId } : {}),
        });

        const result = scanResultToConnectorResult(scanResult);
        if (highestMessageId > 0 && highestMessageId !== minId) {
          result.checkpointId = String(highestMessageId);
        }
        return result;
      } catch (error) {
        lastError = error;
        const floodWait = isTelegramFloodWaitError(error);
        if (!floodWait) break; // Never retry a FloodWait immediately.
        if (attempt === TELEGRAM_MAX_ATTEMPTS) break;
        // Honour Telegram's requested wait, capped so a worker tick cannot hang.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, Math.min(floodWait.seconds, 30) * 1_000);
        });
      }
    }

    const floodWait = isTelegramFloodWaitError(lastError);
    if (floodWait) throw new Error(`telegram_flood_wait_${floodWait.seconds}s`);
    throw lastError instanceof Error ? lastError : new Error('telegram_fetch_failed');
  } finally {
    await restoreResult.client.disconnect();
  }
}

export function createConnectorRunner(
  env: NodeJS.ProcessEnv,
  dependencies: ConnectorDependencies = {
    runBina: runBinaAgencyConnector,
    crawlWebsite,
    crawlTap: crawlTapAz,
    crawlArenda: crawlArendaAz,
    crawlStop: crawlStopAz,
    crawlYeniEmlak: crawlYeniEmlakAz,
    crawlEmlakBazari: crawlEmlakBazariAz,
    crawlIpoteka: crawlIpotekaAz,
    crawlCity: crawlCityAz,
    crawlVipEmlak: crawlVipEmlakAz,
    crawlEv10: crawlEv10Az,
    crawlLalafo: crawlLalafoAz,
    crawlUnvan: crawlUnvanAz,
  },
) {
  return async (source: Source, context: ConnectorContext = { shouldStop: () => false }): Promise<ConnectorResult> => {
    if (source.type === 'test_fixture') {
      if (env.ALLOW_TEST_CONNECTOR !== 'true') throw new Error('Test connector is disabled outside tests');
      return {
        pagesChecked: 1,
        estimatedItems: 1,
        items: [
          {
            sourceUrl: 'https://fixture.invalid/realtor',
            locationType: 'listing',
            excerpt: 'Bakı əmlakçı. Mənzil satışı və kirayə. Telefon 050 123 45 67',
            rawPhone: '050 123 45 67',
            name: 'Aysel Məmmədova',
            agency: 'Bakı Emlak',
            platform: 'fixture',
            fingerprint: 'fixture-contact-0001',
          },
        ],
      };
    }

    if (source.type === 'telegram_channel' || source.type === 'telegram_group') {
      return crawlTelegramAuthorizedMTProto(source.locator, source.id, env, source.maxPages > 0 ? source.maxPages : 50, context.checkpoint);
    }

    if (source.type === 'bina_agency') {
      const config = readBinaScheduleConfig(env);
      const permission = () => {
        const current = readBinaScheduleConfig(env);
        return current.enabled && current.permissionConfirmed;
      };
      if (!permission()) return permissionDisabledResult();
      let effectiveMaxListings = 0;

      if (config.maxListings > 0 && source.maxPages > 0) {
        effectiveMaxListings = Math.min(config.maxListings, source.maxPages);
      } else if (config.maxListings > 0) {
        effectiveMaxListings = config.maxListings;
      } else if (source.maxPages > 0) {
        effectiveMaxListings = source.maxPages;
      }
      return dependencies.runBina({
        startUrl: source.locator,
        maxListings: effectiveMaxListings,
        delayMs: Math.max(config.delayMs, source.delayMs),
        permission,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        ...(context.onListingChecked ? { onListingChecked: context.onListingChecked } : {}),
      });
    }

    if (source.type === 'tap_az') {
      const crawlTap = dependencies.crawlTap ?? crawlTapAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlTap({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'arenda_az') {
      const crawlArenda = dependencies.crawlArenda ?? crawlArendaAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlArenda({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'yeniemlak_az') {
      const crawlYeniEmlak = dependencies.crawlYeniEmlak ?? crawlYeniEmlakAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlYeniEmlak({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'emlakbazari_az') {
      const crawlEmlakBazari = dependencies.crawlEmlakBazari ?? crawlEmlakBazariAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlEmlakBazari({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'ipoteka_az') {
      const crawlIpoteka = dependencies.crawlIpoteka ?? crawlIpotekaAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlIpoteka({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'city_az') {
      const crawlCity = dependencies.crawlCity ?? crawlCityAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlCity({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'vipemlak_az') {
      const crawlVipEmlak = dependencies.crawlVipEmlak ?? crawlVipEmlakAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlVipEmlak({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'ev10_az') {
      const crawlEv10 = dependencies.crawlEv10 ?? crawlEv10Az;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlEv10({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'lalafo_az') {
      const crawlLalafo = dependencies.crawlLalafo ?? crawlLalafoAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlLalafo({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'unvan_az') {
      const crawlUnvan = dependencies.crawlUnvan ?? crawlUnvanAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlUnvan({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'instagram_profile' || source.type === 'instagram_post' || source.type === 'instagram_hashtag') {
      const crawlInsta = dependencies.crawlInstagram ?? crawlInstagram;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlInsta({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 10,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'tiktok_profile' || source.type === 'tiktok_video' || source.type === 'tiktok_hashtag' || source.type === 'tiktok_keyword') {
      const crawlTk = dependencies.crawlTikTok ?? crawlTikTok;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlTk({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 10,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    if (source.type === 'stop_az') {
      const crawlStop = dependencies.crawlStop ?? crawlStopAz;
      const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
      return crawlStop({
        startUrl,
        maxPages: source.maxPages > 0 ? source.maxPages : 20,
        maxDepth: source.maxDepth,
        delayMs: source.delayMs,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }

    // Auto-route legacy 'website' or 'listing_page' sources to their dedicated connector if locator matches
    if (source.type === 'website' || source.type === 'listing_page') {
      const detected = detectSourceTypeFromUrl(source.locator);
      if (detected === 'tap_az') {
        const crawlTap = dependencies.crawlTap ?? crawlTapAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlTap({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'arenda_az') {
        const crawlArenda = dependencies.crawlArenda ?? crawlArendaAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlArenda({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'yeniemlak_az') {
        const crawlYeniEmlak = dependencies.crawlYeniEmlak ?? crawlYeniEmlakAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlYeniEmlak({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'emlakbazari_az') {
        const crawlEmlakBazari = dependencies.crawlEmlakBazari ?? crawlEmlakBazariAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlEmlakBazari({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'ipoteka_az') {
        const crawlIpoteka = dependencies.crawlIpoteka ?? crawlIpotekaAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlIpoteka({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'city_az') {
        const crawlCity = dependencies.crawlCity ?? crawlCityAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlCity({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'vipemlak_az') {
        const crawlVipEmlak = dependencies.crawlVipEmlak ?? crawlVipEmlakAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlVipEmlak({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'ev10_az') {
        const crawlEv10 = dependencies.crawlEv10 ?? crawlEv10Az;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlEv10({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'lalafo_az') {
        const crawlLalafo = dependencies.crawlLalafo ?? crawlLalafoAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlLalafo({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'unvan_az') {
        const crawlUnvan = dependencies.crawlUnvan ?? crawlUnvanAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlUnvan({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'stop_az') {
        const crawlStop = dependencies.crawlStop ?? crawlStopAz;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlStop({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 20,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'instagram_profile' || detected === 'instagram_post' || detected === 'instagram_hashtag') {
        const crawlInsta = dependencies.crawlInstagram ?? crawlInstagram;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlInsta({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 10,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'tiktok_profile' || detected === 'tiktok_video' || detected === 'tiktok_hashtag' || detected === 'tiktok_keyword') {
        const crawlTk = dependencies.crawlTikTok ?? crawlTikTok;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlTk({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 10,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      if (detected === 'telegram_channel' || detected === 'telegram_group' || (source.type as string) === 'telegram_channel' || (source.type as string) === 'telegram_group') {
        return crawlTelegramAuthorizedMTProto(source.locator, source.id, env, source.maxPages > 0 ? source.maxPages : 50, context.checkpoint);
      }
      if (detected === 'facebook_page' || (source.type as string) === 'facebook_page') {
        const crawlFb = dependencies.crawlFacebook ?? crawlFacebook;
        const startUrl = source.locator.startsWith('http') ? source.locator : `https://${source.locator}`;
        return crawlFb({
          startUrl,
          maxPages: source.maxPages > 0 ? source.maxPages : 10,
          maxDepth: source.maxDepth,
          delayMs: source.delayMs,
          shouldStop: context.shouldStop,
          ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
        });
      }
      throw new Error(`Generic web connector is disabled in local-only mode: ${source.locator} is not a supported specialized source`);
    }

    if (source.type === 'google_maps_query' && !env.APIFY_TOKEN) throw new Error('Google Maps Apify: Не настроено (APIFY_TOKEN)');
    throw new Error(`Connector configuration unavailable for ${source.type}`);
  };
}
