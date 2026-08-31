import { test, expect } from '@playwright/test';

test.describe('Real Browser Visual Acceptance & Interaction Suite', () => {
  test('1. Unauthenticated root redirects to /login and hides internal navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Realtor Collector');
    // Ensure dashboard/sources/leads navigation links are not exposed to unauthenticated users
    await expect(page.locator('nav a')).toHaveCount(0);
  });

  test('2. Login form password toggle and memory hint behavior', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('input[name="password"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Toggle password reveal
    const toggleBtn = page.getByRole('button', { name: /показать пароль/i });
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    const hideBtn = page.getByRole('button', { name: /скрыть пароль/i });
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Memory hint reveal
    const hintBtn = page.getByRole('button', { name: /забыли пароль/i });
    await expect(hintBtn).toBeVisible();
    await expect(page.getByText('1-ч-7-G-U-F')).toHaveCount(0);
    await hintBtn.click();
    await expect(page.getByText('1-ч-7-G-U-F')).toBeVisible();
  });

  test('3. Authenticated header controls, logo navigation, and no duplicate sidebar controls', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="password"]', 'smoke-test-password');
    await page.getByRole('button', { name: 'Войти' }).first().click();
    await expect(page).toHaveURL('/');

    // 1. Verify top-right header controls exist
    const header = page.locator('.global-header');
    await expect(header).toBeVisible();
    await expect(header.getByRole('button', { name: 'RU' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'AZ' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'EN' })).toBeVisible();
    await expect(header.getByRole('link', { name: /выйти/i })).toBeVisible();

    // 2. Verify sidebar DOES NOT contain duplicate langbar or duplicate logout
    const sidebar = page.locator('.sidebar');
    await expect(sidebar.locator('.langbar')).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: /выйти/i })).toHaveCount(0);

    // 3. Verify Logo / Brand link navigates to /
    await page.goto('/sources');
    await expect(page).toHaveURL('/sources');
    const logoLink = page.locator('.brand-link');
    await expect(logoLink).toBeVisible();
    await logoLink.click();
    await expect(page).toHaveURL('/');
  });

  test('4. Geometric scroll test: Sidebar remains fixed at top: 0 during long page scrolls', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="password"]', 'smoke-test-password');
    await page.getByRole('button', { name: 'Войти' }).first().click();
    await expect(page).toHaveURL('/');

    const routes = ['/sources', '/contacts', '/leads', '/runs'];

    for (const route of routes) {
      await page.goto(route);
      const sidebar = page.locator('.sidebar');
      await expect(sidebar).toBeVisible();

      // Measure initial position
      const initialBox = await sidebar.boundingBox();
      expect(initialBox).not.toBeNull();
      expect(initialBox!.y).toBe(0);

      // Scroll window down by 1500px
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(100);

      // Measure scrolled position
      const scrolledBox = await sidebar.boundingBox();
      expect(scrolledBox).not.toBeNull();
      // Sidebar top must remain effectively at viewport top (0)
      expect(Math.round(scrolledBox!.y)).toBe(0);
    }
  });

  test('5. Sources page simplified form, category filtering, and clickable URLs', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="password"]', 'smoke-test-password');
    await page.getByRole('button', { name: 'Войти' }).first().click();
    await expect(page).toHaveURL('/');

    await page.goto('/sources');
    await expect(page).toHaveURL('/sources');

    // 1. Verify simplified form fields (no Name, no Pages, no Depth)
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
    await expect(page.locator('input[name="maxPages"]')).toHaveCount(0);
    await expect(page.locator('input[name="maxDepth"]')).toHaveCount(0);

    // Verify Category, Platform, Locator, Language, and Delay in seconds are present
    await expect(page.locator('select[name="category"]')).toBeVisible();
    await expect(page.locator('select[name="type"]')).toBeVisible();
    await expect(page.locator('input[name="locator"]')).toBeVisible();
    await expect(page.locator('select[name="language"]')).toBeVisible();
    await expect(page.locator('input[name="delaySeconds"]')).toBeVisible();
    await expect(page.getByText('Задержка между запросами, сек.')).toBeVisible();

    // 2. Category filter tabs
    const allTab = page.getByRole('button', { name: /^Все/ });
    const websitesTab = page.getByRole('button', { name: /^Веб-сайты/ });
    const socialTab = page.getByRole('button', { name: /^Социальные сети/ });

    await expect(allTab).toBeVisible();
    await expect(websitesTab).toBeVisible();
    await expect(socialTab).toBeVisible();

    // Switch to Social Networks tab -> verifies Social Connections Panel is rendered
    await socialTab.click();
    // `exact: true` — each platform also renders an integration-requirement line
    // (e.g. "Instagram Graph API requires a Meta app + business review"), which
    // would otherwise make the platform title selector ambiguous.
    await expect(page.getByText('Instagram', { exact: true })).toBeVisible();
    await expect(page.getByText('TikTok', { exact: true })).toBeVisible();
    await expect(page.getByText('Facebook', { exact: true })).toBeVisible();
    await expect(page.getByText('WhatsApp', { exact: true })).toBeVisible();
    await expect(page.getByText('Telegram — MTProto Connector')).toBeVisible();

    // 3. Verify ordinary source rows do not contain "Аварийное отключение"
    await websitesTab.click();
    await expect(page.locator('table').getByRole('button', { name: 'Аварийное отключение' })).toHaveCount(0);

    // 4. Verify safe URLs in table are clickable with target="_blank"
    const sourceLinks = page.locator('.source-locator-link');
    const count = await sourceLinks.count();
    if (count > 0) {
      const firstLink = sourceLinks.first();
      await expect(firstLink).toHaveAttribute('target', '_blank');
      await expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  test('6. Dashboard daily metrics and quick run bulk controls', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="password"]', 'smoke-test-password');
    await page.getByRole('button', { name: 'Войти' }).first().click();
    await expect(page).toHaveURL('/');

    // 1. Verify core metric cards and labels in main content
    const main = page.getByRole('main');
    await expect(main.getByText('Риелторы / контакты', { exact: true })).toBeVisible();
    await expect(main.getByText('Новые риелторы', { exact: true })).toBeVisible();
    await expect(main.getByText('Всего лидов', { exact: true })).toBeVisible();
    await expect(main.getByText('Запуски', { exact: true })).toBeVisible();
    await expect(main.getByText('Ошибки сегодня', { exact: true }).first()).toBeVisible();

    // 2. Verify "СЕГОДНЯ" section with Baku localized date
    await expect(page.getByText('СЕГОДНЯ', { exact: true })).toBeVisible();
    await expect(page.getByText(/Оперативная статистика за текущий календарный день/i)).toBeVisible();
    await expect(page.getByText('Новые риелторы сегодня', { exact: true })).toBeVisible();
    await expect(page.getByText('Новые лиды сегодня', { exact: true })).toBeVisible();
    await expect(page.getByText('Обогащено контактов', { exact: true })).toBeVisible();

    // 3. Verify "БЫСТРЫЙ ЗАПУСК" section and buttons
    await expect(page.getByText('БЫСТРЫЙ ЗАПУСК', { exact: true }).first()).toBeVisible();
    const startWebsitesBtn = page.getByRole('button', { name: 'Запустить все веб-сайты' });
    const startSocialBtn = page.getByRole('button', { name: 'Запустить все социальные сети' });
    await expect(startWebsitesBtn).toBeVisible();
    await expect(startSocialBtn).toBeVisible();

    // Click "Запустить все веб-сайты" -> triggers bulk run and shows summary
    await startWebsitesBtn.click();
    await expect(page.getByText(/Результат:/i).first()).toBeVisible();
  });
});
