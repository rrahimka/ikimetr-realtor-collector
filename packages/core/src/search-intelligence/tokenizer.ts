import { TIER_1_REALTOR_TERMS, TIER_2_PROPERTY_ROOTS, TIER_4_AGENCY_TERMS, TIER_6_NEGATIVE_TERMS, BRAND_SUFFIXES } from './tiers';
import { toLatinAscii } from './transliteration';
import { AZERBAIJAN_GEO_DICTIONARY } from './geo';

const ALL_STRONG_TOKENS = new Set<string>();
for (const list of [TIER_1_REALTOR_TERMS.az, TIER_1_REALTOR_TERMS.en, TIER_1_REALTOR_TERMS.ru]) {
  for (const item of list) {
    ALL_STRONG_TOKENS.add(toLatinAscii(item.toLowerCase()).replace(/[^a-z0-9]/g, ''));
  }
}

const ALL_PROPERTY_TOKENS = new Set<string>();
for (const list of [TIER_2_PROPERTY_ROOTS.az, TIER_2_PROPERTY_ROOTS.en, TIER_2_PROPERTY_ROOTS.ru]) {
  for (const item of list) {
    ALL_PROPERTY_TOKENS.add(toLatinAscii(item.toLowerCase()).replace(/[^a-z0-9]/g, ''));
  }
}

const ALL_AGENCY_TOKENS = new Set<string>();
for (const list of [TIER_4_AGENCY_TERMS.az, TIER_4_AGENCY_TERMS.en, TIER_4_AGENCY_TERMS.ru]) {
  for (const item of list) {
    ALL_AGENCY_TOKENS.add(toLatinAscii(item.toLowerCase()).replace(/[^a-z0-9]/g, ''));
  }
}

const ALL_SUFFIX_TOKENS = new Set<string>();
for (const s of BRAND_SUFFIXES) {
  ALL_SUFFIX_TOKENS.add(toLatinAscii(s.toLowerCase()).replace(/[^a-z0-9]/g, ''));
}

const ALL_GEO_TOKENS = new Set<string>();
for (const entry of AZERBAIJAN_GEO_DICTIONARY) {
  for (const a of entry.aliases) {
    ALL_GEO_TOKENS.add(toLatinAscii(a.toLowerCase()).replace(/[^a-z0-9]/g, ''));
  }
}

const ALL_NEGATIVE_TOKENS = new Set<string>();
for (const item of TIER_6_NEGATIVE_TERMS) {
  ALL_NEGATIVE_TOKENS.add(toLatinAscii(item.toLowerCase()).replace(/[^a-z0-9]/g, ''));
}

export interface TokenRecognitionResult {
  raw: string;
  tokens: string[];
  strongRealtorMatches: string[];
  propertyMatches: string[];
  agencyMatches: string[];
  geoMatches: string[];
  negativeMatches: string[];
  isRealEstateCandidate: boolean;
  score: number;
}

/**
 * Tokenizes a domain or username (e.g. "bakupremiumemlak24" or "baku_emlak_group")
 * and extracts recognized real estate, geo, and agency tokens.
 */
export function tokenizeIdentifier(identifier: string): TokenRecognitionResult {
  const normalized = toLatinAscii(identifier.toLowerCase()).replace(/^@/, '');
  const splitPieces = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  const foundTokens = new Set<string>();

  // Direct piece matching
  for (const p of splitPieces) {
    foundTokens.add(p);
  }

  // Substring / concatenated dictionary search (e.g. "baku" + "emlak" in "bakuemlak")
  const combinedDict = [
    ...ALL_STRONG_TOKENS,
    ...ALL_PROPERTY_TOKENS,
    ...ALL_AGENCY_TOKENS,
    ...ALL_SUFFIX_TOKENS,
    ...ALL_GEO_TOKENS,
    ...ALL_NEGATIVE_TOKENS,
  ];

  const stripped = normalized.replace(/[^a-z0-9]/g, '');

  for (const word of combinedDict) {
    if (word.length >= 3 && (normalized.includes(word) || stripped.includes(word))) {
      foundTokens.add(word);
    }
  }

  const tokenList = Array.from(foundTokens);

  const strongMatches = tokenList.filter(t => ALL_STRONG_TOKENS.has(t));
  const propertyMatches = tokenList.filter(t => ALL_PROPERTY_TOKENS.has(t));
  const agencyMatches = tokenList.filter(t => ALL_AGENCY_TOKENS.has(t) || ALL_SUFFIX_TOKENS.has(t));
  const geoMatches = tokenList.filter(t => ALL_GEO_TOKENS.has(t));
  const negativeMatches = tokenList.filter(t => ALL_NEGATIVE_TOKENS.has(t));

  let score = 0;
  score += strongMatches.length * 3;
  score += propertyMatches.length * 2;
  score += geoMatches.length * 1.5;
  score += agencyMatches.length * 1;
  score -= negativeMatches.length * 5;

  const isRealEstateCandidate = (strongMatches.length > 0 || (propertyMatches.length > 0 && geoMatches.length > 0)) && negativeMatches.length === 0;

  return {
    raw: identifier,
    tokens: tokenList,
    strongRealtorMatches: strongMatches,
    propertyMatches,
    agencyMatches,
    geoMatches,
    negativeMatches,
    isRealEstateCandidate,
    score: Math.max(0, score),
  };
}
