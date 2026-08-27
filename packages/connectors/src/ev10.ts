import { createHash } from 'node:crypto';
import { normalizePhone } from '@ikimetr/core';
import { extractAzCity } from './tap';
import { normalizeBinaText } from './bina';
import type { FetchDependencies } from './generic-website';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const EV10_HOSTS = new Set(['ev10.az', 'www.ev10.az']);
const LISTING_PATH = /^\/(?:posting|elan)\/(\d+)\/?$/i;
const EV10_PLATFORM_HOTLINES = new Set(['+994554312159']);

export type ExplicitEv10SellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateEv10Url(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid Ev10 URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!EV10_HOSTS.has(hostname) && !EV10_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid Ev10 host`);
  }

  if (kind === 'listing') {
    if (!LISTING_PATH.test(url.pathname)) {
      throw new Error(`URL path ${url.pathname} is not a valid Ev10 listing path`);
    }
  }

  return url.toString();
}

export function detectExplicitEv10SellerType(posting: {
  is_agent?: boolean;
  owner_name?: string;
  description?: string;
}): ExplicitEv10SellerType {
  if (posting.is_agent === true) {
    const desc = posting.description ? normalizeBinaText(posting.description) : '';
    if (
      desc.includes('agentlik') ||
      desc.includes('agentliy') ||
      desc.includes('agency') ||
      desc.includes('sirket')
    ) {
      return 'agency';
    }
    return 'agent';
  }

  if (posting.is_agent === false) {
    return 'owner';
  }

  // Fallback to text detection
  const text = `${posting.owner_name || ''} ${posting.description || ''}`;
  const norm = normalizeBinaText(text);
  if (!norm) return 'unknown';

  if (
    norm.includes('agentlik') ||
    norm.includes('agentliy') ||
    norm.includes('agency') ||
    norm.includes('sirket')
  ) {
    return 'agency';
  }
  if (
    norm.includes('vasiteci') ||
    norm.includes('rieltor') ||
    norm.includes('makler') ||
    norm.includes('ofis haqqi') ||
    norm.includes('xidmet haqqi')
  ) {
    return 'agent';
  }
  if (
    norm.includes('mulkiyyetci') ||
    norm.includes('emlak sahibi') ||
    norm.includes('sahibi') ||
    norm.includes('sahibinden') ||
    norm.includes('oz evimdir') ||
    norm.includes('sexsi')
  ) {
    return 'owner';
  }

  return 'unknown';
}

function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export interface Ev10PostingJson {
  id: number;
  is_agent?: boolean;
  phone_number?: string;
  owner_name?: string;
  description?: string;
  city?: string;
  district?: string;
  address?: string;
  price?: number;
  email?: string;
}

export function parseEv10PostingJson(posting: Ev10PostingJson, pageUrl: string): ConnectorEvidence | null {
  const sellerType = detectExplicitEv10SellerType(posting);
  if (sellerType === 'owner') {
    return null; // Skip private owners
  }

  const rawPhone = posting.phone_number?.trim();
  if (!rawPhone) return null;

  const normObj = normalizePhone(rawPhone, 'AZ');
  if (!normObj.isValid || !normObj.normalized || EV10_PLATFORM_HOTLINES.has(normObj.normalized)) {
    return null;
  }

  const sellerName = posting.owner_name?.trim() || undefined;
  const isAgency = sellerType === 'agency';
  const city = posting.city || extractAzCity(`${posting.district || ''} ${posting.address || ''} ${posting.description || ''}`);
  const excerpt = `${sellerName || ''} ${posting.address || ''} ${normObj.normalized}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, normObj.normalized, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: normObj.raw,
    platform: 'ev10.az',
    fingerprint: fp,
    explicitSellerType: sellerType,
  };

  if (city) evidence.city = city;
  if (sellerName) evidence.name = sellerName;
  if (isAgency) {
    evidence.agency = sellerName ? `${sellerName} Agency` : 'Ev10 Agency';
  }

  return evidence;
}

export async function fetchEv10PostingById(
  id: number | string,
  deps: FetchDependencies = {}
): Promise<Ev10PostingJson | null> {
  const fetcher = deps.fetcher ?? fetch;
  const apiUrl = `https://ev10.az/api/v1/postings/${id}`;
  try {
    const res = await fetcher(apiUrl, {
      headers: {
        'User-Agent': 'ikimetr-realtor-collector/0.1 (+local research tool)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as Ev10PostingJson;
  } catch {
    return null;
  }
}

export async function crawlEv10Az(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateEv10Url(options.startUrl || 'https://ev10.az/alqi-satqi', 'search');
  const maxPages = options.maxPages || 50;
  const items: ConnectorEvidence[] = [];
  let pagesChecked = 0;

  const fetcher = deps.fetcher ?? fetch;

  // If a single listing URL is passed, crawl just that listing
  try {
    const singleUrl = new URL(startUrl);
    const match = singleUrl.pathname.match(LISTING_PATH);
    if (match?.[1]) {
      const postingId = match[1];
      const posting = await fetchEv10PostingById(postingId, deps);
      pagesChecked = 1;
      if (posting) {
        const evidence = parseEv10PostingJson(posting, startUrl);
        if (evidence) items.push(evidence);
      }
      return { items, pagesChecked, estimatedItems: items.length };
    }
  } catch {
    // ignore
  }

  // 1. Fetch postings list from Ev10 API
  const apiListUrl = `https://ev10.az/api/v1/postings?page=1&limit=${Math.min(maxPages, 50)}`;
  const listRes = await fetcher(apiListUrl, {
    headers: {
      'User-Agent': 'ikimetr-realtor-collector/0.1 (+local research tool)',
      'Accept': 'application/json',
    },
  });

  pagesChecked = 1;
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from Ev10.az API`);

  const listData = (await listRes.json()) as { postings?: Array<{ id: number }> };
  const postingsList = listData.postings || [];

  for (const item of postingsList) {
    if (options.shouldStop && (await options.shouldStop())) break;
    const listingUrl = `https://ev10.az/posting/${item.id}`;
    if (options.shouldProcessUrl && !(await options.shouldProcessUrl(listingUrl))) continue;
    if (options.delayMs > 0) await new Promise((r) => setTimeout(r, options.delayMs));

    try {
      const posting = await fetchEv10PostingById(item.id, deps);
      pagesChecked++;
      if (!posting) continue;

      const evidence = parseEv10PostingJson(posting, listingUrl);
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
