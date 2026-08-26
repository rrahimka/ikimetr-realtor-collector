import {
  BINA_OUTCOMES,
  crawlWebsite,
  runBinaAgencyConnector,
  type BinaConnectorResult,
  type BinaStopRequest,
  type ConnectorResult,
} from '@ikimetr/connectors';
import type { SourceInput } from '@ikimetr/core';
import { readBinaScheduleConfig } from './scheduler';

type Source = SourceInput & { id: number };

export interface ConnectorContext {
  shouldStop: () => BinaStopRequest | Promise<BinaStopRequest>;
  shouldProcessUrl?: (url: string) => boolean | Promise<boolean>;
}

export interface ConnectorDependencies {
  runBina: typeof runBinaAgencyConnector;
  crawlWebsite?: typeof crawlWebsite;
}

function permissionDisabledResult(): BinaConnectorResult {
  const outcomes = Object.fromEntries(BINA_OUTCOMES.map((outcome) => [outcome, outcome === 'blocked' ? 1 : 0])) as BinaConnectorResult['outcomes'];
  return { items: [], pagesChecked: 0, estimatedItems: 0, outcomes, stopReason: 'permission_disabled' };
}

export function createConnectorRunner(
  env: NodeJS.ProcessEnv,
  dependencies: ConnectorDependencies = { runBina: runBinaAgencyConnector, crawlWebsite },
) {
  return async (source: Source, context: ConnectorContext = { shouldStop: () => false }): Promise<ConnectorResult> => {
    if (source.type === 'test_fixture') {
      if (env.ALLOW_TEST_CONNECTOR !== 'true') throw new Error('Test connector is disabled outside tests');
      return { pagesChecked: 1, estimatedItems: 1, items: [{ sourceUrl: 'https://fixture.invalid/realtor', locationType: 'listing', excerpt: 'Bakı əmlakçı. Mənzil satışı və kirayə. Telefon 050 123 45 67', rawPhone: '050 123 45 67', name: 'Aysel Məmmədova', agency: 'Bakı Emlak', platform: 'fixture', fingerprint: 'fixture-contact-0001' }] };
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
      });

    }
    if (source.type === 'website' || source.type === 'listing_page') throw new Error('Generic web connector is disabled in local-only mode');
    if (source.type.startsWith('instagram') && !env.APIFY_TOKEN) throw new Error('Instagram: Не настроено (APIFY_TOKEN)');
    if (source.type.startsWith('tiktok') && !env.APIFY_TOKEN) throw new Error('TikTok: Не настроено (APIFY_TOKEN)');
    if (source.type === 'google_maps_query' && !env.APIFY_TOKEN) throw new Error('Google Maps Apify: Не настроено (APIFY_TOKEN)');
    throw new Error(`Connector configuration unavailable for ${source.type}`);
  };
}
