import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const UNVAN_HOSTS = new Set(['unvan.az', 'www.unvan.az']);
const LISTING_PATH = /-[0-9]+\.html$/i;
const UNVAN_PLATFORM_HOTLINES = new Set<string>();

export type ExplicitUnvanSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateUnvanUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid Unvan URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!UNVAN_HOSTS.has(hostname) && !UNVAN_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid Unvan host`);
  }

  if (kind === 'listing') {
    if (!LISTING_PATH.test(url.pathname)) {
      throw new Error(`URL path ${url.pathname} is not a valid Unvan listing path`);
    }
  }

  return url.toString();
}

export function detectExplicitUnvanSellerType(text: string): ExplicitUnvanSellerType {
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
    norm.includes('butun elanlari') ||
    norm.includes('vasiteci') ||
    norm.includes('rieltor') ||
    norm.includes('makler') ||
    norm.includes('ofis haqqi') ||
    norm.includes('xidmet haqqi') ||
    norm.includes('posrednik')
  ) {
    return 'agent';
  }

  if (
    norm.includes('mulkiyyetci') ||
    norm.includes('emlak sahibi') ||
    norm.includes('sahibi') ||
    norm.includes('sahibinden') ||
    norm.includes('oz evimdir') ||
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

export function parseUnvanListingPage(html: string, pageUrl: string, revealedPhone?: string): ConnectorEvidence | null {
  const $ = load(html);

  // Check if it's in the real estate category
  const breadcrumb = $('body').text();
  const isRealEstate = breadcrumb.includes('Daşınmaz Əmlak') || breadcrumb.includes('Mənzil') || breadcrumb.includes('Ev');
  if (!isRealEstate) {
    return null; // Skip non-real estate ads
  }

  const infoContact = $('.infocontact, .author').first().text().trim();
  const title = $('h1').first().text().trim();
  const desc = $('.text, .content, .description, p').text().trim();
  const fullContext = `${infoContact} ${title} ${desc}`;

  let sellerType = detectExplicitUnvanSellerType(infoContact);
  if (sellerType === 'unknown') {
    sellerType = detectExplicitUnvanSellerType(fullContext);
  }

  if (sellerType === 'owner') {
    return null; // Skip private owners
  }

  // Extract seller name from infoContact e.g. "Samir Hüseynov (Bütün Elanları)" -> "Samir Hüseynov"
  let sellerName: string | undefined;
  const nameMatch = infoContact.match(/^([^(\d]+)/);
  if (nameMatch?.[1]) {
    const rawName = nameMatch[1].replace(/Bakı|şəhəri|Sumqayıt|Xırdalan/gi, '').trim();
    if (rawName && rawName.length > 1 && !/sahib/i.test(rawName)) {
      sellerName = rawName;
    }
  }

  // Collect phone numbers from revealed string, tel links, or regex fallback
  const phones: string[] = [];
  if (revealedPhone) {
    for (const p of revealedPhone.split(',')) {
      const trimmed = p.trim();
      if (trimmed) phones.push(trimmed);
    }
  }

  $('a[href^="tel:"]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const raw = href.replace(/^tel:/i, '').trim();
    if (raw && !raw.includes('XXX')) phones.push(raw);
  });

  const phoneMatches = html.match(/(?:\+?994|0)\s*(?:50|51|55|70|77|99|12|20|21|22|23|24|25|26)\s*\d{3}[\s-]?\d{2}[\s-]?\d{2}/g) || [];
  for (const m of phoneMatches) {
    if (!m.includes('XXX')) phones.push(m);
  }

  // Normalize and filter phones
  const validPhones: Array<{ raw: string; normalized: string }> = [];
  for (const raw of phones) {
    const normObj = normalizePhone(raw, 'AZ');
    if (normObj && normObj.isValid && normObj.normalized && !UNVAN_PLATFORM_HOTLINES.has(normObj.normalized)) {
      if (!validPhones.some((p) => p.normalized === normObj.normalized)) {
        validPhones.push({ raw, normalized: normObj.normalized });
      }
    }
  }

  if (validPhones.length === 0) {
    return null;
  }

  const primaryPhone = validPhones[0]!;
  const city = extractAzCity(`${infoContact} ${title} ${desc}`);
  const isAgency = sellerType === 'agency';
  const excerpt = `${sellerName || ''} ${infoContact} ${title} ${primaryPhone.raw}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, primaryPhone.normalized, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: primaryPhone.raw,
    platform: 'unvan.az',
    fingerprint: fp,
    explicitSellerType: sellerType,
  };

  if (city) evidence.city = city;
  if (sellerName) evidence.name = sellerName;
  if (isAgency) {
    evidence.agency = sellerName ? `${sellerName} Agency` : 'Unvan Agency';
  }

  return evidence;
}

export function extractUnvanAjaxParams(html: string): { id: string; t: string; h: string; rf: string } | null {
  const $ = load(html);
  const telShowEl = $('#telshow');
  const id = telShowEl.attr('data-id');
  const t = telShowEl.attr('data-t') || 'product';
  const h = telShowEl.attr('data-h') || '';
  const rf = telShowEl.attr('data-rf') || '';

  if (!id) return null;
  return { id, t, h, rf };
}

export function discoverUnvanListingUrls(html: string, baseUrl: string = 'https://unvan.az', maxCount: number = 50): string[] {
  const $ = load(html);
  const urls: string[] = [];

  $('a[href]').each((_i, el) => {
    if (urls.length >= maxCount) return;
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      const u = new URL(resolved);
      if (UNVAN_HOSTS.has(u.hostname.replace(/^www\./, '')) && LISTING_PATH.test(u.pathname)) {
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

export async function revealUnvanPhone(
  params: { id: string; t: string; h: string; rf: string },
  refererUrl: string,
  cookieHeader: string,
  deps: FetchDependencies = {}
): Promise<string | null> {
  const fetcher = deps.fetcher ?? fetch;
  const postBody = `act=telshow&id=${encodeURIComponent(params.id)}&t=${encodeURIComponent(params.t)}&h=${encodeURIComponent(params.h)}&rf=${encodeURIComponent(params.rf)}`;

  try {
    const res = await fetcher('https://unvan.az/ajax.php', {
      method: 'POST',
      headers: {
        'User-Agent': 'ikimetr-realtor-collector/0.1 (+local research tool)',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://unvan.az',
        'Referer': refererUrl,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: postBody,
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: number; tel?: string; msg?: string };
    if (json.ok && json.tel) {
      return json.tel;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function crawlUnvanAz(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateUnvanUrl(options.startUrl || 'https://unvan.az/dasinmaz-emlak', 'search');
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from Unvan.az`);

  const rawSetCookies = indexPage.response.headers.getSetCookie?.() || [indexPage.response.headers.get('set-cookie') || ''];
  const cookiePairs: string[] = [];
  for (const c of rawSetCookies) {
    const pair = c.split(';')[0]?.trim();
    if (pair) cookiePairs.push(pair);
  }
  const cookieHeader = cookiePairs.join('; ');

  const listingUrls = discoverUnvanListingUrls(indexPage.body, startUrl, options.maxPages || 50);
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

      const ajaxParams = extractUnvanAjaxParams(page.body);
      let revealedPhone: string | undefined;
      if (ajaxParams) {
        const tel = await revealUnvanPhone(ajaxParams, url, cookieHeader, deps);
        if (tel) revealedPhone = tel;
      }

      const evidence = parseUnvanListingPage(page.body, url, revealedPhone);
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
