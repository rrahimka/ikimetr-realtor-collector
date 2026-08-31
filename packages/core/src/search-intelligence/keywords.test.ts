import { describe, it, expect } from 'vitest';
import {
  CANONICAL_REALESTATE_KEYWORDS,
  allCanonicalKeywords,
  classifyKeywordLanguage,
  seedKeywords,
} from './keywords';

describe('canonical real-estate keyword registry', () => {
  it('exposes a non-empty trilingual set', () => {
    expect(CANONICAL_REALESTATE_KEYWORDS.az.length).toBeGreaterThan(0);
    expect(CANONICAL_REALESTATE_KEYWORDS.ru.length).toBeGreaterThan(0);
    expect(CANONICAL_REALESTATE_KEYWORDS.en.length).toBeGreaterThan(0);
  });

  it('produces a de-duplicated flat list', () => {
    const flat = allCanonicalKeywords();
    expect(flat.length).toBeGreaterThan(0);
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('classifies the dominant language of a keyword value', () => {
    expect(classifyKeywordLanguage('əmlak')).toBe('AZ');
    expect(classifyKeywordLanguage('недвижимость')).toBe('RU');
    expect(classifyKeywordLanguage('real estate')).toBe('EN');
  });

  it('flags mixed-language values', () => {
    expect(classifyKeywordLanguage('əmlak real estate')).toBe('mixed');
    expect(classifyKeywordLanguage('totally unrelated token')).toBe('mixed');
  });

  it('seeds keywords with an inferred language per value', () => {
    const seeds = seedKeywords();
    expect(seeds.length).toBe(allCanonicalKeywords().length);
    for (const seed of seeds) {
      expect(typeof seed.value).toBe('string');
      expect(['AZ', 'RU', 'EN', 'mixed']).toContain(seed.language);
    }
  });
});
