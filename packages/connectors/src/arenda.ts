import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { safeFetch, type FetchDependencies } from './generic-website';
import { normalizeBinaText } from './bina';
import { extractAzCity } from './tap';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const ARENDA_HOSTS = new Set(['arenda.az', 'www.arenda.az']);
const ARENDA_PLATFORM_HOTLINES = new Set(['+994705962424']);

export type ExplicitArendaSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateArendaUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error('Arenda.az URL is not valid');
  }
  if (url.protocol !== 'https:' || !ARENDA_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Arenda.az URL must use https://arenda.az or https://www.arenda.az');
  }
  if (kind === 'listing') {
    return url.toString().split('?')[0]!;
  }
  if (url.pathname === '' || url.pathname === '/') {
    return 'https://arenda.az/kiraye-menziller';
  }
  return url.toString();
}

export function detectExplicitArendaSellerType(text: string): ExplicitArendaSellerType {
  const normalized = normalizeBinaText(text);
  if (/(?:^|[^\p{L}])(?:agentlik|emlak agentliyi|agency|ofis|mmc|group|dasinmaz emlak)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agency';
  }
  if (/(?:^|[^\p{L}])(?:vasiteci|makler|rieltor|emlakci|agent)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agent';
  }
  if (/(?:^|[^\p{L}])(?:mulkiyyetci|sahibinden|emlak sahibi|sahibi|sexsi|ozum|ev sahibi|owner)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'owner';
  }
  return 'unknown';
}

const fingerprint = (...parts: string[]) => createHash('sha256').update(parts.join('\0')).digest('hex');

const NON_LISTING_PATHS = new Set([
  '/',
  '/xeberler',
  '/haqqimizda',
  '/elaqe',
  '/faq',
  '/xidmetler',
  '/elan-yerlesdir',
  '/secilmisler',
  '/istifadeci-sertleri',
  '/istifadecilerin-reytinqi',
  '/yasayis-kompleksi',
  '/dasinmaz-emlak-agentlikleri',
]);

export function isArendaListingPath(pathname: string): boolean {
  const clean = pathname.split('?')[0]!.toLowerCase();
  if (NON_LISTING_PATHS.has(clean)) return false;
  if (clean.includes('/elan/') || /\/\d+\.html/.test(clean)) return true;
  if (clean.startsWith('/kiraye-') || clean.startsWith('/alqi-satqi-') || clean.startsWith('/satiliq-')) return true;
  if (clean.includes('-otaqli-') || clean.includes('-menzil-') || clean.includes('-torpaq-')) return true;
  return false;
}

export function discoverArendaListingUrls(html: string, baseUrl = 'https://arenda.az/kiraye-menziller', cap = 50): string[] {
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
      if (ARENDA_HOSTS.has(parsed.hostname.toLowerCase()) && isArendaListingPath(parsed.pathname)) {
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
  const sellerCardText = $('div[class*="un-text-slate-700"], .seller_info, .agent_info, .user_name, .author, .contact_box, .user-contacts').text().trim();
  const descText = $('.elan_description, .description, p').text().trim();
  const title = $('h1').first().text().trim();
  const fullContext = `${title} ${sellerCardText} ${descText}`;

  let sellerType = detectExplicitArendaSellerType(sellerCardText);
  if (sellerType === 'unknown') {
    sellerType = detectExplicitArendaSellerType(fullContext);
  }

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
  $('.phone, .phone_number, .phones, a[class*="un-font-semibold"]').each((_i, el) => {
    const txt = $(el).text().trim();
    if (txt) phones.push(txt);
  });

  // Plain text numbers outside footer/header
  const bodyText = $('body').find('*').not('footer, header, nav').text();
  const phoneRegex = /(?:\+?994|0)?[\s-]*(?:50|51|55|70|77|99|12|10)[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
  let match: RegExpExecArray | null;
  while ((match = phoneRegex.exec(bodyText)) !== null) {
    phones.push(match[0]);
  }

  const validPhones = phones
    .map(p => normalizePhone(p, 'AZ'))
    .filter(p => p.isValid && p.normalized && !p.isForeign && !ARENDA_PLATFORM_HOTLINES.has(p.normalized));

  if (validPhones.length === 0 || !validPhones[0]?.normalized) return null;

  const chosenPhone = validPhones[0].normalized;
  const authorName = $('.user_name, .agent_name, .seller_name, div[class*="un-text-slate-700"]').first().text().trim() || undefined;
  const isAgency = sellerType === 'agency';
  const city = extractAzCity($('.location, .address, .city, h1').text() || $('body').text());
  const excerpt = `${title} ${sellerCardText} ${descText}`.slice(0, 500).replace(/\s+/g, ' ').trim();

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: chosenPhone,
    platform: 'arenda.az',
    fingerprint: fingerprint(pageUrl, chosenPhone, excerpt),
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
    if (options.shouldStop && (await options.shouldStop())) break;
    if (options.shouldProcessUrl && !(await options.shouldProcessUrl(url))) continue;
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
