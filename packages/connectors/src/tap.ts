import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website';
import { normalizeBinaText } from './bina';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const TAP_HOSTS = new Set(['tap.az', 'www.tap.az']);
const LISTING_PATH = /^\/elanlar\/(?:.*\/)?(\d+)\/?$/;
const TAP_PLATFORM_HOTLINES = new Set(['+994125261919', '+994125261918']);

export type ExplicitTapSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateTapUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error('Tap.az URL is not valid');
  }
  if (url.protocol !== 'https:' || !TAP_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Tap.az URL must use https://tap.az or https://www.tap.az');
  }
  if (kind === 'listing') {
    const match = LISTING_PATH.exec(url.pathname);
    if (!match) throw new Error('Tap.az listing URL format invalid');
    return `https://tap.az/elanlar/${match[1]}`;
  }
  if (url.pathname === '' || url.pathname === '/') {
    return 'https://tap.az/elanlar/dasinmaz-emlak';
  }
  return url.toString();
}

export function detectExplicitTapSellerType(text: string): ExplicitTapSellerType {
  const normalized = normalizeBinaText(text);
  if (/(?:^|[^\p{L}])(?:magaza|sirket|agentlik|emlak agentliyi|agency|diller|mmc|group)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agency';
  }
  if (/(?:^|[^\p{L}])(?:vasiteci|makler|rieltor|emlakci|agent|maklerler|realtor)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agent';
  }
  if (/(?:^|[^\p{L}])(?:mulkiyyetci|sahibinden|sahibi|sexsi|ozum|ev sahibi|owner)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'owner';
  }
  return 'unknown';
}

const AZ_CITIES = ['Bakı', 'Sumqayıt', 'Gəncə', 'Xırdalan', 'Abşeron', 'Naxçıvan', 'Şəki', 'Quba', 'Lənkəran', 'Mingəçevir', 'Şirvan', 'Qusar', 'Zaqatala', 'İsmayıllı', 'Qəbələ', 'Şamaxı', 'Masallı', 'Salyan', 'Bərdə', 'Ağdam', 'Yevlax'];

export function extractAzCity(text: string): string | undefined {
  const normalized = normalizeBinaText(text);
  for (const city of AZ_CITIES) {
    if (normalized.includes(normalizeBinaText(city))) return city;
  }
  return undefined;
}

const fingerprint = (...parts: string[]) => createHash('sha256').update(parts.join('\0')).digest('hex');

export function discoverTapListingUrls(html: string, baseUrl = 'https://tap.az/elanlar/dasinmaz-emlak', cap = 50): string[] {
  const $ = load(html);
  const urls: string[] = [];
  const seen = new Set<string>();

  $('a[href*="/elanlar/"]').each((_i, el) => {
    if (urls.length >= cap) return;
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const full = new URL(href, baseUrl).toString();
      if (LISTING_PATH.test(new URL(full).pathname)) {
        const canonical = validateTapUrl(full, 'listing');
        if (!seen.has(canonical)) {
          seen.add(canonical);
          urls.push(canonical);
        }
      }
    } catch {
      // ignore invalid
    }
  });

  return urls;
}

export function parseTapListingPage(html: string, pageUrl: string): ConnectorEvidence | null {
  const $ = load(html);
  const authorBlock = $('.shop--title, .shop-info, .shop-contact, .seller-info, .js-author-name, .author, .author-info, [class*="shop"], [class*="author"]').text() || '';
  const descBlock = $('.description, [class*="description"], p').text() || '';
  const title = $('h1.title, h1, .lot-title').first().text().trim();
  const contextText = `${authorBlock} ${title} ${descBlock}`;

  let sellerType = detectExplicitTapSellerType(authorBlock);
  if (sellerType === 'unknown') {
    sellerType = detectExplicitTapSellerType(contextText);
  }

  if (sellerType === 'owner') {
    return null; // Skip private owners
  }

  // Extract phone numbers
  const phones: string[] = [];
  $('a[href^="tel:"]').each((_i, el) => {
    const raw = $(el).attr('href')!.slice(4).split('?')[0]!;
    if (raw) phones.push(raw);
  });
  $('a[href*="wa.me/"]').each((_i, el) => {
    const href = $(el).attr('href')!;
    const match = /wa\.me\/(\d{7,15})/.exec(href);
    if (match?.[1]) phones.push(match[1]);
  });
  $('.phone-numbers, .show-phones, .phone, .phones').each((_i, el) => {
    const txt = $(el).text().trim();
    if (txt) phones.push(txt);
  });

  // Extract from plain text (excluding footer support number)
  const allText = $('body').find('*').not('footer, header, nav').text();
  const phoneRegex = /(?:\+?994|0)?[\s-]*(?:50|51|55|70|77|99|12|10)[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
  let match: RegExpExecArray | null;
  while ((match = phoneRegex.exec(allText)) !== null) {
    phones.push(match[0]);
  }

  const validPhones = phones
    .map(p => normalizePhone(p, 'AZ'))
    .filter(p => p.isValid && p.normalized && !p.isForeign && !TAP_PLATFORM_HOTLINES.has(p.normalized));

  if (validPhones.length === 0 || !validPhones[0]?.normalized) return null;

  const chosenPhone = validPhones[0].normalized;
  const authorName = $('.author-name, .shop-title, .shop-info, .js-author-name, .author').first().text().trim() || undefined;
  const isAgency = sellerType === 'agency';
  const city = extractAzCity($('.location, .lot-info, .breadcrumbs').text() || $('body').text());
  const excerpt = `${title} ${authorBlock} ${descBlock}`.slice(0, 500).replace(/\s+/g, ' ').trim();

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: chosenPhone,
    platform: 'tap.az',
    fingerprint: fingerprint(pageUrl, chosenPhone, excerpt),
    explicitSellerType: sellerType,
  };
  if (city) evidence.city = city;
  if (isAgency) {
    evidence.agency = authorName || 'Tap.az Agency';
  } else if (authorName) {
    evidence.name = authorName;
  }
  return evidence;
}

export async function crawlTapAz(options: CrawlOptions, deps: FetchDependencies = {}): Promise<ConnectorResult> {
  const startUrl = validateTapUrl(options.startUrl, 'search');
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from Tap.az`);

  const listingUrls = discoverTapListingUrls(indexPage.body, startUrl, options.maxPages || 50);
  const items: ConnectorEvidence[] = [];
  let pagesChecked = 1;

  for (const url of listingUrls) {
    if (options.shouldStop && (await options.shouldStop())) break;
    if (options.shouldProcessUrl && !(await options.shouldProcessUrl(url))) continue;
    if (options.delayMs > 0) await new Promise(r => setTimeout(r, options.delayMs));
    try {
      const page = await safeFetch(url, deps);
      pagesChecked++;
      if (!page.response.ok) continue;
      const parsed = parseTapListingPage(page.body, url);
      if (parsed) items.push(parsed);
    } catch {
      // skip individual listing fetch failures gracefully
    }
  }

  return { items, pagesChecked, estimatedItems: items.length };
}
