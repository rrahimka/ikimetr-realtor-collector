import { test, expect } from '@playwright/test';

test('login and navigate all pages', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL is not configured');

  const allowedOrigin = new URL(baseURL);
  const allowedWebSocketProtocol =
    allowedOrigin.protocol === 'https:' ? 'wss:' : 'ws:';

  // Block every HTTP(S) request outside the exact smoke-test origin.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.origin === allowedOrigin.origin) {
      await route.continue();
      return;
    }

    await route.abort('blockedbyclient');
  });

  // Block every WebSocket outside the corresponding local smoke origin.
  await page.routeWebSocket(() => true, async (webSocket) => {
    const url = new URL(webSocket.url());

    const isAllowed =
      url.protocol === allowedWebSocketProtocol &&
      url.hostname === allowedOrigin.hostname &&
      url.port === allowedOrigin.port;

    if (isAllowed) {
      webSocket.connectToServer();
      return;
    }

    await webSocket.close({
      code: 1008,
      reason: 'External WebSocket blocked by smoke test',
    });
  });

  await page.goto('/');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('h1')).toHaveText('Realtor Collector');
  await expect(page.locator('input[name="password"]')).toBeVisible();

  await page.fill('input[name="password"]', 'smoke-test-password');
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await expect(page.locator('.card')).toHaveCount(6);

  await page.getByRole('link', { name: 'Sources' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sources');
  await expect(page.locator('form')).toBeVisible();

  await page.getByRole('link', { name: 'Keywords' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Keywords');

  await page.getByRole('link', { name: 'Contacts' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contacts');
  await expect(page.locator('input[name="q"]')).toBeVisible();

  await page.getByRole('link', { name: 'Runs' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Runs');

  await page.getByRole('link', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Review');
});
