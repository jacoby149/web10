import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_BASE, v3Login, v3Signup } from '../v3-helpers';

/**
 * Social feed — the integration floor for web10-social's /feed surface
 * (src/components/Feed/ + src/data/feed.ts + src/data/posts.ts).
 *
 * The API floor pins the app's EXACT /feed read pattern (what the app actually
 * queries), not a re-proof of the multi-group primitive (that's feed-demo's
 * job): readFeed = getMyGroups → drop the discover group → ONE /v3/read over
 * the rest (limit 50, NO server-side sort) → client-side sort by created_at.
 * The I3 anti-test proves a non-follower's group post is absent from that read.
 *
 * The browser gauntlet drives the real app (pre-authed via the token cookie —
 * the D42 login flow itself belongs to the auth specs, the capstone drives it
 * cold): /feed renders a followed creator's post → post via the composer →
 * reload → the feed still renders and the post persists — with [social-feed]
 * console log-sequence verification.
 *
 * The discover board is a SHARED node default, so where it intersects the feed
 * the assertions are contains/absent, never exact counts.
 *
 * NOTE (own-followers provisioning): a user's OWN public post attaches to
 * discover + their OWN followers group. For it to surface in their OWN /feed
 * (which drops discover), the user must be a member of their own followers
 * group. `createPost` provisions it (ensureFollowers, user as owner) before
 * attaching — so the gauntlet asserts the user's own post appears in their
 * own feed, and persists across reload. (The followers-group ID is the node's
 * minted shape, `{provider}/groups/users/{u}/followers` — see groups.ts.)
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
// The node-default discover group — a well-known constant, created at boot,
// every user (and anon) auto-joined. The /feed read DROPS this group, but a
// public post is attached to it (so it is the persistence check's home).
const DISCOVER_GROUP_ID = 'web10.app/groups/web10/discover';
const SERVICE = 'posts';

const password = 'TestPass123!';
const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// The app's followers-group roles (src/data/groups.ts FOLLOWER_ROLES) — the
// owner posts, followers (member) are read-only.
const FOLLOWER_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE], permissions: ['readAll'] },
];

// The app contract the SOCIAL origin needs for the /feed surface: read +
// create on posts, plus the best-effort enrichment services the feed screen
// touches (profiles, media, reactions, comments, settings).
const SOCIAL_CONTRACT_PERMISSIONS: Record<string, string[]> = {
  posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  profile: ['readAll', 'create', 'updateOwn'],
  settings: ['readAll', 'create', 'updateOwn'],
  reactions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  media: ['readAll'],
  public_media: ['readAll'],
};

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, password, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, password);
  return { username, token };
}

async function addAppContract(request: APIRequestContext, token: string, allowedOrigin: string, permissions: Record<string, string[]>) {
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: allowedOrigin, permissions }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
  expect(res.ok(), `app-contracts/add failed (${res.status})`).toBeTruthy();
}

/** Create a followers group through the API (mints `{provider}/groups/users/{creator}/followers`). */
async function createFollowersGroupViaApi(request: APIRequestContext, token: string, creator: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token, name: 'followers', join_policy: 'open', roles: FOLLOWER_ROLES,
      members: [{ member_key: creator, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create followers group failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

async function joinGroup(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/groups/join`, {
    data: JSON.stringify({ token, group_id: groupId }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `join ${groupId} failed (${res.status})`).toBeTruthy();
}

async function postDoc(request: APIRequestContext, token: string, groupId: string, text: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: SERVICE, body: { text, date: new Date().toISOString() }, groups: [groupId] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `create doc failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Read one group's posts (the app's read shape, scoped to a single group). */
async function readGroup(
  request: APIRequestContext, token: string, groupId: string, limit = 50,
): Promise<{ doc_id: string; text: string; created_at: string; author_key: string }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [groupId], limit }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `read ${groupId} failed (${res.status})`).toBeTruthy();
  const docs: { doc_id: string; body: { text?: string }; created_at: string; author_key: string }[] = await res.json();
  return docs.map((d) => ({ doc_id: d.doc_id, text: d.body.text || '', created_at: d.created_at, author_key: d.author_key }));
}

// ClickHouse is eventually consistent: a just-inserted doc may not be visible
// to the dedup read for a moment (worst under parallel load). Poll until the
// post appears in the group (or the timeout elapses).
async function expectGroupContainsPost(
  request: APIRequestContext, token: string, groupId: string, text: string, timeout = 15000,
) {
  await expect(async () => {
    const docs = await readGroup(request, token, groupId);
    expect(docs.map((d) => d.text)).toContain(text);
  }).toPass({ timeout });
}

/**
 * The app's EXACT /feed read (src/data/feed.ts readFeed): getMyGroups → drop
 * the discover group → ONE /v3/read over the remainder (limit 50, no
 * server-side sort — the app sorts client-side) → sort by created_at.
 * Returns the computed feed groups + the sorted posts, mirroring the app.
 */
async function appFeedRead(
  request: APIRequestContext, token: string, sort: 'newest' | 'oldest' = 'newest', limit = 50,
): Promise<{ feedGroups: string[]; posts: { doc_id: string; text: string; created_at: string; author_key: string }[] }> {
  const listRes = await request.post(`${API_BASE}/v3/groups/list`, {
    data: JSON.stringify({ token }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(listRes.ok(), `groups/list failed (${listRes.status})`).toBeTruthy();
  const myGroups: { group_id: string }[] = await listRes.json();
  const feedGroups = myGroups.map((g) => g.group_id).filter((id) => id !== DISCOVER_GROUP_ID);

  if (!feedGroups.length) return { feedGroups, posts: [] };

  const readRes = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: feedGroups, limit }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(readRes.ok(), `feed read failed (${readRes.status})`).toBeTruthy();
  const docs: { doc_id: string; body: { text?: string }; created_at: string; author_key: string }[] = await readRes.json();

  const posts = docs.map((d) => ({ doc_id: d.doc_id, text: d.body.text || '', created_at: d.created_at, author_key: d.author_key }));
  const direction = sort === 'newest' ? -1 : 1;
  posts.sort((a, b) => (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction);
  return { feedGroups, posts };
}

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([{ name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false }]);
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
// the collected post-card texts. toPass keeps the retry/timeout for content
// that appears asynchronously (after load / a post triggers a remount).
async function expectFeedShowsPost(page: Page, text: string, timeout = 15000) {
  await expect(async () => {
    const texts = await page.locator('[data-testid="post-card"]').allTextContents();
    expect(texts.some((t) => t.includes(text))).toBeTruthy();
  }).toPass({ timeout });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// API floor — the app's exact /feed read, fast + deterministic (no browser)
// ---------------------------------------------------------------------------

test.describe('Social feed — API floor (the app\'s exact read)', () => {
  test('one read over the followed followers groups, newest first, discover dropped', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'sfv');
    const c1 = await signupAndLogin(request, 'sfc1');
    const c2 = await signupAndLogin(request, 'sfc2');
    for (const u of [viewer, c1, c2]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }

    // Creators' followers groups (the API's real minted shape) + the viewer
    // follows both (open join = instant).
    const f1 = await createFollowersGroupViaApi(request, c1.token, c1.username);
    const f2 = await createFollowersGroupViaApi(request, c2.token, c2.username);
    await joinGroup(request, viewer.token, f1);
    await joinGroup(request, viewer.token, f2);

    // Creators post to their own followers groups. Space the timestamps so the
    // client-side (millisecond) sort is deterministic.
    await postDoc(request, c1.token, f1, 'c1 post');
    await sleep(1100);
    await postDoc(request, c2.token, f2, 'c2 post');

    // The app's exact read: my groups minus discover, one read, newest first.
    const { feedGroups, posts } = await appFeedRead(request, viewer.token, 'newest');

    // The read is scoped to exactly the followed followers groups — discover
    // is dropped, and nothing else leaks in.
    expect(feedGroups.sort()).toEqual([f1, f2].sort());
    expect(feedGroups).not.toContain(DISCOVER_GROUP_ID);

    // Both followed creators' posts are present (contains), each exactly once.
    const texts = posts.map((d) => d.text);
    expect(texts).toContain('c1 post');
    expect(texts).toContain('c2 post');
    expect(texts.filter((t) => t === 'c1 post').length).toBe(1);
    expect(texts.filter((t) => t === 'c2 post').length).toBe(1);

    // Newest first: c2 (posted later) ranks before c1.
    expect(texts.indexOf('c2 post')).toBeLessThan(texts.indexOf('c1 post'));

    // The discover drop is real: a post that lands ONLY on the shared board is
    // not part of the /feed read (the board is the /discover surface's).
    await postDoc(request, viewer.token, DISCOVER_GROUP_ID, 'viewer on discover only');
    const after = await appFeedRead(request, viewer.token, 'newest');
    expect(after.posts.map((d) => d.text)).not.toContain('viewer on discover only');

    // The sort config is client-side: 'oldest' reverses the same read.
    const oldest = await appFeedRead(request, viewer.token, 'oldest');
    expect(oldest.posts.map((d) => d.text).indexOf('c1 post')).toBeLessThan(
      oldest.posts.map((d) => d.text).indexOf('c2 post'),
    );
  });

  test('I3: a non-follower\'s group post is absent from the app\'s feed read', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'sfx1');
    const c1 = await signupAndLogin(request, 'sfx2');
    const stranger = await signupAndLogin(request, 'sfx3');
    for (const u of [viewer, c1, stranger]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }

    const f1 = await createFollowersGroupViaApi(request, c1.token, c1.username);
    const fStranger = await createFollowersGroupViaApi(request, stranger.token, stranger.username);

    // Viewer follows ONLY c1.
    await joinGroup(request, viewer.token, f1);

    // Both post to their own followers groups.
    await postDoc(request, c1.token, f1, 'c1 post');
    await postDoc(request, stranger.token, fStranger, 'stranger post');

    // The app's exact read is scoped to the viewer's followed groups — the
    // stranger's group is not among them, so their post cannot surface (I3).
    const { feedGroups, posts } = await appFeedRead(request, viewer.token, 'newest');
    expect(feedGroups).toContain(f1);
    expect(feedGroups).not.toContain(fStranger);
    expect(posts.map((d) => d.text)).toContain('c1 post');
    expect(posts.map((d) => d.text)).not.toContain('stranger post');
  });

  test('a fresh user\'s feed read is empty (no follows yet)', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'sff');
    await addAppContract(request, viewer.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);

    // A fresh user is a member of only the discover group (auto-enrolled at
    // signup); the /feed read drops it, so there are no feed groups and the
    // read short-circuits to an empty feed (no /v3/read is even issued).
    const { feedGroups, posts } = await appFeedRead(request, viewer.token, 'newest');
    expect(feedGroups).toEqual([]);
    expect(posts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real /feed flow (pre-authed via token cookie)
// ---------------------------------------------------------------------------

test.describe('Social feed gauntlet — render → post → reload persists', () => {
  test('pre-authed viewer: /feed renders a followed post, post via composer, reload persists', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[social-feed]');

    // Setup (API): a creator with a followers group + a post; the viewer
    // follows them so the feed has something real to render.
    const viewer = await signupAndLogin(request, 'sfui');
    const creator = await signupAndLogin(request, 'sfuic');
    await addAppContract(request, viewer.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    await addAppContract(request, creator.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    const fCreator = await createFollowersGroupViaApi(request, creator.token, creator.username);
    const creatorPost = `creator feed post ${Date.now()}`;
    await postDoc(request, creator.token, fCreator, creatorPost);
    await joinGroup(request, viewer.token, fCreator);

    await setTokenCookie(context, 'social.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);

    // --- /feed renders the followed creator's post ---
    await page.goto(`${SOCIAL_BASE}/feed`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="post-composer"]')).toBeVisible();
    await expectFeedShowsPost(page, creatorPost);

    // --- Post via the composer (public → discover + own followers group) ---
    const myPost = `my feed post ${Date.now()}`;
    await page.locator('[data-testid="post-composer"] textarea').fill(myPost);
    await page.locator('[data-testid="post-submit"]').click();

    // The composer succeeded (no error surfaced). The user's OWN post surfaces
    // in their OWN feed: createPost provisions the user's own followers group
    // (user as owner) before attaching, so readFeed (the user's groups minus
    // discover) includes it. The remount re-reads the feed after the post.
    await expect(page.locator('[data-testid="composer-error"]')).toHaveCount(0);
    await expectFeedShowsPost(page, myPost);
    // It also landed on the discover board (a public post is attached there).
    await expectGroupContainsPost(request, viewer.token, DISCOVER_GROUP_ID, myPost);

    // --- Reload: the session + the feed + the post persist ---
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="post-composer"]')).toBeVisible();
    // The feed still renders the followed creator's post across the reload.
    await expectFeedShowsPost(page, creatorPost);
    // The viewer's OWN post persists in their OWN feed across the reload.
    await expectFeedShowsPost(page, myPost);

    // --- Console log sequence (the real flow, in order) ---
    // 3.35.0: the group-list log moved to the shared getFeedGroups (groups.ts,
    // [social:groups] prefix); readFeed now logs the resolved feed groups.
    const firstReadIdx = logs.findIndex((l) => l.includes('readFeed — feed groups'));
    const createIdx = logs.findIndex((l) => l.includes('createPost — success'));
    const secondReadIdx = logs.findIndex((l, i) => i > createIdx && l.includes('readFeed — feed groups'));
    for (const idx of [firstReadIdx, createIdx, secondReadIdx]) {
      expect(idx, 'missing expected [social-feed] log line').toBeGreaterThanOrEqual(0);
    }
    expect(firstReadIdx).toBeLessThan(createIdx);
    expect(createIdx).toBeLessThan(secondReadIdx);
    // The public post targeted the discover board + the viewer's own followers
    // group (the scheme-agnostic shape: discover + a `…/followers` group).
    const createLog = logs.find((l) => l.includes('createPost — visibility'));
    expect(createLog).toBeTruthy();
    expect(createLog).toContain(DISCOVER_GROUP_ID);
    expect(createLog).toContain('/followers');
    // No feed/create failures in the console.
    const errors = logs.filter((l) => l.includes('Failed') || l.includes('Error'));
    expect(errors).toEqual([]);
  });
});
