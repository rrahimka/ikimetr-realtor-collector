import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website.js';
import { normalizeBinaText } from './bina.js';
import { extractAzCity } from './tap.js';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types.js';

const ARENDA_HOSTS = new Set(['arenda.az', 'www.arenda.az']);
const LISTING_PATH = /^\/(?:elan\/|az\/elan\/|ru\/elan\/|menzil\/|kiraye\/)?(?:.*-)?(\d+)\.html?$/i;

export type ExplicitArendaSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateArendaUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Arenda.az URL is not valid');
  }
  if (url.protocol !== 'https:' || !ARENDA_HOSTS.has(url.hostname)) {
    throw new Error('Arenda.az URL must use https://arenda.az or https://www.arenda.az');
  }
  if (kind === 'listing') {
    const match = LISTING_PATH.exec(url.pathname);
    if (!match && !/\/\d+\.html/.test(url.pathname)) {
      return url.toString();
    }
  }
  return url.toString();
}

export function detectExplicitArendaSellerType(text: string): ExplicitArendaSellerType {
  const normalized = normalizeBinaText(text);
  if (/(?:^|[^\p{L}])(?:agentlik|emlak agentliyi|agency|ofis)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agency';
  }
  if (/(?:^|[^\p{L}])(?:vasiteci|makler|rieltor|emlakci|agent)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agent';
  }
  if (/(?:^|[^\p{L}])(?:mulkiyyetci|sahibinden|sahibi|sexsi|ozum|ev sahibi)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'owner';
  }
  return 'unknown';
}

const fingerprint = (...parts: string[]) => createHash('sha256').update(parts.join('\0')).digest('hex');

export function discoverArendaListingUrls(html: string, baseUrl = 'https://arenda.az', cap = 50): string[] {
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
      if (ARENDA_HOSTS.has(parsed.hostname) && (parsed.pathname.includes('/elan/') || /\/\d+\.html/.test(parsed.pathname))) {
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

export function parseArendaListingPage(html: string, pageUrl: string): ConnectorEvidence | null {
  const $ = load(html);
  const contactBlock = $('.seller_info, .agent_info, .contact_info, .user_name, .user-contacts').text() || $('body').text();
  const sellerType = detectExplicitArendaSellerType(contactBlock);

  if (sellerType === 'owner') {
    return null; // Skip private owners
  }

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
  $('.phone, .phone_number, .phones').each((_i, el) => {
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
  const authorName = $('.user_name, .agent_name, .seller_name').first().text().trim() || undefined;
  const isAgency = sellerType === 'agency';
  const city = extractAzCity($('.location, .address, .city').text() || $('body').text());
  const excerpt = `${title} ${contactBlock}`.slice(0, 500).replace(/\s+/g, ' ').trim();

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: validPhone.normalized,
    platform: 'arenda.az',
    fingerprint: fingerprint(pageUrl, validPhone.normalized, excerpt),
    explicitSellerType: sellerType,
  };
  if (city) evidence.city = city;
  if (isAgency) {
    evidence.agency = authorName || 'Arenda.az Agency';
  } else if (authorName) {
    evidence.name = authorName;
  }
  return evidence;
}

export async function crawlArendaAz(options: CrawlOptions, deps: FetchDependencies = {}): Promise<ConnectorResult> {
  const startUrl = validateArendaUrl(options.startUrl, 'search');
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from Arenda.az`);

  const listingUrls = discoverArendaListingUrls(indexPage.body, startUrl, options.maxPages || 50);
  const items: ConnectorEvidence[] = [];
  let pagesChecked = 1;

  for (const url of listingUrls) {
    if (options.delayMs > 0) await new Promise(r => setTimeout(r, options.delayMs));
    try {
      const page = await safeFetch(url, deps);
      pagesChecked++;
      if (!page.response.ok) continue;
      const parsed = parseArendaListingPage(page.body, url);
      if (parsed) items.push(parsed);
    } catch {
      // ignore individual failure
    }
  }

  return { items, pagesChecked, estimatedItems: items.length };
}
