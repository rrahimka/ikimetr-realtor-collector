import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website.js';
import { normalizeBinaText } from './bina.js';
import { extractAzCity } from './tap.js';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types.js';

const STOP_HOSTS = new Set(['stop.az', 'www.stop.az']);

export type ExplicitStopSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateStopUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Stop.az URL is not valid');
  }
  if (url.protocol !== 'https:' || !STOP_HOSTS.has(url.hostname)) {
    throw new Error('Stop.az URL must use https://stop.az or https://www.stop.az');
  }
  return url.toString();
}

export function detectExplicitStopSellerType(text: string): ExplicitStopSellerType {
  const normalized = normalizeBinaText(text);
  if (/(?:^|[^\p{L}])(?:agentlik|emlak agentliyi|agency)(?:$|[^\p{L}])/u.test(normalized)) return 'agency';
  if (/(?:^|[^\p{L}])(?:vasiteci|makler|rieltor|agent)(?:$|[^\p{L}])/u.test(normalized)) return 'agent';
  if (/(?:^|[^\p{L}])(?:mulkiyyetci|sahibinden|sexsi|ozum)(?:$|[^\p{L}])/u.test(normalized)) return 'owner';
  return 'unknown';
}

const fingerprint = (...parts: string[]) => createHash('sha256').update(parts.join('\0')).digest('hex');

export function discoverStopListingUrls(html: string, baseUrl = 'https://stop.az', cap = 50): string[] {
  const $ = load(html);
  const urls: string[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    if (urls.length >= cap) return;
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const full = new URL(href, baseUrl).toString();
      const parsed = new URL(full);
      if (STOP_HOSTS.has(parsed.hostname) && (parsed.pathname.includes('/elan/') || parsed.pathname.includes('/item/'))) {
        const canonical = full.split('?')[0]!;
        if (!seen.has(canonical)) {
          seen.add(canonical);
          urls.push(canonical);
        }
      }
    } catch {
      // ignore
    }
  });

  return urls;
}

export function parseStopListingPage(html: string, pageUrl: string): ConnectorEvidence | null {
  const $ = load(html);
  const contactText = $('.contact, .author, .seller, .user-info').text() || $('body').text();
  const sellerType = detectExplicitStopSellerType(contactText);

  if (sellerType === 'owner') return null;

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
  $('.phone, .tel').each((_i, el) => {
    const txt = $(el).text().trim();
    if (txt) phones.push(txt);
  });

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

  const title = $('h1').first().text().trim();
  const authorName = $('.author-name, .seller-name').first().text().trim() || undefined;
  const isAgency = sellerType === 'agency';
  const city = extractAzCity($('.city, .location').text() || $('body').text());
  const excerpt = `${title} ${contactText}`.slice(0, 500).replace(/\s+/g, ' ').trim();

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: validPhone.normalized,
    platform: 'stop.az',
    fingerprint: fingerprint(pageUrl, validPhone.normalized, excerpt),
    explicitSellerType: sellerType,
  };
  if (city) evidence.city = city;
  if (isAgency) {
    evidence.agency = authorName || 'Stop.az Agency';
  } else if (authorName) {
    evidence.name = authorName;
  }
  return evidence;
}

export async function crawlStopAz(options: CrawlOptions, deps: FetchDependencies = {}): Promise<ConnectorResult> {
  const startUrl = validateStopUrl(options.startUrl);
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from Stop.az`);

  const listingUrls = discoverStopListingUrls(indexPage.body, startUrl, options.maxPages || 50);
  const items: ConnectorEvidence[] = [];
  let pagesChecked = 1;

  for (const url of listingUrls) {
    if (options.delayMs > 0) await new Promise(r => setTimeout(r, options.delayMs));
    try {
      const page = await safeFetch(url, deps);
      pagesChecked++;
      if (!page.response.ok) continue;
      const parsed = parseStopListingPage(page.body, url);
      if (parsed) items.push(parsed);
    } catch {
      // ignore
    }
  }

  return { items, pagesChecked, estimatedItems: items.length };
}
