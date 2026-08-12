import { z } from 'zod';

export const SOURCE_TYPES = ['website', 'listing_page', 'google_maps_query', 'instagram_profile', 'instagram_post', 'instagram_hashtag', 'tiktok_profile', 'tiktok_video', 'tiktok_hashtag', 'tiktok_keyword', 'test_fixture'] as const;

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
