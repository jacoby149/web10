import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { v3Login, v3Signup, API_BASE } from '../v3-helpers';

/**
 * Social app — Messages surface (the /messages/* route, src/data/dms.ts +
 * src/components/Chat/).
 *
 * The API floor pins the app's exact DM pattern: the DM group is created with
 * the deterministic NAME dm-{sorted} (invite_only, one member role, both
 * participants as bare-username members) and the group_id the API derives
 * ({provider}/groups/users/{creator}/{name} — the creator is embedded in the
 * ID, so it is NOT symmetric). The recipient therefore finds the group by the
 * name suffix in their own group list — the app's exact read pattern — and
 * messages are `posts` docs in that group. The I3 anti-test proves a third
 * user cannot read the DM group.
 *
 * The browser gauntlet drives the real two-user round-trip through the real
 * app: A composes to B by username (the picker's compose path — the first
 * send creates the group), B's context sees the conversation in the list and
 * the message in the thread, B replies, A's reload sees the reply. Console
 * log sequence verified on both sides ([social-dms] seam logs).
 *
 * The social app has no P2P — CRUD is the delivery path, so "receive" is the
 * recipient's group read (list load / conversation open / reload), not a push.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE_URL = API_BASE;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'posts';
const ORIGIN = SOCIAL_BASE;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// The app's deterministic DM group name (src/data/dms.ts dmGroupName) —
// sorted, so both parties derive the same name.
const dmGroupName = (a: string, b: string) => `dm-${[a, b].sort().join('-')}`;

// The app's DM group contract (src/data/dms.ts DM_ROLES, KB:
// groups/social-contracts.md §5): invite_only, one role, equal members.
const DM_ROLES = [
  {
    name: 'member',
    services: ['posts', 'comments'],
    permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  },
];

// The exact app contract the social app's login popup grants
// (src/interfaces/auth.ts SOCIAL_SERVICES × SOCIAL_OPERATIONS).
const SOCIAL_SERVICES = [
  'posts',
  'media',
  'public_media',
  'profile',
  'settings',
  'comments',
  'reactions',
  'contacts',
  'staging_posts',
];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, password, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, password);
  return { username, token };
}

async function addSocialAppContract(request: APIRequestContext, token: string) {
  const res = await request.post(`${API_BASE_URL}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: ORIGIN,
      permissions: Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, [...SOCIAL_OPERATIONS]])),
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
  expect(res.ok(), `app contract add failed (${res.status})`).toBeTruthy();
}

/** Create the DM group exactly the way the app does (dms.ts ensureDmGroup). */
async function rawCreateDmGroup(
  request: APIRequestContext,
  creatorToken: string,
  a: string,
  b: string,
): Promise<string> {
  const res = await request.post(`${API_BASE_URL}/v3/groups/create`, {
    data: JSON.stringify({
      token: creatorToken,
      name: dmGroupName(a, b),
      join_policy: 'invite_only',
      roles: DM_ROLES,
      members: [
        { member_key: a, role: 'member' },
        { member_key: b, role: 'member' },
      ],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `DM group create failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

async function sendDmDoc(
  request: APIRequestContext,
  token: string,
  groupId: string,
  from: string,
  to: string,
  message: string,
): Promise<string> {
  const res = await request.post(`${API_BASE_URL}/v3/create`, {
    data: JSON.stringify({
      token,
      service: SERVICE,
      body: {
        message,
        sender_username: from,
        sender_provider: PROVIDER,
        recipient_username: to,
        recipient_provider: PROVIDER,
        media_refs: [],
      },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(res.ok(), `DM doc create failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

async function readGroupDocs(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE_URL}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [groupId] }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(res.ok(), `DM group read failed (${res.status})`).toBeTruthy();
  return (await res.json()) as any[];
}

async function myGroups(request: APIRequestContext, token: string) {
  const res = await request.post(`${API_BASE_URL}/v3/groups/list`, {
    data: JSON.stringify({ token }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as any[];
}

/** The app's exact group resolution: find the DM group by name suffix. */
function findDmGroup(groups: any[], me: string, other: string) {
  const suffix = `/${dmGroupName(me, other)}`;
  return groups.find((g) => g.group_id.endsWith(suffix)) || null;
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
// the collected texts instead. toPass keeps the retry/timeout for messages
// that appear asynchronously (after a send / a reload).
async function expectThreadContains(page: Page, text: string, timeout = 15000) {
  await expect(async () => {
    const texts = await page.locator('[data-testid="dm-message"]').allTextContents();
    expect(texts.some((t) => t.includes(text))).toBeTruthy();
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// API floor — the app's exact DM pattern (deterministic name + CRUD + I3)
// ---------------------------------------------------------------------------

test.describe('Social messages — API floor (DM group contract + CRUD)', () => {
  test('round-trip: A creates the group, sends, B finds it by name and reads back, B replies', async ({ request }) => {
    const A = await signupAndLogin(request, 'smga');
    const B = await signupAndLogin(request, 'smgb');
    await addSocialAppContract(request, A.token);
    await addSocialAppContract(request, B.token);

    // A's first send creates the DM group (the app's ensureDmGroup path).
    const groupId = await rawCreateDmGroup(request, A.token, A.username, B.username);
    // The API derives the group_id from the caller's token — the creator is
    // embedded in the ID (not symmetric; the name is the deterministic part).
    expect(groupId).toBe(`${PROVIDER}/groups/users/${A.username}/${dmGroupName(A.username, B.username)}`);

    // A sends to B (a posts doc in the group, the app's sendDm body shape).
    await sendDmDoc(request, A.token, groupId, A.username, B.username, 'hello from A');

    // B's exact read pattern: list my groups, find the DM group by the
    // deterministic name suffix, read posts in it.
    const bGroups = await myGroups(request, B.token);
    const bDm = findDmGroup(bGroups, B.username, A.username);
    expect(bDm, 'B must find A-created DM group by the deterministic name').toBeTruthy();
    expect(bDm!.group_id).toBe(groupId);

    const bInbox = await readGroupDocs(request, B.token, groupId);
    expect(bInbox.length).toBe(1);
    expect(bInbox[0].body.message).toBe('hello from A');
    expect(bInbox[0].author_key).toBe(A.username);

    // B replies in the SAME group (no second group).
    await sendDmDoc(request, B.token, groupId, B.username, A.username, 'hi from B');

    const aInbox = await readGroupDocs(request, A.token, groupId);
    expect(aInbox.length).toBe(2);
    const texts = aInbox.map((d) => d.body.message).sort();
    expect(texts).toEqual(['hello from A', 'hi from B']);
  });

  test('deterministic name: exactly ONE DM group for the pair, found by both sides', async ({ request }) => {
    const A = await signupAndLogin(request, 'smgc');
    const B = await signupAndLogin(request, 'smgd');
    await addSocialAppContract(request, A.token);
    await addSocialAppContract(request, B.token);
    const groupId = await rawCreateDmGroup(request, A.token, A.username, B.username);

    // Both sides' group lists contain exactly one group with the DM name
    // suffix — and it is the same group (not one per direction).
    const aGroups = await myGroups(request, A.token);
    const aDm = aGroups.filter((g) => g.group_id.endsWith(`/${dmGroupName(A.username, B.username)}`));
    expect(aDm.length).toBe(1);
    const bGroups = await myGroups(request, B.token);
    const bDm = bGroups.filter((g) => g.group_id.endsWith(`/${dmGroupName(A.username, B.username)}`));
    expect(bDm.length).toBe(1);
    expect(aDm[0].group_id).toBe(bDm[0].group_id);
    expect(aDm[0].group_id).toBe(groupId);

    // The contract is invite_only with the app's member role (both
    // participants equal members — no owner, no hierarchy).
    const detail = await request.post(`${API_BASE_URL}/v3/groups/get`, {
      data: JSON.stringify({ token: B.token, group_id: groupId }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(detail.ok()).toBeTruthy();
    const g = await detail.json();
    expect(g.join_policy).toBe('invite_only');
    expect(g.roles).toEqual(DM_ROLES);
  });

  test('anti-test: a third user cannot read the DM group (I3 holds)', async ({ request }) => {
    const A = await signupAndLogin(request, 'smge');
    const B = await signupAndLogin(request, 'smgf');
    const C = await signupAndLogin(request, 'smgg');
    await addSocialAppContract(request, A.token);
    await addSocialAppContract(request, B.token);
    await addSocialAppContract(request, C.token);
    const groupId = await rawCreateDmGroup(request, A.token, A.username, B.username);
    await sendDmDoc(request, A.token, groupId, A.username, B.username, 'private');

    // C is not a member of the DM group.
    const readRes = await request.post(`${API_BASE_URL}/v3/read`, {
      data: JSON.stringify({ token: C.token, service: SERVICE, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.status()).toBe(403);
    const err = await readRes.json();
    expect(err.detail).toMatch(/not a member/i);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real two-user DM round-trip through the real app
// ---------------------------------------------------------------------------

test.describe('Social messages gauntlet — two-user DM round-trip', () => {
  test('A composes to B (first send creates the group) → B receives → B replies → A sees the reply', async ({ browser, request }) => {
    test.setTimeout(90000);
    const A = await signupAndLogin(request, 'smga1');
    const B = await signupAndLogin(request, 'smgb1');
    await addSocialAppContract(request, A.token);
    await addSocialAppContract(request, B.token);

    // Two pre-authed contexts (token cookies on social.localhost +
    // auth.localhost), separate browser instances — two users, two browsers.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    await setTokenCookie(contextA, 'social.localhost', A.token);
    await setTokenCookie(contextA, 'auth.localhost', A.token);
    await setTokenCookie(contextB, 'social.localhost', B.token);
    await setTokenCookie(contextB, 'auth.localhost', B.token);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const logsA = captureConsoleLogs(pageA, '[social-dms]');
    const logsB = captureConsoleLogs(pageB, '[social-dms]');
    const pageErrorsA: string[] = [];
    pageA.on('pageerror', (e) => pageErrorsA.push(e.message));
    const pageErrorsB: string[] = [];
    pageB.on('pageerror', (e) => pageErrorsB.push(e.message));

    const firstMsg = `hello from A ${Date.now()}`;
    const replyMsg = `reply from B ${Date.now()}`;

    // --- A loads /messages (pre-authed, no login popup) — empty state ---
    await pageA.goto(`${SOCIAL_BASE}/messages`);
    await pageA.waitForLoadState('networkidle');
    await expect(pageA.locator('[data-testid="dms-empty"]')).toBeVisible({ timeout: 20000 });

    // --- A composes to B by username → the first send creates the group ---
    await pageA.locator('[data-testid="dm-new-message-btn"]').click();
    await expect(pageA.locator('[data-testid="dm-contact-picker"]')).toBeVisible();
    await pageA.locator('[data-testid="dm-compose-username-btn"]').click();
    await pageA.locator('[data-testid="dm-compose-username"]').fill(B.username);
    await pageA.locator('[data-testid="dm-compose-message"]').fill(firstMsg);
    await pageA.locator('[data-testid="dm-compose-send"]').click();

    // The conversation opens with A's message in the thread.
    await expect(pageA.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20000 });
    await expectThreadContains(pageA, firstMsg);

    // A's log sequence: no group yet → create (deterministic name) → sent.
    const aFindNull = logsA.findIndex((l) => l.includes('findDmGroup') && l.includes('match: null'));
    const aCreateIdx = logsA.findIndex((l) => l.includes('ensureDmGroup — no group yet, creating'));
    const aCreatedIdx = logsA.findIndex((l) => l.includes('ensureDmGroup — created'));
    const aSentIdx = logsA.findIndex((l) => l.includes('sendDm — sent'));
    expect(aFindNull, 'A must look for an existing DM group first').toBeGreaterThanOrEqual(0);
    expect(aCreateIdx, 'A must create the group (none existed)').toBeGreaterThanOrEqual(0);
    expect(aCreatedIdx, 'A must log the created group').toBeGreaterThanOrEqual(0);
    expect(aSentIdx, 'A must log the sent message').toBeGreaterThanOrEqual(0);
    expect(aCreateIdx).toBeGreaterThan(aFindNull);
    expect(aCreatedIdx).toBeGreaterThan(aCreateIdx);
    expect(aSentIdx).toBeGreaterThan(aCreatedIdx);
    const aGroupId = (logsA[aCreatedIdx].match(/created (\S+)$/) || [])[1];
    expect(aGroupId, 'A must create the group under the deterministic name').toBe(
      `${PROVIDER}/groups/users/${A.username}/${dmGroupName(A.username, B.username)}`,
    );

    // --- B loads /messages → the conversation is in B's list ---
    await pageB.goto(`${SOCIAL_BASE}/messages`);
    await pageB.waitForLoadState('networkidle');
    await expect(pageB.locator('[data-testid="dm-conversation-item"]')).toBeVisible({ timeout: 20000 });
    // The list shows A as the other party, with A's message as the last one.
    const itemText = await pageB.locator('[data-testid="dm-conversation-item"]').first().textContent();
    expect(itemText).toContain(A.username);
    expect(itemText).toContain(firstMsg);

    // --- B opens the conversation → sees A's message (the receive) ---
    await pageB.locator('[data-testid="dm-conversation-item"]').first().click();
    await expect(pageB.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20000 });
    await expectThreadContains(pageB, firstMsg);

    // B found the SAME group A created (the deterministic name resolved to
    // the same group_id on both sides).
    const bFindIdx = logsB.findIndex((l) => l.includes('findDmGroup') && l.includes('match:'));
    expect(bFindIdx, 'B must resolve the DM group by name').toBeGreaterThanOrEqual(0);
    const bGroupId = (logsB[bFindIdx].match(/match: (\S+)$/) || [])[1];
    expect(bGroupId, 'B must resolve to the SAME group A created').toBe(aGroupId);
    const bReadIdx = logsB.findIndex((l) => l.includes('readDms — got'));
    expect(bReadIdx, 'B must read the thread').toBeGreaterThanOrEqual(0);
    expect(bReadIdx).toBeGreaterThan(bFindIdx);

    // --- B replies (the group already exists — no create) ---
    await pageB.locator('[data-testid="dm-input"]').fill(replyMsg);
    await pageB.locator('[data-testid="dm-send-button"]').click();
    await expectThreadContains(pageB, replyMsg);
    const bSentIdx = logsB.findIndex((l) => l.includes('sendDm — sent'));
    expect(bSentIdx, 'B must log the reply').toBeGreaterThanOrEqual(0);
    expect(bSentIdx).toBeGreaterThan(bReadIdx);
    // B must NOT have created a second group.
    expect(logsB.some((l) => l.includes('ensureDmGroup — no group yet, creating')), 'B must reuse the existing group').toBeFalsy();

    // --- A reloads → sees B's reply (CRUD is the delivery path) ---
    await pageA.reload();
    await pageA.waitForLoadState('networkidle');
    await expect(pageA.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20000 });
    await expectThreadContains(pageA, firstMsg);
    await expectThreadContains(pageA, replyMsg);
    const aReReadIdx = logsA.findIndex((l) => l.includes('readDms — got 2 messages'));
    expect(aReReadIdx, 'A must read both messages after the reload').toBeGreaterThanOrEqual(0);
    expect(aReReadIdx).toBeGreaterThan(aSentIdx);

    // No errors in either console, no uncaught exceptions.
    const errorsA = logsA.filter((l) => l.includes('FAILED') || l.includes('Error'));
    const errorsB = logsB.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    expect(pageErrorsA).toEqual([]);
    expect(pageErrorsB).toEqual([]);
  });
});
