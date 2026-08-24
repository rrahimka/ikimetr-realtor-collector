import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type ApiResult = { status: number; data: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

async function apiRequest(page: Page, method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult> {
  return page.evaluate(async ({ method, path, body }) => {
    const csrf = document.cookie.split('; ').find((v) => v.startsWith('csrf_token='))?.split('=')[1] ?? '';
    const init: RequestInit = { method };
    if (method === 'POST') {
      init.headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
      if (body !== undefined) init.body = JSON.stringify(body);
    }
    const resp = await fetch(path, init);
    const text = await resp.text();
    let data: unknown = null;
    if (text !== '') {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }
    return { status: resp.status, data };
  }, { method, path, body });
}

test('collector pipeline: login → fixture source → run → worker → contact → CSV', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL is not configured');

  const allowedOrigin = new URL(baseURL);
  const allowedWebSocketProtocol = allowedOrigin.protocol === 'https:' ? 'wss:' : 'ws:';

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
    await webSocket.close({ code: 1008, reason: 'External WebSocket blocked by smoke test' });
  });

  // 1. Login
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Realtor Collector');
  await page.fill('input[name="password"]', 'smoke-test-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  try {
    await expect(page).toHaveURL('/', { timeout: 15_000 });
  } catch {
    // A cold Next.js dev compile can reset the first request once; retry only
    // after the page is confirmed to still be on the login form.
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL('/');
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');

  // 2. Create the test_fixture source through the authenticated API.
  //    test_fixture is intentionally not exposed by the production SourceForm,
  //    so the narrowest setup is a CSRF-aware API call.
  const created = await apiRequest(page, 'POST', '/api/sources', {
    name: 'Smoke fixture',
    type: 'test_fixture',
    locator: 'fixture://contacts',
    language: 'mixed',
    maxPages: 1,
    maxDepth: 0,
    delayMs: 0,
    enabled: true,
    killSwitch: false,
  });
  expect(created.status).toBe(201);
  if (!isRecord(created.data)) throw new Error('source creation returned an unexpected payload');
  const sourceId = Number(created.data.id);
  expect(sourceId).toBeGreaterThan(0);

  // 3. Enqueue a run for that source through the normal API.
  const enqueued = await apiRequest(page, 'POST', `/api/sources/${sourceId}/run`);
  if (enqueued.status !== 201) {
    console.error('RUN ENQUEUE DIAGNOSTIC:', JSON.stringify({ status: enqueued.status, sourceId, data: enqueued.data }));
  }
  expect(enqueued.status).toBe(201);
  if (!isRecord(enqueued.data)) throw new Error('run enqueue returned an unexpected payload');
  const runId = Number(enqueued.data.id);
  expect(runId).toBeGreaterThan(0);

  // 4. Wait for the real worker to claim and process the run, then persist the fixture contact.
  await expect
    .poll(
      async () => {
        const res = await apiRequest(page, 'GET', '/api/contacts');
        if (!isRecordArray(res.data)) return 0;
        return res.data.filter((row) => row.normalizedPhone === '+994501234567').length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);

  // 5. Verify the run reached the completed terminal state with counters.
  await expect
    .poll(
      async () => {
        await page.goto('/runs');
        return page.getByText('завершено', { exact: true }).count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByText('1 / 1', { exact: true }).first()).toBeVisible();

  // 6. Re-run the same fixture and verify deterministic phone deduplication.
  const rerun = await apiRequest(page, 'POST', `/api/sources/${sourceId}/run`);
  expect(rerun.status).toBe(201);
  await expect
    .poll(
      async () => {
        await page.goto('/runs');
        return page.getByText('завершено', { exact: true }).count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(1);
  const contactsAfterRerun = await apiRequest(page, 'GET', '/api/contacts');
  if (!isRecordArray(contactsAfterRerun.data)) throw new Error('contacts returned an unexpected payload');
  expect(contactsAfterRerun.data.filter((row) => row.normalizedPhone === '+994501234567')).toHaveLength(1);

  // 7. Verify the contact is observable through the UI.
  await page.goto('/contacts');
  await expect(page.getByText('+994501234567').first()).toBeVisible();
  await expect(page.getByText('Aysel Məmmədova').first()).toBeVisible();
  await expect(page.getByText('Bakı Emlak').first()).toBeVisible();

  // 8. CSV export through the normal UI download path.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'CSV экспорт' }).click();
  const download = await downloadPromise;
  const csvPath = await download.path();
  if (!csvPath) throw new Error('CSV download path is unavailable');
  const csv = readFileSync(csvPath, 'utf8');
  expect(csv.trim()).not.toBe('');
  expect(csv).toContain('994501234567');
  expect(csv).toContain("'+994501234567");
});

test('language toggle and CSV import report', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="password"]', 'smoke-test-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL('/');

  // Switch to Azerbaijani, verify the dashboard and nav, then switch back.
  await page.getByRole('button', { name: 'AZ' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Panel');
  await expect(page.getByRole('link', { name: 'Əlaqələr' })).toBeVisible();
  await page.getByRole('button', { name: 'RU' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');

  // Import a contacts CSV and verify accepted + idempotent duplicate report.
  await page.goto('/contacts');
  const csvText = 'phone,name,agency,platform\n050 999 88 77,Fixture Importer,Test Agentliyi,website\n';
  const file = { name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csvText, 'utf8') };
  await page.setInputFiles('input[type="file"]', file);
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByText('Принято')).toBeVisible();
  await expect(page.getByText('+994509998877').first()).toBeVisible();

  await page.setInputFiles('input[type="file"]', file);
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByText('Дубликаты')).toBeVisible();
  await expect(page.getByText('+994509998877').first()).toBeVisible();
});
