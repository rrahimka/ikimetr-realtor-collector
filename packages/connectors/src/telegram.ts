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

const TELEGRAM_HOSTS = new Set(['t.me', 'telegram.me', 'telegram.org']);

export interface TelegramPostSample {
  text?: string;
  url?: string;
  timestamp?: string;
}

export interface TelegramSourceData {
  username: string;
  title?: string;
  description?: string;
  externalUrl?: string;
  publicPhone?: string;
  isChannel?: boolean;
  isGroup?: boolean;
  posts?: TelegramPostSample[];
}

export type ExplicitTelegramSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

/**
 * Validates a public Telegram URL.
 */
export function validateTelegramUrl(
  input: string,
  kind: 'channel' | 'group' | 'profile' | 'post' = 'channel'
): string {
  let url: URL;
  try {
    const raw = input.startsWith('@') ? `https://t.me/${input.slice(1)}` : (input.startsWith('http') ? input : `https://${input}`);
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid Telegram URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!TELEGRAM_HOSTS.has(hostname)) {
    throw new Error(`URL host ${url.hostname} is not a valid Telegram host`);
  }

  const cleanPath = url.pathname.replace(/^\/|\/$/g, '');
  if (!cleanPath) {
    throw new Error(`URL path ${url.pathname} is not a valid Telegram channel/profile path`);
  }

  if (kind === 'post' && !cleanPath.includes('/')) {
    // optional post check
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
  'pubg',
  'oyun hesablari',
  'tiktok panel',
  'canli yayim',
  'reqs dersleri',
  'stomatoloq',
  'klinika',
  'aptek',
  'kriptovalyuta',
  'treydinq',
  'kripto',
  'forex',
  'vakansiya',
  'is elanlari',
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

export interface TelegramClassificationResult {
  isRealtor: boolean;
  sellerType: ExplicitTelegramSellerType;
  score: number;
  signals: string[];
  isForeign: boolean;
  isOwner: boolean;
}

/**
 * Classifies a public Telegram source (channel, group, profile, post).
 */
export function isTelegramRealEstateSource(
  data: TelegramSourceData
): TelegramClassificationResult {
  const combinedText = [
    data.username,
    data.title,
    data.description,
    data.externalUrl,
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

  let sellerType: ExplicitTelegramSellerType = 'unknown';
  if (isOwner) {
    sellerType = 'owner';
  } else if (isRealtor) {
    const textToCheck = `${data.username} ${data.title || ''} ${data.description || ''}`.toLowerCase();
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
 * Builds ConnectorEvidence items from parsed Telegram public source data.
 */
export function buildTelegramEvidence(
  data: TelegramSourceData
): ConnectorResult {
  const classification = isTelegramRealEstateSource(data);
  const combinedText = [
    data.username,
    data.title,
    data.description,
    data.externalUrl,
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
  const sourceUrl = `https://t.me/${data.username.replace(/^@/, '')}`;
  const fp = createHash('sha256').update(`telegram:${data.username}:${primaryPhone}`).digest('hex');
  const excerpt = `${data.username} (${data.title || ''}) · ${data.description || ''}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const sellerName = data.title?.trim() || data.username;
  const isAgency = classification.sellerType === 'agency';
  const agencyName = isAgency
    ? (data.title && /agentlik|agency|emlak|estate|group|qrup|mərkəz|merkez/i.test(data.title) ? data.title : `${sellerName} Agency`)
    : undefined;
  const city = extractAzCity(combinedText) || 'Bakı';

  const evidence: ConnectorEvidence = {
    sourceUrl,
    locationType: data.isGroup ? 'post' : 'profile',
    excerpt,
    rawPhone: primaryPhone,
    platform: 'telegram',
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
 * Extracts Telegram public channel/group preview data from HTML.
 */
export function extractTelegramSourceFromHtml(html: string, url: string): TelegramSourceData | null {
  const $ = load(html);
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('.tgme_page_title').text().trim() || $('title').text().trim();
  const ogDesc = $('meta[property="og:description"]').attr('content') || $('.tgme_page_description').text().trim();
  const extra = $('.tgme_page_extra').text().trim().toLowerCase();

  const isChannel = extra.includes('subscribers') || extra.includes('channel') || extra.includes('abunəçi');
  const isGroup = extra.includes('members') || extra.includes('group') || extra.includes('üzv');

  let username = '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    username = u.pathname.replace(/^\/|\/$/g, '');
  } catch {
    username = url.replace(/[^a-zA-Z0-9_]/g, '');
  }

  if (!username) return null;

  const posts: TelegramPostSample[] = [];
  $('.tgme_widget_message_text').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      posts.push({ text });
    }
  });

  return {
    username,
    title: ogTitle,
    description: ogDesc,
    isChannel,
    isGroup,
    posts,
  };
}

/**
 * Crawls a public Telegram channel or group.
 */
export async function crawlTelegram(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateTelegramUrl(options.startUrl || 'https://t.me/baku_emlak');
  const items: ConnectorEvidence[] = [];

  const page = await safeFetch(startUrl, deps);
  if (page.response.ok) {
    const data = extractTelegramSourceFromHtml(page.body, startUrl);
    if (data) {
      const res = buildTelegramEvidence(data);
      items.push(...res.items);
    }
  }

  return {
    items,
    pagesChecked: 1,
    estimatedItems: items.length,
  };
}

