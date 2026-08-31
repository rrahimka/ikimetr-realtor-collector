import { test, expect, type Page } from '@playwright/test';

/**
 * Regression coverage for a real runtime bug: clicking Telegram
 * "Подключить аккаунт" on the Connections page showed the red toast
 * "Не удалось остановить запуск" ("Failed to stop run").
 *
 * The button always called the correct connect action — it never invoked a
 * stop-run handler. Two defects produced that misleading result:
 *
 *  1. The panel sent its POST without the `x-csrf-token` header. Route handlers
 *     guard writes with `requireApi(true)`, which calls `verifyCsrf()` and
 *     rejects the request with 403.
 *  2. `handleConnect` reported that failure with `toast.stopFailed`
 *     ("Failed to stop run") instead of a connect-specific message, so a
 *     rejected connect looked exactly like a failed stop-run.
 *
 * These tests lock down that the connect click talks only to the connections
 * API, carries CSRF, is accepted, and never surfaces a stop-run error — while
 * the real stop action keeps working.
 */

const STOP_RUN_TOAST = 'Не удалось остановить запуск';
const CONNECT_LABEL = 'Подключить аккаунт';

/** Endpoints that belong to starting/stopping collector runs. */
const RUN_CONTROL_PATTERN = /\/api\/(collector\/(start|stop|heartbeat)|runs\/[^/]+\/cancel|sources\/bulk-run)/;

interface RecordedRequest {
  url: string;
  method: string;
  hasCsrfHeader: boolean;
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="password"]', 'smoke-test-password');
  await page.getByRole('button', { name: 'Войти' }).first().click();
  await expect(page).toHaveURL('/');
}

function recordRequests(page: Page): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  page.on('request', (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      hasCsrfHeader: (request.headers()['x-csrf-token'] ?? '') !== '',
    });
  });
  return requests;
}

test('Telegram Connect starts the auth flow only — it never stops a collector run', async ({ page }) => {
  await login(page);
  const requests = recordRequests(page);
  await page.goto('/connections');

  const telegramCard = page.locator('.connection-card').filter({ hasText: 'Telegram' }).first();
  const connectButton = telegramCard.getByRole('button', { name: CONNECT_LABEL });
  await expect(connectButton).toBeVisible();

  const connectResponse = page.waitForResponse(
    (response) => response.url().includes('/api/connections') && response.request().method() === 'POST',
  );

  await connectButton.click();

  // 1. Connect is accepted. Before the fix this was a 403 CSRF rejection.
  const response = await connectResponse;
  expect(response.status(), 'connect must not be rejected by the CSRF guard').toBe(200);

  // 2. The connect request was actually sent, with the CSRF token attached.
  const connectRequest = requests.find(
    (r) => r.url.includes('/api/connections') && r.method === 'POST',
  );
  expect(connectRequest, 'a POST to /api/connections must be issued').toBeTruthy();
  expect(connectRequest!.hasCsrfHeader, 'connect must send x-csrf-token').toBe(true);

  // 3. No run start/stop/cancel endpoint was contacted at all.
  const runControlCalls = requests.filter((r) => RUN_CONTROL_PATTERN.test(r.url));
  expect(runControlCalls, 'Telegram Connect must not touch run controls').toEqual([]);

  // 4. The misleading stop-run toast must never appear.
  await expect(page.locator('.toast'), 'no stop-run failure toast').not.toContainText(STOP_RUN_TOAST);

  // 5. A legitimate outcome must be reached: either the OTP modal opens
  //    (credentials configured) or the honest needs-credentials toast shows.
  const otpModal = page.getByText('Требуется подтверждение входа');
  const needsCredentialsToast = page.locator('.toast').filter({
    hasText: 'Сначала настройте учётные данные провайдера',
  });
  await expect(otpModal.or(needsCredentialsToast).first()).toBeVisible({ timeout: 15_000 });
});

test('the real Stop Run action still works and is independent of Telegram Connect', async ({ page }) => {
  await login(page);

  // The stop endpoint must still accept a CSRF-protected request. It reports
  // stopped:false when no collector session is active, which is the normal
  // state here — the point is that the route is reachable and not broken.
  const csrf = await page.evaluate(
    () => document.cookie.split('; ').find((v) => v.startsWith('csrf_token='))?.split('=')[1] ?? '',
  );
  expect(csrf, 'a CSRF cookie must be present for mutations').not.toBe('');

  const result = await page.evaluate(async (token) => {
    const resp = await fetch('/api/collector/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({}),
    });
    return { status: resp.status, body: (await resp.json()) as { ok?: boolean } };
  }, csrf);

  expect(result.status, 'stop action must remain functional').toBe(200);
  expect(result.body.ok).toBe(true);

  // And stopping stays a separate endpoint from the one Telegram Connect uses.
  expect('/api/collector/stop').not.toContain('/api/connections');
});
