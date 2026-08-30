import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { v3Post, v3Login, v3Signup } from '../v3-helpers';

/**
 * social-groups-directory — the app's Groups screen (the "coming soon" tab that
 * is now real): the public group directory (Discover) + the user's own group
 * memberships (My Groups) + the deep-linkable group detail.
 *
 * This is a DISTINCT surface from `social-groups.spec.ts` (follows = followers
 * groups). Here the app drives the D53 directory + detail reads:
 *   - GET /v3/groups/directory  (anon, the minimal list of discoverable groups)
 *   - GET /v3/groups/detail     (principal-based: metadata always, posts only
 *     for members, only a non-existent group 404s)
 *   - POST /v3/groups/join      (open → instant member; request → pending)
 *   - POST /v3/groups/leave
 *
 * The API floor pins the app's exact read pattern + the I3 anti-test (a
 * non-member's detail read returns NO posts). The browser gauntlet drives the
 * real /groups screen: Discover tab → join an open group → it appears in My
 * Groups → the detail deep link renders.
 *
 * The group_identity write path is a fast-follow (not built), so directory
 * names fall back to the slug — the floor asserts on group_id, not name.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'posts';
const PASSWORD = 'TestPass123!';

const COMMUNITY_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE, 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
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
 * Create a community group. The API derives the deterministic ID `{provider}/
 * groups/users/{creator}/{slug}`. `discoverable` opts the group into the public
 * directory (D53 — NOT discoverable by default).
 */
async function createGroup(
  request: APIRequestContext,
  token: string,
  creator: string,
  name: string,
  opts: { joinPolicy?: string; discoverable?: boolean } = {},
): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name,
    join_policy: opts.joinPolicy ?? 'open',
    roles: COMMUNITY_ROLES,
    members: [{ member_key: creator, role: 'owner' }],
    ...(opts.discoverable !== undefined ? { discoverable: opts.discoverable } : {}),
  });
  expect(res.ok(), `create group failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

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

/** The app's exact directory read (readGroupDirectory in src/data/groups.ts). */
async function appDirectoryRead(request: APIRequestContext): Promise<{ group_id: string }[]> {
  const res = await request.get(`${API_BASE}/v3/groups/directory?limit=50&offset=0`);
  expect(res.ok(), `directory read failed (${res.status})`).toBeTruthy();
  const data = (await res.json()) as { groups: { group_id: string }[] };
  return data.groups;
}

/** The app's exact detail read (readGroupDetail in src/data/groups.ts). */
async function appDetailRead(request: APIRequestContext, token: string | null, groupId: string) {
  const params = new URLSearchParams({ group_id: groupId });
  if (token) params.set('token', token);
  return request.get(`${API_BASE}/v3/groups/detail?${params.toString()}`);
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

// ---------------------------------------------------------------------------
// API floor — the directory + detail reads + join/leave + I3 (fast, no browser).
// ---------------------------------------------------------------------------

test.describe('social-groups-directory — API floor (D53 directory + detail)', () => {
  test('directory lists discoverable groups and excludes non-discoverable ones', async ({ request }) => {
    const owner = await signupAndLogin(request, 'sgdo');
    await addAppContract(request, owner.token);

    const listedId = await createGroup(request, owner.token, owner.username, 'listed-community', { discoverable: true });
    const hiddenId = await createGroup(request, owner.token, owner.username, 'hidden-community', { discoverable: false });

    const dir = await appDirectoryRead(request);
    const ids = dir.map((g) => g.group_id);
    expect(ids).toContain(listedId);
    expect(ids).not.toContain(hiddenId);
  });

  test('detail is reachable for an existing group (even non-discoverable); only a ghost 404s', async ({ request }) => {
    const owner = await signupAndLogin(request, 'sgdd');
    await addAppContract(request, owner.token);
    const hiddenId = await createGroup(request, owner.token, owner.username, 'detail-hidden', { discoverable: false });

    // A non-discoverable group is still reachable by ID (unlisted-model).
    const ok = await appDetailRead(request, owner.token, hiddenId);
    expect(ok.status()).toBe(200);

    // Only a non-existent group 404s.
    const ghost = await appDetailRead(request, owner.token, `${PROVIDER}/groups/users/${owner.username}/does-not-exist`);
    expect(ghost.status()).toBe(404);
  });

  test('I3: a non-member detail read returns NO posts; a member read returns them', async ({ request }) => {
    const owner = await signupAndLogin(request, 'sgd1');
    const stranger = await signupAndLogin(request, 'sgd2');
    await addAppContract(request, owner.token);
    await addAppContract(request, stranger.token);

    const groupId = await createGroup(request, owner.token, owner.username, 'i3-community', { discoverable: true });
    const postText = `sgd i3 post ${Date.now()}`;
    await postToGroup(request, owner.token, groupId, postText);

    // The stranger is not a member — metadata yes, posts no (I3 holds).
    const strangerRes = await appDetailRead(request, stranger.token, groupId);
    expect(strangerRes.status()).toBe(200);
    const strangerDetail = (await strangerRes.json()) as { is_member: boolean; posts_state: string; posts: unknown[] };
    expect(strangerDetail.is_member).toBe(false);
    expect(strangerDetail.posts_state).toBe('join_to_view');
    expect(strangerDetail.posts).toEqual([]);

    // The owner (a member) sees the post.
    const ownerRes = await appDetailRead(request, owner.token, groupId);
    const ownerDetail = (await ownerRes.json()) as { is_member: boolean; posts: { body: { text?: string } }[] };
    expect(ownerDetail.is_member).toBe(true);
    expect(ownerDetail.posts.map((d) => d.body.text)).toContain(postText);
  });

  test('join (open) → member; leave → no longer a member', async ({ request }) => {
    const owner = await signupAndLogin(request, 'sgj1');
    const joiner = await signupAndLogin(request, 'sgj2');
    await addAppContract(request, owner.token);
    await addAppContract(request, joiner.token);

    const groupId = await createGroup(request, owner.token, owner.username, 'joinable', { joinPolicy: 'open', discoverable: true });

    const joinRes = await v3Post(request, `${API_BASE}/v3/groups/join`, { token: joiner.token, group_id: groupId });
    expect(joinRes.ok(), `join failed (${joinRes.status})`).toBeTruthy();

    const afterJoin = (await (await appDetailRead(request, joiner.token, groupId)).json()) as { is_member: boolean };
    expect(afterJoin.is_member).toBe(true);

    const leaveRes = await v3Post(request, `${API_BASE}/v3/groups/leave`, { token: joiner.token, group_id: groupId });
    expect(leaveRes.ok(), `leave failed (${leaveRes.status})`).toBeTruthy();

    const afterLeave = (await (await appDetailRead(request, joiner.token, groupId)).json()) as { is_member: boolean };
    expect(afterLeave.is_member).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real /groups screen: Discover → join → My Groups →
// detail deep link. (Runs on the CI e2e stack, which builds the PR branch.)
// ---------------------------------------------------------------------------

test.describe('social-groups-directory gauntlet — the /groups screen', () => {
  test('Discover → join an open group → it appears in My Groups → detail deep link', async ({ page, context, request }) => {
    test.setTimeout(60_000);
    const logs = captureConsoleLogs(page, '[social:groups]');

    // Viewer (pre-authed via the token cookie — no login popup).
    const viewer = await signupAndLogin(request, 'sggu');
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addAppContract(request, viewer.token);

    // Owner sets up a discoverable open group via API (the "other user").
    // The slug is UNIQUE per run: the directory is a shared node, so a fixed
    // slug would accumulate one card per run/retry and break the strict-mode
    // `hasText` filter (the name falls back to the slug — no identity write yet).
    const owner = await signupAndLogin(request, 'sggo');
    await addAppContract(request, owner.token);
    const slug = uniqueUser('gauntlet');
    const groupId = await createGroup(request, owner.token, owner.username, slug, { joinPolicy: 'open', discoverable: true });

    // --- Viewer opens /groups (defaults to the My Groups tab) ---
    await page.goto(`${SOCIAL_BASE}/groups`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="groups-tab-my"]')).toHaveAttribute('aria-selected', 'true');

    // --- Switch to the Discover tab (deep-linkable ?tab=discover) ---
    await page.click('[data-testid="groups-tab-discover"]');
    await expect(page.locator('[data-testid="groups-discover-grid"]')).toBeVisible();

    // The owner's discoverable group is in the directory.
    const card = page.locator('[data-testid="groups-discover-card"]').filter({ hasText: slug });
    await expect(card).toBeVisible();

    // --- Join through the app (the real button) ---
    await card.locator('[data-testid="groups-join-button"]').click();
    await expect(card.locator('[data-testid="groups-join-button"]')).toContainText('Joined', { timeout: 10000 });

    // --- It now appears in My Groups ---
    await page.click('[data-testid="groups-tab-my"]');
    await expect(page.locator('[data-testid="groups-my-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="groups-my-row"]').filter({ hasText: slug })).toBeVisible();

    // --- The group detail deep link renders (URL holds the state) ---
    await page.goto(`${SOCIAL_BASE}/groups/${encodeURIComponent(groupId)}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="group-detail-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="group-detail-name"]')).toContainText(slug);
    // A member sees the Leave button (not Join).
    await expect(page.locator('[data-testid="group-detail-leave"]')).toBeVisible();

    // --- Verify console logs (the real flow, in order) ---
    // `getMyCommunityGroups —` logs on mount AND again after the join (the
    // reload), so assert on the LAST occurrence — the post-join one.
    const dirIdx = logs.findIndex((l) => l.includes('loadDirectory — got'));
    const joinIdx = logs.findIndex((l) => l.includes('join —') && l.includes(groupId));
    let myIdx = -1;
    logs.forEach((l, i) => { if (l.includes('getMyCommunityGroups —')) myIdx = i; });
    expect(dirIdx, 'missing directory log').toBeGreaterThanOrEqual(0);
    expect(joinIdx, 'missing join log').toBeGreaterThanOrEqual(0);
    expect(myIdx, 'missing my-groups log').toBeGreaterThanOrEqual(0);
    expect(dirIdx).toBeLessThan(joinIdx);
    expect(joinIdx).toBeLessThan(myIdx);

    // No errors in the app's console.
    const errors = logs.filter((l) => l.includes('failed:'));
    expect(errors).toEqual([]);
  });
});
