import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website.js';
import { normalizeBinaText } from './bina.js';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types.js';

const TAP_HOSTS = new Set(['tap.az', 'www.tap.az']);
const LISTING_PATH = /^\/elanlar\/(?:.*\/)?(\d+)\/?$/;

export type ExplicitTapSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateTapUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Tap.az URL is not valid');
  }
  if (url.protocol !== 'https:' || !TAP_HOSTS.has(url.hostname)) {
    throw new Error('Tap.az URL must use https://tap.az or https://www.tap.az');
  }
  if (kind === 'listing') {
    const match = LISTING_PATH.exec(url.pathname);
    if (!match) throw new Error('Tap.az listing URL format invalid');
    return `https://tap.az/elanlar/${match[1]}`;
  }
  return url.toString();
}

export function detectExplicitTapSellerType(text: string): ExplicitTapSellerType {
  const normalized = normalizeBinaText(text);
  if (/(?:^|[^\p{L}])(?:magaza|sirket|agentlik|emlak agentliyi|agency|diller)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agency';
  }
  if (/(?:^|[^\p{L}])(?:vasiteci|makler|rieltor|emlakci|agent|maklerler)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agent';
  }
  if (/(?:^|[^\p{L}])(?:mulkiyyetci|sahibinden|sahibi|sexsi|ozum|ev sahibi)(?:$|[^\p{L}])/u.test(normalized)) {
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

export function discoverTapListingUrls(html: string, baseUrl = 'https://tap.az', cap = 50): string[] {
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
  const authorBlock = $('.author, .author-info, .shop-contact, .shop-info, .seller-info, .js-author-name, .lot-info').text() || $('body').text();
  const sellerType = detectExplicitTapSellerType(authorBlock);

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
  $('.phone-numbers, .show-phones, .phone').each((_i, el) => {
    const txt = $(el).text().trim();
    if (txt) phones.push(txt);
  });

  // Extract from plain text if not found in links
  if (phones.length === 0) {
    const allText = $('body').text();
    const phoneRegex = /(?:\+?994|0)?[\s-]*(?:50|51|55|70|77|99|12|10)[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
    let match: RegExpExecArray | null;
    while ((match = phoneRegex.exec(allText)) !== null) {
      phones.push(match[0]);
    }
  }

  if (phones.length === 0) return null;

  const validPhone = phones.map(p => normalizePhone(p, 'AZ')).find(p => p.isValid && !p.isForeign);
  if (!validPhone || !validPhone.normalized) return null;

  const title = $('h1.title, h1, .lot-title').first().text().trim();
  const authorName = $('.author-name, .shop-title, .shop-info, .js-author-name').first().text().trim() || undefined;
  const isAgency = sellerType === 'agency';
  const city = extractAzCity($('.location, .lot-info, .breadcrumbs').text() || $('body').text());
  const excerpt = `${title} ${authorBlock}`.slice(0, 500).replace(/\s+/g, ' ').trim();

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: validPhone.normalized,
    platform: 'tap.az',
    fingerprint: fingerprint(pageUrl, validPhone.normalized, excerpt),
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
