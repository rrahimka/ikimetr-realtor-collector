import { createHash } from 'node:crypto';
import { chromium, type Browser, type Locator, type Page, type Response, type Route } from 'playwright';
import {
  BINA_OUTCOMES,
  detectExplicitBinaSellerType,
  isGenericBinaOwnerLabel,
  discoverBinaListingUrls,
  normalizeVisibleBinaPhone,
  validateBinaUrl,
  type BinaOutcome,
  type ExplicitBinaSellerType,
} from './bina';


import {
  discoverBinaListingUrlsFromSitemaps,
  extractDeclaredBinaSitemapUrls,
  type BinaSitemapFetch,
} from './bina-sitemap';
import type { BinaStopRequest, ConnectorEvidence, ConnectorResult } from './types';

export type BinaStopReason =
  | 'http_403'
  | 'http_429'
  | 'captcha'
  | 'protection_interstitial'
  | 'login_required'
  | 'external_redirect'
  | 'kill_switch'
  | 'cancelled'
  | 'permission_disabled'
  | 'robots_disallowed'
  | 'robots_unavailable'
  | 'technical_error_limit'
  | 'markup_changed';

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
  handleAllowedRequest?: (route: Route) => Promise<void>;
  observePage?: (page: Page, phase: BinaPagePhase) => Promise<void>;
  onBlockedRequest?: (url: string) => void;
  onTechnicalError?: (summary: string) => void;
  onListingChecked?: (
    url: string,
    details: { outcome: BinaOutcome; sellerType?: ExplicitBinaSellerType; phone?: string; fingerprint?: string },
  ) => void | Promise<void>;
  shouldProcessUrl?: (url: string) => boolean | Promise<boolean>;
  sitemapFetch?: BinaSitemapFetch;
}

const ALLOWED_RESOURCE_TYPES = new Set(['document', 'script', 'stylesheet']);
const PHONE_BUTTON_NAME = 'Nömrəni göstər';
const SELLER_CARD_SELECTOR = '[data-bina-seller-card], .product-owner, .product-owner__info';
const ROBOTS_PRODUCT_TOKEN = 'ikimetr-realtor-collector';
const ROBOTS_USER_AGENT = 'IkiMetr-Realtor-Collector/1.0';

export function isAllowedBinaRequest(input: string, resourceType: string): boolean {
  let url: URL;
  try {
    url = new URL(validateBinaUrl(input, 'search'));
  } catch {
    return false;
  }
  if (!ALLOWED_RESOURCE_TYPES.has(resourceType)) return false;
  if (resourceType === 'document') return true;
  if (/(?:^|[/_-])(?:api|graphql|track|tracker|tracking|analytics|advert|ads?)(?:[/_-]|\.|$)/iu.test(url.pathname)) return false;
  return resourceType === 'script' ? /\.m?js$/iu.test(url.pathname) : /\.css$/iu.test(url.pathname);
}

export function isAllowedByBinaRobots(robots: string, path: string): boolean {
  type Rule = { allow: boolean; value: string };
  type Group = { agents: string[]; rules: Rule[] };
  const groups: Group[] = [];
  let group: Group | undefined;
  for (const rawLine of robots.split(/\r?\n/u)) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      continue;
    }
    if (key !== 'allow' && key !== 'disallow') continue;
    if (group && value) group.rules.push({ allow: key === 'allow', value });
  }

  const specificity = (candidate: Group) => Math.max(0, ...candidate.agents
    .filter((agent) => agent !== '*' && ROBOTS_PRODUCT_TOKEN.includes(agent))
    .map((agent) => agent.length));
  const bestSpecificity = Math.max(0, ...groups.map(specificity));
  const selected = bestSpecificity > 0
    ? groups.filter((candidate) => specificity(candidate) === bestSpecificity)
    : groups.filter((candidate) => candidate.agents.includes('*'));
  const matches = (rule: Rule) => {
    const anchored = rule.value.endsWith('$');
    const source = (anchored ? rule.value.slice(0, -1) : rule.value)
      .split('*')
      .map((part) => part.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&'))
      .join('.*');
    return new RegExp(`^${source}${anchored ? '$' : ''}`, 'u').test(path);
  };
  const matching = selected
    .flatMap((candidate) => candidate.rules)
    .filter(matches)
    .sort((left, right) => {
      const lengthDifference = right.value.replace(/[*$]/gu, '').length - left.value.replace(/[*$]/gu, '').length;
      return lengthDifference || Number(right.allow) - Number(left.allow);
    });
  return matching[0]?.allow ?? true;
}

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
  if (/\bcaptcha\b|robot olmadığınızı|robot olmadiginizi|verify you are human|just a moment/iu.test(bodyText)) return 'captcha';
  if (/sorry, you have been blocked|attention required/iu.test(bodyText)) return 'protection_interstitial';
  const passwordVisible = await page.locator('input[type="password"]:visible').count().catch(() => 0);
  if (passwordVisible > 0 || /\/(?:login|signin)(?:\/|$)/iu.test(page.url())) return 'login_required';
  return undefined;
}

async function visibleText(container: Page | Locator, selector: string): Promise<string | undefined> {
  const locator = container.locator(`${selector}:visible`).first();
  if (await locator.count() === 0) return undefined;
  const text = (await locator.innerText()).trim();
  return text === '' ? undefined : text;
}

const SELLER_TYPE_LABEL_EXACT_RE = /^(?:Mülkiyyətçi|Sahibindən|Agentlik|Vasitəçi)(?:\s*\([^)]*\))?$/u;
const REVEAL_BUTTON_TEXT = 'Nömrəni göstər';

type TaggedSellerType = 'owner' | 'agency' | 'agent';

export const TAG_SELLER_CARDS_SCRIPT = `
(function (arg) {
  var labelRe = new RegExp(arg.labelPattern, 'u');
  function exactText(el) { return (el.textContent || '').replace(/\\s+/g, ' ').trim(); }
  var all = document.querySelectorAll('span, div, p, a, strong, b, button');
  var labelEls = [];
  for (var i = 0; i < all.length; i += 1) {
    var el = all[i];
    if (!labelRe.test(exactText(el))) continue;
    if (el.closest('.item-card') !== null) continue;
    labelEls.push(el);
  }
  for (var j = 0; j < labelEls.length; j += 1) {
    var labelEl = labelEls[j];
    var rawLabel = exactText(labelEl);
    var isOwner = /^Mülkiyyətçi|^Sahibindən/u.test(rawLabel);
    var scope = labelEl.parentElement;
    for (var depth = 0; scope !== null && depth < 6; depth += 1) {
      if (scope.closest('.item-card') !== null) break;
      var reveal = null;
      if (!isOwner) {
        var inner = scope.querySelectorAll('[data-stat="product-call-btn"], [data-cy="bottom-phone"], button, a, div, span');
        for (var k = 0; k < inner.length; k += 1) {
          var item = inner[k];
          if (item.closest('.item-card') !== null) continue;
          if (item.getAttribute('data-stat') === 'product-call-btn' || item.getAttribute('data-cy') === 'bottom-phone') {
            reveal = item;
            break;
          }
          var t = exactText(item);
          if (t === arg.revealText || t.indexOf(arg.revealText) === 0 || t === 'Zəng et' || t.indexOf('Zəng et') === 0) {
            reveal = item.closest('[data-stat="product-call-btn"]') || item;
            break;
          }
        }
      }
      if (!isOwner && reveal === null) { scope = scope.parentElement; continue; }
      scope.setAttribute('data-ikimetr-card', isOwner ? 'owner' : (/^Agentlik/u.test(rawLabel) ? 'agency' : 'agent'));
      if (reveal !== null) reveal.setAttribute('data-ikimetr-reveal', '');
      break;
    }
  }
})
`;

async function tagSellerCards(page: Page): Promise<void> {
  await page.evaluate(
    `(${TAG_SELLER_CARDS_SCRIPT})(${JSON.stringify({ labelPattern: SELLER_TYPE_LABEL_EXACT_RE.source, revealText: REVEAL_BUTTON_TEXT })})`,
  );
}

async function findTaggedSeller(page: Page): Promise<{ card: Locator; reveal?: Locator; sellerType: ExplicitBinaSellerType } | undefined> {
  const cards = page.locator('[data-ikimetr-card]');
  const total = await cards.count();
  for (let index = 0; index < total; index += 1) {
    const card = cards.nth(index);
    if (!await card.isVisible().catch(() => false)) continue;
    const tagged = (await card.getAttribute('data-ikimetr-card')) as TaggedSellerType | null;
    if (tagged !== 'owner' && tagged !== 'agency' && tagged !== 'agent') continue;
    if (tagged === 'owner') return { card, sellerType: 'owner' };
    const reveals = card.locator('[data-ikimetr-reveal]');
    for (let revealIndex = 0; revealIndex < await reveals.count(); revealIndex += 1) {
      const reveal = reveals.nth(revealIndex);
      if (await reveal.isVisible().catch(() => false)) return { card, reveal, sellerType: tagged };
    }
    return { card, sellerType: tagged };
  }
  return undefined;
}

async function findSellerOnPage(page: Page): Promise<{ card: Locator; reveal?: Locator; sellerType: ExplicitBinaSellerType } | undefined> {
  const cards = page.locator(SELLER_CARD_SELECTOR);
  const cardCount = await cards.count();
  for (let index = 0; index < cardCount; index += 1) {
    const card = cards.nth(index);
    if (!await card.isVisible()) continue;
    const cardText = await card.innerText();
    const lines = cardText.split(/\r?\n/u);

    let sellerType: ExplicitBinaSellerType = 'unknown';
    for (const line of lines) {
      if (isGenericBinaOwnerLabel(line)) continue;
      const detected = detectExplicitBinaSellerType(line);
      if (detected !== 'unknown') {
        sellerType = detected;
        break;
      }
    }
    if (sellerType === 'unknown') {
      sellerType = detectExplicitBinaSellerType(cardText);
    }

    if (sellerType === 'owner') return { card, sellerType: 'owner' };
    if (sellerType === 'agency' || sellerType === 'agent') {
      const reveals = card
        .getByRole('button', { name: PHONE_BUTTON_NAME, exact: true })
        .or(card.getByRole('link', { name: PHONE_BUTTON_NAME, exact: true }));
      for (let revealIndex = 0; revealIndex < await reveals.count(); revealIndex += 1) {
        const reveal = reveals.nth(revealIndex);
        if (await reveal.isVisible()) return { card, reveal, sellerType };
      }
      const parentReveals = card.locator('xpath=..').locator('[data-stat="product-call-btn"], [data-cy="bottom-phone"]');
      for (let revealIndex = 0; revealIndex < await parentReveals.count(); revealIndex += 1) {
        const reveal = parentReveals.nth(revealIndex);
        if (await reveal.isVisible()) return { card: card.locator('xpath=..'), reveal, sellerType };
      }
    }
  }

  await tagSellerCards(page);
  const taggedSeller = await findTaggedSeller(page);
  if (taggedSeller) return taggedSeller;

  // Check whole page for owner marker if no seller card was matched
  const body = page.locator('body');
  if (await body.count() > 0) {
    const bodyText = await body.innerText().catch(() => '');
    const lines = bodyText.split(/\r?\n/u);
    for (const line of lines) {
      if (isGenericBinaOwnerLabel(line)) continue;
      if (detectExplicitBinaSellerType(line) === 'owner') {
        return { card: body, sellerType: 'owner' };
      }
    }
  }

  return undefined;
}


async function readVisiblePhone(container: Locator): Promise<string | undefined> {
  const candidates = container.locator('[data-bina-phone], a[href^="tel:"]');
  const count = await candidates.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      const text = (await candidate.innerText().catch(() => '')).trim();
      if (text !== '') return text;
      const href = (await candidate.getAttribute('href').catch(() => '')) ?? '';
      if (href.startsWith('tel:')) return href.replace(/^tel:/u, '').trim();
    }
  }
  const lines = (await container.innerText().catch(() => '')).split(/\r?\n/u);
  for (const line of lines) {
    const candidate = normalizeVisibleBinaPhone(line.trim());
    if (candidate) return candidate;
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
    if (!isAllowedBinaRequest(request.url(), request.resourceType())) {
      if (request.isNavigationRequest()) redirected.url = request.url();
      options.onBlockedRequest?.(request.url());
      await route.abort('blockedbyclient');
      return;
    }
    if (options.handleAllowedRequest) await options.handleAllowedRequest(route);
    else await route.continue();
  });
  await page.routeWebSocket('**', (webSocket) => webSocket.close({ code: 1008, reason: 'WebSocket blocked' }));
  page.on('download', (download) => { void download.cancel(); });
}

function listingEvidence(
  pageUrl: string,
  phone: string,
  metadata: { name?: string; agency?: string; location?: string; sellerType?: ExplicitBinaSellerType },
): ConnectorEvidence {
  const typeLabel = metadata.sellerType === 'agency' ? 'Agentlik' : metadata.sellerType === 'agent' ? 'Vasitəçi' : 'Agentlik';
  const visibleParts = [typeLabel, metadata.agency, metadata.location].filter((part): part is string => Boolean(part));
  const evidence: ConnectorEvidence = {
    sourceUrl: pageUrl,
    locationType: 'listing',
    excerpt: visibleParts.join(' · ').slice(0, 1_000),
    rawPhone: phone,
    platform: 'bina.az',
    fingerprint: createHash('sha256').update(pageUrl).digest('hex'),
    ...(metadata.sellerType ? { explicitSellerType: metadata.sellerType } : {}),
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
  const maxListings = options.maxListings > 0 ? Math.trunc(options.maxListings) : 0;
  const delayMs = Math.max(10_000, Math.trunc(options.delayMs));
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  const launch = options.launch ?? (() => chromium.launch({ headless: true }));

  let browser: Browser | undefined;
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  let page: Page | undefined;
  const redirected: { url?: string } = {};

  try {
    browser = await launch();
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', userAgent: ROBOTS_USER_AGENT });
    page = await context.newPage();
    await installRequestPolicy(page, options, redirected);
    await options.configurePage?.(page);

    if (!(await options.permission())) return resultWithStop(baseResult, 'permission_disabled');
    const beforeRobotsStop = await options.shouldStop();
    if (beforeRobotsStop) return resultWithStop(baseResult, beforeRobotsStop, 'cancelled');
    const robotsUrl = new URL('/robots.txt', startUrl).toString();
    let robotsResponse: Response | null;
    try {
      robotsResponse = await page.goto(robotsUrl, { waitUntil: 'domcontentloaded' });
    } catch {
      if (redirected.url) return resultWithStop(baseResult, 'external_redirect');
      return resultWithStop(baseResult, 'robots_unavailable');
    }
    const robotsProtection = await detectedProtection(page, robotsResponse);
    if (robotsProtection) return resultWithStop(baseResult, robotsProtection);
    if (!robotsResponse?.ok()) return resultWithStop(baseResult, 'robots_unavailable');
    try {
      validateBinaUrl(page.url(), 'search');
    } catch {
      return resultWithStop(baseResult, 'external_redirect');
    }
    const robotsText = await page.locator('body').innerText().catch(() => '');
    if (!robotsText) return resultWithStop(baseResult, 'robots_unavailable');
    if (!isAllowedByBinaRobots(robotsText, new URL(startUrl).pathname)) return resultWithStop(baseResult, 'robots_disallowed');

    if (!(await options.permission())) return resultWithStop(baseResult, 'permission_disabled');
    const beforeDiscoveryStop = await options.shouldStop();
    if (beforeDiscoveryStop) return resultWithStop(baseResult, beforeDiscoveryStop, 'cancelled');

    let discoveredUrls: string[];
    const declaredSitemaps = extractDeclaredBinaSitemapUrls(robotsText);
    if (declaredSitemaps.length > 0) {
      try {
        discoveredUrls = await discoverBinaListingUrlsFromSitemaps({
          robotsText,
          maxListings,
          ...(options.sitemapFetch ? { fetch: options.sitemapFetch } : {}),
          ...(options.shouldProcessUrl ? { shouldProcessUrl: options.shouldProcessUrl } : {}),
        });
      } catch {
        return resultWithStop(baseResult, 'markup_changed');
      }
      if (discoveredUrls.length === 0) return resultWithStop(baseResult, 'markup_changed');
    } else {
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
      try {
        const searchHtml = await page.content();
        discoveredUrls = discoverBinaListingUrls(searchHtml, page.url(), maxListings);
        if (discoveredUrls.length === 0) return resultWithStop(baseResult, 'markup_changed');
      } catch {
        return resultWithStop(baseResult, 'markup_changed');
      }
    }

    if (!(await options.permission())) return resultWithStop(baseResult, 'permission_disabled');
    const afterDiscoveryStop = await options.shouldStop();
    if (afterDiscoveryStop) return resultWithStop(baseResult, afterDiscoveryStop, 'cancelled');
    const listingUrls: string[] = [];
    for (const listingUrl of discoveredUrls) {
      if (!options.shouldProcessUrl || await options.shouldProcessUrl(listingUrl)) listingUrls.push(listingUrl);
    }
    baseResult.estimatedItems = listingUrls.length;

    let consecutiveTechnicalErrors = 0;
    for (const listingUrl of listingUrls) {
      if (!(await options.permission())) return resultWithStop(baseResult, 'permission_disabled');
      const beforeDelayStop = await options.shouldStop();
      if (beforeDelayStop) return resultWithStop(baseResult, beforeDelayStop, 'cancelled');
      await sleep(delayMs);
      if (!(await options.permission())) return resultWithStop(baseResult, 'permission_disabled');
      const requestedStop = await options.shouldStop();
      if (requestedStop) return resultWithStop(baseResult, requestedStop, 'cancelled');
      baseResult.pagesChecked += 1;

      let response: Response | null;
      try {
        response = await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });
      } catch {
        if (redirected.url) return resultWithStop(baseResult, 'external_redirect');
        outcomes.parse_error += 1;
        consecutiveTechnicalErrors += 1;
        await options.onListingChecked?.(listingUrl, { outcome: 'parse_error' });
        if (consecutiveTechnicalErrors >= 5) return resultWithStop(baseResult, 'technical_error_limit');
        continue;
      }

      if (response?.status() === 404 || response?.status() === 410) {
        outcomes.page_removed += 1;
        consecutiveTechnicalErrors = 0;
        await options.onListingChecked?.(listingUrl, { outcome: 'page_removed' });
        continue;
      }
      if (response && response.status() >= 500) {
        outcomes.parse_error += 1;
        consecutiveTechnicalErrors += 1;
        await options.onListingChecked?.(listingUrl, { outcome: 'parse_error' });
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

      try {
        const seller = await findSellerOnPage(page);
        if (!seller || seller.sellerType === 'owner') {
          outcomes.private_seller += 1;
          consecutiveTechnicalErrors = 0;
          await options.onListingChecked?.(listingUrl, { outcome: 'private_seller', sellerType: seller?.sellerType ?? 'owner' });
          continue;
        }
        if (!seller.reveal) {
          outcomes.missing_phone += 1;
          consecutiveTechnicalErrors = 0;
          await options.onListingChecked?.(listingUrl, { outcome: 'missing_phone', sellerType: seller.sellerType });
          continue;
        }
        if (await readVisiblePhone(seller.card)) return resultWithStop(baseResult, 'markup_changed');

        await options.observePage?.(page, 'before_phone_reveal');
        await seller.reveal.click({ timeout: 5000 }).catch(() => {});
        await options.observePage?.(page, 'after_phone_reveal');
        let visiblePhone = await readVisiblePhone(seller.card);
        for (let poll = 0; !visiblePhone && poll < 8; poll += 1) {
          await new Promise(resolve => setTimeout(resolve, 400));
          visiblePhone = await readVisiblePhone(seller.card);
        }
        if (!visiblePhone) {
          outcomes.missing_phone += 1;
          consecutiveTechnicalErrors = 0;
          await options.onListingChecked?.(listingUrl, { outcome: 'missing_phone', sellerType: seller.sellerType });
          continue;
        }
        const phone = normalizeVisibleBinaPhone(visiblePhone);
        if (!phone) {
          outcomes.invalid_phone += 1;
          consecutiveTechnicalErrors = 0;
          await options.onListingChecked?.(listingUrl, { outcome: 'invalid_phone', sellerType: seller.sellerType });
          continue;
        }

        const canonicalUrl = validateBinaUrl(page.url(), 'listing');
        const name = await visibleText(page, '[data-bina-name], [data-cy="owner-info__content"] span, h1');
        const agency = await visibleText(seller.card, '[data-bina-agency], [data-cy="agency-info"] span');
        const location = await visibleText(page, '[data-bina-location], [data-stat="agency-address"], [data-cy="item_map"]');
        baseResult.items.push(listingEvidence(canonicalUrl, phone, {
          ...(name ? { name } : {}),
          ...(agency ? { agency } : {}),
          ...(location ? { location } : {}),
          sellerType: seller.sellerType,
        }));
        outcomes.accepted += 1;
        consecutiveTechnicalErrors = 0;
        await options.onListingChecked?.(canonicalUrl, { outcome: 'accepted', sellerType: seller.sellerType, phone });
      } catch (error) {
        options.onTechnicalError?.(error instanceof Error ? `${error.message.split('\n')[0] ?? error.message}`.slice(0, 200) : 'unknown listing error');
        outcomes.parse_error += 1;
        consecutiveTechnicalErrors += 1;
        await options.onListingChecked?.(listingUrl, { outcome: 'parse_error' });
        if (consecutiveTechnicalErrors >= 5) return resultWithStop(baseResult, 'technical_error_limit');
      }


    }
    return baseResult;
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
