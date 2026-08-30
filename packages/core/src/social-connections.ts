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

/**
 * Returns the list of safe, legitimately supported search surfaces for a platform.
 */
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

/**
 * Returns the preset surfaces for "Максимальный безопасный поиск".
 */
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
  /** Server-only: Telegram MTProto session string. Never exposed to frontend. */
  sessionString?: string | undefined;
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

export interface WhatsAppConsentRecord {
  groupId: string;
  groupTitle: string;
  authorizedAt: string;
  scope: 'realtors' | 'leads' | 'both';
  isRealtorOnly: boolean;
  authorizedByUser: boolean;
}

/**
 * Checks whether a WhatsApp group has strong real-estate context.
 * Rejects generic marketplace or chat groups from being classified as realtor-only.
 */
export function isRealtorGroupContext(title: string, description?: string): boolean {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  
  // Negative matches: generic buy/sell / general chat / marketplace
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

  // Strong professional real estate markers
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
