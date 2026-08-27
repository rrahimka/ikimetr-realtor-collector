import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import {
  extractPhones,
  tokenizeIdentifier,
  isAzerbaijanMobileNumber,
  isForeignRealEstatePhone,
} from '@ikimetr/core';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import { safeFetch, type FetchDependencies } from './generic-website';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const FACEBOOK_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com', 'fb.me', 'm.facebook.com']);

export interface FacebookPostSample {
  text?: string;
  url?: string;
  timestamp?: string;
}

export interface FacebookPageData {
  pageId?: string;
  username: string;
  pageTitle?: string;
  about?: string;
  businessCategory?: string;
  externalUrl?: string;
  publicPhone?: string;
  publicEmail?: string;
  address?: string;
  posts?: FacebookPostSample[];
}

export type ExplicitFacebookSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

/**
 * Validates a public Facebook page URL.
 */
export function validateFacebookUrl(
  input: string,
  kind: 'page' | 'post' = 'page'
): string {
  let url: URL;
  try {
    const raw = input.startsWith('http') ? input : `https://${input}`;
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid Facebook URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!FACEBOOK_HOSTS.has(hostname) && !FACEBOOK_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid Facebook host`);
  }

  const cleanPath = url.pathname.replace(/^\/|\/$/g, '');
  if (!cleanPath) {
    throw new Error(`URL path ${url.pathname} is not a valid Facebook page path`);
  }

  if (kind === 'page' && (cleanPath.startsWith('groups/') || cleanPath.startsWith('events/'))) {
    // group / event path
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
  'car dealership',
  'kredit ve lizingle avtomobil',
  'gozellik salonu',
  'gözəllik salonu',
  'beauty',
  'salon',
  'lazer epilyasiya',
  'vizaj',
  'sac duzumu',
  'restoran',
  'kafe',
  'lounge',
  'fast food',
  'geyim',
  'moda',
  'paltar',
  'ayaqqabi',
  'boutique',
  'telefon temiri',
  'smartfon',
  'turizm',
  'travel',
  'aviabilet',
  'stomatoloq',
  'klinika',
  'aptek',
  'kriptovalyuta',
  'treydinq',
  'kripto',
  'forex',
  'tikinti materiallari',
  'temir tikinti',
  'mebel salonu',
];

const RAW_OWNER_SIGNALS = [
  'sahibinden',
  'sahibindən',
  'oz evimdir',
  'öz evimdir',
  'ev sahibiyem',
  'ev sahibiyəm',
  'maklerler narahat etmesin',
  'vasiteciler narahat etmesin',
  'vasitəçilər narahat etməsin',
  'araci yoxdur',
  'araçı yoxdur',
  'birbasa sahibinden',
  'birbaşa sahibindən',
];

export interface FacebookClassificationResult {
  isRealtor: boolean;
  sellerType: ExplicitFacebookSellerType;
  score: number;
  signals: string[];
  isForeign: boolean;
  isOwner: boolean;
}

/**
 * Classifies a public Facebook page.
 */
export function isFacebookRealEstatePage(
  data: FacebookPageData
): FacebookClassificationResult {
  const combinedText = [
    data.username,
    data.pageTitle,
    data.about,
    data.businessCategory,
    data.externalUrl,
    data.address,
    ...(data.posts || []).map(p => p.text || ''),
  ]
    .filter(Boolean)
    .join(' ');

  const normalized = normalizeBinaText(combinedText).toLowerCase();
  const tokenizedUsername = tokenizeIdentifier(data.username);

  const signals: string[] = [];
  let positiveScore = 0;
  let negativeScore = 0;
  let ownerScore = 0;

  // 1. Check Realtor Signals
  for (const sig of RAW_REALTOR_SIGNALS) {
    if (normalized.includes(sig)) {
      signals.push(sig);
      positiveScore += 2;
    }
  }

  if (tokenizedUsername.strongRealtorMatches.length > 0) {
    signals.push(...tokenizedUsername.strongRealtorMatches);
    positiveScore += tokenizedUsername.strongRealtorMatches.length * 3;
  }

  if (data.businessCategory && /real estate|property|realtor|əmlak|daşınmaz|broker/i.test(data.businessCategory)) {
    signals.push(`category:${data.businessCategory}`);
    positiveScore += 4;
  }

  // 2. Check Unrelated Business Signals
  for (const sig of RAW_UNRELATED_SIGNALS) {
    if (normalized.includes(sig)) {
      signals.push(`unrelated:${sig}`);
      negativeScore += 5;
    }
  }

  if (tokenizedUsername.negativeMatches.length > 0) {
    signals.push(...tokenizedUsername.negativeMatches.map(m => `unrelated:${m}`));
    negativeScore += 10;
  }

  // 3. Check Owner Signals
  for (const sig of RAW_OWNER_SIGNALS) {
    if (normalized.includes(sig)) {
      signals.push(`owner:${sig}`);
      ownerScore += 3;
    }
  }

  // 4. Check Foreign Signals
  const phone = data.publicPhone || (extractPhones(combinedText)[0]?.normalized ?? '');
  const isForeign = Boolean(phone && isForeignRealEstatePhone(phone));

  const isOwner = ownerScore > 0 && positiveScore < 6;
  const isRealtor = positiveScore >= 2 && negativeScore === 0 && !isForeign && !isOwner;

  let sellerType: ExplicitFacebookSellerType = 'unknown';
  if (isOwner) {
    sellerType = 'owner';
  } else if (isRealtor) {
    const textToCheck = `${data.username} ${data.pageTitle || ''} ${data.about || ''} ${data.businessCategory || ''}`.toLowerCase();
    sellerType = (
      textToCheck.includes('agentlik') ||
      textToCheck.includes('agency') ||
      textToCheck.includes('qrup') ||
      textToCheck.includes('group') ||
      textToCheck.includes('mərkəz') ||
      textToCheck.includes('merkez') ||
      textToCheck.includes('şirkət') ||
      textToCheck.includes('sirket')
    )
      ? 'agency'
      : 'agent';
  }

  return {
    isRealtor,
    sellerType,
    score: Math.max(0, positiveScore - negativeScore - ownerScore),
    signals,
    isForeign,
    isOwner,
  };
}

/**
 * Builds ConnectorEvidence items from parsed Facebook public page data.
 */
export function buildFacebookEvidence(
  data: FacebookPageData
): ConnectorResult {
  const classification = isFacebookRealEstatePage(data);
  const combinedText = [
    data.username,
    data.pageTitle,
    data.about,
    data.businessCategory,
    data.externalUrl,
    data.address,
    ...(data.posts || []).map(p => p.text || ''),
  ].filter(Boolean).join(' ');

  const phones = extractPhones(combinedText)
    .filter(p => p.isValid && !p.isForeign && isAzerbaijanMobileNumber(p.normalized || ''));

  if (!classification.isRealtor || phones.length === 0) {
    return {
      items: [],
      pagesChecked: 1,
      estimatedItems: 0,
    };
  }

  const primaryPhone = phones[0]!.normalized!;
  const sourceUrl = `https://www.facebook.com/${data.username.replace(/^@/, '')}`;
  const fp = createHash('sha256').update(`facebook:${data.username}:${primaryPhone}`).digest('hex');
  const excerpt = `${data.username} (${data.pageTitle || ''}) · ${data.about || ''}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const sellerName = data.pageTitle?.trim() || data.username;
  const isAgency = classification.sellerType === 'agency';
  const agencyName = isAgency
    ? (data.pageTitle && /agentlik|agency|emlak|estate|group|qrup|mərkəz|merkez/i.test(data.pageTitle) ? data.pageTitle : `${sellerName} Agency`)
    : undefined;
  const city = extractAzCity(combinedText) || 'Bakı';

  const evidence: ConnectorEvidence = {
    sourceUrl,
    locationType: 'profile',
    excerpt,
    rawPhone: primaryPhone,
    platform: 'facebook',
    fingerprint: fp,
    username: data.username,
    explicitSellerType: classification.sellerType,
  };

  if (sellerName) evidence.name = sellerName;
  if (agencyName) evidence.agency = agencyName;
  if (city) evidence.city = city;

  return {
    items: [evidence],
    pagesChecked: 1,
    estimatedItems: 1,
  };
}

/**
 * Extracts Facebook public page preview data from HTML.
 */
export function extractFacebookPageFromHtml(html: string, url: string): FacebookPageData | null {
  const $ = load(html);
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';

  let username = '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    username = u.pathname.replace(/^\/|\/$/g, '').split('/')[0] || '';
  } catch {
    username = url.replace(/[^a-zA-Z0-9_]/g, '');
  }

  if (!username) return null;

  return {
    username,
    pageTitle: ogTitle,
    about: ogDesc,
  };
}

/**
 * Crawls a public Facebook page.
 */
export async function crawlFacebook(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateFacebookUrl(options.startUrl || 'https://www.facebook.com/baku.emlak');
  const items: ConnectorEvidence[] = [];

  const page = await safeFetch(startUrl, deps);
  if (page.response.ok) {
    const data = extractFacebookPageFromHtml(page.body, startUrl);
    if (data) {
      const res = buildFacebookEvidence(data);
      items.push(...res.items);
    }
  }

  return {
    items,
    pagesChecked: 1,
    estimatedItems: items.length,
  };
}
