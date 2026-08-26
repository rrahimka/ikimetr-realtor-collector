import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const EMLAKBAZARI_HOSTS = new Set(['emlakbazari.az', 'www.emlakbazari.az']);
const LISTING_PATH = /^\/(?:index\.php\/)?property\/\d+-[a-z0-9-]+$/i;
const EMLAKBAZARI_PLATFORM_HOTLINES = new Set(['+994508395158']);

export type ExplicitEmlakBazariSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateEmlakBazariUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid EmlakBazari URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!EMLAKBAZARI_HOSTS.has(hostname) && !EMLAKBAZARI_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid EmlakBazari host`);
  }

  if (kind === 'listing') {
    if (!LISTING_PATH.test(url.pathname)) {
      throw new Error(`URL path ${url.pathname} is not a valid EmlakBazari listing path`);
    }
  }

  return url.toString();
}

export function detectExplicitEmlakBazariSellerType(text: string): ExplicitEmlakBazariSellerType {
  const norm = normalizeBinaText(text);
  if (!norm) return 'unknown';

  if (
    norm.includes('agentlik') ||
    norm.includes('agency') ||
    norm.includes('emlak agentliyi') ||
    norm.includes('sirket') ||
    norm.includes('guven emlak')
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

export function parseEmlakBazariListingPage(html: string, pageUrl: string): ConnectorEvidence | null {
  const $ = load(html);
  
  const authorBlock = $('.property-author, .property-author__position, .agency-badge').text().trim();
  const authorName = $('.property-author__fullname, .property-author h4, .property-author a').first().text().trim() || undefined;
  const positionText = $('.property-author__position').text().trim();
  const agencyBadge = $('.agency-badge').first().text().trim();
  const title = $('h1').first().text().trim();
  const desc = $('.property-description, .description').text().trim();
  const fullContext = `${authorBlock} ${positionText} ${agencyBadge} ${title} ${desc}`;

  let sellerType = detectExplicitEmlakBazariSellerType(authorBlock);
  if (sellerType === 'unknown') {
    sellerType = detectExplicitEmlakBazariSellerType(fullContext);
  }

  if (sellerType === 'owner') {
    return null; // Skip private owners
  }

  // Extract phone numbers from tel links and context
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
    if (normObj && normObj.isValid && normObj.normalized && !EMLAKBAZARI_PLATFORM_HOTLINES.has(normObj.normalized)) {
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
  const excerpt = `${authorName || ''} ${positionText} ${title} ${primaryPhone.raw}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, primaryPhone.normalized, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: primaryPhone.raw,
    platform: 'emlakbazari.az',
    fingerprint: fp,
    explicitSellerType: sellerType,
  };

  if (city) evidence.city = city;
  if (authorName) evidence.name = authorName;
  if (sellerType === 'agency' || Boolean(agencyBadge)) {
    evidence.agency = authorName ? `${authorName} Agency` : 'EmlakBazari Agency';
  }

  return evidence;
}

export function discoverEmlakBazariListingUrls(html: string, baseUrl: string = 'https://emlakbazari.az', maxCount: number = 50): string[] {
  const $ = load(html);
  const urls: string[] = [];

  $('a[href]').each((_i, el) => {
    if (urls.length >= maxCount) return;
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      const u = new URL(resolved);
      if (EMLAKBAZARI_HOSTS.has(u.hostname.replace(/^www\./, '')) && LISTING_PATH.test(u.pathname)) {
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

export async function crawlEmlakBazariAz(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateEmlakBazariUrl(options.startUrl || 'https://emlakbazari.az/properties?announcement=satilir', 'search');
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from EmlakBazari.az`);

  const listingUrls = discoverEmlakBazariListingUrls(indexPage.body, startUrl, options.maxPages || 50);
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

      const evidence = parseEmlakBazariListingPage(page.body, url);
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
