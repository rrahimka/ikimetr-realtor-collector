import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { extractPhones, normalizePhone } from '@ikimetr/core';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import { safeFetch, type FetchDependencies } from './generic-website';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const INSTAGRAM_PLATFORM_HOTLINES = new Set<string>();

export interface InstagramPostSample {
  caption?: string;
  url?: string;
  timestamp?: string;
}

export interface InstagramProfileData {
  username: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string;
  businessCategory?: string;
  isBusinessAccount?: boolean;
  businessPhoneNumber?: string;
  publicPhone?: string;
  posts?: InstagramPostSample[];
}

export type ExplicitInstagramSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateInstagramUrl(
  input: string,
  kind: 'profile' | 'post' | 'hashtag' | 'search' = 'profile'
): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid Instagram URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!INSTAGRAM_HOSTS.has(hostname) && !INSTAGRAM_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid Instagram host`);
  }

  if (kind === 'profile') {
    const cleanPath = url.pathname.replace(/^\/|\/$/g, '');
    if (!cleanPath || cleanPath.startsWith('p/') || cleanPath.startsWith('reel/') || cleanPath.startsWith('explore/')) {
      throw new Error(`URL path ${url.pathname} is not a valid Instagram profile path`);
    }
  }

  return url.toString();
}

const RAW_REALTOR_SIGNALS = [
  'dasinmaz emlak',
  'daşınmaz əmlak',
  'emlak agenti',
  'əmlak agenti',
  'emlak agentliyi',
  'əmlak agentliyi',
  'emlak',
  'əmlak',
  'baku emlak',
  'bakı əmlak',
  'rieltor',
  'риелтор',
  'риэлтор',
  'makler',
  'vasiteci',
  'vasitəçi',
  'menzil satisi',
  'mənzil satışı',
  'menzil kirayesi',
  'mənzil kirayəsi',
  'kiraye menzil',
  'kirayə mənzil',
  'ev alqi-satqisi',
  'ev alqı-satqısı',
  'heyet evi',
  'həyət evi',
  'villa satisi',
  'villa satışı',
  'bag evi',
  'bağ evi',
  'obyekt satisi',
  'obyekt satışı',
  'obyekt icaresi',
  'obyekt icarəsi',
  'torpaq satisi',
  'torpaq satışı',
  'недвижимость',
  'недвижимость баку',
  'агент по недвижимости',
  'агентство недвижимости',
  'продажа квартир',
  'аренда квартир',
  'квартиры в баку',
  'новостройки баку',
  'real estate',
  'realtor',
  'real estate agent',
  'property agent',
  'property agency',
  'baku real estate',
  'baku properties',
];

const RAW_UNRELATED_SIGNALS = [
  'avtomobil',
  'avto',
  'masin alqi satqisi',
  'maşın alqı satqısı',
  'avtosalon',
  'zapchast',
  'detaling',
  'avtoyuma',
  'avto servis',
  'автомобили',
  'автосалон',
  'запчасти',
  'телефон',
  'telefon satisi',
  'smartfon',
  'iphone',
  'istore',
  'xiaomi',
  'noutbuk',
  'elektronika',
  'электроника',
  'gozellik salonu',
  'gözəllik salonu',
  'sac ustasi',
  'saç ustası',
  'vizaj',
  'makiyaj',
  'manikur',
  'butik',
  'geyim',
  'paltar',
  'ayaqqabi',
  'ayaqqabı',
  'салон красоты',
  'одежда',
  'обувь',
  'restoran',
  'kafe',
  'sirniyyat',
  'şirniyyat',
  'tort',
  'doner',
  'dönər',
  'ресторан',
  'кафе',
  'доставка еды',
  'turizm',
  'aviabilet',
  'viza xidmeti',
  'otel',
  'turizm agentliyi',
  'туризм',
  'визы',
  'авиабилеты',
  'stomatoloq',
  'klinika',
  'hekim',
  'həkim',
  'aptek',
  'vekil',
  'vəkil',
  'huquq xidmeti',
  'hüquq xidməti',
  'yurist',
  'стоматолог',
  'клиника',
  'юрист',
];

const REALTOR_SIGNALS_NORMALIZED = RAW_REALTOR_SIGNALS.map(s => normalizeBinaText(s));
const UNRELATED_SIGNALS_NORMALIZED = RAW_UNRELATED_SIGNALS.map(s => normalizeBinaText(s));

export function isInstagramRealEstateProfile(profile: InstagramProfileData): boolean {
  const bioNorm = normalizeBinaText(profile.biography || '');
  const nameNorm = normalizeBinaText(`${profile.fullName || ''} ${profile.username}`);
  const catNorm = normalizeBinaText(profile.businessCategory || '');
  const postsNorm = normalizeBinaText(profile.posts?.map(p => p.caption || '').join(' ') || '');

  // 1. Strict negative check: if bio/category is predominantly unrelated
  let negativeScore = 0;
  for (const neg of UNRELATED_SIGNALS_NORMALIZED) {
    if (bioNorm.includes(neg) || catNorm.includes(neg) || nameNorm.includes(neg)) {
      negativeScore += 2;
    } else if (postsNorm.includes(neg)) {
      negativeScore += 1;
    }
  }

  // 2. Positive real estate signals check
  let positiveScore = 0;
  for (const pos of REALTOR_SIGNALS_NORMALIZED) {
    if (bioNorm.includes(pos)) {
      positiveScore += 3;
    }
    if (catNorm.includes(pos)) {
      positiveScore += 3;
    }
    if (nameNorm.includes(pos)) {
      positiveScore += 2;
    }
    if (postsNorm.includes(pos)) {
      positiveScore += 1;
    }
  }

  // Real estate category metadata check
  if (catNorm.includes('real estate') || catNorm.includes('emlak') || catNorm.includes('nedvijimost')) {
    positiveScore += 4;
  }

  // Must have strong positive signal (score >= 2) and positive > negative
  return positiveScore >= 2 && positiveScore > negativeScore;
}

export function detectExplicitInstagramSellerType(profile: InstagramProfileData): ExplicitInstagramSellerType {
  const bioNorm = normalizeBinaText(profile.biography || '');
  const nameNorm = normalizeBinaText(`${profile.fullName || ''} ${profile.username}`);
  const catNorm = normalizeBinaText(profile.businessCategory || '');
  const combined = `${bioNorm} ${nameNorm} ${catNorm}`;

  // 1. Owner check
  if (
    bioNorm.includes('mulkiyyetci') ||
    bioNorm.includes('maklerler narahat etmesin') ||
    bioNorm.includes('sahibinden') ||
    bioNorm.includes('sexsi elanlar')
  ) {
    return 'owner';
  }

  // 2. Agency check
  if (
    combined.includes('agentlik') ||
    combined.includes('agency') ||
    combined.includes('emlak agentliyi') ||
    combined.includes('агентство недвижимости') ||
    combined.includes('real estate agency') ||
    combined.includes('group') ||
    combined.includes('estate')
  ) {
    return 'agency';
  }

  // 3. Agent check
  if (
    combined.includes('rieltor') ||
    combined.includes('makler') ||
    combined.includes('vasiteci') ||
    combined.includes('emlakci') ||
    combined.includes('риелтор') ||
    combined.includes('риэлтор') ||
    combined.includes('realtor') ||
    combined.includes('agent') ||
    profile.isBusinessAccount === true
  ) {
    return 'agent';
  }

  return 'agent';
}

function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function extractPhonesFromInstagramProfile(profile: InstagramProfileData): string[] {
  const candidates: string[] = [];

  if (profile.publicPhone) candidates.push(profile.publicPhone);
  if (profile.businessPhoneNumber) candidates.push(profile.businessPhoneNumber);

  const textToScan = `${profile.biography || ''} ${profile.externalUrl || ''} ${profile.posts?.map(p => p.caption || '').join(' ') || ''}`;
  const extracted = extractPhones(textToScan);
  for (const ep of extracted) {
    if (ep.isValid && ep.normalized) {
      candidates.push(ep.normalized);
    }
  }

  const validNormalized: string[] = [];
  for (const raw of candidates) {
    const norm = normalizePhone(raw, 'AZ');
    if (
      norm.isValid &&
      norm.normalized &&
      !norm.isForeign &&
      !INSTAGRAM_PLATFORM_HOTLINES.has(norm.normalized) &&
      !validNormalized.includes(norm.normalized)
    ) {
      validNormalized.push(norm.normalized);
    }
  }

  return validNormalized;
}

export function parseInstagramProfileData(
  profile: InstagramProfileData,
  pageUrl: string
): ConnectorEvidence | null {
  // 1. Conservative real estate verification
  if (!isInstagramRealEstateProfile(profile)) {
    return null;
  }

  const sellerType = detectExplicitInstagramSellerType(profile);
  if (sellerType === 'owner') {
    return null;
  }

  // 2. Public phone extraction
  const phones = extractPhonesFromInstagramProfile(profile);
  if (phones.length === 0) {
    return null;
  }

  const primaryPhone = phones[0]!;
  const sellerName = profile.fullName?.trim() || profile.username;
  const isAgency = sellerType === 'agency';
  const agencyName = isAgency
    ? (profile.fullName && /agentlik|agency|emlak|estate|group/i.test(profile.fullName) ? profile.fullName : `${sellerName} Agency`)
    : undefined;

  const city = extractAzCity(`${profile.biography || ''} ${profile.fullName || ''}`);
  const excerpt = `${profile.username} (${profile.fullName || ''}) · ${profile.biography || ''}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, primaryPhone, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'profile',
    excerpt,
    rawPhone: primaryPhone,
    platform: 'instagram',
    fingerprint: fp,
    username: profile.username,
    explicitSellerType: sellerType,
  };

  if (sellerName) evidence.name = sellerName;
  if (agencyName) evidence.agency = agencyName;
  if (city) evidence.city = city;

  return evidence;
}

export function extractInstagramProfileFromHtml(html: string, pageUrl: string): InstagramProfileData | null {
  const $ = load(html);

  let username = '';
  try {
    const u = new URL(pageUrl);
    username = u.pathname.replace(/^\/|\/$/g, '').split('/')[0] || '';
  } catch {
    username = '';
  }

  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
  const ogDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';

  // Parse display name from og:title: "Full Name (@username) • Instagram..."
  let fullName = '';
  const titleMatch = /^(.*?)\s*\(@([a-zA-Z0-9._]+)\)/.exec(ogTitle);
  if (titleMatch) {
    fullName = titleMatch[1]?.trim() || '';
    if (!username) username = titleMatch[2]?.trim() || '';
  }

  // Parse bio and post text from og:description
  let biography = ogDesc;
  const descMatch = /posts\s*-\s*See Instagram photos and videos from .*?:\s*"(.*)"/i.exec(ogDesc);
  if (descMatch && descMatch[1]) {
    biography = descMatch[1].trim();
  }

  if (!username) return null;

  const result: InstagramProfileData = {
    username,
    biography: biography || ogDesc,
  };
  if (fullName) {
    result.fullName = fullName;
  }
  return result;
}

export async function crawlInstagram(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateInstagramUrl(options.startUrl || 'https://www.instagram.com', 'search');
  const items: ConnectorEvidence[] = [];

  // If startUrl is a single profile URL
  if (startUrl.includes('instagram.com/') && !startUrl.endsWith('instagram.com/') && !startUrl.includes('/explore/')) {
    const page = await safeFetch(startUrl, deps);
    if (page.response.ok) {
      const profile = extractInstagramProfileFromHtml(page.body, startUrl);
      if (profile) {
        const evidence = parseInstagramProfileData(profile, startUrl);
        if (evidence) {
          items.push(evidence);
        }
      }
    }
    return {
      items,
      pagesChecked: 1,
      estimatedItems: items.length,
    };
  }

  return {
    items,
    pagesChecked: 1,
    estimatedItems: items.length,
  };
}
