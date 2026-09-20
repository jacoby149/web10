import { test, expect, chromium, type APIRequestContext } from '@playwright/test';
import { v3Post, v3Login, v3Signup } from '../v3-helpers';

/**
 * Social notifications — the two-user real-time gauntlet (D69).
 *
 * The operator's ask, witnessed in the DOM: "user a messages, user b sees the
 * notification … the e2e needs to witness those things happening." This is the
 * notifications version of social-p2p.spec.ts (which covers the DM fast path).
 *
 * D69 (the KB target, web10-social-v3/notifications.md): notifications are
 * derived events the app owns — CRUD is the source of truth, the P2P data
 * channel is the nudge. No server push, no node table, no polling. When the
 * actor performs a targeting action (react / comment / reply / DM / follow),
 * the actor's app pushes a typed nudge over P2P; the recipient's app-wide
 * notification store (subscribed to onP2PInbound) appends the row + bumps the
 * badge from ANY screen. The recipient re-reads from CRUD for the durable
 * record — it never trusts the payload.
 *
 * Two layers (the test ladder):
 *   - API floor: the data-integrity of the read-side derivation — B's reaction
 *     on A's post is a `reactions` doc with ref_value = A's post, readable by A
 *     (the CRUD read the derivation keys off). Fast, no browser, deterministic.
 *   - Browser gauntlet: the load-bearing witness — B reacts to A's post in the
 *     real app → A's notification badge pops to 1 in REAL TIME (the P2P nudge,
 *     no reload on A) → A opens /notifications → the history shows the event →
 *     marked read (badge clears). The "no reload" is the point: the app has no
 *     polling, so the P2P nudge is the only mechanism that can bump A's badge
 *     after B's reaction.
 *
 * Two SEPARATE browser instances (WebRTC P2P completes across two browsers but
 * NOT across two contexts in the same browser) + the mDNS flag (headless local
 * ICE) — same as social-p2p.spec.ts.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const PASSWORD = 'TestPass123!';
const DISCOVER_GROUP_ID = `${PROVIDER}/groups/web10/discover`;

// The full social app contract (the exact set the app's login popup grants) —
// must include 'notifications' (the badge's CRUD cursor) + the engagement
// services (posts/reactions/comments) or the app's reads 403.
const SOCIAL_SERVICES = [
  'posts', 'media', 'public_media', 'profile', 'settings',
  'comments', 'reactions', 'contacts', 'staging_posts',
  'web10-social-group-identity', 'notifications',
];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

const uniqueUser = (prefix: string) =>
  `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function signupAndLogin(
  request: APIRequestContext,
  prefix: string,
): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, PASSWORD, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, PASSWORD);
  return { username, token };
}

async function addSocialAppContract(request: APIRequestContext, token: string): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/app-contracts/add`, {
    token,
    allowed_origin: SOCIAL_ORIGIN,
    permissions: Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, [...SOCIAL_OPERATIONS]])),
  });
  expect(res.ok(), `app contract add failed (${res.status})`).toBeTruthy();
}

function setTokenCookie(context: any, domain: string, token: string): Promise<void> {
  return context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

function captureConsoleLogs(page: any, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg: any) => {
    const text = msg.text();
    if (text.includes(prefix)) logs.push(text);
  });
  return logs;
}

async function waitForLog(logs: string[], needle: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (logs.some((l) => l.includes(needle))) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for log "${needle}". Logs so far:\n${logs.join('\n')}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ── API floor helpers ────────────────────────────────────────────────────────

/** The user's followers group id (the deterministic id the API derives). */
const followersGroupId = (username: string) => `${PROVIDER}/groups/users/${username}/followers`;

/** Create the user's followers group (open join, owner = the user). Idempotent. */
async function ensureFollowersGroup(
  request: APIRequestContext,
  token: string,
  username: string,
): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name: 'followers',
    join_policy: 'open',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
      { name: 'member', services: ['posts'], permissions: ['readAll'] },
    ],
    members: [{ member_key: username, role: 'owner' }],
  });
  if (!res.ok()) throw new Error(`create followers group failed (${res.status})`);
  return (await res.json()).group_id as string;
}

/** Post to a group, returning the post's doc_id. */
async function postToGroup(
  request: APIRequestContext,
  token: string,
  groupId: string,
  text: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token, service: 'posts',
      body: { text, date: new Date().toISOString() },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create post failed (${res.status})`);
  return (await res.json()).doc_id as string;
}

/** B follows A = B joins A's followers group (open join → instant). */
async function followUser(
  request: APIRequestContext,
  followerToken: string,
  followedUsername: string,
): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/join`, {
    token: followerToken,
    group_id: followersGroupId(followedUsername),
  });
  if (!res.ok()) throw new Error(`follow (join) failed (${res.status})`);
}

/** B reacts to A's post (a `reactions` doc in the discover group, ref_value = the post). */
async function reactToPost(
  request: APIRequestContext,
  token: string,
  postId: string,
  type: 'like' | 'dislike' = 'like',
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: 'reactions',
      body: { type, target_service: 'posts', target_id: postId },
      groups: [DISCOVER_GROUP_ID],
      ref_value: postId,
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create reaction failed (${res.status})`);
  return (await res.json()).doc_id as string;
}

/** Read the reactions targeting a post by ref_value (the derivation's CRUD read). */
async function readReactionsByRef(
  request: APIRequestContext,
  token: string,
  postId: string,
): Promise<{ doc_id: string; author_key: string; body: { type?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'reactions', groups: [DISCOVER_GROUP_ID], ref: postId, limit: 100 }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read reactions failed (${res.status})`);
  return (await res.json()) as { doc_id: string; author_key: string; body: { type?: string } }[];
}

// The mDNS flag is REQUIRED for headless local ICE (same as social-p2p.spec.ts).
const rtcArgs = ['--disable-features=WebRtcHideLocalIpsWithMdns'];

// ---------------------------------------------------------------------------
// API floor — the data-integrity of the read-side derivation (fast, no browser)
// ---------------------------------------------------------------------------

test.describe('Social notifications — API floor (the derivation\'s CRUD read)', () => {
  test('B reacts to A\'s post → the reaction is a reactions doc with ref_value = A\'s post, readable by A', async ({ request }) => {
    const A = await signupAndLogin(request, 'nfa');
    const B = await signupAndLogin(request, 'nfb');
    await addSocialAppContract(request, A.token);
    await addSocialAppContract(request, B.token);

    // A posts (to A's followers group). B follows A (so B can see + engage).
    const aFollowers = await ensureFollowersGroup(request, A.token, A.username);
    const postId = await postToGroup(request, A.token, aFollowers, 'a post to react to');
    await followUser(request, B.token, A.username);

    // B reacts to A's post.
    await reactToPost(request, B.token, postId, 'like');

    // A's derivation read: reactions targeting A's post (ref = postId). The
    // reaction is there, authored by B, type 'like'. This is the CRUD read the
    // client-side deriveNotifications keys off — the data-integrity floor.
    const reactions = await readReactionsByRef(request, A.token, postId);
    expect(reactions.length).toBe(1);
    expect(reactions[0].body.type).toBe('like');
    expect(reactions[0].author_key).toBe(B.username);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the load-bearing witness (real app, real P2P, no reloads)
// ---------------------------------------------------------------------------

test.describe('Social notifications — browser gauntlet (real-time badge, no reloads)', () => {
  test(
    'B reacts to A\'s post → A\'s badge pops to 1 in real time (P2P nudge) → A opens /notifications → marked read',
    async ({ request }) => {
      test.setTimeout(120_000);
      const A = await signupAndLogin(request, 'nra');
      const B = await signupAndLogin(request, 'nrb');
      await addSocialAppContract(request, A.token);
      await addSocialAppContract(request, B.token);

      const browserA = await chromium.launch({ args: rtcArgs });
      const browserB = await chromium.launch({ args: rtcArgs });
      // Hoisted so the finally-block diagnostic can dump them (even on failure).
      let p2pLogsA: string[] = [];
      let p2pLogsB: string[] = [];
      let notifLogsA: string[] = [];
      try {
        const contextA = await browserA.newContext();
        const contextB = await browserB.newContext();
        await setTokenCookie(contextA, 'social.localhost', A.token);
        await setTokenCookie(contextA, 'auth.localhost', A.token);
        await setTokenCookie(contextB, 'social.localhost', B.token);
        await setTokenCookie(contextB, 'auth.localhost', B.token);
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        p2pLogsA = captureConsoleLogs(pageA, '[p2p]');
        p2pLogsB = captureConsoleLogs(pageB, '[p2p]');
        notifLogsA = captureConsoleLogs(pageA, '[notifications]');
        const pageErrorsA: string[] = [];
        pageA.on('pageerror', (e: any) => pageErrorsA.push(e.message));
        const pageErrorsB: string[] = [];
        pageB.on('pageerror', (e: any) => pageErrorsB.push(e.message));

        // --- A loads /feed, P2P-ready, and posts ---
        await pageA.goto(`${SOCIAL_BASE}/feed`);
        await pageA.waitForLoadState('networkidle');
        await waitForLog(p2pLogsA, 'initP2P — READY', 30_000);

        const postText = `notif post ${Date.now()}`;
        await pageA.locator('[data-testid="composer-textarea"]').fill(postText);
        await pageA.locator('[data-testid="post-submit"]').click();
        // A's post renders in A's feed (the optimistic / persisted append).
        await expect(pageA.locator('text=' + postText).first()).toBeVisible({ timeout: 20_000 });

        // --- B follows A (API precondition — makes A's post visible to B) ---
        await followUser(request, B.token, A.username);

        // --- B loads /feed, P2P-ready, and sees A's post ---
        await pageB.goto(`${SOCIAL_BASE}/feed`);
        await pageB.waitForLoadState('networkidle');
        await waitForLog(p2pLogsB, 'initP2P — READY', 30_000);
        const bSeesPost = pageB.locator('text=' + postText).first();
        await expect(bSeesPost).toBeVisible({ timeout: 20_000 });

        // --- A's badge is absent before B reacts (fresh user, no notifications) ---
        // Give A's notification seed a moment to settle so "absent" is meaningful.
        await pageA.waitForTimeout(2000);
        await expect(pageA.locator('[data-testid="nav-notifications-badge"]')).toHaveCount(0);

        // --- B reacts to A's post (the like-button on A's post card) ---
        // The like-button is per-post; scope it to the card containing A's post
        // (the feed has one card per post — .first() would hit the wrong post).
        const bPostCard = pageB.locator('[data-testid="post-card"]', { hasText: postText });
        await expect(bPostCard).toBeVisible({ timeout: 20_000 });
        const bLikeButton = bPostCard.locator('[data-testid="like-button"]');
        await expect(bLikeButton).toBeVisible({ timeout: 20_000 });
        await bLikeButton.click();

        // WITNESS 1: A's notification badge pops to "1" in REAL TIME (the P2P
        // nudge) — no reload / navigation on A. This is the "LIVE" moment.
        await expect(pageA.locator('[data-testid="nav-notifications-badge"]')).toHaveText('1', { timeout: 20_000 });

        // WITNESS 2 (it was the P2P fast path, not a CRUD coincidence): A's
        // notification store logged the inbound nudge.
        const aInboundIdx = notifLogsA.findIndex((l) => l.includes('inbound nudge') || l.includes('nudge — appended'));
        expect(aInboundIdx, 'A must receive the inbound P2P nudge (the fast path)').toBeGreaterThanOrEqual(0);

        // --- A opens /notifications → the history shows the event ---
        await pageA.locator('[data-testid="nav-notifications"]').click();
        await expect(pageA.locator('[data-testid="notifications-list"]')).toBeVisible({ timeout: 20_000 });
        // The row describes the reaction ("B reacted to your post").
        const aRow = pageA.locator('[data-testid="notification-row"]', { hasText: 'reacted to your post' });
        await expect(aRow.first()).toBeVisible({ timeout: 20_000 });

        // --- Marked read: opening /notifications clears the badge ---
        await expect(pageA.locator('[data-testid="nav-notifications-badge"]')).toHaveCount(0, { timeout: 20_000 });

        // No console errors / uncaught exceptions on either side.
        const errorsA = [...p2pLogsA, ...notifLogsA].filter((l) => l.includes('FAILED') || l.includes('Error'));
        const errorsB = p2pLogsB.filter((l) => l.includes('FAILED') || l.includes('Error'));
        expect(errorsA).toEqual([]);
        expect(errorsB).toEqual([]);
        expect(pageErrorsA).toEqual([]);
        expect(pageErrorsB).toEqual([]);
      } finally {
        await browserA.close();
        await browserB.close();
      }
    },
  );
});
