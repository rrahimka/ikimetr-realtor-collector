import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const CITY_HOSTS = new Set(['city.az', 'www.city.az']);
const LISTING_PATH = /^\/item\/(\d+)\/?$/i;
const CITY_PLATFORM_HOTLINES = new Set(['+994502544544']);

export type ExplicitCitySellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateCityUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid City.az URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!CITY_HOSTS.has(hostname) && !CITY_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid City.az host`);
  }

  if (kind === 'listing') {
    if (!LISTING_PATH.test(url.pathname)) {
      throw new Error(`URL path ${url.pathname} is not a valid City.az listing path`);
    }
  }

  return url.toString();
}

export function detectExplicitCitySellerType(text: string): ExplicitCitySellerType {
  const norm = normalizeBinaText(text);
  if (!norm) return 'unknown';

  if (
    norm.includes('agentlik') ||
    norm.includes('agency') ||
    norm.includes('emlak agentliyi') ||
    norm.includes('sirket')
  ) {
    return 'agency';
  }

  if (
    norm.includes('vasiteci') ||
    norm.includes('agent') ||
    norm.includes('rieltor') ||
    norm.includes('makler') ||
    norm.includes('posrednik')
  ) {
    return 'agent';
  }

  if (
    norm.includes('mulkiyyetci') ||
    norm.includes('emlak sahibi') ||
    norm.includes('sahibinden') ||
    norm.includes('sexsi') ||
    norm.includes('sobstvennik') ||
    norm.includes('owner')
  ) {
    return 'owner';
  }

  return 'unknown';
}

function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function parseCityListingPage(html: string, pageUrl: string): ConnectorEvidence | null {
  const $ = load(html);

  const title = $('h1').first().text().trim();
  const desc = $('.item-description, .description, p').text().trim();
  const sellerBlock = $('.item-author, .seller-info, .user-info, .author, .contact').text().trim();
  const fullContext = `${sellerBlock} ${title} ${desc}`;

  let sellerType = detectExplicitCitySellerType(sellerBlock);
  if (sellerType === 'unknown') {
    sellerType = detectExplicitCitySellerType(fullContext);
  }

  if (sellerType === 'owner') {
    return null; // Skip private owners
  }

  const authorName = $('.item-author__name, .author-name, .user-name').first().text().trim() || undefined;

  // Extract phones from tel links and context
  const phones: string[] = [];
  $('a[href^="tel:"]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const raw = href.replace(/^tel:/i, '').trim();
    if (raw) phones.push(raw);
  });

  const phoneMatches = html.match(/(?:\+?994|0)\s*(?:50|51|55|70|77|99|12|20|21|22|23|24|25|26)\s*\d{3}[\s-]?\d{2}[\s-]?\d{2}/g) || [];
  for (const m of phoneMatches) {
    phones.push(m);
  }

  // Normalize and filter out site hotlines
  const validPhones: Array<{ raw: string; normalized: string }> = [];
  for (const raw of phones) {
    const normObj = normalizePhone(raw, 'AZ');
    if (normObj && normObj.isValid && normObj.normalized && !CITY_PLATFORM_HOTLINES.has(normObj.normalized)) {
      if (!validPhones.some((p) => p.normalized === normObj.normalized)) {
        validPhones.push({ raw, normalized: normObj.normalized });
      }
    }
  }

  if (validPhones.length === 0) {
    return null;
  }

  const primaryPhone = validPhones[0]!;
  const city = extractAzCity(`${title} ${desc}`);
  const isAgency = sellerType === 'agency';
  const excerpt = `${authorName || ''} ${title} ${primaryPhone.raw}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, primaryPhone.normalized, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: primaryPhone.raw,
    platform: 'city.az',
    fingerprint: fp,
    explicitSellerType: sellerType,
  };

  if (city) evidence.city = city;
  if (authorName) evidence.name = authorName;
  if (isAgency) {
    evidence.agency = authorName || 'City.az Agency';
  }

  return evidence;
}

export function discoverCityListingUrls(html: string, baseUrl: string = 'https://city.az', maxCount: number = 50): string[] {
  const $ = load(html);
  const urls: string[] = [];

  $('a[href]').each((_i, el) => {
    if (urls.length >= maxCount) return;
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      const u = new URL(resolved);
      if (CITY_HOSTS.has(u.hostname.replace(/^www\./, '')) && LISTING_PATH.test(u.pathname)) {
        if (!urls.includes(resolved)) {
          urls.push(resolved);
        }
      }
    } catch {
      // ignore invalid URLs
    }
  });

  return urls;
}

export async function crawlCityAz(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateCityUrl(options.startUrl || 'https://city.az', 'search');
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from City.az`);

  const listingUrls = discoverCityListingUrls(indexPage.body, startUrl, options.maxPages || 50);
  const items: ConnectorEvidence[] = [];
  let pagesChecked = 1;

  for (const url of listingUrls) {
    if (options.shouldStop && (await options.shouldStop())) break;
    if (options.shouldProcessUrl && !(await options.shouldProcessUrl(url))) continue;
    if (options.delayMs > 0) await new Promise((r) => setTimeout(r, options.delayMs));

    try {
      const page = await safeFetch(url, deps);
      pagesChecked++;
      if (!page.response.ok) continue;

      const evidence = parseCityListingPage(page.body, url);
      if (evidence) {
        items.push(evidence);
      }
    } catch {
      // non-fatal per-item error
    }
  }

  return {
    items,
    pagesChecked,
    estimatedItems: items.length,
  };
}
