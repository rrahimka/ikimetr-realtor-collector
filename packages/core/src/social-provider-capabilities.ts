import type { SocialPlatform } from './social-connections';

/**
 * Provider integration classification used by the UI and API to show the truth
 * about each social connection instead of faking a "connected" state.
 *  - real: a working, provider-supported integration path exists (may still
 *    require user-supplied credentials from env, never bundled).
 *  - architecture_ready: the integration is designed and the OAuth/MTProto flow
 *    is implemented, but it cannot be activated without provider app
 *    registration / review / credentials.
 *  - mock: no provider-supported integration; only local fixtures/demo data.
 *  - unsupported: a requested capability is not available from the provider's
 *    official APIs at all (must not be faked).
 */
export type SocialProviderStatus = 'real' | 'architecture_ready' | 'mock' | 'unsupported';

export type ProviderAuthMethod = 'oauth2' | 'mtproto' | 'whatsapp_cloud' | 'scraper' | 'none';

export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Env var names that must be present to complete the OAuth flow. */
  requiredEnv: string[];
  /** PKCE is always used; this documents the supported method. */
  codeChallengeMethod: 'S256';
}

export interface ProviderProfile {
  platform: SocialPlatform;
  displayName: string;
  status: SocialProviderStatus;
  authMethod: ProviderAuthMethod;
  oauth?: OAuthProviderConfig;
  /** Env var names required to activate this provider (credentials, never code). */
  requiredEnv?: string[];
  /** Capabilities that ARE available through the provider's official APIs. */
  supportedCapabilities: string[];
  /** Capabilities that are NOT available from the provider's official APIs. */
  unsupportedCapabilities: string[];
  notes: string;
}

const INSTAGRAM_OAUTH: OAuthProviderConfig = {
  authorizeUrl: 'https://www.instagram.com/oauth/authorize',
  tokenUrl: 'https://api.instagram.com/oauth/access_token',
  scopes: ['instagram_basic'],
  requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  codeChallengeMethod: 'S256',
};

const FACEBOOK_OAUTH: OAuthProviderConfig = {
  authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
  tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
  scopes: ['pages_read_engagement'],
  requiredEnv: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  codeChallengeMethod: 'S256',
};

const TIKTOK_OAUTH: OAuthProviderConfig = {
  authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
  tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
  scopes: ['user.info.basic', 'video.list'],
  requiredEnv: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  codeChallengeMethod: 'S256',
};

export const PROVIDER_REGISTRY: Record<SocialPlatform, ProviderProfile> = {
  instagram: {
    platform: 'instagram',
    displayName: 'Instagram',
    status: 'architecture_ready',
    authMethod: 'oauth2',
    oauth: INSTAGRAM_OAUTH,
    requiredEnv: INSTAGRAM_OAUTH.requiredEnv,
    supportedCapabilities: ['public_profile', 'media_captions', 'comments'],
    unsupportedCapabilities: [
      'private_account_access',
      'following_list_scraping',
      'scrape_without_consent',
    ],
    notes:
      'Instagram Graph API requires a Meta app + business/creator account + App Review. ' +
      'Public-web HTML scraping is not an official integration.',
  },
  facebook: {
    platform: 'facebook',
    displayName: 'Facebook',
    status: 'architecture_ready',
    authMethod: 'oauth2',
    oauth: FACEBOOK_OAUTH,
    requiredEnv: FACEBOOK_OAUTH.requiredEnv,
    supportedCapabilities: ['page_posts', 'page_comments'],
    unsupportedCapabilities: ['private_profile_scraping', 'group_member_enumeration_official'],
    notes:
      'Facebook Graph API requires a Meta app + App Review for most page/group permissions. ' +
      'Group member enumeration via official APIs needs separate review and is not assumed here.',
  },
  tiktok: {
    platform: 'tiktok',
    displayName: 'TikTok',
    status: 'architecture_ready',
    authMethod: 'oauth2',
    oauth: TIKTOK_OAUTH,
    requiredEnv: TIKTOK_OAUTH.requiredEnv,
    supportedCapabilities: ['public_profile', 'videos'],
    unsupportedCapabilities: ['following_list', 'private_account_scraping'],
    notes:
      'TikTok Display API (OAuth) provides public profile + videos. ' +
      'A user’s following list is NOT available via official APIs (Research API requires approval).',
  },
  telegram: {
    platform: 'telegram',
    displayName: 'Telegram',
    status: 'real',
    authMethod: 'mtproto',
    requiredEnv: ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_SESSION_STRING'],
    supportedCapabilities: [
      'channel_scan',
      'supergroup_scan',
      'message_lead_extraction',
    ],
    unsupportedCapabilities: [],
    notes:
      'MTProto (api_id/api_hash/session) is the official Telegram client API. ' +
      'Scan/aggregation logic is implemented; a live session requires user-supplied credentials (never bundled).',
  },
  whatsapp: {
    platform: 'whatsapp',
    displayName: 'WhatsApp',
    status: 'architecture_ready',
    authMethod: 'whatsapp_cloud',
    requiredEnv: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'],
    supportedCapabilities: ['group_message_scan', 'group_participant_scan_via_local_client'],
    unsupportedCapabilities: ['group_member_enumeration_official_api'],
    notes:
      'Official WhatsApp Business Cloud API supports messaging only — it does NOT expose group ' +
      'member lists. Group message/participant scanning requires a connected local client (unofficial). ' +
      'Group member enumeration via official APIs is unsupported and must not be faked.',
  },
};

export function getProviderProfile(platform: SocialPlatform): ProviderProfile {
  return PROVIDER_REGISTRY[platform];
}

export function listProviderProfiles(): ProviderProfile[] {
  return Object.values(PROVIDER_REGISTRY);
}

/** True only when every required env var for the provider is present. */
export function isProviderConfigured(profile: ProviderProfile, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!profile.requiredEnv || profile.requiredEnv.length === 0) return false;
  return profile.requiredEnv.every((key) => typeof env[key] === 'string' && env[key] !== '');
}

export function isCapabilitySupported(platform: SocialPlatform, capability: string): boolean {
  const profile = PROVIDER_REGISTRY[platform];
  return profile.supportedCapabilities.includes(capability) && !profile.unsupportedCapabilities.includes(capability);
}

export function listUnsupportedCapabilities(platform: SocialPlatform): string[] {
  return [...PROVIDER_REGISTRY[platform].unsupportedCapabilities];
}
