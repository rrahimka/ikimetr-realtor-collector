import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const YENIEMLAK_HOSTS = new Set(['yeniemlak.az', 'www.yeniemlak.az']);
const LISTING_PATH = /^\/elan\/[a-z0-9-]+-(\d+)$/i;
const YENIEMLAK_PLATFORM_HOTLINES = new Set(['+994553372888']);

export type ExplicitYeniEmlakSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateYeniEmlakUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid YeniEmlak URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!YENIEMLAK_HOSTS.has(hostname) && !YENIEMLAK_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid YeniEmlak host`);
  }

  if (kind === 'listing') {
    if (!LISTING_PATH.test(url.pathname)) {
      throw new Error(`URL path ${url.pathname} is not a valid YeniEmlak listing path`);
    }
  }

  return url.toString();
}

export function detectExplicitYeniEmlakSellerType(text: string): ExplicitYeniEmlakSellerType {
  const norm = normalizeBinaText(text);
  if (!norm) return 'unknown';

  if (
    norm.includes('vasiteci') ||
    norm.includes('rieltor') ||
    norm.includes('makler') ||
    norm.includes('vasiteci / rieltor') ||
    norm.includes('posrednik')
  ) {
    return 'agent';
  }

  if (
    norm.includes('agentlik') ||
    norm.includes('emlak agentliyi') ||
    norm.includes('sirket') ||
    norm.includes('agentstvo') ||
    norm.includes('agency')
  ) {
    return 'agency';
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

export function parseYeniEmlakListingPage(html: string, pageUrl: string): ConnectorEvidence | null {
  const $ = load(html);
  
  const sellerTypeBlock = $('.elvrn').text().trim();
  const sellerName = $('.ad').first().text().trim() || undefined;
  const description = $('.text').text().trim();
  const addressText = $('h1:contains("Ünvan")').next('.params').text().trim() || $('.params').text().trim();
  const fullContext = `${sellerTypeBlock} ${description} ${addressText}`;

  let sellerType = detectExplicitYeniEmlakSellerType(sellerTypeBlock);
  if (sellerType === 'unknown') {
    sellerType = detectExplicitYeniEmlakSellerType(fullContext);
  }

  if (sellerType === 'owner') {
    return null; // Skip private owners
  }

  // Extract phone numbers
  const phones: string[] = [];

  // 1. Check img src in div.tel: <img src="/tel-show/0554813446">
  $('.tel img, .tel').each((_i, el) => {
    const src = $(el).attr('src') || '';
    const match = src.match(/\/tel-show\/([0-9+]+)/);
    if (match?.[1]) {
      phones.push(match[1]);
    }
  });

  // 2. Check tel: links
  $('a[href^="tel:"]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const raw = href.replace(/^tel:/i, '').trim();
    if (raw) phones.push(raw);
  });

  // 3. Regex fallback
  const phoneMatches = html.match(/(?:\+?994|0)\s*(?:50|51|55|70|77|99|12|20|21|22|23|24|25|26)\s*\d{3}[\s-]?\d{2}[\s-]?\d{2}/g) || [];
  for (const m of phoneMatches) {
    phones.push(m);
  }

  // Normalize and filter phones
  const validPhones: Array<{ raw: string; normalized: string }> = [];
  for (const raw of phones) {
    const normObj = normalizePhone(raw, 'AZ');
    if (normObj && normObj.isValid && normObj.normalized && !YENIEMLAK_PLATFORM_HOTLINES.has(normObj.normalized)) {
      if (!validPhones.some((p) => p.normalized === normObj.normalized)) {
        validPhones.push({ raw, normalized: normObj.normalized });
      }
    }
  }

  if (validPhones.length === 0) {
    return null;
  }

  const primaryPhone = validPhones[0]!;
  const city = extractAzCity(`${addressText} ${description}`);
  const isAgency = sellerType === 'agency';
  const excerpt = `${sellerName || ''} ${sellerTypeBlock} ${addressText} ${primaryPhone.raw}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, primaryPhone.normalized, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: primaryPhone.raw,
    platform: 'yeniemlak.az',
    fingerprint: fp,
    explicitSellerType: sellerType,
  };

  if (city) evidence.city = city;
  if (isAgency) {
    evidence.agency = sellerName || 'YeniEmlak Agency';
  } else if (sellerName) {
    evidence.name = sellerName;
  }

  return evidence;
}

export function discoverYeniEmlakListingUrls(html: string, baseUrl: string = 'https://yeniemlak.az', maxCount: number = 50): string[] {
  const $ = load(html);
  const urls: string[] = [];

  $('a[href]').each((_i, el) => {
    if (urls.length >= maxCount) return;
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      const u = new URL(resolved);
      if (YENIEMLAK_HOSTS.has(u.hostname.replace(/^www\./, '')) && LISTING_PATH.test(u.pathname)) {
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

export async function crawlYeniEmlakAz(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateYeniEmlakUrl(options.startUrl || 'https://yeniemlak.az/elan/axtar?elan_nov=1&emlak=2', 'search');
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from YeniEmlak.az`);

  const listingUrls = discoverYeniEmlakListingUrls(indexPage.body, startUrl, options.maxPages || 50);
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

      const evidence = parseYeniEmlakListingPage(page.body, url);
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
