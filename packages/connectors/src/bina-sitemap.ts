import { validateBinaUrl } from './bina';

const BINA_SITEMAP_HOST = 'bina.azstatic.com';
const BINA_SITEMAP_PREFIX = '/uploads/sitemaps/';
const BINA_SITEMAP_METHODS = new Set(['GET', 'HEAD']);
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_LOCS = 50_000;
const DEFAULT_MAX_DOCUMENTS = 16;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const MAX_XML_TOKEN_BYTES = 256 * 1024;

export type BinaSitemapFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface BinaSitemapDiscoveryOptions {
  robotsText: string;
  maxListings: number;
  fetch?: BinaSitemapFetch;
  maxBytes?: number;
  maxLocs?: number;
  maxDocuments?: number;
  timeoutMs?: number;
  onListingDiscovered?: (url: string) => boolean | Promise<boolean>;
  shouldProcessUrl?: (url: string) => boolean | Promise<boolean>;
}


export function validateBinaSitemapRequest(
  input: string,
  method: string,
  declaredUrls: ReadonlySet<string>,
): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Bina sitemap request is not allowed');
  }

  const canonical = url.toString();
  if (
    !BINA_SITEMAP_METHODS.has(method) ||
    url.protocol !== 'https:' ||
    url.hostname !== BINA_SITEMAP_HOST ||
    !url.pathname.startsWith(BINA_SITEMAP_PREFIX) ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    !declaredUrls.has(canonical)
  ) {
    throw new Error('Bina sitemap request is not allowed');
  }
  return canonical;
}

function canonicalAllowedSitemapUrl(input: string): string | undefined {
  try {
    const canonical = new URL(input).toString();
    return validateBinaSitemapRequest(canonical, 'GET', new Set([canonical]));
  } catch {
    return undefined;
  }
}

export function extractDeclaredBinaSitemapUrls(robotsText: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of robotsText.split(/\r?\n/u)) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    const match = /^sitemap\s*:\s*(\S+)\s*$/iu.exec(line);
    if (!match) continue;
    const canonical = canonicalAllowedSitemapUrl(match[1]!);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }
  return result;
}

function decodeXmlText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, (entity, token: string) => {
    switch (token.toLowerCase()) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default: {
        const hexadecimal = token[1]?.toLowerCase() === 'x';
        const codePoint = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
    }
  });
}

type SitemapKind = 'urlset' | 'sitemapindex';

async function parseSitemap(
  response: Response,
  maxBytes: number,
  maxLocs: number,
  onLoc: (kind: SitemapKind, value: string) => boolean | Promise<boolean>,
): Promise<void> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (contentType !== 'application/xml' && contentType !== 'text/xml' && !contentType.endsWith('+xml')) {
    throw new Error('Bina sitemap content type is not allowed');
  }
  const advertisedBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertisedBytes) && advertisedBytes > maxBytes) {
    throw new Error('Bina sitemap exceeds the byte limit');
  }
  if (!response.body) throw new Error('Bina sitemap response has no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let locs = 0;
  let buffer = '';
  let guardTail = '';
  let kind: SitemapKind | undefined;
  let stopped = false;

  const consume = async (text: string) => {
    const guarded = guardTail + text;
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(guarded)) throw new Error('Bina sitemap XML is not allowed');
    guardTail = guarded.slice(-32);
    buffer += text;
    kind ??= /<(urlset)(?:\s|>)/iu.test(buffer)
      ? 'urlset'
      : /<(sitemapindex)(?:\s|>)/iu.test(buffer)
        ? 'sitemapindex'
        : undefined;

    const locPattern = /<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc\s*>/giu;
    let processedThrough = 0;
    let match: RegExpExecArray | null;
    while ((match = locPattern.exec(buffer)) !== null) {
      if (!kind) throw new Error('Bina sitemap root element is not supported');
      locs += 1;
      if (locs > maxLocs) throw new Error('Bina sitemap exceeds the loc limit');
      processedThrough = locPattern.lastIndex;
      if (await onLoc(kind, decodeXmlText(match[1]!).trim())) {
        stopped = true;
        break;
      }
    }
    if (processedThrough > 0) buffer = buffer.slice(processedThrough);
    if (!stopped && new TextEncoder().encode(buffer).byteLength > MAX_XML_TOKEN_BYTES) {
      throw new Error('Bina sitemap XML token is too large');
    }
  };

  try {
    while (!stopped) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('Bina sitemap exceeds the byte limit');
      await consume(decoder.decode(chunk.value, { stream: true }));
    }
    if (!stopped) await consume(decoder.decode());
    if (!kind) throw new Error('Bina sitemap root element is not supported');
  } finally {
    if (stopped) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function fetchSitemap(
  input: string,
  declaredUrls: Set<string>,
  fetcher: BinaSitemapFetch,
  timeoutMs: number,
): Promise<Response> {
  let current = validateBinaSitemapRequest(input, 'GET', declaredUrls);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(current, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        headers: {
          accept: 'application/xml, text/xml;q=0.9',
          'user-agent': 'IkiMetr-Realtor-Collector/1.0',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Bina sitemap redirect is not allowed');
      const redirected = canonicalAllowedSitemapUrl(new URL(location, current).toString());
      if (!redirected) throw new Error('Bina sitemap redirect is not allowed');
      declaredUrls.add(redirected);
      current = validateBinaSitemapRequest(redirected, 'GET', declaredUrls);
      await response.body?.cancel().catch(() => undefined);
      continue;
    }
    if (!response.ok) throw new Error('Bina sitemap request failed');
    return response;
  }
  throw new Error('Bina sitemap redirect limit exceeded');
}

export async function discoverBinaListingUrlsFromSitemaps(
  options: BinaSitemapDiscoveryOptions,
): Promise<string[]> {
  const limit = options.maxListings > 0 ? Math.trunc(options.maxListings) : Number.POSITIVE_INFINITY;
  const initialUrls = extractDeclaredBinaSitemapUrls(options.robotsText);
  if (initialUrls.length === 0) return [];

  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const maxBytes = Math.max(1, Math.trunc(options.maxBytes ?? DEFAULT_MAX_BYTES));
  const maxLocs = Math.max(1, Math.trunc(options.maxLocs ?? DEFAULT_MAX_LOCS));
  const maxDocuments = Math.max(1, Math.trunc(options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS));
  const timeoutMs = Math.max(1, Math.trunc(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const declaredUrls = new Set(initialUrls);
  const queued = new Set(initialUrls);
  const queue = [...initialUrls].sort((a, b) => (b.includes('item') ? 1 : 0) - (a.includes('item') ? 1 : 0));
  const listings: string[] = [];
  const seenListings = new Set<string>();
  let documents = 0;

  while (queue.length > 0 && listings.length < limit) {
    if (documents >= maxDocuments) throw new Error('Bina sitemap document limit exceeded');
    const sitemapUrl = queue.shift()!;
    documents += 1;
    const response = await fetchSitemap(sitemapUrl, declaredUrls, fetcher, timeoutMs);
    await parseSitemap(response, maxBytes, maxLocs, async (kind, value) => {
      if (kind === 'sitemapindex') {
        const child = canonicalAllowedSitemapUrl(value);
        if (child && !queued.has(child)) {
          declaredUrls.add(child);
          queued.add(child);
          queue.push(child);
          queue.sort((a, b) => b.localeCompare(a));
        }
        return false;
      }
      if (!value.includes('/items/')) return false;
      try {
        const listing = validateBinaUrl(value, 'listing');
        if (!seenListings.has(listing)) {
          seenListings.add(listing);
          const shouldProcess = options.shouldProcessUrl ? await options.shouldProcessUrl(listing) : true;
          if (shouldProcess) {
            listings.push(listing);
            if (options.onListingDiscovered) {
              const stop = await options.onListingDiscovered(listing);
              if (stop) return true;
            }
          }
        }
      } catch {
        // Non-listing and non-Bina URLs are ignored without being fetched.
      }
      return listings.length >= limit;
    });
  }
  return listings;
}
