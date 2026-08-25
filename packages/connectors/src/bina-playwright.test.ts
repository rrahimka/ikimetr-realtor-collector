import { afterEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Route } from 'playwright';
import { isAllowedBinaRequest, isAllowedByBinaRobots, runBinaAgencyConnector, type BinaConnectorOptions } from './bina-playwright';

const searchUrl = 'https://bina.az/baki/alqi-satqi/menziller';
const openedBrowsers = new Set<Browser>();

afterEach(async () => {
  await Promise.all([...openedBrowsers].map(async (browser) => {
    if (browser.isConnected()) await browser.close();
  }));
  openedBrowsers.clear();
});

function searchHtml(ids: number[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${ids.map((id) => `<a data-bina-listing-card href="/items/${id}">Listing ${id}</a>`).join('')}</body></html>`;
}

function agencyHtml(options: { phone?: string; marker?: string; name?: string; agency?: string; location?: string } = {}): string {
  const phone = options.phone ?? '+994 50 123 45 67';
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <h1 data-bina-name>${options.name ?? 'Aysel Məmmədova'}</h1>
    <div data-bina-location>${options.location ?? 'Bakı'}</div>
    <section data-bina-seller-card>
      <div data-bina-agency>${options.agency ?? 'Bakı Emlak'}</div>
      <strong>${options.marker ?? 'Agentlik'}</strong>
      <button type="button" onclick="this.parentElement.querySelector('[data-bina-phone]').hidden=false">Nömrəni göstər</button>
      <a data-bina-phone hidden href="tel:${phone}">${phone}</a>
    </section>
  </body></html>`;
}

function privateSellerHtml(): string {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body><strong>Şəxsi elan</strong><button>Nömrəni göstər</button></body></html>';
}

type Fixture = (route: Route) => Promise<void> | void;

async function runWithFixture(
  fixture: Fixture,
  overrides: Partial<BinaConnectorOptions> = {},
  robots = 'User-agent: *\nAllow: /\n',
) {
  const launch = async () => {
    const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP * 0.0.0.0'] });
    openedBrowsers.add(browser);
    return browser;
  };
  return runBinaAgencyConnector({
    startUrl: searchUrl,
    maxListings: 5,
    delayMs: 10_000,
    permission: () => true,
    shouldStop: () => false,
    sleep: () => Promise.resolve(),
    launch,
    handleAllowedRequest: async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/robots.txt') {
        await route.fulfill({ status: 200, contentType: 'text/plain', body: robots });
        return;
      }
      await fixture(route);
    },
    ...overrides,
  });
}

describe('runBinaAgencyConnector', () => {
  it('accepts only a visible Agentlik listing and a phone revealed after the click', async () => {
    let phoneWasHiddenBeforeClick = false;
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: path.startsWith('/items/') ? agencyHtml() : searchHtml([101]),
      });
    }, {
      observePage: async (page, phase) => {
        if (phase === 'before_phone_reveal') {
          phoneWasHiddenBeforeClick = await page.locator('[data-bina-phone]').isHidden();
        }
      },
    });

    expect(phoneWasHiddenBeforeClick).toBe(true);
    expect(result.items).toEqual([
      expect.objectContaining({
        sourceUrl: 'https://bina.az/items/101',
        locationType: 'listing',
        rawPhone: '+994501234567',
        name: 'Aysel Məmmədova',
        agency: 'Bakı Emlak',
        platform: 'bina.az',
      }),
    ]);
    expect(result.outcomes.accepted).toBe(1);
    expect(result.pagesChecked).toBe(1);
  });

  it('uses an official robots-declared sitemap instead of relying on search-page listing links', async () => {
    let searchVisited = false;
    const sitemapUrl = 'https://bina.azstatic.com/uploads/sitemaps/sitemap_items.xml';
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/baki/alqi-satqi/menziller') searchVisited = true;
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: path.startsWith('/items/') ? agencyHtml() : searchHtml([]),
      });
    }, {
      sitemapFetch: () => Promise.resolve(new Response(
        '<urlset><url><loc>https://www.bina.az/items/301</loc></url></urlset>',
        { status: 200, headers: { 'content-type': 'application/xml' } },
      )),
    }, `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`);

    expect(searchVisited).toBe(false);
    expect(result.items).toEqual([expect.objectContaining({ sourceUrl: 'https://bina.az/items/301' })]);
    expect(result.pagesChecked).toBe(1);
  });

  it('isolates sitemap parsing failures as markup_changed without visiting the search page', async () => {
    let searchVisited = false;
    const sitemapUrl = 'https://bina.azstatic.com/uploads/sitemaps/sitemap_items.xml';
    const result = await runWithFixture(async (route) => {
      if (new URL(route.request().url()).pathname === '/baki/alqi-satqi/menziller') searchVisited = true;
      await route.fulfill({ status: 200, contentType: 'text/html', body: searchHtml([]) });
    }, {
      sitemapFetch: () => Promise.resolve(new Response(
        '<urlset><url><loc>https://bina.az/agents/1</loc></url></urlset>',
        { status: 200, headers: { 'content-type': 'application/xml' } },
      )),
    }, `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`);

    expect(searchVisited).toBe(false);
    expect(result.stopReason).toBe('markup_changed');
    expect(result.outcomes.blocked).toBe(1);
  });

  it('skips a private seller without clicking the phone reveal', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: 'text/html', body: path.startsWith('/items/') ? privateSellerHtml() : searchHtml([102]) });
    });

    expect(result.items).toHaveLength(0);
    expect(result.outcomes.private_seller).toBe(1);
  });

  it('does not accept an incidental Agentlik marker or unrelated phone outside the seller card', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path.startsWith('/items/')
        ? privateSellerHtml().replace('</body>', '<p>Agentlik xidmətləri haqqında reklam</p><a href="tel:+994501234567">+994501234567</a></body>')
        : searchHtml([107]);
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    });

    expect(result.items).toHaveLength(0);
    expect(result.outcomes.private_seller).toBe(1);
  });

  it('rejects a phone that was already visible before the reveal click', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path.startsWith('/items/') ? agencyHtml().replace('data-bina-phone hidden', 'data-bina-phone') : searchHtml([108]);
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    });

    expect(result.items).toHaveLength(0);
    expect(result.stopReason).toBe('markup_changed');
  });

  it.each([
    ['masked', '+994 50 *** ** 67', 'invalid_phone'],
    ['missing', '', 'missing_phone'],
  ] as const)('records a %s revealed phone without accepting it', async (_name, phone, outcome) => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path.startsWith('/items/')
        ? (phone === '' ? agencyHtml().replace(/<a data-bina-phone[\s\S]*?<\/a>/, '') : agencyHtml({ phone }))
        : searchHtml([103]);
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    });

    expect(result.items).toHaveLength(0);
    expect(result.outcomes[outcome]).toBe(1);
  });

  it('caps listings and waits before each strictly sequential navigation', async () => {
    const sleeps: number[] = [];
    const navigationOrder: string[] = [];
    let activeDocuments = 0;
    let maxActiveDocuments = 0;
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/items/')) {
        activeDocuments += 1;
        maxActiveDocuments = Math.max(maxActiveDocuments, activeDocuments);
        navigationOrder.push(path);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeDocuments -= 1;
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body: path.startsWith('/items/') ? agencyHtml() : searchHtml([1, 2, 3]) });
    }, { maxListings: 2, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });

    expect(result.pagesChecked).toBe(2);
    expect(navigationOrder).toEqual(['/items/1', '/items/2']);
    expect(sleeps).toEqual([10_000, 10_000]);
    expect(maxActiveDocuments).toBe(1);
  });

  it('skips listing URLs rejected by the seven-day recheck policy', async () => {
    const navigated: string[] = [];
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/items/')) navigated.push(path);
      await route.fulfill({ status: 200, contentType: 'text/html', body: path.startsWith('/items/') ? agencyHtml() : searchHtml([201, 202]) });
    }, { shouldProcessUrl: (url) => !url.endsWith('/201') });

    expect(navigated).toEqual(['/items/202']);
    expect(result.pagesChecked).toBe(1);
    expect(result.estimatedItems).toBe(1);
  });

  it('honors robots.txt before visiting the configured search path', async () => {
    let searchVisited = false;
    const result = await runWithFixture(async (route) => {
      searchVisited = true;
      await route.fulfill({ status: 200, contentType: 'text/html', body: searchHtml([203]) });
    }, {}, 'User-agent: *\nDisallow: /baki\n');

    expect(searchVisited).toBe(false);
    expect(result.stopReason).toBe('robots_disallowed');
    expect(result.outcomes.blocked).toBe(1);
  });

  it('does not let a robots wildcard Allow overmatch a disallowed path', () => {
    const robots = 'User-agent: *\nDisallow: /baki/\nAllow: /baki/*.html$\n';
    expect(isAllowedByBinaRobots(robots, '/baki/private')).toBe(false);
    expect(isAllowedByBinaRobots(robots, '/baki/listing.html')).toBe(true);
  });

  it('uses the matching collector group instead of mixing it with wildcard rules', () => {
    const robots = 'User-agent: *\nAllow: /baki/private\nUser-agent: ikimetr-realtor-collector\nDisallow: /baki\n';
    expect(isAllowedByBinaRobots(robots, '/baki/private')).toBe(false);
  });

  it('identifies the collector with the same product token used for robots matching', async () => {
    let userAgent = '';
    await runWithFixture(async (route) => {
      userAgent = route.request().headers()['user-agent'] ?? '';
      await route.fulfill({ status: 200, contentType: 'text/html', body: searchHtml([]) });
    });
    expect(userAgent.toLowerCase()).toContain('ikimetr-realtor-collector');
  });

  it('blocks same-origin hidden APIs and first-party tracking requests', () => {
    expect(isAllowedBinaRequest('https://bina.az/api/phones/1', 'fetch')).toBe(false);
    expect(isAllowedBinaRequest('https://bina.az/graphql', 'xhr')).toBe(false);
    expect(isAllowedBinaRequest('https://bina.az/assets/analytics.js', 'script')).toBe(false);
    expect(isAllowedBinaRequest('https://bina.az/assets/app.js', 'script')).toBe(true);
    expect(isAllowedBinaRequest('https://bina.az/items/101', 'document')).toBe(true);
  });

  it.each([
    ['http_403', 403, '<html><body>Forbidden</body></html>'],
    ['http_429', 429, '<html><body>Too many requests</body></html>'],
    ['captcha', 200, '<html><body><div>CAPTCHA</div></body></html>'],
    ['login_required', 200, '<html><body><form><input type="password"></form></body></html>'],
  ] as const)('blocks safely on %s', async (reason, status, body) => {
    const result = await runWithFixture((route) => route.fulfill({ status, contentType: 'text/html', body }));

    expect(result.stopReason).toBe(reason);
    expect(result.outcomes.blocked).toBe(1);
    expect(result.items).toHaveLength(0);
  });

  it('blocks an external redirect without following it', async () => {
    const blockedRequests: string[] = [];
    const result = await runWithFixture((route) => route.fulfill({ status: 302, headers: { location: 'https://evil.test/login' } }), {
      onBlockedRequest: (url) => { blockedRequests.push(url); },
    });

    expect(result.stopReason).toBe('external_redirect');
    expect(result.outcomes.blocked).toBe(1);
    expect(blockedRequests).toEqual(['https://evil.test/login']);
  });

  it.each([
    ['cancelled', 'cancelled'],
    ['kill_switch', 'cancelled'],
  ] as const)('stops before listing navigation when %s is requested', async (stop, expectedOutcome) => {
    let checks = 0;
    const result = await runWithFixture((route) => route.fulfill({ status: 200, contentType: 'text/html', body: searchHtml([104]) }), {
      shouldStop: () => {
        checks += 1;
        return checks > 1 ? stop : false;
      },
    });

    expect(result.stopReason).toBe(stop);
    expect(result.outcomes[expectedOutcome]).toBe(1);
    expect(result.pagesChecked).toBe(0);
  });

  it('rechecks permission after setup and after every delay', async () => {
    let permission = true;
    let listingVisited = false;
    const searchBlocked = await runWithFixture((route) => route.fulfill({ status: 200, contentType: 'text/html', body: searchHtml([109]) }), {
      permission: () => permission,
      configurePage: () => { permission = false; return Promise.resolve(); },
    });
    expect(searchBlocked.stopReason).toBe('permission_disabled');
    expect(searchBlocked.pagesChecked).toBe(0);

    permission = true;
    const listingBlocked = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/items/')) listingVisited = true;
      await route.fulfill({ status: 200, contentType: 'text/html', body: path.startsWith('/items/') ? agencyHtml() : searchHtml([110]) });
    }, {
      permission: () => permission,
      sleep: () => { permission = false; return Promise.resolve(); },
    });
    expect(listingBlocked.stopReason).toBe('permission_disabled');
    expect(listingVisited).toBe(false);
    expect(listingBlocked.pagesChecked).toBe(0);

    let stopped = false;
    const killBlocked = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/items/')) listingVisited = true;
      await route.fulfill({ status: 200, contentType: 'text/html', body: path.startsWith('/items/') ? agencyHtml() : searchHtml([111]) });
    }, {
      permission: () => true,
      shouldStop: () => stopped ? 'kill_switch' : false,
      sleep: () => { stopped = true; return Promise.resolve(); },
    });
    expect(killBlocked.stopReason).toBe('kill_switch');
    expect(listingVisited).toBe(false);
    expect(killBlocked.pagesChecked).toBe(0);
  });

  it('refuses to launch a browser when permission flags are disabled', async () => {
    let launched = false;
    const result = await runBinaAgencyConnector({
      startUrl: searchUrl,
      maxListings: 5,
      delayMs: 10_000,
      permission: () => false,
      shouldStop: () => false,
      launch: async () => {
        launched = true;
        return chromium.launch({ headless: true });
      },
    });

    expect(launched).toBe(false);
    expect(result.stopReason).toBe('permission_disabled');
    expect(result.outcomes.blocked).toBe(1);
  });

  it('blocks after five consecutive technical listing failures', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/items/')) {
        await route.fulfill({ status: 503, contentType: 'text/html', body: '<html><body>Temporary failure</body></html>' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body: searchHtml([1, 2, 3, 4, 5, 6]) });
    }, { maxListings: 6 });

    expect(result.stopReason).toBe('technical_error_limit');
    expect(result.outcomes.parse_error).toBe(5);
    expect(result.outcomes.blocked).toBe(1);
    expect(result.pagesChecked).toBe(5);
  });

  it('counts DOM and click failures and blocks only at the five-error threshold', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: 'text/html', body: path.startsWith('/items/') ? agencyHtml() : searchHtml([1, 2, 3, 4, 5, 6]) });
    }, {
      maxListings: 6,
      observePage: () => Promise.reject(new Error('artificial DOM failure')),
    });

    expect(result.stopReason).toBe('technical_error_limit');
    expect(result.outcomes.parse_error).toBe(5);
    expect(result.pagesChecked).toBe(5);
  });

  it('returns earlier accepted items when a later listing blocks the cycle', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path.endsWith('/1') ? agencyHtml() : path.endsWith('/2') ? '<html><body>CAPTCHA</body></html>' : searchHtml([1, 2]);
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    });

    expect(result.stopReason).toBe('captcha');
    expect(result.items).toHaveLength(1);
    expect(result.outcomes.accepted).toBe(1);
  });

  it('marks a removed listing as a normal non-blocking outcome', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ status: path.startsWith('/items/') ? 404 : 200, contentType: 'text/html', body: path.startsWith('/items/') ? 'Removed' : searchHtml([105]) });
    });

    expect(result.outcomes.page_removed).toBe(1);
    expect(result.stopReason).toBeUndefined();
  });

  it('blocks a confirmed listing markup change', async () => {
    const result = await runWithFixture((route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><a data-bina-listing-card href="/new-items/106">Changed card</a></body></html>',
    }));

    expect(result.stopReason).toBe('markup_changed');
    expect(result.outcomes.blocked).toBe(1);
  });

  it('blocks a search page with no discoverable listing URLs', async () => {
    const result = await runWithFixture((route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><nav><a href="/">Home</a><a href="/baki">Bakı</a></nav></body></html>',
    }));

    expect(result.stopReason).toBe('markup_changed');
    expect(result.outcomes.blocked).toBe(1);
    expect(result.pagesChecked).toBe(0);
  });

  it('closes page, context, and browser when setup throws', async () => {
    let browser: Browser | undefined;
    await expect(runBinaAgencyConnector({
      startUrl: searchUrl,
      maxListings: 5,
      delayMs: 10_000,
      permission: () => true,
      shouldStop: () => false,
      launch: async () => {
        browser = await chromium.launch({ headless: true });
        return browser;
      },
      configurePage: () => Promise.reject(new Error('fixture setup failed')),
    })).rejects.toThrow('fixture setup failed');

    expect(browser?.isConnected()).toBe(false);
  });
});
