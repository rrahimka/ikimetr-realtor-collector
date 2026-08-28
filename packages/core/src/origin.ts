export type OriginGroup = 'website' | 'social' | 'whatsapp';

export interface ResolveOriginInput {
  platform?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  locator?: string | null;
}

export function resolveOriginGroup(
  platformOrOpts?: string | null | ResolveOriginInput,
  sourceType?: string | null,
  sourceUrl?: string | null,
  locator?: string | null,
): OriginGroup {
  const isObj = typeof platformOrOpts === 'object' && platformOrOpts !== null;
  const platform = isObj ? platformOrOpts.platform : platformOrOpts;
  const st = isObj ? platformOrOpts.sourceType : sourceType;
  const url = isObj ? platformOrOpts.sourceUrl : sourceUrl;
  const loc = isObj ? platformOrOpts.locator : locator;

  const p = (platform || '').toLowerCase();
  const stLower = (st || '').toLowerCase();
  const fullUrl = (url || loc || '').toLowerCase();

  if (
    stLower === 'whatsapp_group' ||
    stLower === 'social_whatsapp' ||
    p === 'whatsapp' ||
    fullUrl.includes('whatsapp.com') ||
    fullUrl.includes('chat.whatsapp.com')
  ) {
    return 'whatsapp';
  }

  if (
    stLower.startsWith('instagram') ||
    stLower.startsWith('tiktok') ||
    stLower.startsWith('facebook') ||
    stLower.startsWith('telegram') ||
    stLower === 'social_instagram' ||
    stLower === 'social_tiktok' ||
    stLower === 'social_facebook' ||
    p === 'instagram' ||
    p === 'tiktok' ||
    p === 'facebook' ||
    p === 'telegram' ||
    fullUrl.includes('instagram.com') ||
    fullUrl.includes('tiktok.com') ||
    fullUrl.includes('facebook.com') ||
    fullUrl.includes('t.me') ||
    fullUrl.includes('telegram.me')
  ) {
    return 'social';
  }

  return 'website';
}
