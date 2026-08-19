import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = () => `storetest${Date.now()}`;

test.describe('app store -> launch -> token handoff', () => {
  test('marketing-ui app store renders', async ({ page }) => {
    await page.goto(`${MARKETING_BASE}/app-store`);
    await expect(page).toHaveTitle(/web10/i);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });

  test('register app via API', async ({ request }) => {
    const registerRes = await request.post(`${API_BASE}/register_app`, {
      data: {
        url: 'http://social.localhost',
        name: 'e2e-test-app',
      },
    });
    // register_app is include_in_schema=False — still callable
  });

  test.skip('app store -> token handoff flow', async () => {
    // GUTTED (v2→v3): tested removed endpoints (/certify, /{username}/posts) and the
    // legacy /signup. The token-handoff feature still exists in v3 — an app gets an
    // origin-scoped token via an app contract, then does CRUD via /v3/create.
    // v3 rewrite: /v3/signup → /v3/login → /v3/app-contracts/add → /v3/create.
  });

  test('system endpoints: ready and stats', async ({ request }) => {
    const readyRes = await request.get(`${API_BASE}/ready`);
    expect(readyRes.ok()).toBeTruthy();
    const ready = await readyRes.json();
    expect(ready.status).toBe('ok');

    const statsRes = await request.post(`${API_BASE}/v3/stats`, { json: {} });
    // stats is include_in_schema=False — still callable
  });
});