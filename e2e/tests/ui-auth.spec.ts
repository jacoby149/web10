import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const API_BASE = `http://api.localhost${p}`;

const uniqueUser = () => `e2euser${Date.now()}`;

test.describe('ui auth flows', () => {
  test('signup via API succeeds', async ({ request }) => {
    const username = uniqueUser();
    const password = 'TestPass123!';

    const res = await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15551234567',
        betacode: 'web10betacode',
      },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('login via API returns token', async ({ request }) => {
    const username = uniqueUser();
    const password = 'TestPass123!';

    // Signup first
    await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15551234567',
        betacode: 'web10betacode',
      },
    });

    // Login
    const res = await request.post(`${API_BASE}/web10token`, {
      data: {
        username,
        password,
        site: 'auth.localhost',
        target: username,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeDefined();
  });

  test('login with wrong password is rejected', async ({ request }) => {
    const username = uniqueUser();
    const password = 'CorrectPass123!';

    await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15551234568',
        betacode: 'web10betacode',
      },
    });

    const res = await request.post(`${API_BASE}/web10token`, {
      data: {
        username,
        password: 'WrongPassword',
        site: 'auth.localhost',
        target: username,
      },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('auth UI renders without white-screen', async ({ page }) => {
    await page.goto(AUTH_BASE);
    await expect(page).toHaveTitle(/web10/i);
    // Page should render content (not a blank crash)
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });
});