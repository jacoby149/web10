import { test, expect } from '@playwright/test';
import { API_BASE, v3Post, v3Login } from '../v3-helpers';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

test.describe('app store (v3)', () => {
  test('marketing-ui app store renders with live stats', async ({ page }) => {
    // ?api= points the page's stats fetch at THIS stack's API (the page
    // defaults to http://api.localhost:80, which is wrong on isolated
    // e2e stacks on a non-80 port).
    await page.goto(`${MARKETING_BASE}/app-store?api=${encodeURIComponent(API_BASE)}`);
    await expect(page).toHaveTitle(/web10/i);
    // The header stats line ("N members · N apps · N of data owned on web10")
    // only renders once the /v3/stats fetch resolves — the v3 brick was this
    // fetch hanging 30s on a Mongo scan the v3 stack doesn't run.
    await expect(page.getByText(/members/)).toBeVisible({ timeout: 15000 });
  });

  test('register app via API (v3, anonymous)', async ({ request }) => {
    const url = `http://e2e-app-${Date.now()}.localhost`;
    const res = await v3Post(request, `${API_BASE}/v3/apps/register`, {
      body: { url, name: 'e2e-test-app' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.url).toBe(url);
    expect(data.review_state).toBe('pending');
  });

  test('repeat registration increments visits; approval surfaces the app in stats', async ({ request }) => {
    const url = `http://e2e-visits-${Date.now()}.localhost`;
    // Two pings — first registration + repeat auto-register (the SDK shape).
    for (let i = 0; i < 2; i++) {
      const res = await v3Post(request, `${API_BASE}/v3/apps/register`, { body: { url } });
      expect(res.ok()).toBeTruthy();
    }
    // Approve (admin) — the public store only lists approved apps.
    const adminToken = await v3Login(request, 'admin', 'admin123');
    const approveRes = await v3Post(request, `${API_BASE}/v3/apps/approve`, {
      token: adminToken,
      url,
      approved: true,
    });
    expect(approveRes.ok()).toBeTruthy();

    // /v3/stats surfaces the approved app with its REAL visit count.
    const statsRes = await v3Post(request, `${API_BASE}/v3/stats`, {});
    expect(statsRes.ok()).toBeTruthy();
    const stats = await statsRes.json();
    const app = (stats.apps ?? []).find((a: { url: string }) => a.url === url);
    expect(app).toBeTruthy();
    expect(app.visits).toBe(2);
  });

  test('system endpoints: ready and stats shape', async ({ request }) => {
    const readyRes = await request.get(`${API_BASE}/ready`);
    expect(readyRes.ok()).toBeTruthy();
    const ready = await readyRes.json();
    expect(ready.status).toBe('ok');

    const statsRes = await v3Post(request, `${API_BASE}/v3/stats`, {});
    expect(statsRes.ok()).toBeTruthy();
    const stats = await statsRes.json();
    expect(typeof stats.users).toBe('number');
    expect(typeof stats.documents).toBe('number');
    expect(typeof stats.groups).toBe('number');
    expect(Array.isArray(stats.apps)).toBeTruthy();
    expect(typeof stats.storage).toBe('number');
  });

  test('demo page auto-registers its path (a path is an app, D47)', async ({ page, request }) => {
    // The real seam: load the notes demo, the SDK pings /v3/apps/register
    // with the full URL, path included. The node records it (visits >= 1).
    const demoUrl = `${MARKETING_BASE}/docs/notes/`;
    await page.goto(demoUrl);
    await expect(page.locator('h1')).toHaveText(/Notes/i, { timeout: 15000 });

    const adminToken = await v3Login(request, 'admin', 'admin123');
    const adminRes = await v3Post(request, `${API_BASE}/v3/apps/admin`, { token: adminToken });
    expect(adminRes.ok()).toBeTruthy();
    const admin = await adminRes.json();
    const app = (admin.apps ?? []).find((a: { url: string }) => a.url === demoUrl);
    expect(app, `demo ${demoUrl} should be registered on the node`).toBeTruthy();
    expect(app.visits).toBeGreaterThanOrEqual(1);
  });

  test('path app on a known host renders in the store grid (D47)', async ({ page, request }) => {
    // A path on a KNOWN host (www.web10.app) is an app, not infrastructure —
    // it must render in the grid, not get filtered with the root URLs.
    const url = 'https://www.web10.app/docs/e2e-path-app/';
    const registerRes = await v3Post(request, `${API_BASE}/v3/apps/register`, {
      body: { url, name: 'E2E Path App' },
    });
    expect(registerRes.ok()).toBeTruthy();
    const adminToken = await v3Login(request, 'admin', 'admin123');
    const approveRes = await v3Post(request, `${API_BASE}/v3/apps/approve`, {
      token: adminToken,
      url,
      approved: true,
    });
    expect(approveRes.ok()).toBeTruthy();

    await page.goto(`${MARKETING_BASE}/app-store?api=${encodeURIComponent(API_BASE)}`);
    await expect(page.getByText('E2E Path App', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test.skip('app store -> token handoff flow', async () => {
    // GUTTED (v2→v3): tested removed endpoints (/certify, /{username}/posts) and the
    // legacy /signup. The token-handoff feature still exists in v3 — an app gets an
    // origin-scoped token via an app contract, then does CRUD via /v3/create.
    // v3 rewrite: /v3/signup → /v3/login → /v3/app-contracts/add → /v3/create.
  });
});
