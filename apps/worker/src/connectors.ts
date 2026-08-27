import {
  BINA_OUTCOMES,
  crawlArendaAz,
  crawlCityAz,
  crawlEmlakBazariAz,
  crawlEv10Az,
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
}

function permissionDisabledResult(): BinaConnectorResult {
  const outcomes = Object.fromEntries(BINA_OUTCOMES.map((outcome) => [outcome, outcome === 'blocked' ? 1 : 0])) as BinaConnectorResult['outcomes'];
  return { items: [], pagesChecked: 0, estimatedItems: 0, outcomes, stopReason: 'permission_disabled' };
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
        const crawlTg = dependencies.crawlTelegram ?? crawlTelegram;
        const startUrl = source.locator.startsWith('http') ? source.locator : (source.locator.startsWith('@') ? `https://t.me/${source.locator.slice(1)}` : `https://${source.locator}`);
        return crawlTg({
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
