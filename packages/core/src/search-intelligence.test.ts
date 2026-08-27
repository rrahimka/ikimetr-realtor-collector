import { describe, it, expect } from 'vitest';
import {
  toLatinAscii,
  getTermAliases,
  generateTokenPermutations,
  formatTokenVariants,
  AZERBAIJAN_GEO_DICTIONARY,
  containsAzerbaijanGeo,
  analyzeAzerbaijanPhone,
  isAzerbaijanMobileNumber,
  isForeignRealEstatePhone,
  tokenizeIdentifier,
  generateSearchIntelligenceSeeds,
  TIER_1_REALTOR_TERMS,
  TIER_2_PROPERTY_ROOTS,
  TIER_3_TRANSACTION_TERMS,
  TIER_4_AGENCY_TERMS,
  BRAND_SUFFIXES,
} from './search-intelligence';

describe('Search Intelligence Base', () => {
  describe('0. Tiers Definition Coverage', () => {
    it('defines rich multilingual tiers for AZ, RU, EN', () => {
      expect(TIER_1_REALTOR_TERMS.az).toContain('əmlak');
      expect(TIER_1_REALTOR_TERMS.ru).toContain('недвижимость');
      expect(TIER_1_REALTOR_TERMS.en).toContain('real estate');

      expect(TIER_2_PROPERTY_ROOTS.az).toContain('mənzil');
      expect(TIER_2_PROPERTY_ROOTS.ru).toContain('квартира');
      expect(TIER_2_PROPERTY_ROOTS.en).toContain('apartment');

      expect(TIER_3_TRANSACTION_TERMS.az).toContain('satılır');
      expect(TIER_4_AGENCY_TERMS.az).toContain('agentlik');
      expect(BRAND_SUFFIXES).toContain('Pro');
    });
  });

  describe('1. Transliterations & Aliases', () => {
    it('transliterates Azerbaijani characters correctly', () => {
      expect(toLatinAscii('əmlak')).toBe('emlak');
      expect(toLatinAscii('mənzil')).toBe('menzil');
      expect(toLatinAscii('daşınmaz əmlak')).toBe('dasinmaz emlak');
      expect(toLatinAscii('vasitəçi')).toBe('vasiteci');
      expect(toLatinAscii('şirkəti')).toBe('sirketi');
      expect(toLatinAscii('mərkəzi')).toBe('merkezi');
      expect(toLatinAscii('alqı-satqı')).toBe('alqi-satqi');
      expect(toLatinAscii('gözəllik')).toBe('gozellik');
    });

    it('generates transliteration and spelling aliases for real estate terms', () => {
      const aliases = getTermAliases('daşınmaz');
      expect(aliases).toContain('daşınmaz');
      expect(aliases).toContain('dasinmaz');

      const realtorAliases = getTermAliases('rieltor');
      expect(realtorAliases).toContain('rieltor');
      expect(realtorAliases).toContain('realtor');
    });
  });

  describe('2. Separators, Permutations & Reverse Order', () => {
    it('generates space, joined, underscore, hyphen, and dot formats', () => {
      const variants = formatTokenVariants(['Baku', 'Emlak']);
      expect(variants.space).toBe('baku emlak');
      expect(variants.joined).toBe('bakuemlak');
      expect(variants.underscore).toBe('baku_emlak');
      expect(variants.hyphen).toBe('baku-emlak');
      expect(variants.dot).toBe('baku.emlak');
    });

    it('generates both forward and reverse order permutations for 2-word combinations', () => {
      const perms = generateTokenPermutations(['Baku', 'Emlak']);
      expect(perms).toContain('baku emlak');
      expect(perms).toContain('bakuemlak');
      expect(perms).toContain('baku_emlak');
      expect(perms).toContain('emlak baku');
      expect(perms).toContain('emlakbaku');
      expect(perms).toContain('emlak_baku');
    });

    it('generates 3-word combinations with prefixes and suffixes', () => {
      const perms = generateTokenPermutations(['Baku', 'Emlak', 'Pro']);
      expect(perms).toContain('baku emlak pro');
      expect(perms).toContain('bakuemlakpro');
      expect(perms).toContain('baku_emlak_pro');
    });
  });

  describe('3. Azerbaijan Geo Coverage & Detection', () => {
    it('contains all Baku districts, metro areas, and regional cities', () => {
      expect(AZERBAIJAN_GEO_DICTIONARY.some(g => g.canonical === 'Nərimanov')).toBe(true);
      expect(AZERBAIJAN_GEO_DICTIONARY.some(g => g.canonical === 'Yasamal')).toBe(true);
      expect(AZERBAIJAN_GEO_DICTIONARY.some(g => g.canonical === '28 May')).toBe(true);
      expect(AZERBAIJAN_GEO_DICTIONARY.some(g => g.canonical === 'Sumqayıt')).toBe(true);
      expect(AZERBAIJAN_GEO_DICTIONARY.some(g => g.canonical === 'Gəncə')).toBe(true);
      expect(AZERBAIJAN_GEO_DICTIONARY.some(g => g.canonical === 'Xırdalan')).toBe(true);
    });

    it('detects Azerbaijan geographical context in texts', () => {
      expect(containsAzerbaijanGeo('Yasamal rayonunda 3 otaqli menzil')).toBe(true);
      expect(containsAzerbaijanGeo('Khirdalan dairesi yaxinliginda')).toBe(true);
      expect(containsAzerbaijanGeo('Ganja city property')).toBe(true);
      expect(containsAzerbaijanGeo('London luxury penthouse')).toBe(false);
    });
  });

  describe('4. Phone & Identity Validation', () => {
    it('validates all 8 Azerbaijan mobile prefixes', () => {
      const prefixes = ['10', '50', '51', '55', '60', '70', '77', '99'];
      for (const p of prefixes) {
        const phone = `+994${p}1234567`;
        const res = analyzeAzerbaijanPhone(phone);
        expect(res.isValid).toBe(true);
        expect(res.isMobile).toBe(true);
        expect(res.type).toBe('mobile');
        expect(res.prefix).toBe(p);
        expect(isAzerbaijanMobileNumber(phone)).toBe(true);
      }
    });

    it('distinguishes fixed lines from mobile lines', () => {
      const fixed = analyzeAzerbaijanPhone('+994125980000');
      expect(fixed.isValid).toBe(true);
      expect(fixed.isMobile).toBe(false);
      expect(fixed.type).toBe('fixed');
    });

    it('rejects foreign numbers and detects Turkish false positives', () => {
      const trPhone = '+905321234567';
      expect(analyzeAzerbaijanPhone(trPhone).isValid).toBe(false);
      expect(isForeignRealEstatePhone(trPhone)).toBe(true);

      const ruPhone = '+79261234567';
      expect(analyzeAzerbaijanPhone(ruPhone).isValid).toBe(false);
      expect(isForeignRealEstatePhone(ruPhone)).toBe(true);

      const usPhone = '+14155552671';
      expect(analyzeAzerbaijanPhone(usPhone).isValid).toBe(false);
      expect(isForeignRealEstatePhone(usPhone)).toBe(true);
    });
  });

  describe('5. Domain & Username Tokenization', () => {
    it('tokenizes concatenated usernames like bakupremiumemlak24', () => {
      const res = tokenizeIdentifier('bakupremiumemlak24');
      expect(res.tokens).toContain('baku');
      expect(res.tokens).toContain('premium');
      expect(res.tokens).toContain('emlak');
      expect(res.strongRealtorMatches).toContain('emlak');
      expect(res.geoMatches).toContain('baku');
      expect(res.isRealEstateCandidate).toBe(true);
      expect(res.score).toBeGreaterThan(0);
    });

    it('tokenizes separator-delimited usernames like real_estate_baku_agency', () => {
      const res = tokenizeIdentifier('real_estate_baku_agency');
      expect(res.strongRealtorMatches).toContain('realestate');
      expect(res.geoMatches).toContain('baku');
      expect(res.agencyMatches).toContain('agency');
      expect(res.isRealEstateCandidate).toBe(true);
    });

    it('rejects usernames with negative unrelated business tokens', () => {
      const res = tokenizeIdentifier('baku_avtosalon_motors');
      expect(res.negativeMatches).toContain('avtosalon');
      expect(res.isRealEstateCandidate).toBe(false);
    });
  });

  describe('6. Search Seed Generator', () => {
    it('generates ranked, multilingual, deduplicated search query seeds', () => {
      const seeds = generateSearchIntelligenceSeeds({ maxSeeds: 100 });
      expect(seeds.length).toBeGreaterThan(20);

      // Verify Unigrams, Geo Roots, Bigrams, Trigrams, Hashtags
      expect(seeds.some(s => s.category === 'unigram')).toBe(true);
      expect(seeds.some(s => s.category === 'geo_root')).toBe(true);
      expect(seeds.some(s => s.category === 'bigram')).toBe(true);
      expect(seeds.some(s => s.category === 'hashtag')).toBe(true);

      // Verify no duplicate queries
      const querySet = new Set(seeds.map(s => s.query.toLowerCase()));
      expect(querySet.size).toBe(seeds.length);
    });
  });
});
