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
  | 'keyword'
  | 'hashtag'
  | 'agency'
  | 'geo'
  | 'website_cross_match'
  | 'profile_expansion';

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
  yieldRate: number; // accepted / checked
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
  strategyMetrics: StrategyMetric[];
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
  existingWebsitePhones: Set<string>
): SocialScaleReport {
  const igStats = { discovered: 0, checked: 0, accepted: 0, rejected: 0, noPhone: 0, newUnique: 0, existingMatches: 0 };
  const tkStats = { discovered: 0, checked: 0, accepted: 0, rejected: 0, noPhone: 0, newUnique: 0, existingMatches: 0 };

  const strategyMap = new Map<DiscoveryStrategy, { checked: number; accepted: number; rejected: number; noPhone: number; newContacts: number; existingMatches: number }>();
  for (const strat of ['keyword', 'hashtag', 'agency', 'geo', 'website_cross_match', 'profile_expansion'] as DiscoveryStrategy[]) {
    strategyMap.set(strat, { checked: 0, accepted: 0, rejected: 0, noPhone: 0, newContacts: 0, existingMatches: 0 });
  }

  const acceptedEvidence: ConnectorEvidence[] = [];
  const rejectedCandidates: Array<{ url: string; reason: string; strategy: DiscoveryStrategy }> = [];

  const seenPhonesAll = new Set<string>();
  const igPhones = new Set<string>();
  const tkPhones = new Set<string>();

  for (const candidate of candidates) {
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
    } else {
      if (evaluation.reason?.includes('No public phone')) {
        stats.noPhone += 1;
        stratMetric.noPhone += 1;
      } else {
        stats.rejected += 1;
        stratMetric.rejected += 1;
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
    yieldRate: m.checked > 0 ? Number(((m.accepted / m.checked) * 100).toFixed(1)) : 0,
  }));

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
    strategyMetrics,
    acceptedEvidence,
    rejectedCandidates,
  };
}
