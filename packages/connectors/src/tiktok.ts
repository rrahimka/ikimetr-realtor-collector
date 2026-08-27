import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { extractPhones, normalizePhone } from '@ikimetr/core';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import { safeFetch, type FetchDependencies } from './generic-website';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com']);
const TIKTOK_PLATFORM_HOTLINES = new Set<string>();

export interface TikTokVideoSample {
  desc?: string;
  url?: string;
  timestamp?: string;
}

export interface TikTokProfileData {
  username: string;
  nickname?: string;
  signature?: string;
  bioLink?: string;
  isCommerceUser?: boolean;
  category?: string;
  publicPhone?: string;
  videos?: TikTokVideoSample[];
}

export type ExplicitTikTokSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateTikTokUrl(
  input: string,
  kind: 'profile' | 'video' | 'hashtag' | 'search' = 'profile'
): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid TikTok URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!TIKTOK_HOSTS.has(hostname) && !TIKTOK_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid TikTok host`);
  }

  if (kind === 'profile') {
    const cleanPath = url.pathname.replace(/^\/|\/$/g, '');
    if (!cleanPath || cleanPath.startsWith('video/') || cleanPath.startsWith('tag/')) {
      throw new Error(`URL path ${url.pathname} is not a valid TikTok profile path`);
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
  'gaming',
  'oyun',
  'pubg',
  'dance',
  'reqs',
];

const REALTOR_SIGNALS_NORMALIZED = RAW_REALTOR_SIGNALS.map(s => normalizeBinaText(s));
const UNRELATED_SIGNALS_NORMALIZED = RAW_UNRELATED_SIGNALS.map(s => normalizeBinaText(s));

export function isTikTokRealEstateProfile(profile: TikTokProfileData): boolean {
  const bioNorm = normalizeBinaText(profile.signature || '');
  const nameNorm = normalizeBinaText(`${profile.nickname || ''} ${profile.username}`);
  const catNorm = normalizeBinaText(profile.category || '');
  const videosNorm = normalizeBinaText(profile.videos?.map(v => v.desc || '').join(' ') || '');

  // 1. Strict negative check
  let negativeScore = 0;
  for (const neg of UNRELATED_SIGNALS_NORMALIZED) {
    if (bioNorm.includes(neg) || catNorm.includes(neg) || nameNorm.includes(neg)) {
      negativeScore += 2;
    } else if (videosNorm.includes(neg)) {
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
    if (videosNorm.includes(pos)) {
      positiveScore += 1;
    }
  }

  return positiveScore >= 2 && positiveScore > negativeScore;
}

export function detectExplicitTikTokSellerType(profile: TikTokProfileData): ExplicitTikTokSellerType {
  const bioNorm = normalizeBinaText(profile.signature || '');
  const nameNorm = normalizeBinaText(`${profile.nickname || ''} ${profile.username}`);
  const catNorm = normalizeBinaText(profile.category || '');
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
    profile.isCommerceUser === true
  ) {
    return 'agent';
  }

  return 'agent';
}

function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function extractPhonesFromTikTokProfile(profile: TikTokProfileData): string[] {
  const candidates: string[] = [];

  if (profile.publicPhone) candidates.push(profile.publicPhone);

  const textToScan = `${profile.signature || ''} ${profile.bioLink || ''} ${profile.videos?.map(v => v.desc || '').join(' ') || ''}`;
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
      !TIKTOK_PLATFORM_HOTLINES.has(norm.normalized) &&
      !validNormalized.includes(norm.normalized)
    ) {
      validNormalized.push(norm.normalized);
    }
  }

  return validNormalized;
}

export function parseTikTokProfileData(
  profile: TikTokProfileData,
  pageUrl: string
): ConnectorEvidence | null {
  // 1. Conservative real estate verification
  if (!isTikTokRealEstateProfile(profile)) {
    return null;
  }

  const sellerType = detectExplicitTikTokSellerType(profile);
  if (sellerType === 'owner') {
    return null;
  }

  // 2. Public phone extraction
  const phones = extractPhonesFromTikTokProfile(profile);
  if (phones.length === 0) {
    return null;
  }

  const primaryPhone = phones[0]!;
  const sellerName = profile.nickname?.trim() || profile.username;
  const isAgency = sellerType === 'agency';
  const agencyName = isAgency
    ? (profile.nickname && /agentlik|agency|emlak|estate|group/i.test(profile.nickname) ? profile.nickname : `${sellerName} Agency`)
    : undefined;

  const city = extractAzCity(`${profile.signature || ''} ${profile.nickname || ''}`);
  const excerpt = `@${profile.username} (${profile.nickname || ''}) · ${profile.signature || ''}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, primaryPhone, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'profile',
    excerpt,
    rawPhone: primaryPhone,
    platform: 'tiktok',
    fingerprint: fp,
    username: profile.username.replace(/^@/, ''),
    explicitSellerType: sellerType,
  };

  if (sellerName) evidence.name = sellerName;
  if (agencyName) evidence.agency = agencyName;
  if (city) evidence.city = city;

  return evidence;
}

export function extractTikTokProfileFromHtml(html: string, pageUrl: string): TikTokProfileData | null {
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

  // Attempt JSON extraction from __UNIVERSAL_DATA_FOR_REHYDRATION__ or SIGI_STATE
  const scriptTag = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html() || $('script[id="SIGI_STATE"]').html();
  if (scriptTag) {
    try {
      const parsed: unknown = JSON.parse(scriptTag);
      if (typeof parsed === 'object' && parsed !== null) {
        const root = parsed as Record<string, unknown>;
        const defaultScope = root.__DEFAULT_SCOPE__ as Record<string, unknown> | undefined;
        const userDetailScope = defaultScope?.['webapp.user-detail'] as Record<string, unknown> | undefined;
        const userInfo = userDetailScope?.userInfo as Record<string, unknown> | undefined;
        const user = userInfo?.user as Record<string, unknown> | undefined;
        if (user) {
          const uniqueId = typeof user.uniqueId === 'string' ? user.uniqueId : '';
          const res: TikTokProfileData = {
            username: uniqueId || username.replace(/^@/, ''),
          };
          if (typeof user.nickname === 'string' && user.nickname) res.nickname = user.nickname;
          if (typeof user.signature === 'string' && user.signature) res.signature = user.signature;
          const bioLink = user.bioLink as Record<string, unknown> | undefined;
          if (typeof bioLink?.link === 'string' && bioLink.link) res.bioLink = bioLink.link;
          const commerceInfo = user.commerceUserInfo as Record<string, unknown> | undefined;
          if (typeof commerceInfo?.commerceUser === 'boolean') {
            res.isCommerceUser = commerceInfo.commerceUser;
          }
          return res;
        }
      }
    } catch {
      // fallback to meta tags
    }
  }

  // Fallback to meta tags
  let nickname = '';
  const titleMatch = /^(.*?)\s*\(@([a-zA-Z0-9._]+)\)/.exec(ogTitle);
  if (titleMatch) {
    nickname = titleMatch[1]?.trim() || '';
    if (!username) username = titleMatch[2]?.trim() || '';
  }

  if (!username) return null;

  const res: TikTokProfileData = {
    username: username.replace(/^@/, ''),
    signature: ogDesc,
  };
  if (nickname) {
    res.nickname = nickname;
  }
  return res;
}

export async function crawlTikTok(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateTikTokUrl(options.startUrl || 'https://www.tiktok.com', 'search');
  const items: ConnectorEvidence[] = [];

  if (startUrl.includes('tiktok.com/@') && !startUrl.includes('/video/')) {
    const page = await safeFetch(startUrl, deps);
    if (page.response.ok) {
      const profile = extractTikTokProfileFromHtml(page.body, startUrl);
      if (profile) {
        const evidence = parseTikTokProfileData(profile, startUrl);
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
