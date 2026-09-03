import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { v3Post, v3Login, v3Signup } from '../v3-helpers';

/**
 * social-groups — the app's groups surface: follows (followers groups) as the
 * app drives them. Following a user IS joining their followers group; the
 * feed is the user's groups (minus discover) read as one multi-group posts
 * read — so follow → the creator's posts enter the feed, unfollow → they
 * leave. The feed-read delta is the load-bearing assertion.
 *
 * The API floor pins the app's exact read pattern (getMyGroups minus discover
 * → read posts) + the follow/unfollow group ops + the I3 anti-test. The
 * browser gauntlet drives the real follow/unfollow button end to end and
 * verifies the feed reflects it, with console log-sequence verification.
 *
 * Group *management* (create/roles/invite) is the authenticator + marketing
 * directory surface — its floors live in `groups-demo`, not here.
 *
 * The discover board is a SHARED node default, so any board assertion is a
 * contains-assertion. The feed (readFeed) EXCLUDES discover, so the feed is
 * isolated to followed creators and exact membership assertions hold.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
// The origin that makes the API calls — the API matches the request Origin
// header against the app contract's allowed_origin exactly.
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'posts';
// The node-default discover group — a well-known constant, NOT provider-
// derived. The feed excludes it; followers groups are provider-derived.
const DISCOVER_GROUP_ID = `${PROVIDER}/groups/web10/discover`;
const PASSWORD = 'TestPass123!';

// A followers group: the creator (owner) posts; followers (member) are read-only.
const FOLLOWERS_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE], permissions: ['readAll'] },
];

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, PASSWORD, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, PASSWORD);
  return { username, token };
}

async function addAppContract(request: APIRequestContext, token: string) {
  await v3Post(request, `${API_BASE}/v3/app-contracts/add`, {
    token,
    allowed_origin: SOCIAL_ORIGIN,
    permissions: { [SERVICE]: ['create', 'readAll', 'updateOwn', 'deleteOwn'] },
  });
}

/**
 * Create the creator's followers group (open join — following is an instant
 * join). The API derives the deterministic ID `{provider}/groups/users/
 * {creator}/followers` from the name `followers` + the token's creator.
 */
async function createFollowersGroup(request: APIRequestContext, token: string, creator: string): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name: 'followers',
    join_policy: 'open',
    roles: FOLLOWERS_ROLES,
    members: [{ member_key: creator, role: 'owner' }],
  });
  expect(res.ok(), `create followers group failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

/** Post to a group (the creator's followers group in this spec). */
async function postToGroup(request: APIRequestContext, token: string, groupId: string, text: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token, service: SERVICE,
      body: { text, date: new Date().toISOString() },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `create post failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/**
 * The app's exact feed read (readFeed in src/data/feed.ts): the user's groups
 * minus discover, read as ONE multi-group posts read. Returns the post texts.
 * This is the read the follow/unfollow delta is asserted against.
 */
async function appFeedRead(request: APIRequestContext, token: string): Promise<string[]> {
  const groupsRes = await v3Post(request, `${API_BASE}/v3/groups/list`, { token });
  expect(groupsRes.ok(), `groups/list failed (${groupsRes.status})`).toBeTruthy();
  const groups = (await groupsRes.json()) as { group_id: string }[];
  const feedGroups = groups.filter((g) => g.group_id !== DISCOVER_GROUP_ID).map((g) => g.group_id);
  if (!feedGroups.length) return [];
  const readRes = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: feedGroups }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(readRes.ok(), `feed read failed (${readRes.status})`).toBeTruthy();
  const docs = (await readRes.json()) as { body: { text?: string } }[];
  return docs.map((d) => d.body.text).filter((t): t is string => t !== undefined);
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
// the collected card texts. toPass keeps the retry/timeout for posts that
// appear/disappear asynchronously (after a follow/unfollow triggers a reload).
async function expectFeedHasPost(page: Page, text: string, present: boolean, timeout = 15000) {
  await expect(async () => {
    const texts = await page.locator('[data-testid="post-card"]').allTextContents();
    expect(texts.some((t) => t.includes(text))).toBe(present);
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// API floor — the follow/unfollow group ops + the feed-read delta (fast, no
// browser). Pins the app's exact read pattern, not a re-proof of the primitive.
// ---------------------------------------------------------------------------

test.describe('social-groups — API floor (follows = followers groups)', () => {
  test('follow → creator post enters the feed; unfollow → it leaves (feed-read delta)', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'sgv');
    const creator = await signupAndLogin(request, 'sgc');
    await addAppContract(request, viewer.token);
    await addAppContract(request, creator.token);

    // The creator's followers group (open, deterministic ID).
    const followersId = `${PROVIDER}/groups/users/${creator.username}/followers`;
    const createdId = await createFollowersGroup(request, creator.token, creator.username);
    expect(createdId).toBe(followersId);

    // The creator posts to their followers group.
    const postText = `sg creator post ${Date.now()}`;
    await postToGroup(request, creator.token, followersId, postText);

    // Before follow: the creator's post is NOT in the viewer's feed (the
    // viewer only belongs to discover, which the feed excludes).
    expect(await appFeedRead(request, viewer.token)).not.toContain(postText);

    // Follow = join the creator's followers group.
    const joinRes = await v3Post(request, `${API_BASE}/v3/groups/join`, {
      token: viewer.token, group_id: followersId,
    });
    expect(joinRes.ok(), `join failed (${joinRes.status})`).toBeTruthy();

    // After follow: the creator's post IS in the viewer's feed.
    expect(await appFeedRead(request, viewer.token)).toContain(postText);

    // Unfollow = leave the creator's followers group.
    const leaveRes = await v3Post(request, `${API_BASE}/v3/groups/leave`, {
      token: viewer.token, group_id: followersId,
    });
    expect(leaveRes.ok(), `leave failed (${leaveRes.status})`).toBeTruthy();

    // After unfollow: the creator's post is GONE from the viewer's feed.
    expect(await appFeedRead(request, viewer.token)).not.toContain(postText);

    // I3: a direct read of the creator's followers group by the (now ex-)
    // follower is denied — membership is the gate, not a cached feed.
    const directRead = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: viewer.token, service: SERVICE, groups: [followersId] }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
    expect(directRead.status()).toBe(403);
  });

  test('anti-test: a stranger who never followed cannot read the followers group (I3)', async ({ request }) => {
    const creator = await signupAndLogin(request, 'sga1');
    const stranger = await signupAndLogin(request, 'sga2');
    await addAppContract(request, creator.token);
    await addAppContract(request, stranger.token);

    const followersId = await createFollowersGroup(request, creator.token, creator.username);
    await postToGroup(request, creator.token, followersId, 'private to followers');

    // The stranger is not a member — a direct read is denied (I3 holds).
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: stranger.token, service: SERVICE, groups: [followersId] }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
    expect(readRes.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real follow/unfollow button, the feed reflects it.
// ---------------------------------------------------------------------------

test.describe('social-groups gauntlet — follow/unfollow through the app', () => {
  test('follow → creator post appears in /feed; unfollow → it leaves', async ({ page, context, request }) => {
    test.setTimeout(60_000);
    const logs = captureConsoleLogs(page, '[social]');

    // Viewer (pre-authed via the token cookie — no login popup).
    const viewer = await signupAndLogin(request, 'sgui');
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);

    // Creator (set up via API — they're "other users", not driven in-browser).
    const creator = await signupAndLogin(request, 'sguic');
    await addAppContract(request, creator.token);
    const followersId = await createFollowersGroup(request, creator.token, creator.username);
    const postText = `sg ui post ${Date.now()}`;
    await postToGroup(request, creator.token, followersId, postText);

    // --- Viewer opens the creator's profile (signed in via the cookie) ---
    await page.goto(`${SOCIAL_BASE}/u/${creator.username}`);
    await page.waitForLoadState('networkidle');
    const followBtn = page.locator('[data-testid="follow-button"]');
    await expect(followBtn).toContainText('Follow');

    // --- Follow through the app (the real button) ---
    await followBtn.click();
    await expect(followBtn).toContainText('Following', { timeout: 10000 });

    // --- The creator's post appears in /feed ---
    await page.goto(`${SOCIAL_BASE}/feed`);
    await page.waitForLoadState('networkidle');
    await expectFeedHasPost(page, postText, true);

    // --- Unfollow through the app ---
    await page.goto(`${SOCIAL_BASE}/u/${creator.username}`);
    await page.waitForLoadState('networkidle');
    await expect(followBtn).toContainText('Following');
    await followBtn.click();
    await expect(followBtn).toContainText('Follow', { timeout: 10000 });

    // --- The creator's post leaves /feed ---
    await page.goto(`${SOCIAL_BASE}/feed`);
    await page.waitForLoadState('networkidle');
    await expectFeedHasPost(page, postText, false);

    // --- Verify console logs (the real flow, in order) ---
    const toggle1Idx = logs.findIndex((l) => l.includes('handleFollow — toggling follow for') && l.includes('currently following: false'));
    const nowFollowingIdx = logs.findIndex((l) => l.includes('handleFollow — now following'));
    const toggle2Idx = logs.findIndex((l) => l.includes('handleFollow — toggling follow for') && l.includes('currently following: true'));
    const noLongerIdx = logs.findIndex((l) => l.includes('handleFollow — no longer following'));

    for (const idx of [toggle1Idx, nowFollowingIdx, toggle2Idx, noLongerIdx]) {
      expect(idx, 'missing expected log line').toBeGreaterThanOrEqual(0);
    }
    expect(toggle1Idx).toBeLessThan(nowFollowingIdx);
    expect(nowFollowingIdx).toBeLessThan(toggle2Idx);
    expect(toggle2Idx).toBeLessThan(noLongerIdx);

    // No errors in the app's console.
    const errors = logs.filter((l) => l.includes('Failed to toggle follow'));
    expect(errors).toEqual([]);
  });
});
