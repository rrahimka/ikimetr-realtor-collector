import { generateTokenPermutations } from './transliteration';

export interface SearchSeedEntry {
  category: 'unigram' | 'bigram' | 'trigram' | 'phrase' | 'geo_root' | 'agency_geo' | 'hashtag';
  query: string;
  priority: number; // 1 (highest) to 5 (lowest)
  language: 'az' | 'ru' | 'en' | 'mixed';
}

/**
 * Deterministically generates ranked, deduplicated search query seeds.
 */
export function generateSearchIntelligenceSeeds(options: {
  maxSeeds?: number;
  includeSeparators?: boolean;
} = {}): SearchSeedEntry[] {
  const maxSeeds = options.maxSeeds ?? 500;
  const includeSeparators = options.includeSeparators ?? true;

  const seeds: SearchSeedEntry[] = [];
  const seenQueries = new Set<string>();

  const addSeed = (query: string, category: SearchSeedEntry['category'], priority: number, language: SearchSeedEntry['language']) => {
    const clean = query.trim();
    if (!clean || seenQueries.has(clean.toLowerCase())) return;
    seenQueries.add(clean.toLowerCase());
    seeds.push({ category, query: clean, priority, language });
  };

  // 1. UNIGRAMS (Tier 1 Strong Roots)
  const strongRoots = ['əmlak', 'emlak', 'rieltor', 'realtor', 'makler', 'недвижимость', 'real estate'];
  for (const root of strongRoots) {
    addSeed(root, 'unigram', 1, root === 'недвижимость' ? 'ru' : (root === 'real estate' ? 'en' : 'az'));
  }

  // 2. HASHTAGS
  const hashtags = [
    '#emlak',
    '#daşınmazəmlak',
    '#bakuemlak',
    '#bakurealestate',
    '#rieltorbaku',
    '#menzilsatilir',
    '#kirayeevler',
    '#realestatebaku',
  ];
  for (const tag of hashtags) {
    addSeed(tag, 'hashtag', 1, 'az');
  }

  // 3. PRIMARY GEO × ROOT (Baku Districts & Major Cities × Real Estate Roots)
  const primaryGeos = ['Bakı', 'Baku', 'Yasamal', 'Nərimanov', 'Nəsimi', 'Xətai', 'Sumqayıt', 'Xırdalan', 'Gəncə', 'Qəbələ'];
  for (const geo of primaryGeos) {
    for (const root of ['əmlak', 'emlak', 'rieltor']) {
      addSeed(`${geo} ${root}`, 'geo_root', 1, 'az');
      addSeed(`${root} ${geo}`, 'geo_root', 1, 'az');
    }
  }

  // 4. ROOT × SUFFIX (Bigrams: Emlak Pro, Real Estate Agency, etc.)
  const topSuffixes = ['Pro', 'Group', 'Agency', 'Realty', 'Estate', '24', 'Mərkəz', 'Capital', 'Invest', 'Expert'];
  for (const root of ['Emlak', 'Əmlak', 'Realty', 'Property', 'Mənzil']) {
    for (const suffix of topSuffixes) {
      addSeed(`${root} ${suffix}`, 'bigram', 1, root === 'Realty' || root === 'Property' ? 'en' : 'az');
    }
  }

  // 5. GEO × ROOT × SUFFIX (Trigrams: Baku Emlak Pro, Baku Property Group)
  for (const geo of ['Baku', 'Bakı', 'Yasamal', 'Nərimanov']) {
    for (const root of ['Emlak', 'Property', 'Real Estate']) {
      for (const suffix of ['Group', 'Pro', 'Agency']) {
        addSeed(`${geo} ${root} ${suffix}`, 'trigram', 1, 'mixed');
      }
    }
  }

  // 6. PERMUTATIONS WITH SEPARATORS
  if (includeSeparators) {
    for (const geo of ['Baku', 'Yasamal']) {
      for (const root of ['Emlak', 'Realtor']) {
        const permutations = generateTokenPermutations([geo, root]);
        for (const p of permutations.slice(0, 3)) {
          addSeed(p, 'geo_root', 2, 'az');
        }
      }
    }
  }

  // 6. TRANSACTION × PROPERTY (Satılır mənzil, Kirayə evlər, Продажа квартир)
  const transactionPairs = [
    { q: 'mənzil satışı bakı', lang: 'az' as const },
    { q: 'ev satışı xırdalan', lang: 'az' as const },
    { q: 'bağ evi mərdəkan', lang: 'az' as const },
    { q: 'villa satılır qəbələ', lang: 'az' as const },
    { q: 'günlük kirayə mənzillər', lang: 'az' as const },
    { q: 'yeni tikili mənzillər bakı', lang: 'az' as const },
    { q: 'продажа квартир баку', lang: 'ru' as const },
    { q: 'аренда квартир баку посуточно', lang: 'ru' as const },
    { q: 'новостройки баку', lang: 'ru' as const },
    { q: 'baku apartments for rent', lang: 'en' as const },
    { q: 'baku luxury real estate', lang: 'en' as const },
  ];

  for (const tp of transactionPairs) {
    addSeed(tp.q, 'phrase', 2, tp.lang);
  }

  return seeds.slice(0, maxSeeds);
}
