import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { API_BASE, v3Post, v3Login, v3Signup } from '../v3-helpers';

/**
 * Discover board gauntlet — the node-default discover group's exact read
 * pattern + the board moderation ops (hide → post absent from anon read →
 * unhide → post reappears).
 *
 * API floor (thin — the primitive floors live in feed-demo):
 *   - Anon read of the discover group returns the board (no token).
 *   - A real user's post appears in the anon read.
 *   - Moderation round-trip: hide (node admin) → post absent → unhide →
 *     post reappears.
 *   - I3 anti-test: anon cannot read a non-member group; a non-member user
 *     gets 403.
 *
 * Browser gauntlet: the marketing trending page
 * (marketing-ui/src/pages/Trending.tsx) renders the board. A seeded post
 * appears, a hidden post disappears, an unhidden post reappears.
 *
 * The discover board is a SHARED node default, so the board assertions are
 * contains-assertions, never exact counts.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;
const PROVIDER = 'api.localhost';
const DISCOVER_GROUP_ID = `${PROVIDER}/groups/web10/discover`;
const SERVICE = 'posts';

// Chromium ignores /etc/hosts (it queries the container's DNS, which answers
// *.localhost with 127.0.0.1). The vhosts are mapped in /etc/hosts by the
// runner, so resolve the proxy IP from there and pin it with
// --host-resolver-rules. On the CI runner (no container) getent returns
// 127.0.0.1, which is correct there too.
function vhostResolverArgs(): string[] {
  try {
    const out = execSync('getent hosts api.localhost', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const ip = out.split(/\s+/)[0];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return [];
    const hosts = ['api', 'auth', 'sdk', 'marketing', 'social', 'marketing-api'];
    return [`--host-resolver-rules=${hosts.map((h) => `MAP ${h}.localhost ${ip}`).join(', ')}`];
  } catch {
    return [];
  }
}

test.use({
  launchOptions: { args: vhostResolverArgs() },
});

const password = 'TestPass123!';
const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, password);
  const token = await v3Login(request, username, password);
  return { username, token };
}

/** The node admin (global-setup's admin) — the operator. */
async function adminToken(request: APIRequestContext): Promise<string> {
  return v3Login(request, 'admin', 'admin123');
}

/** Post to the discover group (the board). */
async function postToDiscover(request: APIRequestContext, token: string, text: string): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/create`, {
    token,
    service: SERVICE,
    body: { text, origin: 'web10', created_at: new Date().toISOString() },
    groups: [DISCOVER_GROUP_ID],
  });
  expect(res.ok(), `create post failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Anon read (NO token) — the public board path. */
async function anonRead(request: APIRequestContext, service: string, groups: string[], limit = 100) {
  return request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ service, groups, limit }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Hide a doc from the discover group (node admin). */
async function hideDoc(request: APIRequestContext, token: string, docId: string) {
  const res = await v3Post(request, `${API_BASE}/v3/groups/hide`, {
    token,
    group_id: DISCOVER_GROUP_ID,
    doc_id: docId,
  });
  expect(res.ok(), `hide failed (${res.status})`).toBeTruthy();
  return res.json();
}

/** Unhide (restore) a doc to the discover group (node admin). */
async function unhideDoc(request: APIRequestContext, token: string, docId: string) {
  const res = await v3Post(request, `${API_BASE}/v3/groups/unhide`, {
    token,
    group_id: DISCOVER_GROUP_ID,
    doc_id: docId,
  });
  expect(res.ok(), `unhide failed (${res.status})`).toBeTruthy();
  return res.json();
}

/** List hidden docs in the discover group (node admin). */
async function listHiddenDocs(request: APIRequestContext, token: string) {
  const res = await v3Post(request, `${API_BASE}/v3/groups/hidden`, {
    token,
    group_id: DISCOVER_GROUP_ID,
  });
  expect(res.ok(), `hidden list failed (${res.status})`).toBeTruthy();
  return res.json();
}

/** Read the discover group as anon and return the list of body.text values. */
async function anonBoardTexts(request: APIRequestContext): Promise<string[]> {
  const res = await anonRead(request, SERVICE, [DISCOVER_GROUP_ID]);
  expect(res.ok(), `anon board read failed (${res.status})`).toBeTruthy();
  const docs = (await res.json()) as any[];
  return docs.map((d) => d.body.text);
}

// ---------------------------------------------------------------------------
// API floor — the board's exact read pattern + moderation round-trip
// ---------------------------------------------------------------------------

test.describe('Discover board — API floor (anon read + moderation)', () => {
  test('anon read of the discover group returns seeded posts', async ({ request }) => {
    const u1 = await signupAndLogin(request, 'boardapi1');
    const u2 = await signupAndLogin(request, 'boardapi2');
    const text1 = `board post one ${Date.now()}`;
    const text2 = `board post two ${Date.now()}`;
    await postToDiscover(request, u1.token, text1);
    await postToDiscover(request, u2.token, text2);

    // NO token — the discover group is anon-readable (the public board).
    const texts = await anonBoardTexts(request);
    // The board is a shared node default — contains, not exact counts.
    expect(texts).toContain(text1);
    expect(texts).toContain(text2);
  });

  test('moderation round-trip: hide → absent → unhide → present', async ({ request }) => {
    const poster = await signupAndLogin(request, 'boardmod1');
    const admin = await adminToken(request);
    const text = `moderation test post ${Date.now()}`;
    const docId = await postToDiscover(request, poster.token, text);

    // The post is visible in the anon board read.
    {
      const texts = await anonBoardTexts(request);
      expect(texts).toContain(text);
    }

    // Hide it (node admin).
    const hideRes = await hideDoc(request, admin, docId);
    expect(hideRes.status).toBe('hidden');

    // The post is absent from the anon board read.
    {
      const texts = await anonBoardTexts(request);
      expect(texts).not.toContain(text);
    }

    // The doc is in the hidden list.
    {
      const hidden = await listHiddenDocs(request, admin);
      const hiddenIds: string[] = (hidden.hidden as any[]).map((h) => h.doc_id ?? h);
      expect(hiddenIds).toContain(docId);
    }

    // Unhide it (node admin).
    const unhideRes = await unhideDoc(request, admin, docId);
    expect(unhideRes.status).toBe('restored');

    // The post reappears in the anon board read.
    {
      const texts = await anonBoardTexts(request);
      expect(texts).toContain(text);
    }
  });

  test('anti-test: I3 holds — anon cannot read a non-member group; a non-member user gets 403', async ({ request }) => {
    const owner = await signupAndLogin(request, 'boardi3');
    const outsider = await signupAndLogin(request, 'boardi3x');
    const roles = [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
      { name: 'member', services: [SERVICE], permissions: ['readAll'] },
    ];
    const create = await v3Post(request, `${API_BASE}/v3/groups/create`, {
      token: owner.token,
      name: 'private-circle',
      join_policy: 'invite_only',
      roles,
      members: [{ member_key: owner.username, role: 'owner' }],
    });
    expect(create.ok(), `create group failed (${create.status})`).toBeTruthy();
    const groupId = (await create.json()).group_id as string;
    const postText = `private group post ${Date.now()}`;
    const postRes = await v3Post(request, `${API_BASE}/v3/create`, {
      token: owner.token,
      service: SERVICE,
      body: { text: postText },
      groups: [groupId],
    });
    expect(postRes.ok()).toBeTruthy();

    // Anon is only a member of the discover group. Anon reads are exempt from
    // the 403 membership check (an empty board is a valid result) — I3 for
    // anon is the membership JOIN: the group's posts simply do not come back.
    const anonRes = await anonRead(request, SERVICE, [groupId]);
    expect(anonRes.ok()).toBeTruthy();
    const anonDocs = (await anonRes.json()) as any[];
    expect(anonDocs.map((d) => d.body.text)).not.toContain(postText);

    // A real user who is not a member gets the actionable 403.
    const outsiderRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: outsider.token, service: SERVICE, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(outsiderRes.status()).toBe(403);
    const err = await outsiderRes.json();
    expect(err.detail).toMatch(/not a member/i);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the marketing trending page renders the board;
// a hidden post disappears, an unhidden post reappears.
// ---------------------------------------------------------------------------

test.describe('Discover board gauntlet — marketing trending page + moderation', () => {
  test('seeded post appears; hidden post disappears; unhidden post reappears', async ({ page, context, request }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // --- Seed via API ---
    const poster = await signupAndLogin(request, 'boardui1');
    const admin = await adminToken(request);
    const postText = `board gauntlet post ${Date.now()}`;
    const docId = await postToDiscover(request, poster.token, postText);

    // --- Load the marketing trending page (anon — no auth needed) ---
    await page.goto(`${MARKETING_BASE}/trending`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="trending-grid"]')).toBeVisible({ timeout: 30_000 });

    // The seeded post renders (contains — the board is shared).
    {
      const cards = page.locator('[data-testid="trending-card"]');
      const count = await cards.count();
      const found = await cards.filter({ hasText: postText }).count();
      expect(found, `post "${postText}" not on the trending board (${count} cards)`).toBeGreaterThanOrEqual(1);
    }

    // --- Hide the post (node admin via API) ---
    await hideDoc(request, admin, docId);

    // Reload — the post is gone.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="trending-grid"]')).toBeVisible({ timeout: 30_000 });
    {
      const cards = page.locator('[data-testid="trending-card"]');
      const found = await cards.filter({ hasText: postText }).count();
      expect(found, `hidden post "${postText}" should be absent from the board`).toBe(0);
    }

    // --- Unhide the post (node admin via API) ---
    await unhideDoc(request, admin, docId);

    // Reload — the post reappears.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="trending-grid"]')).toBeVisible({ timeout: 30_000 });
    {
      const cards = page.locator('[data-testid="trending-card"]');
      const found = await cards.filter({ hasText: postText }).count();
      expect(found, `unhidden post "${postText}" should reappear on the board`).toBeGreaterThanOrEqual(1);
    }

    // No uncaught page errors.
    expect(pageErrors).toEqual([]);
  });
});
