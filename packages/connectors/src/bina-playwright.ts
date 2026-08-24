import { createHash } from 'node:crypto';
import { chromium, type Browser, type Page, type Response } from 'playwright';
import {
  BINA_OUTCOMES,
  discoverBinaListingUrls,
  hasVisibleAgencyMarker,
  normalizeVisibleBinaPhone,
  validateBinaUrl,
  type BinaOutcome,
} from './bina';
import type { ConnectorEvidence, ConnectorResult } from './types';

export type BinaStopReason =
  | 'http_403'
  | 'http_429'
  | 'captcha'
  | 'login_required'
  | 'external_redirect'
  | 'kill_switch'
  | 'cancelled'
  | 'permission_disabled'
  | 'technical_error_limit'
  | 'markup_changed';

export type BinaStopRequest = false | 'cancelled' | 'kill_switch';
export type BinaPagePhase = 'before_phone_reveal' | 'after_phone_reveal';

export interface BinaConnectorResult extends ConnectorResult {
  outcomes: Record<BinaOutcome, number>;
  stopReason?: BinaStopReason;
}

export interface BinaConnectorOptions {
  startUrl: string;
  maxListings: number;
  delayMs: number;
  permission: () => boolean | Promise<boolean>;
  shouldStop: () => BinaStopRequest | Promise<BinaStopRequest>;
  sleep?: (milliseconds: number) => Promise<void>;
  launch?: () => Promise<Browser>;
  configurePage?: (page: Page) => Promise<void>;
  observePage?: (page: Page, phase: BinaPagePhase) => Promise<void>;
  onBlockedRequest?: (url: string) => void;
  shouldProcessUrl?: (url: string) => boolean | Promise<boolean>;
}

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);
const PHONE_BUTTON_NAME = 'Nömrəni göstər';

function emptyOutcomes(): Record<BinaOutcome, number> {
  return Object.fromEntries(BINA_OUTCOMES.map((outcome) => [outcome, 0])) as Record<BinaOutcome, number>;
}

function resultWithStop(
  result: Omit<BinaConnectorResult, 'stopReason'>,
  stopReason: BinaStopReason,
  outcome: 'blocked' | 'cancelled' = 'blocked',
): BinaConnectorResult {
  result.outcomes[outcome] += 1;
  return { ...result, stopReason };
}

async function detectedProtection(page: Page, response: Response | null): Promise<BinaStopReason | undefined> {
  if (response?.status() === 403) return 'http_403';
  if (response?.status() === 429) return 'http_429';
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/\bcaptcha\b|robot olmadığınızı|robot olmadiginizi/iu.test(bodyText)) return 'captcha';
  const passwordVisible = await page.locator('input[type="password"]:visible').count().catch(() => 0);
  if (passwordVisible > 0 || /\/(?:login|signin)(?:\/|$)/iu.test(page.url())) return 'login_required';
  return undefined;
}

async function visibleText(page: Page, selector: string): Promise<string | undefined> {
  const locator = page.locator(`${selector}:visible`).first();
  if (await locator.count() === 0) return undefined;
  const text = (await locator.innerText()).trim();
  return text === '' ? undefined : text;
}

async function findVisibleReveal(page: Page) {
  const candidates = page
    .getByRole('button', { name: PHONE_BUTTON_NAME, exact: true })
    .or(page.getByRole('link', { name: PHONE_BUTTON_NAME, exact: true }));
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  return undefined;
}

async function readVisiblePhone(page: Page): Promise<string | undefined> {
  const candidates = page.locator('[data-bina-phone]:visible, a[href^="tel:"]:visible');
  for (let index = 0; index < await candidates.count(); index += 1) {
    const text = (await candidates.nth(index).innerText()).trim();
    if (text !== '') return text;
  }
  return undefined;
}

async function installRequestPolicy(page: Page, options: BinaConnectorOptions, redirected: { url?: string }): Promise<void> {
  page.on('response', (response) => {
    const status = response.status();
    const location = response.headers()['location'];
    if (status < 300 || status >= 400 || !location) return;
    const redirectUrl = new URL(location, response.url()).toString();
    try {
      validateBinaUrl(redirectUrl, 'search');
    } catch {
      redirected.url = redirectUrl;
      options.onBlockedRequest?.(redirectUrl);
    }
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
      await route.abort('blockedbyclient');
      return;
    }
    try {
      validateBinaUrl(request.url(), 'search');
      await route.continue();
    } catch {
      redirected.url = request.url();
      options.onBlockedRequest?.(request.url());
      await route.abort('blockedbyclient');
    }
  });
  await page.routeWebSocket('**', (webSocket) => webSocket.close({ code: 1008, reason: 'WebSocket blocked' }));
  page.on('download', (download) => { void download.cancel(); });
}

function listingEvidence(pageUrl: string, phone: string, metadata: { name?: string; agency?: string; location?: string }): ConnectorEvidence {
  const visibleParts = ['Agentlik', metadata.agency, metadata.location].filter((part): part is string => Boolean(part));
  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt: visibleParts.join(' · ').slice(0, 1_000),
    rawPhone: phone,
    platform: 'bina.az',
    fingerprint: createHash('sha256').update(pageUrl).digest('hex'),
  };
  if (metadata.name) evidence.name = metadata.name;
  if (metadata.agency) evidence.agency = metadata.agency;
  return evidence;
}

export async function runBinaAgencyConnector(options: BinaConnectorOptions): Promise<BinaConnectorResult> {
  const outcomes = emptyOutcomes();
  const baseResult = { items: [] as ConnectorEvidence[], pagesChecked: 0, estimatedItems: 0, outcomes };
  if (!(await options.permission())) return resultWithStop(baseResult, 'permission_disabled');
  const initialStop = await options.shouldStop();
  if (initialStop) return resultWithStop(baseResult, initialStop, 'cancelled');

  const startUrl = validateBinaUrl(options.startUrl, 'search');
  const maxListings = Math.max(0, Math.min(100, Math.trunc(options.maxListings)));
  const delayMs = Math.max(10_000, Math.trunc(options.delayMs));
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const launch = options.launch ?? (() => chromium.launch({ headless: true }));

  let browser: Browser | undefined;
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  let page: Page | undefined;
  const redirected: { url?: string } = {};

  try {
    browser = await launch();
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    page = await context.newPage();
    await installRequestPolicy(page, options, redirected);
    await options.configurePage?.(page);

    let searchResponse: Response | null;
    try {
      searchResponse = await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    } catch {
      if (redirected.url) return resultWithStop(baseResult, 'external_redirect');
      outcomes.parse_error += 1;
      return baseResult;
    }
    const searchProtection = await detectedProtection(page, searchResponse);
    if (searchProtection) return resultWithStop(baseResult, searchProtection);
    try {
      validateBinaUrl(page.url(), 'search');
    } catch {
      return resultWithStop(baseResult, 'external_redirect');
    }

    const searchHtml = await page.content();
    const discoveredUrls = discoverBinaListingUrls(searchHtml, page.url(), maxListings);
    const listingUrls: string[] = [];
    for (const listingUrl of discoveredUrls) {
      if (!options.shouldProcessUrl || await options.shouldProcessUrl(listingUrl)) listingUrls.push(listingUrl);
    }
    baseResult.estimatedItems = listingUrls.length;
    const visibleCardCount = await page.locator('[data-bina-listing-card]').count();
    if (visibleCardCount > 0 && listingUrls.length === 0) return resultWithStop(baseResult, 'markup_changed');

    let consecutiveTechnicalErrors = 0;
    for (const listingUrl of listingUrls) {
      if (!(await options.permission())) return resultWithStop(baseResult, 'permission_disabled');
      const requestedStop = await options.shouldStop();
      if (requestedStop) return resultWithStop(baseResult, requestedStop, 'cancelled');
      await sleep(delayMs);
      baseResult.pagesChecked += 1;

      let response: Response | null;
      try {
        response = await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });
      } catch {
        if (redirected.url) return resultWithStop(baseResult, 'external_redirect');
        outcomes.parse_error += 1;
        consecutiveTechnicalErrors += 1;
        if (consecutiveTechnicalErrors >= 5) return resultWithStop(baseResult, 'technical_error_limit');
        continue;
      }

      if (response?.status() === 404 || response?.status() === 410) {
        outcomes.page_removed += 1;
        consecutiveTechnicalErrors = 0;
        continue;
      }
      if (response && response.status() >= 500) {
        outcomes.parse_error += 1;
        consecutiveTechnicalErrors += 1;
        if (consecutiveTechnicalErrors >= 5) return resultWithStop(baseResult, 'technical_error_limit');
        continue;
      }
      const protection = await detectedProtection(page, response);
      if (protection) return resultWithStop(baseResult, protection);
      try {
        validateBinaUrl(page.url(), 'listing');
      } catch {
        return resultWithStop(baseResult, 'external_redirect');
      }

      const visibleTextContent = await page.locator('body').innerText();
      if (!visibleTextContent.split(/\r?\n/u).some((line) => hasVisibleAgencyMarker(line))) {
        outcomes.private_seller += 1;
        consecutiveTechnicalErrors = 0;
        continue;
      }

      await options.observePage?.(page, 'before_phone_reveal');
      const reveal = await findVisibleReveal(page);
      if (!reveal) {
        outcomes.missing_phone += 1;
        consecutiveTechnicalErrors = 0;
        continue;
      }
      await reveal.click();
      await options.observePage?.(page, 'after_phone_reveal');
      const visiblePhone = await readVisiblePhone(page);
      if (!visiblePhone) {
        outcomes.missing_phone += 1;
        consecutiveTechnicalErrors = 0;
        continue;
      }
      const phone = normalizeVisibleBinaPhone(visiblePhone);
      if (!phone) {
        outcomes.invalid_phone += 1;
        consecutiveTechnicalErrors = 0;
        continue;
      }

      const canonicalUrl = validateBinaUrl(page.url(), 'listing');
      const name = await visibleText(page, '[data-bina-name], h1');
      const agency = await visibleText(page, '[data-bina-agency]');
      const location = await visibleText(page, '[data-bina-location]');
      baseResult.items.push(listingEvidence(canonicalUrl, phone, { ...(name ? { name } : {}), ...(agency ? { agency } : {}), ...(location ? { location } : {}) }));
      outcomes.accepted += 1;
      consecutiveTechnicalErrors = 0;
    }
    return baseResult;
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
