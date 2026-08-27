export type SourceOperationalStatus =
  | 'SUPPORTED_VERIFIED'
  | 'SUPPORTED_DEGRADED'
  | 'CANDIDATE'
  | 'AGGREGATOR'
  | 'PROTECTED'
  | 'UNSUPPORTED'
  | 'DEAD';

export interface SourceDefinition {
  name: string;
  domain: string;
  connectorType: string;
  enabled: boolean;
  supported: boolean;
  liveVerified: boolean;
  classificationSupported: boolean;
  phoneExtractionSupported: boolean;
  discoveryMethod: 'playwright' | 'cheerio_http' | 'sitemap' | 'api' | 'none';
  ratePolicy: { minDelayMs: number; defaultMaxPages: number; maxDepth: number };
  recheckPolicy: { recheckDays: number };
  protectionPolicy: { handlesCloudflare: boolean; handlesCaptcha: boolean; cooldownMinutes: number };
  lastVerifiedAt: string;
  status: SourceOperationalStatus;
  notes?: string;
}

export const CANONICAL_SOURCE_REGISTRY: Record<string, SourceDefinition> = {
  'bina.az': {
    name: 'Bina.az',
    domain: 'bina.az',
    connectorType: 'bina_agency',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'playwright',
    ratePolicy: { minDelayMs: 10_000, defaultMaxPages: 10, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: true, handlesCaptcha: true, cooldownMinutes: 60 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Playwright connector with sitemap discovery and dynamic phone reveal',
  },
  'tap.az': {
    name: 'Tap.az',
    domain: 'tap.az',
    connectorType: 'tap_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Cheerio HTTP connector with seller classification and hotline exclusion',
  },
  'arenda.az': {
    name: 'Arenda.az',
    domain: 'arenda.az',
    connectorType: 'arenda_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Cheerio HTTP connector with seller classification and hotline exclusion',
  },
  'yeniemlak.az': {
    name: 'YeniEmlak.az',
    domain: 'yeniemlak.az',
    connectorType: 'yeniemlak_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Cheerio HTTP connector with seller classification and phone extraction',
  },
  'emlakbazari.az': {
    name: 'EmlakBazari.az',
    domain: 'emlakbazari.az',
    connectorType: 'emlakbazari_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Cheerio HTTP connector with seller classification and hotline exclusion',
  },
  'ipoteka.az': {
    name: 'Ipoteka.az',
    domain: 'ipoteka.az',
    connectorType: 'ipoteka_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Cheerio HTTP connector with seller classification',
  },
  'city.az': {
    name: 'City.az',
    domain: 'city.az',
    connectorType: 'city_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Cheerio HTTP connector with hotline exclusion',
  },
  'stop.az': {
    name: 'Stop.az',
    domain: 'stop.az',
    connectorType: 'stop_az',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 10, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'DEAD',
    notes: 'Domain unreachable / host offline',
  },
  'emlak.az': {
    name: 'Emlak.az',
    domain: 'emlak.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 30 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'PROTECTED',
    notes: 'Cloudflare 403 protection on direct requests',
  },
  'evler.az': {
    name: 'Evler.az',
    domain: 'evler.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 30 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'PROTECTED',
    notes: 'HTTP 403 protection on direct requests',
  },
  'kub.az': {
    name: 'Kub.az',
    domain: 'kub.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'PROTECTED',
    notes: 'Cloudflare challenge protection on listing pages',
  },
  'mertebe.az': {
    name: 'Mertebe.az',
    domain: 'mertebe.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'PROTECTED',
    notes: 'Cloudflare challenge protection on listing pages',
  },
  'binalar.az': {
    name: 'Binalar.az',
    domain: 'binalar.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'AGGREGATOR',
    notes: 'Aggregator portal re-publishing listings',
  },
  'binatap.az': {
    name: 'Binatap.az',
    domain: 'binatap.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'AGGREGATOR',
    notes: 'Aggregator portal re-publishing listings',
  },
  'vipemlak.az': {
    name: 'VIPemlak.az',
    domain: 'vipemlak.az',
    connectorType: 'vipemlak_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-27T01:10:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Cheerio HTTP connector with session-preserved AJAX phone reveal',
  },
  'ev10.az': {
    name: 'Ev10.az',
    domain: 'ev10.az',
    connectorType: 'ev10_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'api',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-27T01:15:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated REST API connector with verified seller classification and hotline exclusion',
  },
  'lalafo.az': {
    name: 'Lalafo.az',
    domain: 'lalafo.az',
    connectorType: 'lalafo_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-27T01:18:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated real estate category connector with pro/agency seller verification',
  },
  'unvan.az': {
    name: 'Unvan.az',
    domain: 'unvan.az',
    connectorType: 'unvan_az',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 1_000, defaultMaxPages: 20, maxDepth: 0 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-27T01:20:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated real estate connector with AJAX phone reveal',
  },
  'instagram.com': {
    name: 'Instagram',
    domain: 'instagram.com',
    connectorType: 'instagram_profile',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 0 },
    recheckPolicy: { recheckDays: 14 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 30 },
    lastVerifiedAt: '2026-08-27T11:00:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated Instagram social connector with public profile & realtor classification',
  },
  'tiktok.com': {
    name: 'TikTok',
    domain: 'tiktok.com',
    connectorType: 'tiktok_profile',
    enabled: true,
    supported: true,
    liveVerified: true,
    classificationSupported: true,
    phoneExtractionSupported: true,
    discoveryMethod: 'cheerio_http',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 0 },
    recheckPolicy: { recheckDays: 14 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 30 },
    lastVerifiedAt: '2026-08-27T11:00:00.000Z',
    status: 'SUPPORTED_VERIFIED',
    notes: 'Dedicated TikTok social connector with public profile & video caption classification',
  },
  'ucuzemlak.az': {
    name: 'UcuzEmlak.az',
    domain: 'ucuzemlak.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'DEAD',
    notes: 'Domain offline / fetch failed',
  },
  'menzil.az': {
    name: 'Menzil.az',
    domain: 'menzil.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'DEAD',
    notes: 'Domain repurposed to website builder service',
  },
  'kupca.az': {
    name: 'Kupca.az',
    domain: 'kupca.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T23:05:00.000Z',
    status: 'DEAD',
    notes: 'Domain parking page',
  },
  'rahathome.az': {
    name: 'RahatHome.az',
    domain: 'rahathome.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'DEAD',
    notes: 'Domain offline / DNS failed',
  },
  'kiraye.az': {
    name: 'Kiraye.az',
    domain: 'kiraye.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'DEAD',
    notes: 'Domain offline / DNS failed',
  },
  'dasinmazemlak.az': {
    name: 'DasinmazEmlak.az',
    domain: 'dasinmazemlak.az',
    connectorType: 'website',
    enabled: false,
    supported: false,
    liveVerified: false,
    classificationSupported: false,
    phoneExtractionSupported: false,
    discoveryMethod: 'none',
    ratePolicy: { minDelayMs: 2_000, defaultMaxPages: 10, maxDepth: 1 },
    recheckPolicy: { recheckDays: 7 },
    protectionPolicy: { handlesCloudflare: false, handlesCaptcha: false, cooldownMinutes: 15 },
    lastVerifiedAt: '2026-08-26T20:15:00.000Z',
    status: 'DEAD',
    notes: 'SSL certificate error (HTTP 526)',
  },
};

export function extractDomainFromLocator(locator: string): string {
  const trimmed = locator.trim();
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return trimmed.toLowerCase().replace(/^www\./, '');
  }
}

export function getSourceDefinition(domainOrType: string): SourceDefinition | undefined {
  const domain = extractDomainFromLocator(domainOrType);
  if (CANONICAL_SOURCE_REGISTRY[domain]) return CANONICAL_SOURCE_REGISTRY[domain];
  for (const def of Object.values(CANONICAL_SOURCE_REGISTRY)) {
    if (def.connectorType === domainOrType) return def;
  }
  return undefined;
}

export function isSourceSupported(domainOrType: string): boolean {
  const def = getSourceDefinition(domainOrType);
  return Boolean(def?.supported);
}

export function getSourceOperationalStatus(domainOrType: string): SourceOperationalStatus {
  const def = getSourceDefinition(domainOrType);
  return def ? def.status : 'UNSUPPORTED';
}

/** Central safe default upper bound of items/pages to inspect per scheduled run */
export const DEFAULT_MAX_ITEMS_PER_RUN = 50;

export type SourceCategory = 'website' | 'social';

export const SOCIAL_SOURCE_TYPES = [
  'instagram_profile',
  'instagram_post',
  'instagram_hashtag',
  'tiktok_profile',
  'tiktok_video',
  'tiktok_hashtag',
  'tiktok_keyword',
  'telegram_channel',
  'telegram_group',
  'facebook_page',
] as const;

/**
 * Determines whether a source type or locator belongs to 'website' or 'social'.
 */
export function getSourceCategory(sourceTypeOrLocator: string): SourceCategory {
  const clean = (sourceTypeOrLocator || '').trim().toLowerCase();
  if (SOCIAL_SOURCE_TYPES.some((st) => st === clean)) return 'social';
  if (
    clean.includes('instagram.com') ||
    clean.includes('tiktok.com') ||
    clean.includes('t.me') ||
    clean.includes('telegram.me') ||
    clean.startsWith('@') ||
    clean.includes('facebook.com') ||
    clean.includes('fb.com') ||
    clean.includes('fb.me')
  ) {
    return 'social';
  }
  return 'website';
}

/**
 * Derives a human-friendly display name for a source automatically.
 */
export function deriveSourceDisplayName(source: {
  name?: string | null | undefined;
  type?: string | null | undefined;
  locator?: string | null | undefined;
}): string {
  const type = source.type || '';
  const locator = (source.locator || '').trim();

  switch (type) {
    case 'bina_agency':
      return 'Bina.az';
    case 'tap_az':
      return 'Tap.az';
    case 'arenda_az':
      return 'Arenda.az';
    case 'yeniemlak_az':
      return 'YeniEmlak.az';
    case 'emlakbazari_az':
      return 'EmlakBazari.az';
    case 'ipoteka_az':
      return 'Ipoteka.az';
    case 'city_az':
      return 'City.az';
    case 'vipemlak_az':
      return 'VIPemlak.az';
    case 'ev10_az':
      return 'Ev10.az';
    case 'lalafo_az':
      return 'Lalafo.az';
    case 'unvan_az':
      return 'Unvan.az';
    case 'stop_az':
      return 'Stop.az';
    case 'telegram_channel':
    case 'telegram_group': {
      let handle = locator;
      if (locator.startsWith('@')) {
        handle = locator;
      } else {
        try {
          const u = new URL(locator.startsWith('http') ? locator : `https://${locator}`);
          const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
          if (parts[0] && parts[0] !== 'c' && parts[0] !== 'joinchat') {
            handle = `@${parts[0]}`;
          }
        } catch {
          // ignore
        }
      }
      if (!handle.startsWith('@') && /^[a-zA-Z0-9_]+$/.test(handle)) {
        handle = `@${handle}`;
      }
      return `Telegram — ${handle || locator || 'Канал'}`;
    }
    case 'instagram_profile':
    case 'instagram_post':
    case 'instagram_hashtag': {
      let handle = locator;
      if (locator.startsWith('@') || locator.startsWith('#')) {
        handle = locator;
      } else {
        try {
          const u = new URL(locator.startsWith('http') ? locator : `https://${locator}`);
          const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
          if (parts[0] === 'explore' && parts[1] === 'tags' && parts[2]) {
            handle = `#${parts[2]}`;
          } else if (parts[0] && parts[0] !== 'p' && parts[0] !== 'reel' && parts[0] !== 'explore') {
            handle = `@${parts[0]}`;
          }
        } catch {
          // ignore
        }
      }
      if (!handle.startsWith('@') && !handle.startsWith('#') && /^[a-zA-Z0-9._]+$/.test(handle)) {
        handle = `@${handle}`;
      }
      return `Instagram — ${handle || locator || 'Профиль'}`;
    }
    case 'tiktok_profile':
    case 'tiktok_video':
    case 'tiktok_hashtag':
    case 'tiktok_keyword': {
      let handle = locator;
      if (locator.startsWith('@') || locator.startsWith('#')) {
        handle = locator;
      } else {
        try {
          const u = new URL(locator.startsWith('http') ? locator : `https://${locator}`);
          const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
          if (parts[0] && parts[0].startsWith('@')) {
            handle = parts[0];
          } else if (parts[0] && parts[0] === 'tag' && parts[1]) {
            handle = `#${parts[1]}`;
          } else if (parts[0]) {
            handle = `@${parts[0]}`;
          }
        } catch {
          // ignore
        }
      }
      if (!handle.startsWith('@') && !handle.startsWith('#') && /^[a-zA-Z0-9._]+$/.test(handle)) {
        handle = `@${handle}`;
      }
      return `TikTok — ${handle || locator || 'Профиль'}`;
    }
    case 'facebook_page': {
      let handle = locator;
      try {
        const u = new URL(locator.startsWith('http') ? locator : `https://${locator}`);
        const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
        if (parts[0] && parts[0] !== 'pages' && parts[0] !== 'groups' && parts[0] !== 'profile.php') {
          handle = parts[0];
        }
      } catch {
        // ignore
      }
      return `Facebook — ${handle || locator || 'Страница'}`;
    }
    case 'google_maps_query':
      return `Google Maps — ${locator || 'Поиск'}`;
    case 'test_fixture':
      return source.name && source.name !== 'test_fixture' ? source.name : 'Тестовый источник';
    default: {
      if (source.name && source.name !== type && source.name !== 'website' && source.name !== 'listing_page') {
        return source.name;
      }
      if (locator) {
        try {
          const u = new URL(locator.startsWith('http') ? locator : `https://${locator}`);
          const host = u.hostname.replace(/^www\./, '');
          if (host) {
            return host.charAt(0).toUpperCase() + host.slice(1);
          }
        } catch {
          // ignore
        }
        return locator;
      }
      return 'Веб-сайт';
    }
  }
}
