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
}

function permissionDisabledResult(): BinaConnectorResult {
  const outcomes = Object.fromEntries(BINA_OUTCOMES.map((outcome) => [outcome, outcome === 'blocked' ? 1 : 0])) as BinaConnectorResult['outcomes'];
  return { items: [], pagesChecked: 0, estimatedItems: 0, outcomes, stopReason: 'permission_disabled' };
}

export function createConnectorRunner(
  env: NodeJS.ProcessEnv,
  dependencies: ConnectorDependencies = { runBina: runBinaAgencyConnector },
) {
  return async (source: Source, context: ConnectorContext = { shouldStop: () => false }): Promise<ConnectorResult> => {
    if (source.type === 'test_fixture') {
      if (env.ALLOW_TEST_CONNECTOR !== 'true') throw new Error('Test connector is disabled outside tests');
      return { pagesChecked: 1, estimatedItems: 1, items: [{ sourceUrl: 'https://fixture.invalid/realtor', locationType: 'listing', excerpt: 'Bakı əmlakçı. Mənzil satışı və kirayə. Telefon 050 123 45 67', rawPhone: '050 123 45 67', name: 'Aysel Məmmədova', agency: 'Bakı Emlak', platform: 'fixture', fingerprint: 'fixture-contact-0001' }] };
    }
    if (source.type === 'bina_agency') {
      const config = readBinaScheduleConfig(env);
      const permission = () => config.enabled && config.permissionConfirmed;
      if (!permission()) return permissionDisabledResult();
      return dependencies.runBina({
        startUrl: source.locator,
        maxListings: Math.min(config.maxListings, Math.max(1, source.maxPages)),
        delayMs: Math.max(config.delayMs, source.delayMs),
        permission,
        shouldStop: context.shouldStop,
        ...(context.shouldProcessUrl ? { shouldProcessUrl: context.shouldProcessUrl } : {}),
      });
    }
    if (source.type === 'website' || source.type === 'listing_page') return crawlWebsite({ startUrl: source.locator, maxPages: source.maxPages, maxDepth: source.maxDepth, delayMs: source.delayMs });
    if (source.type.startsWith('instagram') && !env.APIFY_TOKEN) throw new Error('Instagram: Не настроено (APIFY_TOKEN)');
    if (source.type.startsWith('tiktok') && !env.APIFY_TOKEN) throw new Error('TikTok: Не настроено (APIFY_TOKEN)');
    if (source.type === 'google_maps_query' && !env.APIFY_TOKEN) throw new Error('Google Maps Apify: Не настроено (APIFY_TOKEN)');
    throw new Error(`Connector configuration unavailable for ${source.type}`);
  };
}
