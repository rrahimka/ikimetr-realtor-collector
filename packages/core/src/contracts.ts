import { z } from 'zod';

export const SOURCE_TYPES = [
  'website',
  'listing_page',
  'google_maps_query',
  'instagram_profile',
  'instagram_post',
  'instagram_hashtag',
  'tiktok_profile',
  'tiktok_video',
  'tiktok_hashtag',
  'tiktok_keyword',
  'bina_agency',
  'tap_az',
  'arenda_az',
  'stop_az',
  'yeniemlak_az',
  'emlakbazari_az',
  'ipoteka_az',
  'city_az',
  'vipemlak_az',
  'ev10_az',
  'lalafo_az',
  'unvan_az',
  'telegram_channel',
  'telegram_group',
  'facebook_page',
  'test_fixture',
] as const;

export function detectSourceTypeFromUrl(input: string): SourceType {
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
    if (host === 'stop.az') return 'stop_az';
    if (host === 'yeniemlak.az') return 'yeniemlak_az';
    if (host === 'emlakbazari.az') return 'emlakbazari_az';
    if (host === 'ipoteka.az') return 'ipoteka_az';
    if (host === 'city.az') return 'city_az';
    if (host === 'vipemlak.az') return 'vipemlak_az';
    if (host === 'ev10.az') return 'ev10_az';
    if (host === 'lalafo.az') return 'lalafo_az';
    if (host === 'unvan.az') return 'unvan_az';
    if (host.includes('instagram.com')) {
      if (url.pathname.includes('/p/') || url.pathname.includes('/reel/')) return 'instagram_post';
      if (url.pathname.includes('/explore/tags/')) return 'instagram_hashtag';
      return 'instagram_profile';
    }
    if (host.includes('tiktok.com')) {
      if (url.pathname.includes('/video/')) return 'tiktok_video';
      if (url.pathname.includes('/tag/')) return 'tiktok_hashtag';
      return 'tiktok_profile';
    }
    if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.me')) {
      return 'facebook_page';
    }
    if (host.includes('google.com') && url.pathname.includes('/maps')) return 'google_maps_query';
  } catch {
    // fallback
  }
  return 'website';
}

export const sourceSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  type: z.enum(SOURCE_TYPES),
  locator: z.string().trim().min(1).max(2_000),
  language: z.enum(['AZ', 'RU', 'EN', 'mixed']).default('mixed'),
  maxPages: z.coerce.number().int().min(0).max(500).default(10),
  maxDepth: z.coerce.number().int().min(0).max(10).default(1),
  delayMs: z.coerce.number().int().min(0).max(60_000).default(1_000),
  enabled: z.coerce.boolean().default(true),
  killSwitch: z.coerce.boolean().default(false),
}).superRefine((source, context) => {
  let parsedLocator: URL | undefined;
  try {
    parsedLocator = new URL(source.locator.startsWith('http') ? source.locator : `https://${source.locator}`);
  } catch {
    parsedLocator = undefined;
  }
  const exactBinaHost = parsedLocator?.hostname === 'bina.az' || parsedLocator?.hostname === 'www.bina.az';
  if (source.type !== 'bina_agency') {
    if ((source.type === 'website' || source.type === 'listing_page') && exactBinaHost) {
      context.addIssue({ code: 'custom', path: ['type'], message: 'Bina URLs require the dedicated bina_agency source type' });
    }
    return;
  }
  try {
    const locator = parsedLocator ?? new URL(source.locator);
    const exactHost = locator.hostname === 'bina.az' || locator.hostname === 'www.bina.az';
    if (locator.protocol !== 'https:' || !exactHost || locator.username || locator.password || locator.port) {
      context.addIssue({ code: 'custom', path: ['locator'], message: 'Bina locator must use an exact allowed HTTPS host' });
    }
  } catch {
    context.addIssue({ code: 'custom', path: ['locator'], message: 'Bina locator must be a valid absolute URL' });
  }
  if (source.maxDepth !== 0) context.addIssue({ code: 'custom', path: ['maxDepth'], message: 'Bina source depth must be zero' });
  if (source.delayMs < 10_000) context.addIssue({ code: 'custom', path: ['delayMs'], message: 'Bina source delay must be at least 10000 ms' });
});

export const evidenceSchema = z.object({
  sourceId: z.number().int().positive(), sourceUrl: z.string().url(),
  locationType: z.enum(['profile', 'listing', 'post', 'comment']),
  excerpt: z.string().max(1_000), rawPhone: z.string().max(100),
  name: z.string().max(200).nullable().optional(), agency: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  username: z.string().max(200).nullable().optional(), platform: z.string().max(50),
  fingerprint: z.string().min(16).max(128),
  explicitSellerType: z.enum(['agency', 'agent', 'owner', 'unknown']).optional(),
});

export type SourceInput = z.infer<typeof sourceSchema>;
export type EvidenceInput = z.infer<typeof evidenceSchema>;
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ContactType = 'agent' | 'agency' | 'owner' | 'unknown' | 'suspicious';
export type ExplicitSellerType = 'agency' | 'agent' | 'owner' | 'unknown';
export interface Classification { type: ContactType; confidence: number; reasons: string[]; ruleVersion: '1.0.0'; classifiedAt: string }

export const LEAD_TYPES = [
  'buyer',
  'seller',
  'renter',
  'landlord',
  'investor',
  'realtor_request',
  'unknown',
] as const;

export const LEAD_STATUSES = [
  'new',
  'qualified',
  'needs_review',
  'contacted',
  'converted',
  'rejected',
  'expired',
] as const;

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

export const SEARCH_SURFACES = [
  'profile_name',
  'username',
  'bio',
  'posts',
  'captions',
  'comments',
  'replies',
  'hashtags',
  'channel_name',
  'group_name',
  'group_description',
  'message_text',
  'phone_match',
  'agency_name',
  'geo_keyword',
] as const;

export type LeadType = (typeof LEAD_TYPES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type SearchSurface = (typeof SEARCH_SURFACES)[number];

export interface LeadInput {
  id?: number | undefined;
  leadType: LeadType;
  status?: LeadStatus | undefined;
  sourcePlatform: string;
  sourceSurface: string;
  sourceUrl: string;
  externalId?: string | null | undefined;
  username?: string | null | undefined;
  displayName?: string | null | undefined;
  publicPhone?: string | null | undefined;
  normalizedPhone?: string | null | undefined;
  intentExcerpt: string;
  city?: string | null | undefined;
  district?: string | null | undefined;
  metro?: string | null | undefined;
  propertyType?: string | null | undefined;
  rooms?: number | null | undefined;
  budgetMin?: number | null | undefined;
  budgetMax?: number | null | undefined;
  currency?: string | undefined;
  confidence?: number | undefined;
  confidenceLevel?: ConfidenceLevel | undefined;
  signals?: string[] | undefined;
  parentContext?: string | null | undefined;
  isRealtorSender?: boolean | undefined;
  firstSeenAt?: string | undefined;
  lastSeenAt?: string | undefined;
  expiresAt?: string | undefined;
}

export interface LeadRecord {
  id: number;
  leadType: LeadType;
  status: LeadStatus;
  sourcePlatform: string;
  sourceSurface: string;
  sourceUrl: string;
  externalId?: string | null | undefined;
  username?: string | null | undefined;
  displayName?: string | null | undefined;
  publicPhone?: string | null | undefined;
  normalizedPhone?: string | null | undefined;
  intentExcerpt: string;
  city?: string | null | undefined;
  district?: string | null | undefined;
  metro?: string | null | undefined;
  propertyType?: string | null | undefined;
  rooms?: number | null | undefined;
  budgetMin?: number | null | undefined;
  budgetMax?: number | null | undefined;
  currency: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  signals: string[];
  parentContext?: string | null | undefined;
  isRealtorSender: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
}
