import { load } from 'cheerio';
import { normalizePhone } from '@ikimetr/core';

export const BINA_OUTCOMES = [
  'accepted',
  'duplicate',
  'private_seller',
  'missing_phone',
  'invalid_phone',
  'page_removed',
  'blocked',
  'parse_error',
  'cancelled',
] as const;

export type BinaOutcome = (typeof BINA_OUTCOMES)[number];
export type BinaUrlKind = 'search' | 'listing';

const BINA_HOSTS = new Set(['bina.az', 'www.bina.az']);
const LISTING_PATH = /^\/items\/(\d+)\/?$/;

function parseAllowedUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Bina URL is not allowed');
  }
  if (
    url.protocol !== 'https:' ||
    !BINA_HOSTS.has(url.hostname) ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  ) {
    throw new Error('Bina URL is not allowed');
  }
  return url;
}

export function validateBinaUrl(input: string, kind: BinaUrlKind): string {
  const url = parseAllowedUrl(input);
  if (kind === 'search') return url.toString();

  const match = LISTING_PATH.exec(url.pathname);
  if (!match) throw new Error('Bina listing URL is not canonical');
  const id = BigInt(match[1]!).toString();
  if (id === '0') throw new Error('Bina listing URL is not canonical');
  return `https://bina.az/items/${id}`;
}

export function discoverBinaListingUrls(html: string, baseUrl: string, cap = 0): string[] {
  const safeBase = validateBinaUrl(baseUrl, 'search');
  const limit = cap > 0 ? Math.trunc(cap) : Number.POSITIVE_INFINITY;
  const result: string[] = [];
  const seen = new Set<string>();
  const $ = load(html);

  for (const anchor of $('a[href]').toArray()) {
    if (result.length >= limit) break;
    const href = $(anchor).attr('href');
    if (!href) continue;
    try {
      const canonical = validateBinaUrl(new URL(href, safeBase).toString(), 'listing');
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      result.push(canonical);
    } catch {
      // Non-listing and non-Bina links are expected on a search page.
    }
  }
  return result;
}

export type ExplicitBinaSellerType = 'agency' | 'agent' | 'owner' | 'unknown';

export function normalizeBinaText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[əe]/gu, 'e')
    .replace(/[ıi]/gu, 'i')
    .replace(/[öo]/gu, 'o')
    .replace(/[üu]/gu, 'u')
    .replace(/[ğg]/gu, 'g')
    .replace(/[çc]/gu, 'c')
    .replace(/[şs]/gu, 's');
}

const GENERIC_OWNER_LABEL_RE = /^elan(?:i)?n\s+sahibi:?$/u;

export function isGenericBinaOwnerLabel(text: string): boolean {
  return GENERIC_OWNER_LABEL_RE.test(normalizeBinaText(text).trim());
}

export function detectExplicitBinaSellerType(text: string): ExplicitBinaSellerType {
  const normalized = normalizeBinaText(text);
  if (GENERIC_OWNER_LABEL_RE.test(normalized.trim())) return 'unknown';

  if (/(?:^|[^\p{L}])(?:agentlik|emlak agentliyi|agency|агентство)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agency';
  }
  if (/(?:^|[^\p{L}])(?:vasiteci|rieltor|makler|emlakci|риелтор|риэлтор|агент|realtor|agent)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'agent';
  }
  if (/(?:^|[^\p{L}])(?:mulkiyyetci|sahibinden|sahibi|sexsi|ozum|собственник|владелец|хозяин|owner|private)(?:$|[^\p{L}])/u.test(normalized)) {
    return 'owner';
  }
  return 'unknown';
}



export function hasVisibleAgencyMarker(text: string): boolean {
  const sellerType = detectExplicitBinaSellerType(text);
  return sellerType === 'agency' || sellerType === 'agent';
}

export function isExplicitOwnerMarker(text: string): boolean {
  return detectExplicitBinaSellerType(text) === 'owner';
}

export function normalizeVisibleBinaPhone(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '' || /[*xX•…]/u.test(trimmed)) return undefined;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 12) return undefined;
  const phone = normalizePhone(trimmed, 'AZ');
  if (!phone.isValid || phone.isForeign || !phone.normalized || !/^\+994\d{9}$/.test(phone.normalized)) return undefined;
  return phone.normalized;
}

export function maskPhone(phone: string): string {
  return /^\+994\d{9}$/.test(phone) ? `${phone.slice(0, 6)}*****${phone.slice(-2)}` : '[redacted phone]';
}
