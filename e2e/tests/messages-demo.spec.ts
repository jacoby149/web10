import { test, expect, chromium, type APIRequestContext } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'web10-docs-message-demo';
const ORIGIN = 'http://marketing.localhost';

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// The DM group name is symmetric (sorted) — the demo's deterministic ID.
const dmGroupName = (a: string, b: string) => `dm-${[a, b].sort().join('-')}`;

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

// Create the DM group exactly the way the demo's group contract does: the
// creator is the owner, the recipient is a member, deterministic name.
async function createDmGroup(request: APIRequestContext, creatorToken: string, creator: string, other: string) {
  const name = dmGroupName(creator, other);
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token: creatorToken,
      name,
      join_policy: 'invite_only',
      roles: [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
        { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'deleteOwn'] },
      ],
      members: [
        { member_key: creator, role: 'owner' },
        { member_key: other, role: 'member' },
      ],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).group_id as string;
}

async function sendDoc(request: APIRequestContext, token: string, groupId: string, from: string, to: string, text: string) {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: SERVICE,
      body: { from_username: from, from_provider: PROVIDER, to_username: to, to_provider: PROVIDER, text, date: new Date().toISOString() },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).doc_id as string;
}

async function readGroupDocs(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [groupId] }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as any[];
}

async function myGroups(request: APIRequestContext, token: string) {
  const res = await request.post(`${API_BASE}/v3/groups/list`, {
    data: JSON.stringify({ token }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as any[];
}

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

// toContainText on a multi-element locator violates strict mode, so assert on
// the collected texts instead. toPass keeps the retry/timeout for messages that
// appear asynchronously (after a send).
async function expectInboxContains(page: any, text: string, timeout = 15000) {
  await expect(async () => {
    const texts = await page.locator('[data-testid="message-text"]').allTextContents();
    expect(texts).toContain(text);
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// API floor — the DM group primitive, fast + deterministic (no browser)
// ---------------------------------------------------------------------------

test.describe('Messages demo — API floor (DM group + CRUD)', () => {
  test('round-trip: A sends, B receives, B replies, A receives — ONE group', async ({ request }) => {
    const A = await signupAndLogin(request, 'msga');
    const B = await signupAndLogin(request, 'msgb');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);

    // A sets up the DM group (A = owner, B = member).
    const groupId = await createDmGroup(request, A.token, A.username, B.username);
    expect(groupId).toBe(`${PROVIDER}/groups/users/${A.username}/${dmGroupName(A.username, B.username)}`);

    // A sends to B.
    await sendDoc(request, A.token, groupId, A.username, B.username, 'hello from A');

    // B reads the SAME group and sees A's message (B is a member).
    const bInbox = await readGroupDocs(request, B.token, groupId);
    expect(bInbox.length).toBe(1);
    expect(bInbox[0].body.text).toBe('hello from A');
    expect(bInbox[0].author_key).toBe(A.username);

    // B replies in the SAME group.
    await sendDoc(request, B.token, groupId, B.username, A.username, 'hi from B');

    // A reads and sees both messages.
    const aInbox = await readGroupDocs(request, A.token, groupId);
    expect(aInbox.length).toBe(2);
    const texts = aInbox.map((d) => d.body.text).sort();
    expect(texts).toEqual(['hello from A', 'hi from B']);

    // Exactly ONE DM group exists for the pair (not one per direction).
    const aGroups = await myGroups(request, A.token);
    const aDm = aGroups.filter((g) => g.group_id.endsWith(`/${dmGroupName(A.username, B.username)}`));
    expect(aDm.length).toBe(1);
    const bGroups = await myGroups(request, B.token);
    const bDm = bGroups.filter((g) => g.group_id.endsWith(`/${dmGroupName(A.username, B.username)}`));
    expect(bDm.length).toBe(1);
    expect(aDm[0].group_id).toBe(bDm[0].group_id);
  });

  test('deterministic name: the recipient finds the sender-created group by name (no duplicate)', async ({ request }) => {
    const A = await signupAndLogin(request, 'msgc');
    const B = await signupAndLogin(request, 'msgd');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);

    // A creates the group first.
    const groupId = await createDmGroup(request, A.token, A.username, B.username);

    // B's list of groups includes A's group (matched by the deterministic name
    // suffix) — so B reuses it instead of creating a second group. This is the
    // seam the demo's findDmGroup() drives.
    const bGroups = await myGroups(request, B.token);
    const match = bGroups.find((g) => g.group_id.endsWith(`/${dmGroupName(A.username, B.username)}`));
    expect(match, 'B must find A-created DM group by name').toBeTruthy();
    expect(match!.group_id).toBe(groupId);
  });

  test('anti-test: recipient cannot delete the sender message (author-scoped delete)', async ({ request }) => {
    const A = await signupAndLogin(request, 'mse');
    const B = await signupAndLogin(request, 'msgf');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);
    const groupId = await createDmGroup(request, A.token, A.username, B.username);
    const docId = await sendDoc(request, A.token, groupId, A.username, B.username, 'do not delete me');

    // B (a member, but not the author) tries to delete A's message.
    const delRes = await request.post(`${API_BASE}/v3/delete`, {
      data: JSON.stringify({ token: B.token, doc_id: docId }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    // The API scopes delete to the author (get_document(doc_id, author)) — B is
    // not the author, so this must fail, not delete.
    expect(delRes.ok()).toBeFalsy();

    // The message must still be there for both.
    const aInbox = await readGroupDocs(request, A.token, groupId);
    expect(aInbox.length).toBe(1);
    expect(aInbox[0].body.text).toBe('do not delete me');
  });

  test('anti-test: a non-member cannot read the DM group (I3 holds)', async ({ request }) => {
    const A = await signupAndLogin(request, 'msgg');
    const B = await signupAndLogin(request, 'msgh');
    const C = await signupAndLogin(request, 'msgi');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);
    await addAppContract(request, C.token);
    const groupId = await createDmGroup(request, A.token, A.username, B.username);
    await sendDoc(request, A.token, groupId, A.username, B.username, 'private');

    // C is not a member of the DM group.
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: C.token, service: SERVICE, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.status()).toBe(403);
    const err = await readRes.json();
    expect(err.detail).toMatch(/not a member/i);
  });

  test('anti-test: send without an app contract fails 403 (contract gate)', async ({ request }) => {
    const A = await signupAndLogin(request, 'msgj');
    const B = await signupAndLogin(request, 'msgk');
    // NO app contract for A.
    const groupId = await createDmGroup(request, A.token, A.username, B.username);
    const res = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token: A.token,
        service: SERVICE,
        body: { from_username: A.username, to_username: B.username, text: 'no contract' },
        groups: [groupId],
      }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real two-user DM flow through the real consent popup
// ---------------------------------------------------------------------------

test.describe('Messages demo gauntlet — two-user DM through the real popup', () => {
  test('first send opens ONE popup (DM group); subsequent sends + reply open none', async ({ browser, context, request }) => {
    // Set up two users with app contracts. NO DM group yet — the first send
    // creates it through the real popup.
    const A = await signupAndLogin(request, 'msgga');
    const B = await signupAndLogin(request, 'msggb');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);

    // context = A's browser (pre-authed). contextB = B's browser (pre-authed).
    await setTokenCookie(context, 'marketing.localhost', A.token);
    await setTokenCookie(context, 'auth.localhost', A.token);
    const contextB = await browser.newContext();
    await setTokenCookie(contextB, 'marketing.localhost', B.token);
    await setTokenCookie(contextB, 'auth.localhost', B.token);

    // Create the main pages FIRST. context.newPage() fires the 'page' event,
    // so attaching the popup counters after this means only REAL popups (from
    // the sends) are counted — not the main pages themselves.
    const pageA = context.pages()[0] || (await context.newPage());
    const pageB = await contextB.newPage();

    let popupsA = 0;
    context.on('page', () => { popupsA++; });
    let popupsB = 0;
    contextB.on('page', () => { popupsB++; });

    const logsA: string[] = [];
    pageA.on('console', (m) => { if (m.text().includes('[messages-demo]')) logsA.push(m.text()); });

    // --- A loads the demo (signed in, no login popup) ---
    await pageA.goto(`${MARKETING_BASE}/docs/messages/`);
    await pageA.waitForLoadState('networkidle');
    await expect(pageA.locator('#authButton')).toHaveText('Log out');
    await expect(pageA.locator('#editor')).toBeVisible();

    // --- A sends the FIRST message to B → opens ONE popup (create DM group) ---
    await pageA.locator('#toUsername').fill(B.username);
    await pageA.locator('#toProvider').fill(PROVIDER);
    await pageA.locator('#msgText').fill('hello from A');

    const popupPromise = context.waitForEvent('page', { timeout: 20000 });
    await pageA.locator('[data-testid="send-button"]').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle', { timeout: 20000 });

    // The group contract renders → approve it.
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 20000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();

    // A's message lands in A's inbox.
    await expect(pageA.locator('[data-testid="message-text"]').first()).toHaveText('hello from A', { timeout: 15000 });

    // --- A sends a SECOND message to B → NO new popup (group reused) ---
    await pageA.locator('#msgText').fill('second from A');
    await pageA.locator('[data-testid="send-button"]').click();
    await expect(pageA.locator('[data-testid="message-text"]')).toHaveCount(2, { timeout: 15000 });
    // Give any (erroneous) second popup time to appear.
    await pageA.waitForTimeout(2000);
    expect(popupsA, 'only the first send may open a popup').toBe(1);

    // --- B loads the demo → sees A's two messages ---
    await pageB.goto(`${MARKETING_BASE}/docs/messages/`);
    await pageB.waitForLoadState('networkidle');
    await expect(pageB.locator('#authButton')).toHaveText('Log out');
    await expect(pageB.locator('[data-testid="message-text"]')).toHaveCount(2, { timeout: 15000 });
    await expectInboxContains(pageB, 'hello from A');

    // B's inbox must NOT show a Delete button on A's messages (author-scoped).
    await expect(pageB.locator('[data-testid="message"] button:has-text("Delete")')).toHaveCount(0);

    // --- B replies to A → NO popup (B finds the group in B's list) ---
    await pageB.locator('#toUsername').fill(A.username);
    await pageB.locator('#toProvider').fill(PROVIDER);
    await pageB.locator('#msgText').fill('hi from B');
    await pageB.locator('[data-testid="send-button"]').click();
    await expectInboxContains(pageB, 'hi from B');
    await pageB.waitForTimeout(2000);
    expect(popupsB, 'B must never open a popup').toBe(0);

    // --- A reloads → sees B's reply ---
    await pageA.reload();
    await pageA.waitForLoadState('networkidle');
    await expectInboxContains(pageA, 'hi from B');
    // A's own messages show a Delete button; B's does not.
    await expect(pageA.locator('[data-testid="message"] button:has-text("Delete")')).toHaveCount(2);

    // Total across both users: exactly ONE popup (A's first send).
    expect(popupsA + popupsB).toBe(1);

    // No errors in A's console.
    const errors = logsA.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });

  test('P2P round-trip: A sends, B receives in real time over the WebRTC data channel', { timeout: 90000 }, async ({ request }) => {
    // Two users with app contracts. The DM group is PRE-CREATED via the API
    // (A = owner, B = member, deterministic name) so this test isolates the
    // P2P data channel from the group-creation popup (the popup flow is covered
    // by the gauntlet test above). A's send reuses the existing group (no popup),
    // persists the message (CRUD), and nudges B over P2P.
    const A = await signupAndLogin(request, 'p2pa');
    const B = await signupAndLogin(request, 'p2pb');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);
    await createDmGroup(request, A.token, A.username, B.username);

    // Two SEPARATE browser instances — WebRTC P2P completes across two browsers
    // but NOT across two contexts in the same browser (Chromium isolates
    // per-context network stacks, so the local ICE check never connects). Two
    // browsers also matches the real scenario: two users in two browsers.
    //
    // The mDNS flag is REQUIRED: without it, Chromium hides local IPs behind
    // mDNS .local names for ICE host candidates, which don't resolve in the
    // headless environment, so the local ICE check fails (stuck at "checking").
    // With the flag, host candidates are real IPs and the local connection works.
    const rtcArgs = ['--disable-features=WebRtcHideLocalIpsWithMdns'];
    const browserA = await chromium.launch({ args: rtcArgs });
    const browserB = await chromium.launch({ args: rtcArgs });
    try {
      const contextA = await browserA.newContext();
      const contextB = await browserB.newContext();
      await setTokenCookie(contextA, 'marketing.localhost', A.token);
      await setTokenCookie(contextA, 'auth.localhost', A.token);
      await setTokenCookie(contextB, 'marketing.localhost', B.token);
      await setTokenCookie(contextB, 'auth.localhost', B.token);
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const logsA: string[] = [];
      pageA.on('console', (m) => { if (m.text().includes('[messages-demo]')) logsA.push(m.text()); });
      const logsB: string[] = [];
      pageB.on('console', (m) => { if (m.text().includes('[messages-demo]')) logsB.push(m.text()); });
      const pageErrorsA: string[] = [];
      pageA.on('pageerror', (e) => pageErrorsA.push(e.message));
      const pageErrorsB: string[] = [];
      pageB.on('pageerror', (e) => pageErrorsB.push(e.message));

      // --- Load both demos (pre-authed, no login popup) ---
      await pageA.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageA.waitForLoadState('networkidle');
      await pageB.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageB.waitForLoadState('networkidle');
      await expect(pageA.locator('#authButton')).toHaveText('Log out');
      await expect(pageB.locator('#authButton')).toHaveText('Log out');

      // --- Wait for BOTH peers to be open (P2P ready) before A sends ---
      // PeerJS drops a connect() issued before the local peer is open, so the
      // demo gates sends on this. The status flips to "ready" when the peer opens.
      await expect(pageA.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });
      await expect(pageB.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });

      // --- A sends to B (reuses the pre-created group → NO popup) ---
      await pageA.locator('#toUsername').fill(B.username);
      await pageA.locator('#toProvider').fill(PROVIDER);
      await pageA.locator('#msgText').fill('p2p hello');
      await pageA.locator('[data-testid="send-button"]').click();

      // A's message lands in A's inbox (CRUD persist).
      await expect(pageA.locator('[data-testid="message-text"]').first()).toHaveText('p2p hello', { timeout: 15000 });

      // --- B receives it in REAL TIME over P2P (no reload, no polling) ---
      await expectInboxContains(pageB, 'p2p hello', 20000);

      // --- Verify the P2P seam fired on both sides (log sequence) ---
      // A: the P2P send was attempted, and only AFTER the message was persisted.
      const aCreateIdx = logsA.findIndex((l) => l.includes('creating message in existing group'));
      const aSendIdx = logsA.findIndex((l) => l.includes('sendP2P — sending over P2P'));
      expect(aCreateIdx, 'A must persist the message in the existing group').toBeGreaterThanOrEqual(0);
      expect(aSendIdx, 'A must attempt the P2P send').toBeGreaterThanOrEqual(0);
      expect(aSendIdx, 'A must send over P2P AFTER persisting the message').toBeGreaterThan(aCreateIdx);

      // B: the inbound P2P fired with the payload, then re-read the inbox.
      const bInboundIdx = logsB.findIndex((l) => l.includes('onInbound — P2P message from peer'));
      const bDataIdx = logsB.findIndex((l) => l.includes('onInbound — data:') && l.includes('p2p hello'));
      expect(bInboundIdx, 'B must receive the P2P nudge').toBeGreaterThanOrEqual(0);
      expect(bDataIdx, 'B must receive the P2P payload').toBeGreaterThanOrEqual(0);
      const bReRead = logsB.slice(bInboundIdx + 1).some((l) => l.includes('readMessages — got'));
      expect(bReRead, 'B must re-read the inbox after the P2P nudge').toBeTruthy();

      // --- No console errors / uncaught exceptions on either side ---
      const errorsA = logsA.filter((l) => l.includes('FAILED') || l.includes('Error'));
      const errorsB = logsB.filter((l) => l.includes('FAILED') || l.includes('Error'));
      expect(errorsA).toEqual([]);
      expect(errorsB).toEqual([]);
      expect(pageErrorsA).toEqual([]);
      expect(pageErrorsB).toEqual([]);
    } finally {
      await browserA.close();
      await browserB.close();
    }
  });
});