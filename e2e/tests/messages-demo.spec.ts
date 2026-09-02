import { test, expect, chromium, type APIRequestContext } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'web10-docs-message-demo';
const ORIGIN = MARKETING_BASE;

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
        { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
        { name: 'member', permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] } },
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

  test('P2P is best-effort: offline recipient still gets the message via CRUD (source of truth)', { timeout: 90000 }, async ({ request }) => {
    // Anti-test for the core design: CRUD is the source of truth, P2P is the
    // best-effort fast path. A sends to B while B is OFFLINE (no peer
    // registered) — the P2P send fails (peer-unavailable) but the message must
    // still land via the group. When B comes online, B's initial read sees it.
    const A = await signupAndLogin(request, 'p2oc');
    const B = await signupAndLogin(request, 'p2od');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);
    await createDmGroup(request, A.token, A.username, B.username);

    const rtcArgs = ['--disable-features=WebRtcHideLocalIpsWithMdns'];
    const browserA = await chromium.launch({ args: rtcArgs });
    const browserB = await chromium.launch({ args: rtcArgs });
    try {
      const contextA = await browserA.newContext();
      const contextB = await browserB.newContext();
      await setTokenCookie(contextA, 'marketing.localhost', A.token);
      await setTokenCookie(contextA, 'auth.localhost', A.token);
      // B's cookies are set but B's page is NOT loaded — B is offline.
      await setTokenCookie(contextB, 'marketing.localhost', B.token);
      await setTokenCookie(contextB, 'auth.localhost', B.token);
      const pageA = await contextA.newPage();

      const logsA: string[] = [];
      pageA.on('console', (m) => { if (m.text().includes('[messages-demo]')) logsA.push(m.text()); });
      const pageErrorsA: string[] = [];
      pageA.on('pageerror', (e) => pageErrorsA.push(e.message));

      await pageA.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageA.waitForLoadState('networkidle');
      await expect(pageA.locator('#authButton')).toHaveText('Log out');
      await expect(pageA.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });

      // A sends to offline B. The P2P send fails (no peer) but the CRUD
      // persist already happened, so the message lands in the group.
      await pageA.locator('#toUsername').fill(B.username);
      await pageA.locator('#toProvider').fill(PROVIDER);
      await pageA.locator('#msgText').fill('offline hello');
      await pageA.locator('[data-testid="send-button"]').click();

      // A's message lands in A's inbox (CRUD persist).
      await expect(pageA.locator('[data-testid="message-text"]').first()).toHaveText('offline hello', { timeout: 15000 });

      // The P2P send was attempted (and failed — B is offline). The demo must
      // not crash or log an error; the message still landed via CRUD.
      const aSendIdx = logsA.findIndex((l) => l.includes('sendP2P — sending over P2P'));
      expect(aSendIdx, 'A must attempt the P2P send even when B is offline').toBeGreaterThanOrEqual(0);
      const errorsA = logsA.filter((l) => l.includes('FAILED') || l.includes('Error'));
      expect(errorsA, 'A must not log an error when the P2P send fails').toEqual([]);
      expect(pageErrorsA, 'A must not throw when the P2P send fails').toEqual([]);

      // B comes online (loads the demo). B's initial read sees the message
      // (CRUD is the source of truth — it was persisted while B was offline).
      const pageB = await contextB.newPage();
      await pageB.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageB.waitForLoadState('networkidle');
      await expect(pageB.locator('#authButton')).toHaveText('Log out');
      await expectInboxContains(pageB, 'offline hello', 15000);
    } finally {
      await browserA.close();
      await browserB.close();
    }
  });

  test('first send: real popup creates the group AND the message delivers over P2P', { timeout: 120000 }, async ({ request }) => {
    // The combined flow — the actual first-message experience. A's first send
    // to B opens the REAL consent popup (group creation, A=owner B=member),
    // then A persists the message (CRUD) AND nudges B over P2P. B receives in
    // real time. This is the gauntlet's popup flow + the P2P round-trip, in one
    // test — the composition the other two tests cover separately.
    const A = await signupAndLogin(request, 'p2pe');
    const B = await signupAndLogin(request, 'p2pf');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);
    // NO group pre-created — A's first send creates it via the popup.

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

      await pageA.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageA.waitForLoadState('networkidle');
      await pageB.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageB.waitForLoadState('networkidle');
      await expect(pageA.locator('#authButton')).toHaveText('Log out');
      await expect(pageB.locator('#authButton')).toHaveText('Log out');
      await expect(pageA.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });
      await expect(pageB.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });

      // A sends the FIRST message to B → opens the REAL consent popup.
      await pageA.locator('#toUsername').fill(B.username);
      await pageA.locator('#toProvider').fill(PROVIDER);
      await pageA.locator('#msgText').fill('first p2p hello');

      const popupPromise = contextA.waitForEvent('page', { timeout: 20000 });
      await pageA.locator('[data-testid="send-button"]').click();
      const popup = await popupPromise;
      await popup.waitForLoadState('networkidle', { timeout: 20000 });
      await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 20000 });
      await popup.locator('[data-testid="consent-approve-0"]').click();

      // A's message lands in A's inbox (CRUD persist in the new group).
      await expect(pageA.locator('[data-testid="message-text"]').first()).toHaveText('first p2p hello', { timeout: 15000 });

      // B receives it in REAL TIME over P2P (no reload, no polling).
      await expectInboxContains(pageB, 'first p2p hello', 20000);

      // Log sequence: A creates the group (popup) THEN persists THEN sends P2P.
      const aGroupIdx = logsA.findIndex((l) => l.includes('createDmGroup — approved'));
      const aCreateIdx = logsA.findIndex((l) => l.includes('creating message in new group'));
      const aSendIdx = logsA.findIndex((l) => l.includes('sendP2P — sending over P2P'));
      expect(aGroupIdx, 'A must create the group via the popup').toBeGreaterThanOrEqual(0);
      expect(aCreateIdx, 'A must persist the message in the new group').toBeGreaterThanOrEqual(0);
      expect(aCreateIdx, 'A must persist AFTER creating the group').toBeGreaterThan(aGroupIdx);
      expect(aSendIdx, 'A must send over P2P').toBeGreaterThanOrEqual(0);
      expect(aSendIdx, 'A must send P2P AFTER persisting').toBeGreaterThan(aCreateIdx);

      // B: onInbound with the payload, then re-read the inbox.
      const bInboundIdx = logsB.findIndex((l) => l.includes('onInbound — P2P message from peer'));
      const bDataIdx = logsB.findIndex((l) => l.includes('onInbound — data:') && l.includes('first p2p hello'));
      expect(bInboundIdx, 'B must receive the P2P nudge').toBeGreaterThanOrEqual(0);
      expect(bDataIdx, 'B must receive the P2P payload').toBeGreaterThanOrEqual(0);
      const bReRead = logsB.slice(bInboundIdx + 1).some((l) => l.includes('readMessages — got'));
      expect(bReRead, 'B must re-read the inbox after the P2P nudge').toBeTruthy();

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

  test('P2P survives a reload: peer re-inits and still delivers (return run)', { timeout: 120000 }, async ({ request }) => {
    // State rule: cold start and return run are different code paths. A reloads
    // — the demo re-runs initApp → initP2P (a NEW peer, the old one is gone).
    // The message must persist (CRUD) AND P2P must still deliver after the
    // reload (B sends a reply, A receives it in real time on the new peer).
    const A = await signupAndLogin(request, 'p2pg');
    const B = await signupAndLogin(request, 'p2ph');
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);
    await createDmGroup(request, A.token, A.username, B.username);

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

      await pageA.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageA.waitForLoadState('networkidle');
      await pageB.goto(`${MARKETING_BASE}/docs/messages/`);
      await pageB.waitForLoadState('networkidle');
      await expect(pageA.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });
      await expect(pageB.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });

      // Cold start: A sends to B (P2P delivers).
      await pageA.locator('#toUsername').fill(B.username);
      await pageA.locator('#toProvider').fill(PROVIDER);
      await pageA.locator('#msgText').fill('before reload');
      await pageA.locator('[data-testid="send-button"]').click();
      await expectInboxContains(pageB, 'before reload', 20000);

      // Return run: A reloads. The demo re-inits P2P (new peer).
      await pageA.reload();
      await pageA.waitForLoadState('networkidle');
      // The message persists across the reload (CRUD is the source of truth).
      await expectInboxContains(pageA, 'before reload', 15000);
      // P2P re-inits and is ready again.
      await expect(pageA.locator('[data-testid="p2p-status"]')).toHaveText('P2P: ready', { timeout: 20000 });

      // P2P still works after the reload: B sends a reply, A receives it in
      // real time on the NEW peer (no reload on A's side).
      await pageB.locator('#toUsername').fill(A.username);
      await pageB.locator('#toProvider').fill(PROVIDER);
      await pageB.locator('#msgText').fill('reply after reload');
      await pageB.locator('[data-testid="send-button"]').click();
      await expectInboxContains(pageA, 'reply after reload', 20000);

      // B's reply triggered A's onInbound (P2P delivered on the re-init peer).
      const aInboundReply = logsA.some((l) => l.includes('onInbound — data:') && l.includes('reply after reload'));
      expect(aInboundReply, 'A must receive B reply over P2P after the reload').toBeTruthy();
    } finally {
      await browserA.close();
      await browserB.close();
    }
  });
});