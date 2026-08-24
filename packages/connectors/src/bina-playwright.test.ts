import { afterEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page, type Route } from 'playwright';
import { runBinaAgencyConnector, type BinaConnectorOptions } from './bina-playwright';

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
    <div data-bina-agency>${options.agency ?? 'Bakı Emlak'}</div>
    <div data-bina-location>${options.location ?? 'Bakı'}</div>
    <strong>${options.marker ?? 'Agentlik'}</strong>
    <button type="button" onclick="document.querySelector('[data-bina-phone]').hidden=false">Nömrəni göstər</button>
    <a data-bina-phone hidden href="tel:${phone}">${phone}</a>
  </body></html>`;
}

function privateSellerHtml(): string {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body><strong>Şəxsi elan</strong><button>Nömrəni göstər</button></body></html>';
}

type Fixture = (route: Route) => Promise<void> | void;

async function runWithFixture(fixture: Fixture, overrides: Partial<BinaConnectorOptions> = {}) {
  const launch = async () => {
    const browser = await chromium.launch({ headless: true });
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
    configurePage: async (page: Page) => {
      await page.route('https://bina.az/**', fixture);
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

  it('skips a private seller without clicking the phone reveal', async () => {
    const result = await runWithFixture(async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: 'text/html', body: path.startsWith('/items/') ? privateSellerHtml() : searchHtml([102]) });
    });

    expect(result.items).toHaveLength(0);
    expect(result.outcomes.private_seller).toBe(1);
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
