import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Profiles surface — the social app's profile screen (own + another user's +
 * the post deep link).
 *
 * The profile is a document in the `profile` collection, attached to the
 * user's followers group (`{provider}/groups/users/{username}/followers` —
 * the API's created-group derivation, groups.py create_group). Reading it is
 * a group-scoped read: the reader must be a member of the followers group
 * (I3). Following a user = joining their followers group, so a follower can
 * read the profile + posts; a stranger (non-member) cannot.
 *
 * The API floor pins the app's exact read pattern (what src/data/profile.ts
 * + posts.ts + follows.ts actually send): the profile doc read, the posts
 * read, and the follower count — plus the I3 anti-test (a stranger's
 * non-public data is not readable). The browser gauntlet drives the real
 * app: pre-authed via the token cookie → own profile (edit persists across
 * reload) → another user's public profile (posts + follow UI) → the
 * /u/:username/p/:postId deep link lands on the post.
 *
 * The followers group is created through the public API (name "followers"),
 * which derives the ID the app computes — so the app's group-scoped reads
 * resolve to a real group the reader is a member of.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const DISCOVER_GROUP_ID = 'web10.app/groups/web10/discover';
const SOCIAL_ORIGIN = `http://social.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// The app's followers-group roles (src/data/groups.ts FOLLOWER_ROLES): the
// owner manages, the member (follower) reads posts.
const FOLLOWER_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: ['posts'], permissions: ['readAll'] },
];

// The social app's contract (src/interfaces/auth.ts SOCIAL_SERVICES +
// SOCIAL_OPERATIONS) — the origin that makes the API calls is granted these.
const SOCIAL_SERVICES = ['posts', 'media', 'public_media', 'profile', 'settings', 'comments', 'reactions', 'contacts', 'staging_posts'];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

// The app computes the followers group ID from the node provider (the token's
// provider) + the API's created-group shape. The spec must create the group so
// the derived ID matches exactly.
const followersGroupId = (username: string) => `${PROVIDER}/groups/users/${username}/followers`;

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  // The e2e ClickHouse (ReplacingMergeTree) is eventually consistent and the
  // shared multi-workspace stack can be transiently unhealthy (a signup insert
  // or the login's authenticate query can lose the merge race, or the node can
  // be mid-reconfigure). Retry both the signup and the login to ride it out —
  // the CI serial run is stable, but the local parallel/shared run needs this.
  let signupOk = false;
  for (let attempt = 0; attempt < 5 && !signupOk; attempt++) {
    const signupRes = await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (signupRes.ok()) {
      signupOk = true;
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  expect(signupOk, `signup failed for ${username}`).toBeTruthy();
  let token = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok()) {
      token = (await res.json()).token as string;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(token, `login failed after retries for ${username}`).toBeTruthy();
  return { username, token };
}

/**
 * Add the social app contract for a user so the app (Origin: social.localhost)
 * can CRUD the social services. No Origin header → the authenticator-origin
 * gate passes (direct API call).
 */
async function addSocialAppContract(request: APIRequestContext, token: string) {
  const permissions: Record<string, string[]> = {};
  for (const s of SOCIAL_SERVICES) permissions[s] = [...SOCIAL_OPERATIONS];
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: SOCIAL_ORIGIN, permissions }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `add app contract failed (${res.status})`).toBeTruthy();
}

/**
 * Create the user's followers group through the public API. name "followers"
 * → the API derives `{provider}/groups/users/{creator}/followers`, which is
 * exactly what the app's followersGroupId computes. The creator is the owner.
 */
async function createFollowersGroup(request: APIRequestContext, token: string, username: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name: 'followers',
      join_policy: 'open',
      roles: FOLLOWER_ROLES,
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create followers group failed (${res.status})`).toBeTruthy();
  const groupId = (await res.json()).group_id as string;
  expect(groupId).toBe(followersGroupId(username));
  return groupId;
}

async function joinGroup(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/groups/join`, {
    data: JSON.stringify({ token, group_id: groupId }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `join group failed (${res.status})`).toBeTruthy();
}

async function createDoc(
  request: APIRequestContext, token: string, service: string,
  body: Record<string, unknown>, groups: string[],
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service, body, groups }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create ${service} doc failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** The app's exact profile read (src/data/profile.ts readProfile/readUserProfile). */
async function readProfileDocs(request: APIRequestContext, token: string, username: string): Promise<any[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'profile', groups: [followersGroupId(username)] }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `read profile failed (${res.status})`).toBeTruthy();
  return (await res.json()) as any[];
}

/** The app's exact posts read for a user's followers group (posts.ts readUserPosts). */
async function readUserPosts(request: APIRequestContext, token: string, username: string): Promise<any[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'posts', groups: [followersGroupId(username)] }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `read posts failed (${res.status})`).toBeTruthy();
  return (await res.json()) as any[];
}

/** The app's exact follower count (follows.ts countFollowers → members/list). */
async function readFollowerCount(request: APIRequestContext, token: string, username: string): Promise<number> {
  const res = await request.post(`${API_BASE}/v3/groups/members/list`, {
    data: JSON.stringify({ token, group_id: followersGroupId(username) }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `read members failed (${res.status})`).toBeTruthy();
  const members = (await res.json()) as any[];
  return members.length;
}

/**
 * Let ClickHouse (ReplacingMergeTree) settle after a write. The e2e node is a
 * shared multi-workspace stack where the merge can lag behind the insert, so a
 * write (app-contract add, group create, doc create) may not be visible to the
 * very next read. A short settle avoids the read racing the merge. The CI
 * serial run is fast enough that this is a no-op there; it stabilizes the
 * shared local run.
 */
const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

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
// API floor — the app's exact read pattern, fast + deterministic (no browser)
// ---------------------------------------------------------------------------

test.describe('Profiles — API floor (the app\'s exact reads)', () => {
  test('profile doc read + posts read + follower count', async ({ request }) => {
    const owner = await signupAndLogin(request, 'profapi');
    const groupId = await createFollowersGroup(request, owner.token, owner.username);

    // The owner writes a profile doc + a post into their followers group.
    const bio = `api floor bio ${Date.now()}`;
    await createDoc(request, owner.token, 'profile',
      { display_name: 'Owner', bio, website: 'owner.example', location: 'Node City' },
      [groupId]);
    const postText = `api floor post ${Date.now()}`;
    await createDoc(request, owner.token, 'posts', { text: postText, date: new Date().toISOString() }, [groupId]);

    // The app's exact profile read returns the owner's profile doc.
    const profiles = await readProfileDocs(request, owner.token, owner.username);
    expect(profiles.length).toBe(1);
    expect(profiles[0].body.bio).toBe(bio);
    expect(profiles[0].body.display_name).toBe('Owner');

    // The app's exact posts read returns the owner's post.
    const posts = await readUserPosts(request, owner.token, owner.username);
    expect(posts.map((d) => d.body.text)).toContain(postText);

    // The follower count (members/list) reflects the owner (1 member so far).
    expect(await readFollowerCount(request, owner.token, owner.username)).toBe(1);

    // A follower joins → the count increments (the audience is the asset).
    const fan = await signupAndLogin(request, 'profapifan');
    await joinGroup(request, fan.token, groupId);
    expect(await readFollowerCount(request, owner.token, owner.username)).toBe(2);
  });

  test('I3: a stranger cannot read a non-member\'s profile or posts', async ({ request }) => {
    const owner = await signupAndLogin(request, 'profstr');
    const groupId = await createFollowersGroup(request, owner.token, owner.username);
    await createDoc(request, owner.token, 'profile', { display_name: 'Owner', bio: 'private to followers' }, [groupId]);
    await createDoc(request, owner.token, 'posts', { text: 'private post', date: new Date().toISOString() }, [groupId]);

    // A stranger is NOT a member of the followers group.
    const stranger = await signupAndLogin(request, 'profstranger');

    // Profile read → 403 (not a member of the requested group).
    const profileRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: stranger.token, service: 'profile', groups: [followersGroupId(owner.username)] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(profileRes.status()).toBe(403);

    // Posts read → 403 (I3 holds for the profile surface).
    const postsRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: stranger.token, service: 'posts', groups: [followersGroupId(owner.username)] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(postsRes.status()).toBe(403);

    // Follower count → 401 (the API maps a permission denial to CRUD/401).
    const membersRes = await request.post(`${API_BASE}/v3/groups/members/list`, {
      data: JSON.stringify({ token: stranger.token, group_id: followersGroupId(owner.username) }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(membersRes.status()).toBe(401);
  });

  test('a follower CAN read the profile + posts (membership grants access)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'profff');
    const groupId = await createFollowersGroup(request, owner.token, owner.username);
    const bio = `follower-readable bio ${Date.now()}`;
    await createDoc(request, owner.token, 'profile', { display_name: 'Owner', bio }, [groupId]);
    const postText = `follower-readable post ${Date.now()}`;
    await createDoc(request, owner.token, 'posts', { text: postText, date: new Date().toISOString() }, [groupId]);

    const fan = await signupAndLogin(request, 'proffffan');
    await joinGroup(request, fan.token, groupId);

    // The follower (a member) reads the profile + posts successfully.
    const profiles = await readProfileDocs(request, fan.token, owner.username);
    expect(profiles.map((d) => d.body.bio)).toContain(bio);
    const posts = await readUserPosts(request, fan.token, owner.username);
    expect(posts.map((d) => d.body.text)).toContain(postText);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real profile flow (pre-authed via the token cookie)
// ---------------------------------------------------------------------------

test.describe('Profiles gauntlet — real flow + log sequence', () => {
  test('own profile: edit the bio → persists across a reload', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[social]');

    const owner = await signupAndLogin(request, 'profown');
    await addSocialAppContract(request, owner.token);
    await createFollowersGroup(request, owner.token, owner.username);
    await setTokenCookie(context, 'social.localhost', owner.token);
    await setTokenCookie(context, 'auth.localhost', owner.token);
    await settle();

    // /profile redirects to /u/{username} (the owner's own profile).
    await page.goto(`${SOCIAL_BASE}/profile`);
    await page.waitForLoadState('networkidle');
    // Signed in via the cookie — the app mounted into the signed-in shell.
    await expect(page.locator('[data-testid="edit-profile-button"]')).toBeVisible({ timeout: 15000 });

    // Edit the bio.
    const bio = `my bio ${Date.now()}`;
    await page.locator('[data-testid="edit-profile-button"]').click();
    await page.getByPlaceholder('Bio').fill(bio);
    await page.locator('[data-testid="save-profile-button"]').click();

    // The bio renders after save.
    await expect(page.getByText(bio, { exact: false })).toBeVisible({ timeout: 15000 });

    // Return run: reload. The token cookie persists, the profile re-reads,
    // and the bio survives (the doc was written to the followers group).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(bio, { exact: false })).toBeVisible({ timeout: 15000 });

    // The app recognized the signed-in state from the cookie (log sequence).
    const logStr = logs.join('\n');
    expect(logStr).toContain('[social] app mount — isSignedIn: true');
    expect(logStr).toContain('[social] isSignedIn — token cookie present: true');
  });

  test('another user\'s public profile renders (posts + follow UI)', async ({ page, context, request }) => {
    const owner = await signupAndLogin(request, 'profpub');
    await addSocialAppContract(request, owner.token);
    const groupId = await createFollowersGroup(request, owner.token, owner.username);
    const bio = `public profile bio ${Date.now()}`;
    await createDoc(request, owner.token, 'profile', { display_name: 'Public Owner', bio }, [groupId]);
    const postText = `public profile post ${Date.now()}`;
    await createDoc(request, owner.token, 'posts', { text: postText, date: new Date().toISOString() }, [groupId, DISCOVER_GROUP_ID]);

    // The viewer follows the owner (joins the followers group) → can read.
    const viewer = await signupAndLogin(request, 'profpubviewer');
    await addSocialAppContract(request, viewer.token);
    await joinGroup(request, viewer.token, groupId);
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await settle();

    await page.goto(`${SOCIAL_BASE}/u/${owner.username}`);
    await page.waitForLoadState('networkidle');

    // The profile renders: the display name + bio (from the profile doc).
    await expect(page.getByText('Public Owner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(bio, { exact: false })).toBeVisible();
    // The @handle (another user, not own).
    await expect(page.getByText(`@${owner.username}`)).toBeVisible();

    // The post renders (a post cell in the grid).
    await expect(page.locator('[data-testid="profile-post-cell"]')).toBeVisible({ timeout: 15000 });

    // The follow UI is present (the follow button — the groups surface owns
    // its state; here we pin that the profile exposes the follow control).
    await expect(page.locator('[data-testid="follow-button"]')).toBeVisible();
  });

  test('the /u/:username/p/:postId deep link lands on the post', async ({ page, context, request }) => {
    const owner = await signupAndLogin(request, 'profdeep');
    await addSocialAppContract(request, owner.token);
    const groupId = await createFollowersGroup(request, owner.token, owner.username);
    const postText = `deep link post ${Date.now()}`;
    const postId = await createDoc(request, owner.token, 'posts', { text: postText, date: new Date().toISOString() }, [groupId, DISCOVER_GROUP_ID]);

    const viewer = await signupAndLogin(request, 'profdeepviewer');
    await addSocialAppContract(request, viewer.token);
    await joinGroup(request, viewer.token, groupId);
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await settle();

    // Deep link straight to the post — the lightbox opens on the post.
    await page.goto(`${SOCIAL_BASE}/u/${owner.username}/p/${postId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(postText, { exact: false })).toBeVisible({ timeout: 15000 });
  });
});
