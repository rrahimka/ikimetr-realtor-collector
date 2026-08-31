/**
 * Canonical multilingual real-estate keyword registry (RU / AZ / EN).
 *
 * Single source of truth for discovery scoring and keyword seeding. The older
 * per-tier dictionaries in `tiers.ts` remain available for classification, but
 * discovery and keyword management should consume this consolidated set.
 */
import {
  TIER_1_REALTOR_TERMS,
  TIER_2_PROPERTY_ROOTS,
  TIER_3_TRANSACTION_TERMS,
  TIER_4_AGENCY_TERMS,
} from './tiers';

export type KeywordLang = 'AZ' | 'RU' | 'EN' | 'mixed';

export interface CanonicalKeywordSet {
  az: string[];
  ru: string[];
  en: string[];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

/** Consolidated RU/AZ/EN real-estate vocabulary used across discovery + UI. */
export const CANONICAL_REALESTATE_KEYWORDS: CanonicalKeywordSet = {
  az: uniqueStrings([
    ...TIER_1_REALTOR_TERMS.az,
    ...TIER_2_PROPERTY_ROOTS.az,
    ...TIER_3_TRANSACTION_TERMS.az,
    ...TIER_4_AGENCY_TERMS.az,
  ]),
  ru: uniqueStrings([
    ...TIER_1_REALTOR_TERMS.ru,
    ...TIER_2_PROPERTY_ROOTS.ru,
    ...TIER_3_TRANSACTION_TERMS.ru,
    ...TIER_4_AGENCY_TERMS.ru,
  ]),
  en: uniqueStrings([
    ...TIER_1_REALTOR_TERMS.en,
    ...TIER_2_PROPERTY_ROOTS.en,
    ...TIER_3_TRANSACTION_TERMS.en,
    ...TIER_4_AGENCY_TERMS.en,
  ]),
};

/** Flat list of every canonical keyword across all languages. */
export function allCanonicalKeywords(): string[] {
  return uniqueStrings([
    ...CANONICAL_REALESTATE_KEYWORDS.az,
    ...CANONICAL_REALESTATE_KEYWORDS.ru,
    ...CANONICAL_REALESTATE_KEYWORDS.en,
  ]);
}

/**
 * Classifies the dominant language of a keyword/hashtag value.
 * Returns `mixed` when more than one language matches (or none match).
 */
export function classifyKeywordLanguage(value: string): KeywordLang {
  const v = value.toLowerCase();
  const az = CANONICAL_REALESTATE_KEYWORDS.az.some((k) => v.includes(k.toLowerCase()));
  const ru = CANONICAL_REALESTATE_KEYWORDS.ru.some((k) => v.includes(k.toLowerCase()));
  const en = CANONICAL_REALESTATE_KEYWORDS.en.some((k) => v.includes(k.toLowerCase()));
  const hits = [az, ru, en].filter(Boolean).length;
  if (hits > 1) return 'mixed';
  if (az) return 'AZ';
  if (ru) return 'RU';
  if (en) return 'EN';
  return 'mixed';
}

/** Seed list for bootstrapping the keyword table (value + inferred language). */
export function seedKeywords(): Array<{ value: string; language: KeywordLang }> {
  return allCanonicalKeywords().map((value) => ({ value, language: classifyKeywordLanguage(value) }));
}
