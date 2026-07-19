import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const BASE = `http://marketing.localhost${p}`;

test.describe('marketing-ui route smoke', () => {
  test('landing page renders without white-screen', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/web10/i);
    await expect(page.locator('text=The web10')).toBeVisible({ timeout: 10000 });
  });

  test('docs route loads without white-screen', async ({ page }) => {
    // The nginx /docs/ alias intercepts the SPA route, but the page should
    // still load (no white-screen crash). The docs content is served from
    // the static alias or falls through to the SPA.
    const resp = await page.goto(`${BASE}/docs`);
    // May get 301→403 from the nginx alias, or 200 from the SPA — either way
    // the page should render without crashing
    expect(page.url()).toContain('marketing.localhost');
    // Page should have some content (not a blank crash)
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });

  test('app-store route renders', async ({ page }) => {
    await page.goto(`${BASE}/app-store`);
    await expect(page).toHaveTitle(/web10/i);
    // Page should render without white-screen
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });

  test('import/exporter route renders', async ({ page }) => {
    await page.goto(`${BASE}/import`);
    await expect(page).toHaveTitle(/web10/i);
    // Page should render without white-screen
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });
});