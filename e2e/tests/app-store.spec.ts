import { test, expect } from '@playwright/test';
import { API_BASE, v3Post, v3Login, v3Signup } from '../v3-helpers';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

// D49: the store's metric is real-user activity over `app_visits` — anon
// pings are dropped at ingest, counting is gated to 1 per (app, user) per
// 3h, and the public list is paginated + sorted by users_30d. `apps` is a
// stable registration record (no per-ping appends, no visit counter).

async function signupAndLogin(request: any, prefix: string): Promise<{ username: string; token: string }> {
  const username = `${prefix}-${Date.now()}`;
  await v3Signup(request, username, 'TestPass123!', '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, 'TestPass123!');
  return { username, token };
}

async function approve(request: any, url: string): Promise<void> {
  const adminToken = await v3Login(request, 'admin', 'admin123');
  const res = await v3Post(request, `${API_BASE}/v3/apps/approve`, { token: adminToken, url, approved: true });
  expect(res.ok()).toBeTruthy();
}

async function listApp(request: any, url: string): Promise<Record<string, unknown>> {
  const res = await v3Post(request, `${API_BASE}/v3/apps/list`, { limit: 100, offset: 0 });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const app = (data.apps ?? []).find((a: { url: string }) => a.url === url);
  expect(app, `app ${url} should be in the public list`).toBeTruthy();
  return app as Record<string, unknown>;
}

// The endpoint caps limit at 100 — page through to the end.
async function listAllApps(request: any): Promise<{ url: string }[]> {
  const all: { url: string }[] = [];
  let offset = 0;
  for (;;) {
    const res = await v3Post(request, `${API_BASE}/v3/apps/list`, { limit: 100, offset });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    all.push(...data.apps);
    if (all.length >= data.total) break;
    offset += 100;
  }
  return all;
}

test.describe('app store (v3, D49)', () => {
  test('marketing-ui app store renders with live stats', async ({ page }) => {
    // ?api= points the page's stats fetch at THIS stack's API (the page
    // defaults to http://api.localhost:80, which is wrong on isolated
    // e2e stacks on a non-80 port).
    await page.goto(`${MARKETING_BASE}/app-store?api=${encodeURIComponent(API_BASE)}`);
    await expect(page).toHaveTitle(/web10/i);
    // The header stats line ("N web10 users · 30d · N apps · N of data owned
    // on web10") only renders once the /v3/stats fetch resolves — the v3
    // brick was this fetch hanging 30s on a Mongo scan the v3 stack doesn't
    // run. The headline is the macro active-user set (D49), not "members".
    await expect(page.getByText(/web10 users/)).toBeVisible({ timeout: 15000 });
  });

  test('register app via API (v3, anonymous) — url normalized, pending', async ({ request }) => {
    const url = `http://e2e-app-${Date.now()}.localhost`;
    const res = await v3Post(request, `${API_BASE}/v3/apps/register`, {
      body: { url, name: 'e2e-test-app' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // D49 / hardening #4: canonical form — exactly one trailing slash,
    // lowercase host, no query/fragment. One row per app, not per spelling.
    expect(data.url).toBe(`${url}/`);
    expect(data.review_state).toBe('pending');
  });

  test('verified user ping counts an active user; anon ping does not (D49)', async ({ request }) => {
    const { token } = await signupAndLogin(request, 'e2e-users');
    const url = `http://e2e-users-${Date.now()}.localhost/`;
    const reg = await v3Post(request, `${API_BASE}/v3/apps/register`, { body: { url, token } });
    expect(reg.ok()).toBeTruthy();

    // Anon ping on the same app — dropped at ingest, not a second user.
    const anon = await v3Post(request, `${API_BASE}/v3/apps/register`, { body: { url } });
    expect(anon.ok()).toBeTruthy();

    await approve(request, url);
    const app = await listApp(request, url);
    expect(app.users_30d).toBe(1);
    expect(app.users_1d).toBe(1);
    expect(app.visits).toBe(1);
  });

  test('repeat pings within the 3h window are gated to one visit (D49)', async ({ request }) => {
    const { token } = await signupAndLogin(request, 'e2e-gate');
    const url = `http://e2e-gate-${Date.now()}.localhost/`;
    for (let i = 0; i < 3; i++) {
      const res = await v3Post(request, `${API_BASE}/v3/apps/register`, { body: { url, token } });
      expect(res.ok()).toBeTruthy();
    }
    // One counted visit, not three — the ingest gate ('if >3h, insert').
    await approve(request, url);
    const app = await listApp(request, url);
    expect(app.visits).toBe(1);
    expect(app.users_30d).toBe(1);
  });

  test('system endpoints: ready and stats shape (D49)', async ({ request }) => {
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
    // D49: the per-app array moved to /v3/apps/list (paginated); /v3/stats
    // carries the approved-app count + the node-wide active-user set.
    expect(typeof stats.app_count).toBe('number');
    expect(typeof stats.active_users.users_1d).toBe('number');
    expect(typeof stats.active_users.users_30d).toBe('number');
    expect(typeof stats.active_users.users_90d).toBe('number');
    expect(typeof stats.active_users.users_1y).toBe('number');
    expect(typeof stats.storage).toBe('number');
  });

  test('demo page auto-registers its path (a path is an app, D47)', async ({ page, request }) => {
    // The real seam: load the notes demo, the SDK pings /v3/apps/register
    // with the full URL, path included. The node records the registration.
    const demoUrl = `${MARKETING_BASE}/docs/notes/`;
    await page.goto(demoUrl);
    await expect(page.locator('h1')).toHaveText(/Notes/i, { timeout: 15000 });

    const adminToken = await v3Login(request, 'admin', 'admin123');
    const adminRes = await v3Post(request, `${API_BASE}/v3/apps/admin`, { token: adminToken });
    expect(adminRes.ok()).toBeTruthy();
    const admin = await adminRes.json();
    const app = (admin.apps ?? []).find((a: { url: string }) => a.url === demoUrl);
    expect(app, `demo ${demoUrl} should be registered on the node`).toBeTruthy();
  });

  test('signed-in demo user counts as an active user (D49 browser seam)', async ({ page, context, request }) => {
    // Seed the real user's token cookie the way a returning browser would;
    // the SDK's init ping reads it (state.token ?? readTokenCookie()), so
    // the visit is attributed to a real web10 user — not anon.
    const { token } = await signupAndLogin(request, 'e2e-browser');
    await context.addCookies([
      { name: 'token', value: token, domain: 'marketing.localhost', path: '/', secure: false, httpOnly: false },
    ]);

    const demoUrl = `${MARKETING_BASE}/docs/notes/`;
    await page.goto(demoUrl);
    await expect(page.locator('h1')).toHaveText(/Notes/i, { timeout: 15000 });

    // The demo auto-registers as pending; the public list shows approved
    // only — approve it, then check the metric. The SDK ping is
    // fire-and-forget, so poll until the counted visit lands.
    await approve(request, demoUrl);
    await expect
      .poll(
        async () => {
          const res = await v3Post(request, `${API_BASE}/v3/apps/list`, { limit: 100, offset: 0 });
          const data = await res.json();
          const a = (data.apps ?? []).find((x: { url: string }) => x.url === demoUrl);
          return a ? (a.users_30d as number) : 0;
        },
        { timeout: 15000, message: `demo ${demoUrl} should show a counted real-user visit` },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test('store list is paginated and sorted (D49)', async ({ request }) => {
    // 25 approved apps → the list exceeds one page (the store's PAGE_SIZE
    // is 20). The stack may carry other approved apps (repeated local runs),
    // so every assertion is relative, not absolute.
    const ts = Date.now();
    const urls: string[] = [];
    for (let i = 0; i < 25; i++) {
      const url = `http://e2e-page-${ts}-${i}.localhost/`;
      const reg = await v3Post(request, `${API_BASE}/v3/apps/register`, {
        body: { url, name: `E2E Page ${i}` },
      });
      expect(reg.ok()).toBeTruthy();
      urls.push(url);
    }
    for (const url of urls) await approve(request, url);

    const page1Res = await v3Post(request, `${API_BASE}/v3/apps/list`, { limit: 20, offset: 0 });
    expect(page1Res.ok()).toBeTruthy();
    const page1 = await page1Res.json();
    expect(page1.apps.length).toBe(20);
    expect(page1.total).toBeGreaterThanOrEqual(25);

    const page2Res = await v3Post(request, `${API_BASE}/v3/apps/list`, { limit: 20, offset: 20 });
    expect(page2Res.ok()).toBeTruthy();
    const page2 = await page2Res.json();
    // Page 2 is capped at the limit, not "everything left".
    expect(page2.apps.length).toBe(Math.min(20, page1.total - 20));
    expect(page2.total).toBe(page1.total);

    // No overlap between pages.
    const seen = new Set(page1.apps.map((a: { url: string }) => a.url));
    for (const a of page2.apps) expect(seen.has(a.url)).toBeFalsy();

    // Every registered app appears in the full list (sort position of
    // 0-user apps is not asserted — the sort invariant below covers
    // ordering).
    const allUrls = (await listAllApps(request)).map((a) => a.url);
    for (const url of urls) expect(allUrls).toContain(url);

    // Sorted by users_30d desc (visits tiebreak) — non-increasing across
    // the concatenated pages.
    const counts = [...page1.apps, ...page2.apps].map((a: { users_30d: number }) => a.users_30d);
    for (let i = 1; i < counts.length; i++) expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
  });

  test('path app on a known host renders in the store grid (D47)', async ({ page, request }) => {
    // A path on a KNOWN host (www.web10.app) is an app, not infrastructure —
    // it must render in the grid, not get filtered with the root URLs. The
    // url normalizes server-side (www stripped) — and approve normalizes
    // too, so the operator can paste either spelling.
    const url = 'https://www.web10.app/docs/e2e-path-app/';
    const canonical = 'https://web10.app/docs/e2e-path-app/';
    const registerRes = await v3Post(request, `${API_BASE}/v3/apps/register`, {
      body: { url, name: 'E2E Path App' },
    });
    expect(registerRes.ok()).toBeTruthy();
    const data = await registerRes.json();
    expect(data.url).toBe(canonical);
    await approve(request, url); // www spelling — normalized at the endpoint

    // The grid is server-paginated (page 1 = top 20 by users_30d). Give the
    // app one real counted user so it sorts onto page 1 deterministically.
    const { token } = await signupAndLogin(request, 'e2e-pathapp');
    const ping = await v3Post(request, `${API_BASE}/v3/apps/register`, { body: { url: canonical, token } });
    expect(ping.ok()).toBeTruthy();

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
