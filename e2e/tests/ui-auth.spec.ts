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

    const res = await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551234567' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('login via API returns token', async ({ request }) => {
    const username = uniqueUser();
    const password = 'TestPass123!';

    // Signup first
    await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551234567' }),
      headers: { 'Content-Type': 'application/json' },
    });

    // Login
    const res = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeDefined();
  });

  test('login with wrong password is rejected', async ({ request }) => {
    const username = uniqueUser();
    const password = 'CorrectPass123!';

    await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551234568' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password: 'WrongPassword' }),
      headers: { 'Content-Type': 'application/json' },
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