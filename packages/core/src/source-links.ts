/**
 * Safe URL validation and source link resolution for Lead Intelligence.
 */

const PROHIBITED_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'];

export interface LeadSourceLike {
  sourcePlatform: string;
  sourceSurface?: string | null | undefined;
  sourceUrl?: string | null | undefined;
  username?: string | null | undefined;
  displayName?: string | null | undefined;
}

/**
 * Validates and normalizes an external source URL.
 * Only allows safe protocols: https:, http:, and tg:.
 * Strictly rejects javascript:, data:, file:, malformed URLs, and null-byte injection.
 * Strips embedded user credentials.
 */
export function getSafeSourceUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Prohibit null bytes or control characters
  if (/[\0\r\n\t]/.test(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  for (const scheme of PROHIBITED_SCHEMES) {
    if (lower.startsWith(scheme)) return null;
  }

  // Handle tg: protocol
  if (lower.startsWith('tg:')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'tg:') {
        return trimmed;
      }
    } catch {
      // Some tg: URLs might not parse with new URL if invalid
      if (/^tg:\/\/[a-zA-Z0-9_?=&/-]+$/i.test(trimmed)) {
        return trimmed;
      }
      return null;
    }
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') {
      return null;
    }

    // Strip credentials
    parsed.username = '';
    parsed.password = '';

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Formats platform name for compact UI display.
 */
export function formatPlatformDisplay(platform: string | null | undefined): string {
  if (!platform) return 'unknown';
  const clean = platform.trim().toLowerCase();
  switch (clean) {
    case 'telegram':
    case 'telegram_channel':
    case 'telegram_group':
      return 'telegram';
    case 'instagram':
    case 'instagram_profile':
    case 'instagram_post':
    case 'instagram_hashtag':
      return 'instagram';
    case 'tiktok':
    case 'tiktok_profile':
    case 'tiktok_video':
    case 'tiktok_hashtag':
      return 'tiktok';
    case 'facebook':
    case 'facebook_page':
      return 'facebook';
    case 'bina':
    case 'bina.az':
    case 'bina_agency':
      return 'bina.az';
    case 'tap':
    case 'tap.az':
    case 'tap_az':
      return 'tap.az';
    case 'arenda':
    case 'arenda.az':
    case 'arenda_az':
      return 'arenda.az';
    case 'stop':
    case 'stop.az':
    case 'stop_az':
      return 'stop.az';
    case 'yeniemlak':
    case 'yeniemlak.az':
    case 'yeniemlak_az':
      return 'yeniemlak.az';
    case 'emlakbazari':
    case 'emlakbazari.az':
    case 'emlakbazari_az':
      return 'emlakbazari.az';
    case 'ipoteka':
    case 'ipoteka.az':
    case 'ipoteka_az':
      return 'ipoteka.az';
    case 'city':
    case 'city.az':
    case 'city_az':
      return 'city.az';
    case 'vipemlak':
    case 'vipemlak.az':
    case 'vipemlak_az':
      return 'vipemlak.az';
    case 'ev10':
    case 'ev10.az':
    case 'ev10_az':
      return 'ev10.az';
    case 'lalafo':
    case 'lalafo.az':
    case 'lalafo_az':
      return 'lalafo.az';
    case 'unvan':
    case 'unvan.az':
    case 'unvan_az':
      return 'unvan.az';
    case 'google_maps':
    case 'google_maps_query':
      return 'google_maps';
    case 'website':
    case 'listing_page':
      return 'website';
    default:
      return clean;
  }
}

/**
 * Returns human-readable platform title (e.g. Telegram, Instagram, Bina.az).
 */
export function getPlatformTitle(platform: string | null | undefined): string {
  const display = formatPlatformDisplay(platform);
  switch (display) {
    case 'telegram':
      return 'Telegram';
    case 'instagram':
      return 'Instagram';
    case 'tiktok':
      return 'TikTok';
    case 'facebook':
      return 'Facebook';
    case 'bina.az':
      return 'Bina.az';
    case 'tap.az':
      return 'Tap.az';
    case 'arenda.az':
      return 'Arenda.az';
    case 'stop.az':
      return 'Stop.az';
    case 'yeniemlak.az':
      return 'YeniEmlak.az';
    case 'emlakbazari.az':
      return 'EmlakBazari.az';
    case 'ipoteka.az':
      return 'Ipoteka.az';
    case 'city.az':
      return 'City.az';
    case 'vipemlak.az':
      return 'VIPemlak.az';
    case 'ev10.az':
      return 'Ev10.az';
    case 'lalafo.az':
      return 'Lalafo.az';
    case 'unvan.az':
      return 'Unvan.az';
    case 'google_maps':
      return 'Google Maps';
    case 'website':
      return 'Веб-сайт';
    default:
      return display.charAt(0).toUpperCase() + display.slice(1);
  }
}

export interface LeadSourceContext {
  platformTitle: string;
  channelOrProfileLabel: string;
  channelOrProfileValue: string | null;
  surface: string;
  safeUrl: string | null;
}

/**
 * Extracts structured source context (platform, channel/profile/page, surface, safeUrl).
 */
export function getLeadSourceContext(lead: LeadSourceLike): LeadSourceContext {
  const platform = formatPlatformDisplay(lead.sourcePlatform);
  const platformTitle = getPlatformTitle(lead.sourcePlatform);
  const surface = lead.sourceSurface || 'message_text';
  const safeUrl = getSafeSourceUrl(lead.sourceUrl);

  let channelOrProfileLabel = 'Группа/канал/профиль';
  let channelOrProfileValue: string | null = null;

  if (platform === 'telegram') {
    channelOrProfileLabel = 'Группа/канал';
    if (safeUrl) {
      try {
        const u = new URL(safeUrl);
        const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
        if (parts[0] && parts[0] !== 'c' && parts[0] !== 'joinchat') {
          channelOrProfileValue = parts[0];
        }
      } catch {
        // ignore
      }
    }
    if (!channelOrProfileValue && lead.username) {
      channelOrProfileValue = `@${lead.username.replace(/^@/, '')}`;
    } else if (!channelOrProfileValue && lead.displayName) {
      channelOrProfileValue = lead.displayName;
    }
  } else if (platform === 'instagram') {
    channelOrProfileLabel = 'Профиль/страница';
    if (lead.username) {
      channelOrProfileValue = `@${lead.username.replace(/^@/, '')}`;
    } else if (lead.displayName) {
      channelOrProfileValue = lead.displayName;
    } else if (safeUrl) {
      try {
        const u = new URL(safeUrl);
        const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
        if (parts[0] && parts[0] !== 'p' && parts[0] !== 'reel' && parts[0] !== 'explore') {
          channelOrProfileValue = `@${parts[0]}`;
        }
      } catch {
        // ignore
      }
    }
  } else if (platform === 'tiktok') {
    channelOrProfileLabel = 'Профиль/страница';
    if (lead.username) {
      channelOrProfileValue = `@${lead.username.replace(/^@/, '')}`;
    } else if (lead.displayName) {
      channelOrProfileValue = lead.displayName;
    }
  } else if (platform === 'facebook') {
    channelOrProfileLabel = 'Профиль/страница';
    if (lead.displayName) {
      channelOrProfileValue = lead.displayName;
    } else if (lead.username) {
      channelOrProfileValue = `@${lead.username.replace(/^@/, '')}`;
    }
  } else {
    channelOrProfileLabel = 'Страница / источник';
    if (lead.displayName) {
      channelOrProfileValue = lead.displayName;
    } else if (lead.username) {
      channelOrProfileValue = lead.username;
    } else if (safeUrl) {
      try {
        const u = new URL(safeUrl);
        channelOrProfileValue = u.pathname && u.pathname !== '/' ? u.pathname : u.hostname;
      } catch {
        // ignore
      }
    }
  }

  return {
    platformTitle,
    channelOrProfileLabel,
    channelOrProfileValue,
    surface,
    safeUrl,
  };
}

/**
 * Generates hover tooltip content for a lead's source cell.
 */
export function getLeadSourceTooltip(lead: LeadSourceLike): string {
  const ctx = getLeadSourceContext(lead);
  const lines: string[] = [`Источник: ${ctx.platformTitle}`];

  if (ctx.channelOrProfileValue) {
    lines.push(`${ctx.channelOrProfileLabel}: ${ctx.channelOrProfileValue}`);
  }

  lines.push(`Поверхность: ${ctx.surface}`);

  if (ctx.safeUrl) {
    lines.push('Открыть оригинал');
  }

  return lines.join('\n');
}

/**
 * Resolves the most specific valid source URL for a lead.
 * Follows priority:
 * 1. Specific message / comment / reply URL
 * 2. Specific post / video / listing URL
 * 3. Profile / page URL
 * 4. Group / channel URL
 * 5. Website listing / source URL
 * Returns null if no valid source URL is persisted (never fabricates URLs).
 */
export function resolveLeadSourceUrl(lead: {
  sourceUrl?: string | null | undefined;
  sourcePlatform?: string | null | undefined;
  username?: string | null | undefined;
}): string | null {
  return getSafeSourceUrl(lead.sourceUrl);
}
