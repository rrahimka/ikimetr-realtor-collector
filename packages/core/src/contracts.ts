import { z } from 'zod';

export const SOURCE_TYPES = ['website', 'listing_page', 'google_maps_query', 'instagram_profile', 'instagram_post', 'instagram_hashtag', 'tiktok_profile', 'tiktok_video', 'tiktok_hashtag', 'tiktok_keyword', 'bina_agency', 'test_fixture'] as const;

export const sourceSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  type: z.enum(SOURCE_TYPES),
  locator: z.string().trim().min(1).max(2_000),
  language: z.enum(['AZ', 'RU', 'EN', 'mixed']).default('mixed'),
  maxPages: z.coerce.number().int().min(1).max(500).default(10),
  maxDepth: z.coerce.number().int().min(0).max(10).default(1),
  delayMs: z.coerce.number().int().min(0).max(60_000).default(1_000),
  enabled: z.coerce.boolean().default(true),
  killSwitch: z.coerce.boolean().default(false),
}).superRefine((source, context) => {
  if (source.type !== 'bina_agency') return;
  try {
    const locator = new URL(source.locator);
    const exactHost = locator.hostname === 'bina.az' || locator.hostname === 'www.bina.az';
    if (locator.protocol !== 'https:' || !exactHost || locator.username || locator.password || locator.port) {
      context.addIssue({ code: 'custom', path: ['locator'], message: 'Bina locator must use an exact allowed HTTPS host' });
    }
  } catch {
    context.addIssue({ code: 'custom', path: ['locator'], message: 'Bina locator must be a valid absolute URL' });
  }
  if (source.maxPages > 100) context.addIssue({ code: 'custom', path: ['maxPages'], message: 'Bina sources are limited to 100 listings' });
  if (source.maxDepth !== 0) context.addIssue({ code: 'custom', path: ['maxDepth'], message: 'Bina source depth must be zero' });
  if (source.delayMs < 10_000) context.addIssue({ code: 'custom', path: ['delayMs'], message: 'Bina source delay must be at least 10000 ms' });
});

export const evidenceSchema = z.object({
  sourceId: z.number().int().positive(), sourceUrl: z.string().url(),
  locationType: z.enum(['profile', 'listing', 'post', 'comment']),
  excerpt: z.string().max(1_000), rawPhone: z.string().max(100),
  name: z.string().max(200).nullable().optional(), agency: z.string().max(200).nullable().optional(),
  username: z.string().max(200).nullable().optional(), platform: z.string().max(50),
  fingerprint: z.string().min(16).max(128),
});

export type SourceInput = z.infer<typeof sourceSchema>;
export type EvidenceInput = z.infer<typeof evidenceSchema>;
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ContactType = 'agent' | 'agency' | 'owner' | 'unknown' | 'suspicious';
export interface Classification { type: ContactType; confidence: number; reasons: string[]; ruleVersion: '1.0.0'; classifiedAt: string }
