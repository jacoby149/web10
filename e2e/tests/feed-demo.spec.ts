import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Feed demo — the platform unit test for the social feed: a discover group
 * (open, auto-join public board) + per-creator followers groups, read as ONE
 * combined multi-group feed (`/v3/read` over a list of groups).
 *
 * The API floor proves the multi-group read primitive (the load-bearing part —
 * it needs several users, so it exercises the membership scoping the
 * single-user demos never touch). The browser gauntlet drives the real demo
 * flow end to end: auth → set up the discover group through the REAL consent
 * popup → post to discover → follow creators → read the combined feed — with
 * console log-sequence verification.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'web10-docs-feed-demo';
const ORIGIN = 'http://marketing.localhost';

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// The discover group is a public board: one role, members can post + read.
const DISCOVER_ROLES = [
  { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
];
// A followers group: the creator (owner) posts; followers (member) are read-only.
const FOLLOWERS_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE], permissions: ['readAll'] },
];

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await request.post(`${API_BASE}/v3/signup`, {
    data: JSON.stringify({ username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) }),
    headers: { 'Content-Type': 'application/json' },
  });
  const res = await request.post(`${API_BASE}/v3/login`, {
    data: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  const token = (await res.json()).token as string;
  return { username, token };
}

async function addAppContract(request: APIRequestContext, token: string) {
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: ORIGIN,
      permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] },
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
}

/** Create a group; the creator takes `memberRole`. Returns the group_id. */
async function createGroup(
  request: APIRequestContext, token: string, creator: string, name: string,
  joinPolicy: string, roles: Record<string, any>[], memberRole = 'owner',
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token, name, join_policy: joinPolicy, roles,
      members: [{ member_key: creator, role: memberRole }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create group "${name}" failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

async function postDoc(request: APIRequestContext, token: string, groupId: string, text: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token, service: SERVICE,
      body: { text, date: new Date().toISOString() },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(res.ok(), `create doc failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

async function readGroups(request: APIRequestContext, token: string, groups: string[]): Promise<any[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(res.ok(), `read failed (${res.status})`).toBeTruthy();
  return (await res.json()) as any[];
}

async function joinGroup(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/groups/join`, {
    data: JSON.stringify({ token, group_id: groupId }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `join failed (${res.status})`).toBeTruthy();
  return res.json();
}

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

function captureConsoleLogs(page: Page, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes(prefix)) logs.push(text);
  });
  return logs;
}

// toContainText on a multi-element locator violates strict mode, so assert on
// the collected texts instead. toPass keeps the retry/timeout for posts that
// appear asynchronously (after a post/follow triggers a feed reload).
async function expectFeedContains(page: Page, text: string, timeout = 15000) {
  await expect(async () => {
    const texts = await page.locator('[data-testid="feed-post-text"]').allTextContents();
    expect(texts).toContain(text);
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// API floor — the multi-group read primitive, fast + deterministic (no browser)
// ---------------------------------------------------------------------------

test.describe('Feed demo — API floor (multi-group read)', () => {
  test('one read over discover + 2 followers groups returns all three posts', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'feedv');
    const c1 = await signupAndLogin(request, 'feedc1');
    const c2 = await signupAndLogin(request, 'feedc2');
    await addAppContract(request, viewer.token);
    await addAppContract(request, c1.token);
    await addAppContract(request, c2.token);

    // Viewer's discover group (open, public board).
    const discoverId = await createGroup(request, viewer.token, viewer.username, 'discover', 'open', DISCOVER_ROLES, 'member');
    expect(discoverId).toBe(`${PROVIDER}/groups/users/${viewer.username}/discover`);

    // Creators' followers groups (open — following is an instant join).
    const f1 = await createGroup(request, c1.token, c1.username, 'followers', 'open', FOLLOWERS_ROLES);
    const f2 = await createGroup(request, c2.token, c2.username, 'followers', 'open', FOLLOWERS_ROLES);
    expect(f1).toBe(`${PROVIDER}/groups/users/${c1.username}/followers`);
    expect(f2).toBe(`${PROVIDER}/groups/users/${c2.username}/followers`);

    // Viewer follows both creators (open join = instant, no approval).
    await joinGroup(request, viewer.token, f1);
    await joinGroup(request, viewer.token, f2);

    // Posts: viewer → discover, c1 → f1, c2 → f2.
    await postDoc(request, viewer.token, discoverId, 'viewer on discover');
    await postDoc(request, c1.token, f1, 'c1 post');
    await postDoc(request, c2.token, f2, 'c2 post');

    // ONE multi-group read over discover + both followers groups.
    const docs = await readGroups(request, viewer.token, [discoverId, f1, f2]);
    expect(docs.length).toBe(3);
    expect(docs.map((d) => d.body.text).sort()).toEqual(['c1 post', 'c2 post', 'viewer on discover']);
    expect(docs.map((d) => d.author_key).sort()).toEqual([c1.username, c2.username, viewer.username].sort());
  });

  test('anti-test: a viewer who follows only C1 does NOT see C2\'s posts (membership scoping)', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'feedx1');
    const c1 = await signupAndLogin(request, 'feedx2');
    const c2 = await signupAndLogin(request, 'feedx3');
    await addAppContract(request, viewer.token);
    await addAppContract(request, c1.token);
    await addAppContract(request, c2.token);

    const f1 = await createGroup(request, c1.token, c1.username, 'followers', 'open', FOLLOWERS_ROLES);
    const f2 = await createGroup(request, c2.token, c2.username, 'followers', 'open', FOLLOWERS_ROLES);

    // Viewer follows ONLY C1.
    await joinGroup(request, viewer.token, f1);

    // Both creators post to their own followers groups.
    await postDoc(request, c1.token, f1, 'c1 post');
    await postDoc(request, c2.token, f2, 'c2 post');

    // Reading the viewer's followed groups must surface only C1's post.
    const docs = await readGroups(request, viewer.token, [f1]);
    expect(docs.length).toBe(1);
    expect(docs[0].body.text).toBe('c1 post');
  });

  test('anti-test: a non-member cannot read a followers group (I3 holds)', async ({ request }) => {
    const creator = await signupAndLogin(request, 'feeda1');
    const outsider = await signupAndLogin(request, 'feeda2');
    await addAppContract(request, creator.token);
    await addAppContract(request, outsider.token);
    const f = await createGroup(request, creator.token, creator.username, 'followers', 'open', FOLLOWERS_ROLES);
    await postDoc(request, creator.token, f, 'private to followers');

    // Outsider is not a member of the followers group.
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: outsider.token, service: SERVICE, groups: [f] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.status()).toBe(403);
    const err = await readRes.json();
    expect(err.detail).toMatch(/not a member/i);
  });

  test('anti-test: read without an app contract fails 403 (contract gate)', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'feedb1');
    const c1 = await signupAndLogin(request, 'feedb2');
    await addAppContract(request, c1.token);
    // NO app contract for the viewer.
    const f1 = await createGroup(request, c1.token, c1.username, 'followers', 'open', FOLLOWERS_ROLES);
    await joinGroup(request, viewer.token, f1);
    await postDoc(request, c1.token, f1, 'needs a contract');

    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: viewer.token, service: SERVICE, groups: [f1] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.status()).toBe(403);
  });

  test('unfollow (leave) removes the creator from the combined feed', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'feedu1');
    const c1 = await signupAndLogin(request, 'feedu2');
    await addAppContract(request, viewer.token);
    await addAppContract(request, c1.token);
    const f1 = await createGroup(request, c1.token, c1.username, 'followers', 'open', FOLLOWERS_ROLES);
    await joinGroup(request, viewer.token, f1);
    await postDoc(request, c1.token, f1, 'c1 post');

    // Following: the post is in the feed.
    expect((await readGroups(request, viewer.token, [f1])).length).toBe(1);

    // Unfollow = leave the followers group.
    const leave = await request.post(`${API_BASE}/v3/groups/leave`, {
      data: JSON.stringify({ token: viewer.token, group_id: f1 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(leave.ok()).toBeTruthy();

    // Consequence: the creator's post is gone from the viewer's feed (I3).
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: viewer.token, service: SERVICE, groups: [f1] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real feed flow through the real consent popup
// ---------------------------------------------------------------------------

test.describe('Feed demo gauntlet — real flow + log sequence', () => {
  test('auth → set up discover (real popup) → post → follow → combined feed', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[feed-demo]');

    // Viewer (pre-authed) + two creators (set up via API — they're "other users").
    const viewer = await signupAndLogin(request, 'feedui');
    await setTokenCookie(context, 'marketing.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);

    const c1 = await signupAndLogin(request, 'feeduic1');
    const c2 = await signupAndLogin(request, 'feeduic2');
    await addAppContract(request, c1.token);
    await addAppContract(request, c2.token);

    // Creators' followers groups + posts.
    const f1 = await createGroup(request, c1.token, c1.username, 'followers', 'open', FOLLOWERS_ROLES);
    const f2 = await createGroup(request, c2.token, c2.username, 'followers', 'open', FOLLOWERS_ROLES);
    const c1Post = `c1 feed post ${Date.now()}`;
    const c2Post = `c2 feed post ${Date.now()}`;
    await postDoc(request, c1.token, f1, c1Post);
    await postDoc(request, c2.token, f2, c2Post);

    // --- Viewer loads the demo (signed in, discover group NOT yet set up) ---
    await page.goto(`${MARKETING_BASE}/docs/feed/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#editor')).toBeVisible();
    // Discover group missing → the setup button is the D42 lazy seam.
    await expect(page.locator('#setupDiscoverBtn')).toBeVisible({ timeout: 10000 });

    // --- Set up the discover group through the REAL consent popup ---
    const popupPromise = context.waitForEvent('page', { timeout: 20000 });
    await page.locator('#setupDiscoverBtn').click();
    const popup = await popupPromise;
    const popupLogs: string[] = [];
    popup.on('console', (m) => popupLogs.push(m.text()));
    popup.on('pageerror', (e) => popupLogs.push(`[pageerror] ${e.message}`));
    await popup.waitForLoadState('networkidle', { timeout: 20000 });
    // The group contract must render (not "all set") — the load-bearing seam.
    try {
      await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 20000 });
    } catch (err) {
      const body = await popup.locator('body').innerText().catch(() => '(unreadable)');
      throw new Error(`consent-req-0 never rendered.\n--- popup body ---\n${body}\n--- popup console ---\n${popupLogs.join('\n')}\n--- demo console ---\n${logs.join('\n')}`);
    }
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});

    // Discover group ready → setup button hidden, feed visible.
    await expect(page.locator('#setupDiscoverBtn')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#feed')).toBeVisible();

    // --- Post to discover ---
    const myPost = `my discover post ${Date.now()}`;
    await page.locator('#postText').fill(myPost);
    await page.locator('[data-testid="post-button"]').click();
    await expectFeedContains(page, myPost);

    // --- Follow creator C1 (open join, no popup) → C1's post joins the feed ---
    await page.locator('[data-testid="creator-input"]').fill(c1.username);
    await page.locator('[data-testid="follow-button"]').click();
    await expectFeedContains(page, c1Post);
    // C2's post must NOT appear yet (the viewer hasn't followed C2).
    expect(await page.locator('[data-testid="feed-post-text"]').allTextContents()).not.toContain(c2Post);

    // --- Follow creator C2 too → the combined feed now has all three posts ---
    await page.locator('[data-testid="creator-input"]').fill(c2.username);
    await page.locator('[data-testid="follow-button"]').click();
    await expectFeedContains(page, c2Post);
    await expect(page.locator('[data-testid="feed-post"]')).toHaveCount(3, { timeout: 10000 });

    // The feed meta reflects the multi-group read (discover + 2 followers).
    await expect(page.locator('#feedMeta')).toContainText('3 groups');

    // --- Verify console logs (the real flow, in order) ---
    const logStr = logs.join('\n');
    expect(logStr).toContain('[feed-demo] init — host:');
    expect(logStr).toContain('[feed-demo] initApp — setting up signed-in state');
    expect(logStr).toContain('[feed-demo] ensureDiscoverGroup — no discover group yet');
    expect(logStr).toContain('[feed-demo] setupDiscoverBtn clicked');
    expect(logStr).toContain('[feed-demo] setupDiscover — discover group created');
    expect(logStr).toContain('[feed-demo] postToDiscover — success');
    expect(logStr).toContain('[feed-demo] followCreator — joined');
    expect(logStr).toContain('[feed-demo] loadFeed — got');

    // No errors in the demo's console.
    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });

  test('log sequence is ordered correctly', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[feed-demo]');

    const viewer = await signupAndLogin(request, 'feedseq');
    await setTokenCookie(context, 'marketing.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);

    const c1 = await signupAndLogin(request, 'feedseqc1');
    await addAppContract(request, c1.token);
    const f1 = await createGroup(request, c1.token, c1.username, 'followers', 'open', FOLLOWERS_ROLES);
    await postDoc(request, c1.token, f1, 'seq c1 post');

    await page.goto(`${MARKETING_BASE}/docs/feed/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#setupDiscoverBtn')).toBeVisible({ timeout: 10000 });

    // Set up discover through the real popup.
    const popupPromise = context.waitForEvent('page', { timeout: 20000 });
    await page.locator('#setupDiscoverBtn').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle', { timeout: 20000 });
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 20000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});
    await expect(page.locator('#setupDiscoverBtn')).toBeHidden({ timeout: 10000 });

    // Post + follow to generate the full log sequence.
    await page.locator('#postText').fill('seq post');
    await page.locator('[data-testid="post-button"]').click();
    await expect(page.locator('[data-testid="feed-post-text"]').first()).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="creator-input"]').fill(c1.username);
    await page.locator('[data-testid="follow-button"]').click();
    await expect(page.locator('[data-testid="feed-post"]')).toHaveCount(2, { timeout: 10000 });

    const initIdx = logs.findIndex((l) => l.includes('init — host:'));
    const initAppIdx = logs.findIndex((l) => l.includes('initApp — setting up signed-in state'));
    const ensureIdx = logs.findIndex((l) => l.includes('ensureDiscoverGroup — no discover group yet'));
    const setupClickIdx = logs.findIndex((l) => l.includes('setupDiscoverBtn clicked'));
    const setupOkIdx = logs.findIndex((l) => l.includes('setupDiscover — discover group created'));
    const postIdx = logs.findIndex((l) => l.includes('postToDiscover — success'));
    const followIdx = logs.findIndex((l) => l.includes('followCreator — joined'));

    for (const idx of [initIdx, initAppIdx, ensureIdx, setupClickIdx, setupOkIdx, postIdx, followIdx]) {
      expect(idx, 'missing expected log line').toBeGreaterThanOrEqual(0);
    }
    expect(initIdx).toBeLessThan(initAppIdx);
    expect(initAppIdx).toBeLessThan(ensureIdx);
    expect(ensureIdx).toBeLessThan(setupClickIdx);
    expect(setupClickIdx).toBeLessThan(setupOkIdx);
    expect(setupOkIdx).toBeLessThan(postIdx);
    expect(postIdx).toBeLessThan(followIdx);
  });

  test('state rule: the discover group persists across a reload (return run)', async ({ page, context, request }) => {
    const viewer = await signupAndLogin(request, 'feedrr');
    await setTokenCookie(context, 'marketing.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);

    await page.goto(`${MARKETING_BASE}/docs/feed/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#setupDiscoverBtn')).toBeVisible({ timeout: 10000 });

    // First run: set up the discover group through the real popup.
    const popupPromise = context.waitForEvent('page', { timeout: 20000 });
    await page.locator('#setupDiscoverBtn').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle', { timeout: 20000 });
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 20000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});
    await expect(page.locator('#setupDiscoverBtn')).toBeHidden({ timeout: 10000 });

    // Post so there's something to persist.
    const myPost = `return-run post ${Date.now()}`;
    await page.locator('#postText').fill(myPost);
    await page.locator('[data-testid="post-button"]').click();
    await expectFeedContains(page, myPost);

    // Return run: reload. The token cookie persists, initApp re-runs, and the
    // discover group must still be there — the setup button stays hidden and
    // the post survives (not clobbered, not duplicated, not gone).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#setupDiscoverBtn')).toBeHidden({ timeout: 10000 });
    await expectFeedContains(page, myPost);
    await expect(page.locator('[data-testid="feed-post"]')).toHaveCount(1, { timeout: 10000 });
  });

  // ---------------------------------------------------------------------
  // Fork rule + anti-tests: every branch the UI exposes is driven, and the
  // broken-state consequences are verified (not just a status code).
  // ---------------------------------------------------------------------

  test('anti-test: revoke contract → post fails → Fix access (real popup) → recovery', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[feed-demo]');

    const viewer = await signupAndLogin(request, 'feedfix');
    await setTokenCookie(context, 'marketing.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);
    // Pre-create the discover group via the API so the feed works without the
    // setup popup — this test is about the fix-access seam, not discover setup.
    await createGroup(request, viewer.token, viewer.username, 'discover', 'open', DISCOVER_ROLES, 'member');

    await page.goto(`${MARKETING_BASE}/docs/feed/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#setupDiscoverBtn')).toBeHidden({ timeout: 10000 });

    // The feed works initially (post to discover).
    const beforePost = `before revoke ${Date.now()}`;
    await page.locator('#postText').fill(beforePost);
    await page.locator('[data-testid="post-button"]').click();
    await expectFeedContains(page, beforePost);

    // Revoke the app contract via the API.
    const revoke = await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: JSON.stringify({ token: viewer.token, allowed_origin: ORIGIN }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });
    expect(revoke.ok()).toBeTruthy();

    // Now a post fails with 403 → the "Fix access" button appears.
    const afterPost = `after revoke ${Date.now()}`;
    await page.locator('#postText').fill(afterPost);
    await page.locator('[data-testid="post-button"]').click();
    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 10000 });
    // Consequence: the post was NOT created (the contract gate holds).
    expect(await page.locator('[data-testid="feed-post-text"]').allTextContents()).not.toContain(afterPost);

    // Click "Fix access" — the REAL auth popup drives the re-consent.
    const popupPromise = context.waitForEvent('page', { timeout: 20000 });
    await page.locator('#fixAccessBtn').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle', { timeout: 20000 });
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 20000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});

    // Recovery: the demo's callback re-approves and the feed works again.
    await expect(async () => {
      expect(logs.join('\n')).toContain('fixAccess — contract re-approved, retrying loadFeed');
    }).toPass({ timeout: 15000 });
    const recoveredPost = `after fix ${Date.now()}`;
    await page.locator('#postText').fill(recoveredPost);
    await page.locator('[data-testid="post-button"]').click();
    await expectFeedContains(page, recoveredPost);

    // The fix flow was triggered (log).
    expect(logs.join('\n')).toContain('[feed-demo] fixAccessBtn clicked');
  });

  test('fork: delete own post (author-scoped) — it disappears from the feed', async ({ page, context, request }) => {
    const viewer = await signupAndLogin(request, 'feeddel');
    await setTokenCookie(context, 'marketing.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);
    await createGroup(request, viewer.token, viewer.username, 'discover', 'open', DISCOVER_ROLES, 'member');

    await page.goto(`${MARKETING_BASE}/docs/feed/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#setupDiscoverBtn')).toBeHidden({ timeout: 10000 });

    // Post to discover.
    const postText = `to delete ${Date.now()}`;
    await page.locator('#postText').fill(postText);
    await page.locator('[data-testid="post-button"]').click();
    await expectFeedContains(page, postText);

    // My own post shows a Delete button; click it.
    await expect(page.locator('[data-testid="delete-button"]')).toHaveCount(1, { timeout: 10000 });
    await page.locator('[data-testid="delete-button"]').click();

    // Consequence: the post is gone from the feed.
    await expect(async () => {
      expect(await page.locator('[data-testid="feed-post-text"]').allTextContents()).not.toContain(postText);
    }).toPass({ timeout: 10000 });
    await expect(page.locator('[data-testid="feed-post"]')).toHaveCount(0, { timeout: 10000 });
  });

  test('fork: follow a non-existent creator → error message, no crash', async ({ page, context, request }) => {
    const viewer = await signupAndLogin(request, 'feedghost');
    await setTokenCookie(context, 'marketing.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);
    await createGroup(request, viewer.token, viewer.username, 'discover', 'open', DISCOVER_ROLES, 'member');

    await page.goto(`${MARKETING_BASE}/docs/feed/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#setupDiscoverBtn')).toBeHidden({ timeout: 10000 });

    // Follow a creator that has no followers group (ghost).
    const ghost = `ghost-creator-${Date.now()}`;
    await page.locator('[data-testid="creator-input"]').fill(ghost);
    await page.locator('[data-testid="follow-button"]').click();

    // Consequence: a clear error message (not a crash / not a silent no-op).
    await expect(page.locator('#message')).toContainText('no followers group', { timeout: 10000 });
    // The demo is still functional — the feed still renders.
    await expect(page.locator('[data-testid="feed-post"]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('#feed')).toBeVisible();
  });
});