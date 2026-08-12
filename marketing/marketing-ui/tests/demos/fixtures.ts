import { test as base, expect } from '@playwright/test';
import { MOCK_WAPI_JS, FAKE_TOKEN } from './mock-wapi';

export const test = base.extend<{
  demoPage: {
    simulateAuth: () => Promise<void>;
  };
}>({
  demoPage: async ({ page }, use) => {
    // Intercept wapi.js to serve our mock SDK (which includes fetch override)
    await page.route('**/wapi.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: MOCK_WAPI_JS,
      });
    });

    // Intercept same-origin apps/register
    await page.route('**/v3/apps/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await use({
      simulateAuth: async () => {
        await page.evaluate((token) => {
          document.cookie = 'token=' + token + ';path=/;max-age=3600;SameSite=Lax;';
          const callbacks = (window as any).web10.__authCallbacks || [];
          callbacks.forEach(function(cb: (x: boolean) => void) { cb(true); });
        }, FAKE_TOKEN);
        await page.waitForTimeout(100);
      },
    });
  },
});

export { expect };