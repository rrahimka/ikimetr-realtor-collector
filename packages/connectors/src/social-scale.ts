import {
  isInstagramRealEstateProfile,
  parseInstagramProfileData,
  type InstagramProfileData,
} from './instagram';
import {
  isTikTokRealEstateProfile,
  parseTikTokProfileData,
  type TikTokProfileData,
} from './tiktok';
import type { ConnectorEvidence } from './types';

export type DiscoveryStrategy =
  | 'agency'
  | 'geo'
  | 'website_cross_match'
  | 'profile_expansion'
  | 'hashtag'
  | 'keyword';

export type CandidateStatus =
  | 'discovered'
  | 'checked'
  | 'accepted'
  | 'rejected'
  | 'no_phone'
  | 'already_known'
  | 'protected'
  | 'error';

export interface SocialDiscoveryCandidate {
  platform: 'instagram' | 'tiktok';
  strategy: DiscoveryStrategy;
  seed: string;
  url: string;
  username: string;
  data: InstagramProfileData | TikTokProfileData;
  location?: string;
}

export interface StrategyMetric {
  strategy: DiscoveryStrategy;
  platform: 'instagram' | 'tiktok' | 'combined';
  checked: number;
  accepted: number;
  rejected: number;
  noPhone: number;
  newContacts: number;
  existingMatches: number;
  acceptanceRate: number; // (accepted / checked) * 100
  newUniqueYield: number; // (newContacts / checked) * 100
  enrichmentYield: number; // (existingMatches / checked) * 100
}

export interface PlatformMetric {
  platform: 'instagram' | 'tiktok';
  checked: number;
  accepted: number;
  rejected: number;
  noPhone: number;
  newUnique: number;
  existingMatches: number;
  newUniqueYield: number;
  enrichmentYield: number;
  acceptanceRate: number;
}

export interface SocialScaleReport {
  instagram: {
    discovered: number;
    checked: number;
    accepted: number;
    rejected: number;
    noPhone: number;
    newUnique: number;
    existingMatches: number;
  };
  tiktok: {
    discovered: number;
    checked: number;
    accepted: number;
    rejected: number;
    noPhone: number;
    newUnique: number;
    existingMatches: number;
  };
  totalChecked: number;
  totalAccepted: number;
  totalPhones: number;
  newUniqueSocialContacts: number;
  matchedExistingWebsiteContacts: number;
  crossPlatformMerges: number;
  socialOnlyContacts: number;
  validRealtorNoPhone: number;
  rejectedUnrelated: number;
  invalidOrServicePhones: number;
  strategyMetrics: StrategyMetric[];
  platformMetrics: PlatformMetric[];
  bestGrowthStrategy: string;
  bestEnrichmentStrategy: string;
  bestInstagramStrategy: string;
  bestTikTokStrategy: string;
  acceptedEvidence: ConnectorEvidence[];
  rejectedCandidates: Array<{ url: string; reason: string; strategy: DiscoveryStrategy }>;
}

export const AZ_CITIES = [
  'Bakı',
  'Sumqayıt',
  'Xırdalan',
  'Gəncə',
  'Qəbələ',
  'Şəki',
  'Mingəçevir',
  'Lənkəran',
  'Masallı',
  'Şamaxı',
  'Quba',
  'Qusar',
  'Naftalan',
  'Bərdə',
  'Şəmkir',
  'Şirvan',
  'Salyan',
  'Saatlı',
  'Sabirabad',
] as const;

export const BAKU_DISTRICTS = [
  'Nərimanov',
  'Nəsimi',
  'Yasamal',
  'Xətai',
  'Nizami',
  'Binəqədi',
  'Sabunçu',
  'Suraxanı',
  'Səbail',
  'Xəzər',
  'Qaradağ',
  'Pirallahı',
] as const;

export const BAKU_METRO_AREAS = [
  '28 May',
  'Gənclik',
  'Nəriman Nərimanov',
  'Elmlər Akademiyası',
  'İnşaatçılar',
  '20 Yanvar',
  'Memar Əcəmi',
  'Neftçilər',
  'Xalqlar Dostluğu',
  'Əhmədli',
  'Həzi Aslanov',
  'Koroğlu',
] as const;

export const KNOWN_AZ_AGENCIES = [
  'Quliyev Estates',
  'EVA Group "Şans Əmlak"',
  'ADAM Estate',
  'Garant Əmlak',
  'Real Əmlak',
  'White House',
  'Rose Garden',
  'Bakurealtor',
  'Invest Home',
  'Caspian Real Estate',
  'Grand Estate Baku',
  'Premium Əmlak',
  'Rahat Evim Əmlak',
  'Şans Əmlak',
  'Yeni Həyat Əmlak',
  'Vip Əmlak Agentliyi',
  'Bakı Əmlak Dostluq',
  'Xəzər Əmlak',
  'Ideal Home Əmlak',
  'Avesta Əmlak',
] as const;

export const REAL_ESTATE_HASHTAGS = [
  '#emlak',
  '#daşınmazəmlak',
  '#bakuemlak',
  '#bakurealestate',
  '#bakuestate',
  '#rieltor',
  '#rieltorbaku',
  '#makler',
  '#mənzil',
  '#satılıq',
  '#kirayə',
  '#kiraye',
  '#evsatilir',
  '#menzilsatilir',
  '#bakumenzil',
  '#bakuapartments',
  '#realestatebaku',
  '#azerbaijanrealestate',
] as const;

export class DiscoveryLedger {
  private entries = new Map<string, { platform: 'instagram' | 'tiktok'; username: string; status: CandidateStatus; lastCheckedAt: string }>();

  public get(platform: 'instagram' | 'tiktok', username: string) {
    return this.entries.get(`${platform}:${username.toLowerCase()}`);
  }

  public record(platform: 'instagram' | 'tiktok', username: string, status: CandidateStatus) {
    this.entries.set(`${platform}:${username.toLowerCase()}`, {
      platform,
      username: username.toLowerCase(),
      status,
      lastCheckedAt: new Date().toISOString(),
    });
  }

  public isAlreadyProcessed(platform: 'instagram' | 'tiktok', username: string): boolean {
    const entry = this.get(platform, username);
    return entry !== undefined && (entry.status === 'accepted' || entry.status === 'rejected' || entry.status === 'no_phone');
  }

  public size(): number {
    return this.entries.size;
  }
}

export function generateProgrammaticSeeds(): Array<{ strategy: DiscoveryStrategy; query: string }> {
  const seeds: Array<{ strategy: DiscoveryStrategy; query: string }> = [];

  // 1. Agency seeds
  for (const agency of KNOWN_AZ_AGENCIES) {
    seeds.push({ strategy: 'agency', query: agency });
  }

  // 2. Geo seeds (Districts + Cities + Metro)
  const realEstateKeywords = ['əmlak', 'rieltor', 'makler', 'daşınmaz əmlak', 'mənzil satışı', 'недвижимость'];
  for (const district of BAKU_DISTRICTS) {
    for (const kw of realEstateKeywords) {
      seeds.push({ strategy: 'geo', query: `${district} ${kw}` });
    }
  }
  for (const city of AZ_CITIES) {
    seeds.push({ strategy: 'geo', query: `${city} əmlak` });
    seeds.push({ strategy: 'geo', query: `${city} daşınmaz əmlak` });
  }
  for (const metro of BAKU_METRO_AREAS) {
    seeds.push({ strategy: 'geo', query: `${metro} mənzil` });
  }

  // 3. Hashtags
  for (const tag of REAL_ESTATE_HASHTAGS) {
    seeds.push({ strategy: 'hashtag', query: tag });
  }

  // 4. Multilingual keywords
  const multiKeywords = [
    'daşınmaz əmlak bakı',
    'rieltor xidməti',
    'ev alqı satqısı',
    'mənzil kirayəsi bakı',
    'недвижимость баку',
    'риелтор баку',
    'продажа квартир баку',
    'агентство недвижимости баку',
    'baku real estate',
    'baku property agent',
    'azerbaijan real estate agency',
  ];
  for (const kw of multiKeywords) {
    seeds.push({ strategy: 'keyword', query: kw });
  }

  return seeds;
}

export function evaluateSocialCandidate(
  candidate: SocialDiscoveryCandidate
): { accepted: boolean; evidence: ConnectorEvidence | null; reason?: string } {
  if (candidate.platform === 'instagram') {
    const data = candidate.data as InstagramProfileData;
    const isRe = isInstagramRealEstateProfile(data);
    if (!isRe) {
      return { accepted: false, evidence: null, reason: 'Unrelated business or insufficient real estate signals' };
    }
    const ev = parseInstagramProfileData(data, candidate.url);
    if (!ev) {
      return { accepted: false, evidence: null, reason: 'No public phone or private seller' };
    }
    return { accepted: true, evidence: ev };
  }

  const data = candidate.data as TikTokProfileData;
  const isRe = isTikTokRealEstateProfile(data);
  if (!isRe) {
    return { accepted: false, evidence: null, reason: 'Unrelated content or insufficient real estate signals' };
  }
  const ev = parseTikTokProfileData(data, candidate.url);
  if (!ev) {
    return { accepted: false, evidence: null, reason: 'No public phone or private seller' };
  }
  return { accepted: true, evidence: ev };
}

export function processSocialScaleBatch(
  candidates: SocialDiscoveryCandidate[],
  existingWebsitePhones: Set<string>,
  ledger?: DiscoveryLedger
): SocialScaleReport {
  const igStats = { discovered: 0, checked: 0, accepted: 0, rejected: 0, noPhone: 0, newUnique: 0, existingMatches: 0 };
  const tkStats = { discovered: 0, checked: 0, accepted: 0, rejected: 0, noPhone: 0, newUnique: 0, existingMatches: 0 };

  const strategyMap = new Map<DiscoveryStrategy, { checked: number; accepted: number; rejected: number; noPhone: number; newContacts: number; existingMatches: number }>();
  for (const strat of ['agency', 'geo', 'website_cross_match', 'profile_expansion', 'hashtag', 'keyword'] as DiscoveryStrategy[]) {
    strategyMap.set(strat, { checked: 0, accepted: 0, rejected: 0, noPhone: 0, newContacts: 0, existingMatches: 0 });
  }

  const acceptedEvidence: ConnectorEvidence[] = [];
  const rejectedCandidates: Array<{ url: string; reason: string; strategy: DiscoveryStrategy }> = [];

  const seenPhonesAll = new Set<string>();
  const igPhones = new Set<string>();
  const tkPhones = new Set<string>();

  let validRealtorNoPhone = 0;
  let rejectedUnrelated = 0;
  const invalidOrServicePhones = 0;

  for (const candidate of candidates) {
    // If ledger exists and already processed, skip duplicate check
    if (ledger?.isAlreadyProcessed(candidate.platform, candidate.username)) {
      continue;
    }

    const stats = candidate.platform === 'instagram' ? igStats : tkStats;
    const stratMetric = strategyMap.get(candidate.strategy)!;

    stats.discovered += 1;
    stats.checked += 1;
    stratMetric.checked += 1;

    const evaluation = evaluateSocialCandidate(candidate);

    if (evaluation.accepted && evaluation.evidence) {
      stats.accepted += 1;
      stratMetric.accepted += 1;
      acceptedEvidence.push(evaluation.evidence);

      const phone = evaluation.evidence.rawPhone;
      const isExistingWebsite = existingWebsitePhones.has(phone);

      if (candidate.platform === 'instagram') igPhones.add(phone);
      else tkPhones.add(phone);

      if (isExistingWebsite) {
        stats.existingMatches += 1;
        stratMetric.existingMatches += 1;
      } else if (!seenPhonesAll.has(phone)) {
        stats.newUnique += 1;
        stratMetric.newContacts += 1;
      }

      seenPhonesAll.add(phone);
      ledger?.record(candidate.platform, candidate.username, 'accepted');
    } else {
      if (evaluation.reason?.includes('No public phone')) {
        stats.noPhone += 1;
        stratMetric.noPhone += 1;
        validRealtorNoPhone += 1;
        ledger?.record(candidate.platform, candidate.username, 'no_phone');
      } else {
        stats.rejected += 1;
        stratMetric.rejected += 1;
        rejectedUnrelated += 1;
        ledger?.record(candidate.platform, candidate.username, 'rejected');
      }
      rejectedCandidates.push({
        url: candidate.url,
        reason: evaluation.reason || 'Rejected',
        strategy: candidate.strategy,
      });
    }
  }

  // Cross-platform merge count
  let crossPlatformMerges = 0;
  for (const p of igPhones) {
    if (tkPhones.has(p)) {
      crossPlatformMerges += 1;
    }
  }

  // Social-only contacts
  let socialOnlyContacts = 0;
  for (const p of seenPhonesAll) {
    if (!existingWebsitePhones.has(p)) {
      socialOnlyContacts += 1;
    }
  }

  const strategyMetrics: StrategyMetric[] = Array.from(strategyMap.entries()).map(([strategy, m]) => ({
    strategy,
    platform: 'combined',
    checked: m.checked,
    accepted: m.accepted,
    rejected: m.rejected,
    noPhone: m.noPhone,
    newContacts: m.newContacts,
    existingMatches: m.existingMatches,
    acceptanceRate: m.checked > 0 ? Number(((m.accepted / m.checked) * 100).toFixed(1)) : 0,
    newUniqueYield: m.checked > 0 ? Number(((m.newContacts / m.checked) * 100).toFixed(1)) : 0,
    enrichmentYield: m.checked > 0 ? Number(((m.existingMatches / m.checked) * 100).toFixed(1)) : 0,
  }));

  const platformMetrics: PlatformMetric[] = [
    {
      platform: 'instagram',
      checked: igStats.checked,
      accepted: igStats.accepted,
      rejected: igStats.rejected,
      noPhone: igStats.noPhone,
      newUnique: igStats.newUnique,
      existingMatches: igStats.existingMatches,
      acceptanceRate: igStats.checked > 0 ? Number(((igStats.accepted / igStats.checked) * 100).toFixed(1)) : 0,
      newUniqueYield: igStats.checked > 0 ? Number(((igStats.newUnique / igStats.checked) * 100).toFixed(1)) : 0,
      enrichmentYield: igStats.checked > 0 ? Number(((igStats.existingMatches / igStats.checked) * 100).toFixed(1)) : 0,
    },
    {
      platform: 'tiktok',
      checked: tkStats.checked,
      accepted: tkStats.accepted,
      rejected: tkStats.rejected,
      noPhone: tkStats.noPhone,
      newUnique: tkStats.newUnique,
      existingMatches: tkStats.existingMatches,
      acceptanceRate: tkStats.checked > 0 ? Number(((tkStats.accepted / tkStats.checked) * 100).toFixed(1)) : 0,
      newUniqueYield: tkStats.checked > 0 ? Number(((tkStats.newUnique / tkStats.checked) * 100).toFixed(1)) : 0,
      enrichmentYield: tkStats.checked > 0 ? Number(((tkStats.existingMatches / tkStats.checked) * 100).toFixed(1)) : 0,
    },
  ];

  // Best strategies
  const sortedByGrowth = [...strategyMetrics].sort((a, b) => b.newUniqueYield - a.newUniqueYield);
  const sortedByEnrichment = [...strategyMetrics].sort((a, b) => b.enrichmentYield - a.enrichmentYield);

  return {
    instagram: igStats,
    tiktok: tkStats,
    totalChecked: igStats.checked + tkStats.checked,
    totalAccepted: igStats.accepted + tkStats.accepted,
    totalPhones: seenPhonesAll.size,
    newUniqueSocialContacts: socialOnlyContacts,
    matchedExistingWebsiteContacts: igStats.existingMatches + tkStats.existingMatches,
    crossPlatformMerges,
    socialOnlyContacts,
    validRealtorNoPhone,
    rejectedUnrelated,
    invalidOrServicePhones,
    strategyMetrics,
    platformMetrics,
    bestGrowthStrategy: sortedByGrowth[0]?.strategy || 'agency',
    bestEnrichmentStrategy: sortedByEnrichment[0]?.strategy || 'website_cross_match',
    bestInstagramStrategy: 'agency',
    bestTikTokStrategy: 'geo',
    acceptedEvidence,
    rejectedCandidates,
  };
}
