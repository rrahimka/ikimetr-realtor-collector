import {
  BINA_OUTCOMES,
  crawlArendaAz,
  crawlStopAz,
  crawlTapAz,
  crawlWebsite,
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
      throw new Error(`Generic web connector is disabled in local-only mode: ${source.locator} is not a supported specialized source`);
    }

    if (source.type.startsWith('instagram') && !env.APIFY_TOKEN) throw new Error('Instagram: Не настроено (APIFY_TOKEN)');
    if (source.type.startsWith('tiktok') && !env.APIFY_TOKEN) throw new Error('TikTok: Не настроено (APIFY_TOKEN)');
    if (source.type === 'google_maps_query' && !env.APIFY_TOKEN) throw new Error('Google Maps Apify: Не настроено (APIFY_TOKEN)');
    throw new Error(`Connector configuration unavailable for ${source.type}`);
  };
}
