import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const API_BASE = `http://api.localhost${p}`;

const uniqueUser = () => `socialuser${Date.now()}`;

test.describe('web10-social post to feed', () => {
  test('social user signup + token + CRUD round-trip', async ({ request }) => {
    const username = uniqueUser();
    const password = 'TestPass123!';

    // 1. Create user
    const signupRes = await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15559876543',
        betacode: 'web10betacode',
      },
    });
    expect(signupRes.ok()).toBeTruthy();

    // 2. Get token for social.localhost
    const tokenRes = await request.post(`${API_BASE}/v3/login`, {
      data: {
        username,
        password,
        site: 'social.localhost',
        target: username,
      },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();
    expect(token).toBeDefined();

    // 3. Verify token via /certify (returns true when valid)
    const certifyRes = await request.post(`${API_BASE}/certify`, {
      data: { token },
    });
    expect(certifyRes.ok()).toBeTruthy();
    expect(await certifyRes.json()).toBe(true);
  });

  test('social app renders login screen without crash', async ({ page }) => {
    await page.goto(SOCIAL_BASE);
    await expect(page.locator('text=web10')).toBeVisible({ timeout: 10000 });
    // D-login-cta (1.0.155) changed the copy to "Log in or create your
    // account", which now also appears in a subtitle paragraph — `text=Log
    // in` matches both and violates Playwright's strict mode.
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible({ timeout: 10000 });
  });
});