import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Sharing demo — the platform unit test for blocking and sharing.
 *
 * Three user-controlled controls (KB: security/overview.md "Blocking and
 * Sharing", social/cross-app-sharing.md):
 * - Sharing toggle (per user, per group) — "pause sharing without leaving"
 * - User-wide blacklist — "they can't see any of your content, anywhere"
 * - Per-group blacklist — "they still see everyone else's content. just not yours"
 *
 * Enforcement lives in the read query (ch.read_documents_in_groups): "hidden"
 * means the read returns nothing for the blocked user — not an error, not a
 * 403, the document is simply absent from the results. The anti-tests assert
 * exactly that, including the unblock→visible recovery. The recovery is the
 * bug-catcher for the stale-tombstone race: unblock appends a new row
 * (deleted=1) while the pre-unblock row (deleted=0) survives until a
 * background merge — a read that matches ANY pre-unblock row would keep
 * hiding the content nondeterministically.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const SERVICE = 'web10-docs-sharing-demo';

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

const ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
];

async function signupFreshUser(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
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

async function v3Post(request: APIRequestContext, action: string, body: Record<string, any>): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await request.post(`${API_BASE}/v3/${action}`, {
    data: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  const text = await res.text().catch(() => '');
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { ok: res.ok(), status: res.status(), body: parsed };
}

/** Create a group with the standard roles; the creator is the owner. Returns the group_id. */
async function createGroup(request: APIRequestContext, token: string, creator: string, name: string, joinPolicy: string): Promise<string> {
  const res = await v3Post(request, 'groups/create', {
    token, name, join_policy: joinPolicy, roles: ROLES,
    members: [{ member_key: creator, role: 'owner' }],
  });
  expect(res.ok, `create group "${name}" failed (${res.status}): ${JSON.stringify(res.body)}`).toBeTruthy();
  return res.body.group_id as string;
}

async function joinGroup(request: APIRequestContext, token: string, groupId: string): Promise<void> {
  const res = await v3Post(request, 'groups/join', { token, group_id: groupId });
  expect(res.ok, `join failed (${res.status}): ${JSON.stringify(res.body)}`).toBeTruthy();
}

/** Read a group's documents as the token's user. Expects 200 — "hidden" is an empty result, not an error. */
async function readGroup(request: APIRequestContext, token: string, groupId: string): Promise<any[]> {
  const res = await v3Post(request, 'read', { token, service: SERVICE, groups: [groupId] });
  expect(res.ok, `read failed (${res.status}): ${JSON.stringify(res.body)}`).toBeTruthy();
  return res.body as any[];
}

/** Post to a group and return the doc_id. */
async function postToGroup(request: APIRequestContext, token: string, groupId: string, text: string): Promise<string> {
  const res = await v3Post(request, 'create', {
    token, service: SERVICE, body: { text, date: new Date().toISOString() }, groups: [groupId],
  });
  expect(res.ok, `create failed (${res.status}): ${JSON.stringify(res.body)}`).toBeTruthy();
  return res.body.doc_id as string;
}

const docIds = (docs: any[]): string[] => docs.map((d) => d.doc_id);

// ---------------------------------------------------------------------------
// API floor — sharing toggle
// ---------------------------------------------------------------------------

test.describe('Sharing — API floor: sharing toggle', () => {
  test('pause sharing → member can\'t see the author\'s posts → resume → visible again', async ({ request }) => {
    const a = await signupFreshUser(request, 'shra');
    const b = await signupFreshUser(request, 'shrb');
    const groupId = await createGroup(request, a.token, a.username, `sh-${a.username}`, 'open');
    await joinGroup(request, b.token, groupId);

    const docId = await postToGroup(request, a.token, groupId, 'sharing toggle post');

    // sanity: the member sees the post
    expect(docIds(await readGroup(request, b.token, groupId))).toContain(docId);

    // pause sharing (the author's action)
    const pause = await v3Post(request, 'groups/sharing/set', { token: a.token, group_id: groupId, enabled: false });
    expect(pause.ok, `pause sharing failed: ${JSON.stringify(pause.body)}`).toBeTruthy();

    // consequence: the member's read returns nothing for the author's post
    expect(docIds(await readGroup(request, b.token, groupId)), 'author post still visible to member after pause').not.toContain(docId);

    // author exemption: the author still sees their own post
    expect(docIds(await readGroup(request, a.token, groupId)), 'author lost sight of their own post').toContain(docId);

    // resume sharing
    const resume = await v3Post(request, 'groups/sharing/set', { token: a.token, group_id: groupId, enabled: true });
    expect(resume.ok, `resume sharing failed: ${JSON.stringify(resume.body)}`).toBeTruthy();

    // consequence: the member sees the post again
    expect(docIds(await readGroup(request, b.token, groupId)), 'post still hidden after resume').toContain(docId);
  });

  test('pause sharing does not affect other members\' content (one-directional)', async ({ request }) => {
    const a = await signupFreshUser(request, 'shr1a');
    const b = await signupFreshUser(request, 'shr1b');
    const groupId = await createGroup(request, a.token, a.username, `sh1-${a.username}`, 'open');
    await joinGroup(request, b.token, groupId);

    const aDoc = await postToGroup(request, a.token, groupId, 'a post');
    const bDoc = await postToGroup(request, b.token, groupId, 'b post');

    await v3Post(request, 'groups/sharing/set', { token: a.token, group_id: groupId, enabled: false });

    // b sees their own post, not a's
    const asB = docIds(await readGroup(request, b.token, groupId));
    expect(asB).not.toContain(aDoc);
    expect(asB).toContain(bDoc);
    // a still sees b's post (a's content is hidden, not b's) + their own
    const asA = docIds(await readGroup(request, a.token, groupId));
    expect(asA).toContain(bDoc);
    expect(asA).toContain(aDoc);
  });
});

// ---------------------------------------------------------------------------
// API floor — user-wide blacklist
// ---------------------------------------------------------------------------

test.describe('Sharing — API floor: user-wide blacklist', () => {
  test('block → hidden everywhere → unblock → visible (tombstone race-catcher)', async ({ request }) => {
    const a = await signupFreshUser(request, 'uwa');
    const b = await signupFreshUser(request, 'uwb');
    const g1 = await createGroup(request, a.token, a.username, `uw1-${a.username}`, 'open');
    const g2 = await createGroup(request, a.token, a.username, `uw2-${a.username}`, 'open');
    await joinGroup(request, b.token, g1);
    await joinGroup(request, b.token, g2);

    const doc1 = await postToGroup(request, a.token, g1, 'post in g1');
    const doc2 = await postToGroup(request, a.token, g2, 'post in g2');
    const bDoc = await postToGroup(request, b.token, g1, 'b post');

    // sanity: b sees both of a's posts
    expect(docIds(await readGroup(request, b.token, g1))).toContain(doc1);
    expect(docIds(await readGroup(request, b.token, g2))).toContain(doc2);

    // a blocks b (user-wide)
    const block = await v3Post(request, 'block', { token: a.token, blocked_key: b.username });
    expect(block.ok, `block failed: ${JSON.stringify(block.body)}`).toBeTruthy();

    // consequence: hidden in EVERY group
    expect(docIds(await readGroup(request, b.token, g1)), 'g1 post visible after user-wide block').not.toContain(doc1);
    expect(docIds(await readGroup(request, b.token, g2)), 'g2 post visible after user-wide block').not.toContain(doc2);
    // one-directional: b's own content is unaffected, and a still sees b's post
    expect(docIds(await readGroup(request, b.token, g1))).toContain(bDoc);
    expect(docIds(await readGroup(request, a.token, g1))).toContain(bDoc);

    // unblock — the stale pre-unblock row must not keep hiding the content
    const unblock = await v3Post(request, 'unblock', { token: a.token, blocked_key: b.username });
    expect(unblock.ok, `unblock failed: ${JSON.stringify(unblock.body)}`).toBeTruthy();

    expect(docIds(await readGroup(request, b.token, g1)), 'g1 post still hidden after unblock').toContain(doc1);
    expect(docIds(await readGroup(request, b.token, g2)), 'g2 post still hidden after unblock').toContain(doc2);
  });
});

// ---------------------------------------------------------------------------
// API floor — per-group blacklist
// ---------------------------------------------------------------------------

test.describe('Sharing — API floor: per-group blacklist', () => {
  test('block in one group → hidden there only → unblock → visible', async ({ request }) => {
    const a = await signupFreshUser(request, 'pga');
    const b = await signupFreshUser(request, 'pgb');
    const g1 = await createGroup(request, a.token, a.username, `pg1-${a.username}`, 'open');
    const g2 = await createGroup(request, a.token, a.username, `pg2-${a.username}`, 'open');
    await joinGroup(request, b.token, g1);
    await joinGroup(request, b.token, g2);

    const doc1 = await postToGroup(request, a.token, g1, 'post in g1');
    const doc2 = await postToGroup(request, a.token, g2, 'post in g2');
    const bDoc = await postToGroup(request, b.token, g1, 'b post');

    // a blocks b in g1 only
    const block = await v3Post(request, 'groups/block', { token: a.token, group_id: g1, blocked_key: b.username });
    expect(block.ok, `group block failed: ${JSON.stringify(block.body)}`).toBeTruthy();

    // consequence: hidden in g1, visible in g2 (per-group scope)
    expect(docIds(await readGroup(request, b.token, g1)), 'g1 post visible after per-group block').not.toContain(doc1);
    expect(docIds(await readGroup(request, b.token, g2)), 'g2 post hidden after a g1-only block').toContain(doc2);
    // b still sees everyone else's content in g1 (their own post)
    expect(docIds(await readGroup(request, b.token, g1))).toContain(bDoc);
    // one-directional: a still sees b's post in g1
    expect(docIds(await readGroup(request, a.token, g1))).toContain(bDoc);

    // unblock in g1
    const unblock = await v3Post(request, 'groups/unblock', { token: a.token, group_id: g1, blocked_key: b.username });
    expect(unblock.ok, `group unblock failed: ${JSON.stringify(unblock.body)}`).toBeTruthy();

    expect(docIds(await readGroup(request, b.token, g1)), 'g1 post still hidden after unblock').toContain(doc1);
  });
});

// ---------------------------------------------------------------------------
// Anti-tests — the KB with teeth. Start from a broken state, verify the
// CONSEQUENCE (not just a status code), and verify recovery.
// ---------------------------------------------------------------------------

test.describe('Sharing — anti-tests (the KB with teeth)', () => {
  test('hidden means the read returns nothing — not an error, not a 403', async ({ request }) => {
    const a = await signupFreshUser(request, 'anta');
    const b = await signupFreshUser(request, 'antb');
    const groupId = await createGroup(request, a.token, a.username, `ant-${a.username}`, 'open');
    await joinGroup(request, b.token, groupId);
    const docId = await postToGroup(request, a.token, groupId, 'hidden shape post');

    await v3Post(request, 'block', { token: a.token, blocked_key: b.username });

    // The read SUCCEEDS (200) and the doc is simply absent. A 403/500 would
    // be the wrong shape of "hidden" — the KB says the content is just not
    // there for the blocked user.
    const res = await v3Post(request, 'read', { token: b.token, service: SERVICE, groups: [groupId] });
    expect(res.status, `read returned ${res.status} instead of 200: ${JSON.stringify(res.body)}`).toBe(200);
    expect(docIds(res.body)).not.toContain(docId);
  });

  test('recovery: block → unblock → block → unblock is stable across cycles', async ({ request }) => {
    const a = await signupFreshUser(request, 'antc');
    const b = await signupFreshUser(request, 'antcb');
    const groupId = await createGroup(request, a.token, a.username, `antc-${a.username}`, 'open');
    await joinGroup(request, b.token, groupId);
    const docId = await postToGroup(request, a.token, groupId, 'cycle post');

    for (let cycle = 0; cycle < 2; cycle++) {
      await v3Post(request, 'block', { token: a.token, blocked_key: b.username });
      expect(docIds(await readGroup(request, b.token, groupId)), `cycle ${cycle}: visible while blocked`).not.toContain(docId);
      await v3Post(request, 'unblock', { token: a.token, blocked_key: b.username });
      expect(docIds(await readGroup(request, b.token, groupId)), `cycle ${cycle}: still hidden after unblock`).toContain(docId);
    }
  });

  test('recovery: sharing pause → resume → pause is stable across cycles', async ({ request }) => {
    const a = await signupFreshUser(request, 'antd');
    const b = await signupFreshUser(request, 'antdb');
    const groupId = await createGroup(request, a.token, a.username, `antd-${a.username}`, 'open');
    await joinGroup(request, b.token, groupId);
    const docId = await postToGroup(request, a.token, groupId, 'sharing cycle post');

    for (let cycle = 0; cycle < 2; cycle++) {
      await v3Post(request, 'groups/sharing/set', { token: a.token, group_id: groupId, enabled: false });
      expect(docIds(await readGroup(request, b.token, groupId)), `cycle ${cycle}: visible while paused`).not.toContain(docId);
      await v3Post(request, 'groups/sharing/set', { token: a.token, group_id: groupId, enabled: true });
      expect(docIds(await readGroup(request, b.token, groupId)), `cycle ${cycle}: still hidden after resume`).toContain(docId);
    }
  });

  test('edge: unblocking a user who was never blocked is a no-op, reads still work', async ({ request }) => {
    const a = await signupFreshUser(request, 'ante');
    const b = await signupFreshUser(request, 'anteb');
    const groupId = await createGroup(request, a.token, a.username, `ante-${a.username}`, 'open');
    await joinGroup(request, b.token, groupId);
    const docId = await postToGroup(request, a.token, groupId, 'no-op post');

    const unblock = await v3Post(request, 'unblock', { token: a.token, blocked_key: b.username });
    expect(unblock.ok, `no-op unblock failed: ${JSON.stringify(unblock.body)}`).toBeTruthy();
    expect(docIds(await readGroup(request, b.token, groupId))).toContain(docId);
  });

  test('edge: blocking a user with no content changes nothing for them', async ({ request }) => {
    const a = await signupFreshUser(request, 'antf');
    const b = await signupFreshUser(request, 'antfb');
    const groupId = await createGroup(request, a.token, a.username, `antf-${a.username}`, 'open');
    await joinGroup(request, b.token, groupId);
    const aDoc = await postToGroup(request, a.token, groupId, 'a only post');

    await v3Post(request, 'block', { token: a.token, blocked_key: b.username });

    // b's read succeeds and is simply empty (b has no posts of their own)
    const res = await v3Post(request, 'read', { token: b.token, service: SERVICE, groups: [groupId] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    void aDoc;
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — drive the demo UI
// ---------------------------------------------------------------------------

async function setupSignedInDemo(
  page: Page, context: any, request: APIRequestContext, withGroup: boolean,
): Promise<{ username: string; token: string; groupId: string | null }> {
  const { username, token } = await signupFreshUser(request, 'shui');
  await context.addCookies([
    { name: 'token', value: token, domain: 'marketing.localhost', path: '/', secure: false, httpOnly: false },
    { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
  ]);

  // Pre-grant the app contract for the demo origin (the demo's CRUD calls
  // are origin-checked). The origin includes the port on isolated stacks.
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: MARKETING_BASE,
      permissions: {
        [SERVICE]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
      },
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });

  // The demo looks for a deterministic group: sharing-{username}.
  const groupId = withGroup
    ? await createGroup(request, token, username, `sharing-${username}`, 'open')
    : null;
  return { username, token, groupId };
}

function captureFull(page: Page): { console: string[]; errors: string[] } {
  const console: string[] = [];
  const errors: string[] = [];
  page.on('console', (msg) => console.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => errors.push(String(err)));
  return { console, errors };
}

/** Assert that each needle appears in the console log, in order (subsequence). */
function assertSubsequence(console: string[], ...needles: string[]): void {
  let idx = 0;
  for (const needle of needles) {
    const found = console.findIndex((line, i) => i >= idx && line.includes(needle));
    expect(
      found,
      `expected log "${needle}" after index ${idx} in:\n${console.join('\n')}`,
    ).toBeGreaterThanOrEqual(0);
    idx = found + 1;
  }
}

test.describe('Sharing demo — browser gauntlet', () => {
  test('signed-in: post, pause sharing via UI, verify hidden as member, resume, verify visible', async ({ page, context, request }) => {
    const { username, token, groupId } = await setupSignedInDemo(page, context, request, true);
    const b = await signupFreshUser(request, 'shuib');
    await joinGroup(request, b.token, groupId!);
    const full = captureFull(page);

    await page.goto(`${MARKETING_BASE}/docs/sharing/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#message')).toContainText(username);

    // Return run: the pre-created group is found on load, posts render empty
    await expect(page.locator('#posts')).toContainText('no posts yet', { timeout: 10000 });

    // Post via the UI
    const text = `sharing demo post ${Date.now()}`;
    await page.locator('#postText').fill(text);
    await page.locator('#postBtn').click();
    await expect(page.locator('#posts .post').first()).toContainText(text, { timeout: 10000 });

    // Sanity: the member sees the post (isolates demo vs API)
    const memberDocs = await readGroup(request, b.token, groupId!);
    const docId = memberDocs.find((d) => d.body.text === text)?.doc_id;
    expect(docId, 'post missing from member read after UI post').toBeTruthy();

    // Pause sharing via the UI
    await page.locator('#pauseSharingBtn').click();
    await expect(page.locator('#sharingStatus')).toContainText('paused', { timeout: 10000 });

    // Consequence: the member's read returns nothing for the post (200, absent)
    const res = await v3Post(request, 'read', { token: b.token, service: SERVICE, groups: [groupId!] });
    expect(res.status).toBe(200);
    expect(docIds(res.body), 'post visible to member after UI pause').not.toContain(docId);

    // Author exemption: the author's own view still has the post
    await expect(page.locator('#posts .post').first()).toContainText(text);

    // Resume sharing via the UI
    await page.locator('#resumeSharingBtn').click();
    await expect(page.locator('#sharingStatus')).toContainText('Sharing is on', { timeout: 10000 });

    // Consequence: the member sees the post again
    expect(docIds(await readGroup(request, b.token, groupId!)), 'post still hidden after UI resume').toContain(docId);

    expect(full.errors, `pageerrors:\n${full.errors.join('\n')}`).toHaveLength(0);
    // Log sequence: post → read → pause → read
    assertSubsequence(
      full.console,
      'postToGroup — called',
      'postToGroup — success',
      'loadPosts — got',
      'setSharing — called, enabled: false',
      'setSharing — success',
      'loadPosts — got',
      'setSharing — called, enabled: true',
      'setSharing — success',
    );
  });

  test('cold start: set up the sharing group through the real consent popup', async ({ page, context, request }) => {
    const { username } = await setupSignedInDemo(page, context, request, false);
    const full = captureFull(page);

    await page.goto(`${MARKETING_BASE}/docs/sharing/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');

    // No group yet → the setup button appears (findSharingGroup found nothing)
    await expect(page.locator('#setupGroupBtn')).toBeVisible({ timeout: 10000 });

    // Click → the real consent popup opens with the group contract
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#setupGroupBtn').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');

    // The group contract must render (not "all set") — the load-bearing seam
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});

    // The demo confirms the group is ready
    await expect(page.locator('#message')).toContainText('sharing group ready', { timeout: 10000 });

    // And the full flow works: post via the UI renders
    const text = `popup post ${Date.now()}`;
    await page.locator('#postText').fill(text);
    await page.locator('#postBtn').click();
    await expect(page.locator('#posts .post').first()).toContainText(text, { timeout: 10000 });

    expect(full.errors, `pageerrors:\n${full.errors.join('\n')}`).toHaveLength(0);
    void popupFull;
    // Log sequence: no group → setup click → group created → ready → post
    assertSubsequence(
      full.console,
      'findSharingGroup — no sharing group yet',
      'setupGroupBtn clicked',
      'setupGroup — group created',
      'groupReady — group:',
      'postToGroup — success',
    );
  });

  test('per-group block via UI: hidden from member, unblock restores', async ({ page, context, request }) => {
    const { username, token, groupId } = await setupSignedInDemo(page, context, request, true);
    const b = await signupFreshUser(request, 'shbgb');
    await joinGroup(request, b.token, groupId!);
    const full = captureFull(page);

    // Seed a post via the API (the UI post path is covered by the first test)
    const docId = await postToGroup(request, token, groupId!, `group block post ${Date.now()}`);
    expect(docIds(await readGroup(request, b.token, groupId!))).toContain(docId);

    await page.goto(`${MARKETING_BASE}/docs/sharing/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#posts .post').first()).toBeVisible({ timeout: 10000 });

    // Block b in this group via the UI
    await page.locator('#blockGroupInput').fill(b.username);
    await page.locator('#blockGroupBtn').click();
    await expect(page.locator('#blockStatus')).toContainText('Blocked', { timeout: 10000 });

    // Consequence: hidden from the member (200, absent)
    const res = await v3Post(request, 'read', { token: b.token, service: SERVICE, groups: [groupId!] });
    expect(res.status).toBe(200);
    expect(docIds(res.body), 'post visible to member after UI group block').not.toContain(docId);

    // Unblock via the UI
    await page.locator('#blockGroupInput').fill(b.username);
    await page.locator('#unblockGroupBtn').click();
    await expect(page.locator('#blockStatus')).toContainText('Unblocked', { timeout: 10000 });

    // Consequence: visible again
    expect(docIds(await readGroup(request, b.token, groupId!)), 'post still hidden after UI unblock').toContain(docId);

    expect(full.errors, `pageerrors:\n${full.errors.join('\n')}`).toHaveLength(0);
  });

  test('user-wide block via UI: hidden from member, unblock restores', async ({ page, context, request }) => {
    const { username, token, groupId } = await setupSignedInDemo(page, context, request, true);
    const b = await signupFreshUser(request, 'shuwb');
    await joinGroup(request, b.token, groupId!);
    const full = captureFull(page);

    const docId = await postToGroup(request, token, groupId!, `user-wide block post ${Date.now()}`);
    expect(docIds(await readGroup(request, b.token, groupId!))).toContain(docId);

    await page.goto(`${MARKETING_BASE}/docs/sharing/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#posts .post').first()).toBeVisible({ timeout: 10000 });

    // Block b everywhere via the UI
    await page.locator('#blockUserInput').fill(b.username);
    await page.locator('#blockUserBtn').click();
    await expect(page.locator('#blockStatus')).toContainText('Blocked', { timeout: 10000 });

    // Consequence: hidden from the member (200, absent)
    const res = await v3Post(request, 'read', { token: b.token, service: SERVICE, groups: [groupId!] });
    expect(res.status).toBe(200);
    expect(docIds(res.body), 'post visible to member after UI user-wide block').not.toContain(docId);

    // Unblock via the UI
    await page.locator('#blockUserInput').fill(b.username);
    await page.locator('#unblockUserBtn').click();
    await expect(page.locator('#blockStatus')).toContainText('Unblocked', { timeout: 10000 });

    // Consequence: visible again
    expect(docIds(await readGroup(request, b.token, groupId!)), 'post still hidden after UI unblock').toContain(docId);

    expect(full.errors, `pageerrors:\n${full.errors.join('\n')}`).toHaveLength(0);
  });
});
