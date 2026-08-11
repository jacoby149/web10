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

  test('app store -> token handoff flow', async ({ request }) => {
    const username = uniqueUser();
    const password = 'TestPass123!';

    await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15555550001',
        betacode: 'web10betacode',
      },
    });

    // Token handoff: no site/target → self-access
    const tokenRes = await request.post(`${API_BASE}/v3/login`, {
      json: { token: '', body: { username, password } },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();
    expect(token).toBeDefined();

    const certifyRes = await request.post(`${API_BASE}/certify`, {
      data: { token },
    });
    expect(certifyRes.ok()).toBeTruthy();
    expect(await certifyRes.json()).toBe(true);

    // Token allows CRUD on user's own data
    const createRes = await request.post(`${API_BASE}/${username}/posts`, {
      data: {
        token,
        query: { text: 'app store launch post', created_at: new Date().toISOString() },
      },
    });
    expect(createRes.ok()).toBeTruthy();
  });

  test('system endpoints: ready and stats', async ({ request }) => {
    const readyRes = await request.get(`${API_BASE}/ready`);
    expect(readyRes.ok()).toBeTruthy();
    const ready = await readyRes.json();
    expect(ready.status).toBe('ok');

    const statsRes = await request.post(`${API_BASE}/stats`);
    // stats is include_in_schema=False — still callable
  });
});