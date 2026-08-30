import { t, type Lang } from './i18n';

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

const PROHIBITED_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'];

export function getSafeSourceUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/[\0\r\n\t]/.test(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  for (const scheme of PROHIBITED_SCHEMES) {
    if (lower.startsWith(scheme)) return null;
  }

  if (lower.startsWith('tg:')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'tg:') return trimmed;
    } catch {
      if (/^tg:\/\/[a-zA-Z0-9_?=&/-]+$/i.test(trimmed)) return trimmed;
      return null;
    }
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') return null;
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSourceSupported(domainOrType: string): boolean {
  const clean = (domainOrType || '').toLowerCase();
  if (
    clean === 'stop_az' ||
    clean === 'stop.az' ||
    clean.includes('stop.az') ||
    clean.includes('emlak.az') ||
    clean.includes('evler.az') ||
    clean.includes('kub.az') ||
    clean.includes('mertebe.az') ||
    clean.includes('binalar.az') ||
    clean.includes('binatap.az') ||
    clean.includes('ucuzemlak.az') ||
    clean.includes('menzil.az') ||
    clean.includes('kupca.az') ||
    clean.includes('rahathome.az') ||
    clean.includes('kiraye.az') ||
    clean.includes('dasinmazemlak.az')
  ) {
    return false;
  }
  return true;
}

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

export const WEBSITE_SOURCE_OPTIONS = [
  { value: 'bina_agency', labelKey: 'sourceType.binaAgency', defaultDelaySeconds: 10, defaultLang: 'AZ', placeholder: 'https://bina.az/baki/alqi-satqi/menziller' },
  { value: 'tap_az', labelKey: 'sourceType.tapAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://tap.az/elanlar/dasinmaz-emlak' },
  { value: 'arenda_az', labelKey: 'sourceType.arendaAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://arenda.az/alqi-satqi' },
  { value: 'yeniemlak_az', labelKey: 'sourceType.yeniemlakAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://yeniemlak.az/elan/axtar' },
  { value: 'emlakbazari_az', labelKey: 'sourceType.emlakbazariAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://emlakbazari.az' },
  { value: 'ipoteka_az', labelKey: 'sourceType.ipotekaAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://ipoteka.az' },
  { value: 'city_az', labelKey: 'sourceType.cityAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://city.az' },
  { value: 'vipemlak_az', labelKey: 'sourceType.vipemlakAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://vipemlak.az/elanlar' },
  { value: 'ev10_az', labelKey: 'sourceType.ev10Az', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://ev10.az/alqi-satqi' },
  { value: 'lalafo_az', labelKey: 'sourceType.lalafoAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://lalafo.az/baku/nedvizhimost' },
  { value: 'unvan_az', labelKey: 'sourceType.unvanAz', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://unvan.az/dasinmaz-emlak' },
  { value: 'website', labelKey: 'sourceType.website', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://example.az/...' },
] as const;

export const SOCIAL_SOURCE_OPTIONS = [
  { value: 'instagram_profile', labelKey: 'sourceType.instagramProfile', defaultDelaySeconds: 2, defaultLang: 'mixed', placeholder: 'https://instagram.com/username или @username' },
  { value: 'tiktok_profile', labelKey: 'sourceType.tiktokProfile', defaultDelaySeconds: 2, defaultLang: 'mixed', placeholder: 'https://tiktok.com/@username или @username' },
  { value: 'telegram_channel', labelKey: 'sourceType.telegramChannel', defaultDelaySeconds: 2, defaultLang: 'mixed', placeholder: 'https://t.me/channel или @channel' },
  { value: 'facebook_page', labelKey: 'sourceType.facebookPage', defaultDelaySeconds: 2, defaultLang: 'mixed', placeholder: 'https://facebook.com/page_name' },
] as const;

export const SOURCE_TYPE_OPTIONS = [
  ...WEBSITE_SOURCE_OPTIONS,
  ...SOCIAL_SOURCE_OPTIONS,
  { value: 'google_maps_query', labelKey: 'sourceType.googleMaps', defaultDelaySeconds: 1, defaultLang: 'mixed', placeholder: 'daşınmaz əmlak bakı' },
  { value: 'listing_page', labelKey: 'sourceType.listingPage', defaultDelaySeconds: 1, defaultLang: 'AZ', placeholder: 'https://example.az/listings' },
  { value: 'telegram_group', labelKey: 'sourceType.telegramGroup', defaultDelaySeconds: 2, defaultLang: 'mixed', placeholder: 'https://t.me/group' },
] as const;

export type SourceType = (typeof SOURCE_TYPE_OPTIONS)[number]['value'];

export type FormDefaults = {
  maxPages: number;
  maxDepth: number;
  delayMs: number;
  delaySeconds: number;
  language: string;
  placeholder: string;
};

export function getSourceFormDefaults(type: string): FormDefaults {
  if (type === 'bina_agency') {
    return {
      maxPages: DEFAULT_MAX_ITEMS_PER_RUN,
      maxDepth: 0,
      delayMs: 10_000,
      delaySeconds: 10,
      language: 'AZ',
      placeholder: 'https://bina.az/baki/alqi-satqi/menziller',
    };
  }
  if (
    type === 'tap_az' ||
    type === 'arenda_az' ||
    type === 'yeniemlak_az' ||
    type === 'emlakbazari_az' ||
    type === 'ipoteka_az' ||
    type === 'city_az' ||
    type === 'vipemlak_az' ||
    type === 'ev10_az' ||
    type === 'lalafo_az' ||
    type === 'unvan_az' ||
    type === 'stop_az'
  ) {
    return {
      maxPages: DEFAULT_MAX_ITEMS_PER_RUN,
      maxDepth: 0,
      delayMs: 1_000,
      delaySeconds: 1,
      language: 'AZ',
      placeholder: 'https://...',
    };
  }
  if (
    type === 'instagram_profile' ||
    type === 'tiktok_profile' ||
    type === 'telegram_channel' ||
    type === 'telegram_group' ||
    type === 'facebook_page'
  ) {
    return {
      maxPages: DEFAULT_MAX_ITEMS_PER_RUN,
      maxDepth: 0,
      delayMs: 2_000,
      delaySeconds: 2,
      language: 'mixed',
      placeholder: 'https://t.me/... / @username / поисковая фраза',
    };
  }
  return {
    maxPages: DEFAULT_MAX_ITEMS_PER_RUN,
    maxDepth: 1,
    delayMs: 1_000,
    delaySeconds: 1,
    language: 'AZ',
    placeholder: 'https://...',
  };
}

export function detectClientSourceType(input: string): SourceType | undefined {
  const trimmed = input.trim();
  if (trimmed.startsWith('@') || trimmed.includes('t.me/') || trimmed.includes('telegram.me/')) {
    return 'telegram_channel';
  }
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'bina.az') return 'bina_agency';
    if (host === 'tap.az') return 'tap_az';
    if (host === 'arenda.az') return 'arenda_az';
    if (host === 'yeniemlak.az') return 'yeniemlak_az';
    if (host === 'emlakbazari.az') return 'emlakbazari_az';
    if (host === 'ipoteka.az') return 'ipoteka_az';
    if (host === 'city.az') return 'city_az';
    if (host === 'vipemlak.az') return 'vipemlak_az';
    if (host === 'ev10.az') return 'ev10_az';
    if (host === 'lalafo.az') return 'lalafo_az';
    if (host === 'unvan.az') return 'unvan_az';
    if (host.includes('instagram.com')) return 'instagram_profile';
    if (host.includes('tiktok.com')) return 'tiktok_profile';
    if (host.includes('t.me') || host.includes('telegram.me')) return 'telegram_channel';
    if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.me')) return 'facebook_page';
  } catch {
    // ignore
  }
  return undefined;
}

export function formatDelay(delayMs: number): string {
  if (delayMs >= 1000) {
    const sec = delayMs / 1000;
    return `${sec % 1 === 0 ? sec : sec.toFixed(1)} сек.`;
  }
  return `${delayMs} ms`;
}

export function getSourceTypeLabel(type: string, lang: Lang): string {
  if (type === 'bina_agency') return t(lang, 'sourceType.binaAgency');
  if (type === 'tap_az') return t(lang, 'sourceType.tapAz');
  if (type === 'arenda_az') return t(lang, 'sourceType.arendaAz');
  if (type === 'yeniemlak_az') return t(lang, 'sourceType.yeniemlakAz');
  if (type === 'emlakbazari_az') return t(lang, 'sourceType.emlakbazariAz');
  if (type === 'ipoteka_az') return t(lang, 'sourceType.ipotekaAz');
  if (type === 'city_az') return t(lang, 'sourceType.cityAz');
  if (type === 'vipemlak_az') return t(lang, 'sourceType.vipemlakAz');
  if (type === 'ev10_az') return t(lang, 'sourceType.ev10Az');
  if (type === 'lalafo_az') return t(lang, 'sourceType.lalafoAz');
  if (type === 'unvan_az') return t(lang, 'sourceType.unvanAz');
  if (type === 'stop_az') return t(lang, 'sourceType.stopAz');
  if (type === 'instagram_profile') return t(lang, 'sourceType.instagramProfile');
  if (type === 'tiktok_profile') return t(lang, 'sourceType.tiktokProfile');
  if (type === 'telegram_channel') return t(lang, 'sourceType.telegramChannel');
  if (type === 'telegram_group') return t(lang, 'sourceType.telegramGroup');
  if (type === 'facebook_page') return t(lang, 'sourceType.facebookPage');
  if (type === 'google_maps_query') return t(lang, 'sourceType.googleMaps');
  if (type === 'listing_page') return t(lang, 'sourceType.listingPage');
  if (type === 'website') return t(lang, 'sourceType.website');
  return type;
}

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'whatsapp' | 'telegram';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reauth_required';

export type SearchSurfaceMode =
  | 'name_username'
  | 'bio_about'
  | 'posts_captions'
  | 'comments'
  | 'hashtags'
  | 'geo_keywords'
  | 'agency_name'
  | 'phone_crossmatch';

export type SearchPurpose = 'realtors' | 'leads' | 'both';

export const ALL_SEARCH_SURFACES: { id: SearchSurfaceMode; labelKey: string }[] = [
  { id: 'name_username', labelKey: 'searchMode.nameUsername' },
  { id: 'bio_about', labelKey: 'searchMode.bioAbout' },
  { id: 'posts_captions', labelKey: 'searchMode.postsCaptions' },
  { id: 'comments', labelKey: 'searchMode.comments' },
  { id: 'hashtags', labelKey: 'searchMode.hashtags' },
  { id: 'geo_keywords', labelKey: 'searchMode.geoKeywords' },
  { id: 'agency_name', labelKey: 'searchMode.agencyName' },
  { id: 'phone_crossmatch', labelKey: 'searchMode.phoneCrossmatch' },
];

export function getPlatformSupportedSurfaces(platform: SocialPlatform): SearchSurfaceMode[] {
  switch (platform) {
    case 'instagram':
      return [
        'name_username',
        'bio_about',
        'posts_captions',
        'comments',
        'hashtags',
        'geo_keywords',
        'agency_name',
        'phone_crossmatch',
      ];
    case 'tiktok':
      return [
        'name_username',
        'bio_about',
        'posts_captions',
        'comments',
        'hashtags',
        'geo_keywords',
        'agency_name',
      ];
    case 'facebook':
      return [
        'name_username',
        'bio_about',
        'posts_captions',
        'comments',
        'geo_keywords',
        'agency_name',
        'phone_crossmatch',
      ];
    case 'whatsapp':
      return [
        'name_username',
        'bio_about',
        'posts_captions',
        'comments',
        'phone_crossmatch',
      ];
    case 'telegram':
      return [
        'name_username',
        'bio_about',
        'posts_captions',
        'comments',
        'hashtags',
        'geo_keywords',
        'agency_name',
        'phone_crossmatch',
      ];
  }
}

export function getMaxSafePresetSurfaces(platform: SocialPlatform): SearchSurfaceMode[] {
  switch (platform) {
    case 'instagram':
      return ['name_username', 'bio_about', 'posts_captions', 'comments', 'hashtags', 'geo_keywords', 'agency_name'];
    case 'tiktok':
      return ['name_username', 'bio_about', 'posts_captions', 'comments', 'hashtags', 'geo_keywords'];
    case 'facebook':
      return ['name_username', 'bio_about', 'posts_captions', 'comments', 'geo_keywords', 'agency_name'];
    case 'whatsapp':
      return ['name_username', 'bio_about', 'posts_captions', 'comments'];
    case 'telegram':
      return ['name_username', 'bio_about', 'posts_captions', 'comments', 'hashtags', 'geo_keywords', 'agency_name'];
  }
}

export interface SocialAccountConnection {
  platform: SocialPlatform;
  status: ConnectionStatus;
  accountHandle?: string | undefined;
  accountName?: string | undefined;
  enabledSurfaces: SearchSurfaceMode[];
  purpose: SearchPurpose;
  maxSafePreset: boolean;
  humanAuthRequired?: boolean | undefined;
  humanAuthType?: 'qr' | 'otp' | 'device_confirmation' | 'browser' | undefined;
  humanAuthPrompt?: string | undefined;
  qrCodeData?: string | undefined;
  /** Honest integration classification for this platform (real/architecture_ready/mock/unsupported). */
  integrationStatus?: 'real' | 'architecture_ready' | 'mock' | 'unsupported' | undefined;
  /** OAuth2 authorize URL for provider-supported connect flows (never a fake "connected" shortcut). */
  authorizeUrl?: string | undefined;
  connectedAt?: string | undefined;
  lastScannedAt?: string | undefined;
  errorMessage?: string | undefined;
}

export interface WhatsAppGroupData {
  id: string;
  name: string;
  description?: string | undefined;
  participantCount?: number | undefined;
  lastActivity?: string | undefined;
  status: 'active' | 'inactive';
  authorized: boolean;
  authorizedAt?: string | undefined;
  isRealtorOnlyGroup: boolean;
  searchMode: SearchPurpose;
}

export function isRealtorGroupContext(title: string, description?: string): boolean {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  const isGenericChat =
    combined.includes('elan bazar') ||
    combined.includes('ucuzluq') ||
    combined.includes('alqi satqi her sey') ||
    combined.includes('hər şey') ||
    combined.includes('avto') ||
    combined.includes('telefon') ||
    combined.includes('geyimlər') ||
    combined.includes('baku chat') ||
    combined.includes('sohbet');

  if (isGenericChat && !combined.includes('makler') && !combined.includes('rieltor') && !combined.includes('əmlak agent')) {
    return false;
  }

  return (
    combined.includes('makler') ||
    combined.includes('rieltor') ||
    combined.includes('realtor') ||
    combined.includes('əmlak agent') ||
    combined.includes('emlak agent') ||
    combined.includes('dasinmaz emlak makler') ||
    combined.includes('daşınmaz əmlak makler') ||
    combined.includes('baku real estate agents') ||
    combined.includes('agentlikleri') ||
    combined.includes('agentlikləri')
  );
}
