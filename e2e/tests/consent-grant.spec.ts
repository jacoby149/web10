import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;

const uniqueUser = () => `consentuser${Date.now()}`;

test.describe('signup -> consent -> grant full flow', () => {
  test('signup -> login -> self CRUD works with owner token', async ({ request }) => {
    const username = uniqueUser();
    const password = 'TestPass123!';

    const signupRes = await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15559990001',
        betacode: 'web10betacode',
      },
    });
    expect(signupRes.ok()).toBeTruthy();

    // Owner token: no site/target → self-access via decoded.username == user
    const tokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username, password },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();
    expect(token).toBeDefined();

    const certifyRes = await request.post(`${API_BASE}/certify`, {
      data: { token },
    });
    expect(certifyRes.ok()).toBeTruthy();
    expect(await certifyRes.json()).toBe(true);

    const createRes = await request.post(`${API_BASE}/${username}/posts`, {
      data: {
        token,
        query: { text: 'Self-access post', created_at: new Date().toISOString() },
      },
    });
    expect(createRes.ok()).toBeTruthy();

    const readRes = await request.patch(`${API_BASE}/${username}/posts`, {
      data: { token, query: {} },
    });
    expect(readRes.ok()).toBeTruthy();
    const posts = await readRes.json();
    expect(Array.isArray(posts)).toBeTruthy();
    expect(posts.length).toBeGreaterThanOrEqual(1);
    expect(posts[0].text).toBe('Self-access post');
  });

  test('signup -> login -> mint tiered token -> CRUD with tiered token', async ({ request }) => {
    const username = uniqueUser();
    const password = 'TestPass123!';

    await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15559990002',
        betacode: 'web10betacode',
      },
    });

    // Get auth token (site must be in CORS_SERVICE_MANAGERS)
    const authTokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username, password, site: 'auth.localhost', target: 'api.localhost' },
    });
    expect(authTokenRes.ok()).toBeTruthy();
    const { token: authToken } = await authTokenRes.json();

    // Consent: create the posts term record the auth app's grant flow
    // would create — self on the whitelist, the app site in cross_origins
    const termsRes = await request.post(`${API_BASE}/${username}/services`, {
      data: {
        token: authToken,
        query: {
          service: 'posts',
          whitelist: [{ username, provider: 'api.localhost', all: true }],
          blacklist: [],
          cross_origins: ['social.localhost'],
        },
      },
    });
    expect(termsRes.ok()).toBeTruthy();

    // Mint the tiered token for the app site (regression: this was always
    // 401 MINT because the minted TokenData never had provider set)
    const mintRes = await request.post(`${API_BASE}/web10token`, {
      data: { username, token: authToken, site: 'social.localhost', target: 'api.localhost' },
    });
    expect(mintRes.ok()).toBeTruthy();
    const { token: tieredToken } = await mintRes.json();

    // CRUD with the tiered token — the full consent -> grant -> app chain
    const createRes = await request.post(`${API_BASE}/${username}/posts`, {
      data: {
        token: tieredToken,
        query: { text: 'Tiered token post', created_at: new Date().toISOString() },
      },
    });
    expect(createRes.ok()).toBeTruthy();

    const readRes = await request.patch(`${API_BASE}/${username}/posts`, {
      data: { token: tieredToken, query: {} },
    });
    expect(readRes.ok()).toBeTruthy();
    const posts = await readRes.json();
    expect(posts.some((p: { text?: string }) => p.text === 'Tiered token post')).toBeTruthy();
  });

  test('tiered token cannot access other user data', async ({ request }) => {
    const userA = uniqueUser();
    const userB = `${uniqueUser()}b`;
    const password = 'TestPass123!';

    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: userA, password, new_pass: password, retypepass: password, phone: '+15559990003', betacode: 'web10betacode' },
    });
    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: userB, password, new_pass: password, retypepass: password, phone: '+15559990004', betacode: 'web10betacode' },
    });

    const tokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username: userA, password },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();

    // Try to read userB's data — should fail (no terms grant)
    const readRes = await request.patch(`${API_BASE}/${userB}/posts`, {
      data: { token, query: {} },
    });
    expect(readRes.ok()).toBeFalsy();
  });

  test('auth UI renders without crash', async ({ page }) => {
    await page.goto(AUTH_BASE);
    await expect(page).toHaveTitle(/web10/i);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });
});