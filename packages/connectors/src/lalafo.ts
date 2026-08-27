import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';
import { extractAzCity } from './tap';
import { normalizeBinaText } from './bina';
import { safeFetch, type FetchDependencies } from './generic-website';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types';

const LALAFO_HOSTS = new Set(['lalafo.az', 'www.lalafo.az']);
const LISTING_PATH = /\/ads\/[a-zA-Z0-9_-]+-id-(\d+)/i;
const LALAFO_PLATFORM_HOTLINES = new Set<string>();

export type ExplicitLalafoSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function validateLalafoUrl(input: string, kind: 'search' | 'listing' = 'search'): string {
  let url: URL;
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`);
  } catch {
    throw new Error(`Invalid Lalafo URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol must be http(s): ${input}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!LALAFO_HOSTS.has(hostname) && !LALAFO_HOSTS.has(`www.${hostname}`)) {
    throw new Error(`URL host ${url.hostname} is not a valid Lalafo host`);
  }

  if (kind === 'listing') {
    if (!LISTING_PATH.test(url.pathname)) {
      throw new Error(`URL path ${url.pathname} is not a valid Lalafo listing path`);
    }
  }

  return url.toString();
}

export interface LalafoAdData {
  id: number;
  category_id?: number;
  title?: string;
  description?: string;
  city?: string;
  mobile?: string;
  user?: {
    username?: string;
    pro?: boolean;
    business?: {
      business?: boolean;
      features?: {
        company_name?: string | null;
        label?: string | null;
      };
    };
  };
  params?: Array<{
    name?: string;
    value?: string;
  }>;
}

const RAW_REAL_ESTATE_PARAMS = [
  'təklifin növü',
  'tip predlojeniya',
  'inzibati rayonlar',
  'administrativnye rayony',
  'sahə (m2)',
  'sahə',
  'ploshad (m2)',
  'ploshad',
  'torpaq sahəsi (sot)',
  'ploshad uchastka (sot.)',
  'otaq sayı',
  'kolichestvo komnat',
  'mərtəbə',
  'etaj',
  'mərtəbə sayı',
  'etajnost',
  'mənzilin növü',
  'tip jilya',
  'əmlakın növü',
  'tip nedvijimosti',
  'bina növü',
  'tip zdaniya',
  'sənədin növü',
  'tip dokumenta',
  'təmir',
  'remont',
  'parkinq',
  'parking',
  'kupça',
  'kupchaya',
];

const RAW_NON_REAL_ESTATE_PARAMS = [
  'yürüş',
  'probeq',
  'ban növü',
  'tip kuzova',
  'buraxılış ili',
  'god vypuska',
  'mühərrikin həcmi',
  'obem dvigatelya',
  'sürətlər qutusu',
  'korobka peredach',
  'yaddaş',
  'pamyat',
  'ekran',
  'cins',
  'pol',
  'ölçü',
  'razmer',
];

export const LALAFO_REAL_ESTATE_PARAMS = new Set(RAW_REAL_ESTATE_PARAMS.map(p => normalizeBinaText(p)));
export const LALAFO_NON_REAL_ESTATE_PARAMS = new Set(RAW_NON_REAL_ESTATE_PARAMS.map(p => normalizeBinaText(p)));

const NON_REAL_ESTATE_URL_PATHS = [
  '/avtomobiller',
  '/elektronika',
  '/telefonlar',
  '/xidmetler',
  '/uslugi',
  '/geyim',
  '/odejda',
  '/ehtiyyat-hisseleri',
  '/zapchasti',
  '/heyvanlar',
  '/transport',
];

const REAL_ESTATE_URL_KEYWORDS = [
  'nedvizhimost',
  'dasinmaz-emlak',
  'kommercheskaya-nedvizhimost',
  'kvartiry',
  'doma',
  'zemelnye-uchastki',
  'q-anbar',
  'q-ofis',
  'q-obyekt',
];

export function isLalafoRealEstateAd(data: LalafoAdData, pageUrl?: string): boolean {
  if (pageUrl) {
    const lowerUrl = pageUrl.toLowerCase();
    for (const nonRe of NON_REAL_ESTATE_URL_PATHS) {
      if (lowerUrl.includes(nonRe)) return false;
    }
  }

  const paramNames = data.params?.map((p) => normalizeBinaText(p.name || '').trim()) || [];

  // 1. Explicit non-real-estate parameters check
  for (const name of paramNames) {
    if (LALAFO_NON_REAL_ESTATE_PARAMS.has(name)) {
      return false;
    }
  }

  // 2. Real estate parameters check
  for (const name of paramNames) {
    if (LALAFO_REAL_ESTATE_PARAMS.has(name)) {
      return true;
    }
  }

  // 3. Category ID check (Lalafo real estate subtree: 2000-2999)
  if (typeof data.category_id === 'number') {
    if (data.category_id >= 2000 && data.category_id < 3000) {
      return true;
    }
    // If category_id is outside 2000-2999 and no RE params exist, reject
    if (data.category_id > 0) {
      return false;
    }
  }

  // 4. URL keyword check
  if (pageUrl) {
    const lowerUrl = pageUrl.toLowerCase();
    for (const reKw of REAL_ESTATE_URL_KEYWORDS) {
      if (lowerUrl.includes(reKw)) return true;
    }
  }

  // 5. Title / description keywords check
  const textNorm = normalizeBinaText(`${data.title || ''} ${data.description || ''}`);
  if (
    /(?:^|[^\p{L}])(?:menzil|menziller|bina evi|heyet evi|villa|bag evi|torpaq|obyekt|ofis|anbar|dasinmaz emlak|novostroyka|kupcali|ipoteka)(?:$|[^\p{L}])/u.test(textNorm)
  ) {
    return true;
  }

  return false;
}

export function detectExplicitLalafoSellerType(data: LalafoAdData): ExplicitLalafoSellerType {
  const offerTypeParam = data.params?.find(
    (p) => p.name === 'Təklifin növü' || p.name === 'Тип предложения'
  )?.value;

  const offerNorm = offerTypeParam ? normalizeBinaText(offerTypeParam) : '';
  const descNorm = data.description ? normalizeBinaText(data.description) : '';
  const titleNorm = data.title ? normalizeBinaText(data.title) : '';

  // 1. Explicit owner checks
  if (
    offerNorm.includes('mulkiyyetci') ||
    offerNorm.includes('maklerler narahat etmesin') ||
    descNorm.includes('maklerler narahat etmesin') ||
    descNorm.includes('oz evimdir') ||
    descNorm.includes('sahibinden') ||
    titleNorm.includes('sahibinden')
  ) {
    return 'owner';
  }

  // 2. Business or Agency check
  if (
    data.user?.business?.business === true ||
    Boolean(data.user?.business?.features?.company_name) ||
    offerNorm.includes('agentlik') ||
    offerNorm.includes('agency') ||
    descNorm.includes('agentlik') ||
    descNorm.includes('agency') ||
    descNorm.includes('emlak sirketi')
  ) {
    return 'agency';
  }

  // 3. Pro / Agent check
  if (
    data.user?.pro === true ||
    offerNorm.includes('vasiteci') ||
    offerNorm.includes('rieltor') ||
    offerNorm.includes('makler') ||
    descNorm.includes('ofis haqqi') ||
    descNorm.includes('xidmet haqqi') ||
    descNorm.includes('vasiteci') ||
    descNorm.includes('rieltor')
  ) {
    return 'agent';
  }

  return 'unknown';
}

function fingerprint(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function parseLalafoAdData(data: LalafoAdData, pageUrl: string): ConnectorEvidence | null {
  // Category safety guard: ONLY process ads verified as real-estate
  if (!isLalafoRealEstateAd(data, pageUrl)) {
    return null;
  }

  const sellerType = detectExplicitLalafoSellerType(data);
  // Conservative classification: ONLY accept verified agent or agency, reject owners and unclassified private users
  if (sellerType !== 'agent' && sellerType !== 'agency') {
    return null;
  }

  const rawPhone = data.mobile?.trim();
  if (!rawPhone) return null;

  const normObj = normalizePhone(rawPhone, 'AZ');
  if (!normObj.isValid || !normObj.normalized || LALAFO_PLATFORM_HOTLINES.has(normObj.normalized)) {
    return null;
  }

  const sellerName = data.user?.username?.trim() || undefined;
  const companyName = data.user?.business?.features?.company_name?.trim() || undefined;
  const city = data.city || extractAzCity(`${data.title || ''} ${data.description || ''}`);
  const isAgency = sellerType === 'agency';
  const excerpt = `${sellerName || ''} ${data.title || ''} ${normObj.normalized}`.slice(0, 500).replace(/\s+/g, ' ').trim();
  const fp = fingerprint(pageUrl, normObj.normalized, excerpt);

  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt,
    rawPhone: normObj.raw,
    platform: 'lalafo.az',
    fingerprint: fp,
    explicitSellerType: sellerType,
  };

  if (city) evidence.city = city;
  if (sellerName) evidence.name = sellerName;
  if (isAgency) {
    evidence.agency = companyName || (sellerName ? `${sellerName} Agency` : 'Lalafo Agency');
  }

  return evidence;
}

export function extractLalafoDetailFromHtml(html: string): LalafoAdData | null {
  const $ = load(html);
  const nextDataRaw = $('#__NEXT_DATA__').html();
  if (!nextDataRaw) return null;

  try {
    const parsed = JSON.parse(nextDataRaw) as {
      props?: {
        pageProps?: {
          dehydratedState?: {
            queries?: Array<{
              queryKey?: unknown[];
              state?: {
                data?: LalafoAdData;
              };
            }>;
          };
        };
      };
    };

    const queries = parsed.props?.pageProps?.dehydratedState?.queries;
    if (!queries) return null;

    const detailQuery = queries.find((q) => q.queryKey?.[0] === 'detail');
    return detailQuery?.state?.data || null;
  } catch {
    return null;
  }
}

export function discoverLalafoListingUrls(html: string, baseUrl: string = 'https://lalafo.az', maxCount: number = 50): string[] {
  const $ = load(html);
  const urls: string[] = [];

  $('a[href]').each((_i, el) => {
    if (urls.length >= maxCount) return;
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      const u = new URL(resolved);
      if (LALAFO_HOSTS.has(u.hostname.replace(/^www\./, '')) && LISTING_PATH.test(u.pathname)) {
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

export async function crawlLalafoAz(
  options: CrawlOptions,
  deps: FetchDependencies = {}
): Promise<ConnectorResult> {
  const startUrl = validateLalafoUrl(options.startUrl || 'https://lalafo.az/baku/nedvizhimost', 'search');
  const indexPage = await safeFetch(startUrl, deps);
  if (!indexPage.response.ok) throw new Error(`HTTP ${indexPage.response.status} from Lalafo.az`);

  const listingUrls = discoverLalafoListingUrls(indexPage.body, startUrl, options.maxPages || 50);
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

      const adData = extractLalafoDetailFromHtml(page.body);
      if (adData) {
        const evidence = parseLalafoAdData(adData, url);
        if (evidence) {
          items.push(evidence);
        }
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
