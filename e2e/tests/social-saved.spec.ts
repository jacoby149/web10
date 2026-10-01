import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Saved collections (D88) — the e2e gauntlet (the last of the five bites).
 *
 * A saved collection is a GROUP the app creates for the user (kind:'saved' face,
 * the `web10-social-saved` tag); a saved post is a doc in the app-named `saved`
 * service that ref_value's the target post's doc_id (a pointer, not a copy).
 * Private by default (owner row only → a non-owner's content read 403s, I3);
 * public = the `anyone` reader row (the D58 publicness-is-a-role-grant idiom).
 *
 * The API floor pins the app's exact read/write pattern (what src/data/saved.ts
 * sends) + the I3 anti-test (a non-owner cannot read a PRIVATE collection's
 * contents; a non-owner CAN read a PUBLIC one) + the dead-ref degrade (a saved
 * doc is a pointer — the ref_value is stored, and resolving a missing post
 * degrades, never a hard fail).
 *
 * The browser gauntlet drives the real app through the app contract (Origin:
 * social.localhost — the contract gate applies): the owner saves a post into a
 * NEW collection via the "Save to…" sheet → it appears on the profile's Saved
 * tab → the owner opens the collection → flips it public → a SECOND account
 * opens it read-only. This is the first thing to exercise the `saved` service
 * through the app-contract gate (the unit tests mocked the data layer, so they
 * never hit it) — if `saved` is missing from the app's contract, the save 403s.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const DISCOVER_GROUP_ID = `${PROVIDER}/groups/web10/discover`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// The app's contract services (src/interfaces/auth.ts SOCIAL_SERVICES) — the
// origin that makes the API calls is granted these. `saved` (the
// saved-collection store, D88) MUST be here: the API does strict per-service
// matching, so a save without it 403s at the app-contract gate.
const SOCIAL_SERVICES = [
  'posts', 'media', 'public_media', 'profile', 'settings', 'comments',
  'reactions', 'contacts', 'staging_posts', 'web10-social-group-identity',
  'notifications', 'saved',
];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

// The collection's role set (src/data/saved.ts SAVED_ROLES) — the D58 shape
// {name, permissions: {service: [ops]}}. `owner` has full control; `reader` is
// the reserved read-grant role granted to the `anyone` principal when public.
const SAVED_ROLES = [
  {
    name: 'owner',
    permissions: {
      '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'],
      group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
    },
  },
  { name: 'reader', permissions: { saved: ['readAll'], 'web10-social-group-identity': ['readAll'] } },
];
const SAVED_TAG = 'web10-social-saved';

// The deterministic collection group_id (the API derives it from the name
// `saved-{slug}` + the token's creator): {provider}/groups/users/{owner}/saved-{slug}.
const collectionGroupId = (owner: string, slug: string) => `${PROVIDER}/groups/users/${owner}/saved-${slug}`;

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  let signupOk = false;
  for (let attempt = 0; attempt < 5 && !signupOk; attempt++) {
    const signupRes = await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (signupRes.ok()) signupOk = true;
    else await new Promise((r) => setTimeout(r, 500));
  }
  expect(signupOk, `signup failed for ${username}`).toBeTruthy();
  let token = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok()) { token = (await res.json()).token as string; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(token, `login failed after retries for ${username}`).toBeTruthy();
  return { username, token };
}

/** Add the social app contract (the app's full service set, incl. `saved`). */
async function addSocialAppContract(request: APIRequestContext, token: string) {
  const permissions: Record<string, string[]> = {};
  for (const s of SOCIAL_SERVICES) permissions[s] = [...SOCIAL_OPERATIONS];
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: SOCIAL_ORIGIN, permissions }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `add app contract failed (${res.status})`).toBeTruthy();
}

/** Create the owner's followers group (so the owner has a non-discover group to post into). */
async function createFollowersGroup(request: APIRequestContext, token: string, username: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name: 'followers',
      join_policy: 'open',
      roles: [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
        { name: 'member', services: ['posts'], permissions: ['readAll'] },
      ],
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create followers group failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

/**
 * Create a saved collection the way the app does (src/data/saved.ts
 * createCollection): createGroup(`saved-{slug}`, invite_only, SAVED_ROLES,
 * [owner], {discoverable:false, tags:[SAVED_TAG]}) + the kind:'saved' face +
 * (when public) the `anyone` reader row. Returns the group_id.
 */
async function createCollection(
  request: APIRequestContext, token: string, owner: string, slug: string,
  opts: { public?: boolean } = {},
): Promise<string> {
  const members: { member_key: string; role: string }[] = [{ member_key: owner, role: 'owner' }];
  if (opts.public) members.push({ member_key: 'anyone', role: 'reader' });
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name: `saved-${slug}`,
      join_policy: 'invite_only',
      roles: SAVED_ROLES,
      members,
      discoverable: false,
      tags: [SAVED_TAG],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create collection group failed (${res.status})`).toBeTruthy();
  const groupId = (await res.json()).group_id as string;
  expect(groupId).toBe(collectionGroupId(owner, slug));
  // The kind:'saved' face (the identity doc — the source of truth for the kind).
  await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token, service: 'web10-social-group-identity',
      body: { kind: 'saved', name: slug, visibility: opts.public ? 'public' : 'private' },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  return groupId;
}

/** Create a post (the owner's followers group + discover, so it's in the feed). */
async function createPost(request: APIRequestContext, token: string, text: string, groups: string[]): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: 'posts', body: { text, date: new Date().toISOString() }, groups }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create post failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Save a post into a collection (the app's exact write: a `saved` doc ref_value'ing the post). */
async function savePostToCollection(request: APIRequestContext, token: string, groupId: string, postId: string) {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: 'saved', body: { post_id: postId }, groups: [groupId], ref_value: postId }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `save post to collection failed (${res.status})`).toBeTruthy();
}

/** The app's exact collection read (src/data/saved.ts readCollection → the saved docs). */
async function readSavedDocs(request: APIRequestContext, token: string, groupId: string): Promise<any[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'saved', groups: [groupId] }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `read collection failed (${res.status})`).toBeTruthy();
  return (await res.json()) as any[];
}

/** A raw read that may 403 (the I3 anti-test) — returns the status + body. */
async function rawReadSaved(request: APIRequestContext, token: string, groupId: string): Promise<{ status: number; docs: any[] }> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'saved', groups: [groupId] }),
    headers: { 'Content-Type': 'application/json' },
  });
  const docs = res.ok() ? (await res.json()) as any[] : [];
  return { status: res.status(), docs };
}

/** Add the `anyone` reader row (flip public) — the D58 role-grant. */
async function addAnyoneReader(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/groups/members/add`, {
    data: JSON.stringify({ token, group_id: groupId, member_key: 'anyone', role: 'reader' }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `add anyone reader failed (${res.status})`).toBeTruthy();
}

const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

async function pollUntil<T>(fn: () => Promise<T>, pred: (v: T) => boolean, timeoutMs = 15000, intervalMs = 500): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  for (;;) {
    last = await fn();
    if (pred(last)) return last;
    if (Date.now() > deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([{ name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false }]);
}

function captureConsoleLogs(page: Page, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => { const t = msg.text(); if (t.includes(prefix)) logs.push(t); });
  return logs;
}

// ---------------------------------------------------------------------------
// API floor — the app's exact read/write pattern + the I3 anti-test (no browser)
// ---------------------------------------------------------------------------

test.describe('Saved collections — API floor (the app\'s exact reads/writes)', () => {
  test('create → save → read round-trip (the owner)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'svdapi');
    const groupId = await createCollection(request, owner.token, owner.username, 'roundtrip');
    const postText = `roundtrip post ${Date.now()}`;
    const postId = await createPost(request, owner.token, postText, [DISCOVER_GROUP_ID]);

    await savePostToCollection(request, owner.token, groupId, postId);

    // The app's exact collection read returns the saved doc, ref_value'd to the post.
    // (Poll with a non-throwing read — the owner's membership row can settle a
    // beat after the group create under ClickHouse's eventual consistency.)
    const docs = await pollUntil(
      () => rawReadSaved(request, owner.token, groupId).then((r) => r.docs),
      (d) => d.length >= 1,
    );
    expect(docs.length).toBe(1);
    expect(docs[0].ref_value).toBe(postId);
    expect(docs[0].body.post_id).toBe(postId);
  });

  test('I3: a non-owner CANNOT read a PRIVATE collection\'s contents (403)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'svdpriv');
    const groupId = await createCollection(request, owner.token, owner.username, 'private'); // private (no anyone row)
    const postId = await createPost(request, owner.token, `private post ${Date.now()}`, [DISCOVER_GROUP_ID]);
    await savePostToCollection(request, owner.token, groupId, postId);

    // The owner (a member) reads fine.
    expect((await readSavedDocs(request, owner.token, groupId)).length).toBe(1);

    // A stranger (not a member, no anyone grant) → 403 (I3 holds).
    const stranger = await signupAndLogin(request, 'svdprivstr');
    const res = await rawReadSaved(request, stranger.token, groupId);
    expect(res.status).toBe(403);
    expect(res.docs).toHaveLength(0);
  });

  test('a non-owner CAN read a PUBLIC collection\'s contents (the anyone grant)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'svdpub');
    const groupId = await createCollection(request, owner.token, owner.username, 'public', { public: true });
    const postText = `public post ${Date.now()}`;
    const postId = await createPost(request, owner.token, postText, [DISCOVER_GROUP_ID]);
    await savePostToCollection(request, owner.token, groupId, postId);

    // A stranger (not a member) reads via the `anyone`→reader grant.
    const stranger = await signupAndLogin(request, 'svdpubstr');
    const res = await rawReadSaved(request, stranger.token, groupId);
    expect(res.status).toBe(200);
    expect(res.docs).toHaveLength(1);
    expect(res.docs[0].ref_value).toBe(postId);

    // A private collection flipped public (add the anyone row) becomes readable too.
    const privId = await createCollection(request, owner.token, owner.username, 'flip');
    const postId2 = await createPost(request, owner.token, `flip post ${Date.now()}`, [DISCOVER_GROUP_ID]);
    await savePostToCollection(request, owner.token, privId, postId2);
    expect((await rawReadSaved(request, stranger.token, privId)).status).toBe(403); // private first
    await addAnyoneReader(request, owner.token, privId); // flip public
    const after = await rawReadSaved(request, stranger.token, privId);
    expect(after.status).toBe(200);
    expect(after.docs.map((d) => d.ref_value)).toContain(postId2);
  });

  test('a dead ref degrades (the saved doc is a pointer; a missing post does not fail the read)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'svddead');
    const groupId = await createCollection(request, owner.token, owner.username, 'deadref');

    // A saved doc pointing at a post that doesn't exist (a deleted post's ref).
    const ghostPostId = `ghost-${Date.now()}`;
    await savePostToCollection(request, owner.token, groupId, ghostPostId);

    // The collection read succeeds (the saved doc is readable — it's a pointer).
    const docs = await pollUntil(
      () => rawReadSaved(request, owner.token, groupId).then((r) => r.docs),
      (d) => d.length >= 1,
    );
    expect(docs.length).toBe(1);
    expect(docs[0].ref_value).toBe(ghostPostId);

    // Resolving the ref (read-by-id the target post) degrades — the post is gone.
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: owner.token, service: 'posts', doc_id: ghostPostId }),
      headers: { 'Content-Type': 'application/json' },
    });
    // A missing post is not found (404) — the app degrades this to an
    // "unavailable" tile; the collection read itself never hard-fails.
    expect(readRes.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — save → Saved tab → open → flip public → second account
// ---------------------------------------------------------------------------

test.describe('Saved collections gauntlet — real flow through the app contract', () => {
  test('save a post → it appears on the Saved tab → open → flip public → a second account opens it', async ({ browser, request }) => {
    // The owner: signup + the app contract (Origin-gated) + a post to save.
    const owner = await signupAndLogin(request, 'svdgui');
    await addSocialAppContract(request, owner.token);
    const followersId = await createFollowersGroup(request, owner.token, owner.username);
    const postText = `save me ${Date.now()}`;
    const postId = await createPost(request, owner.token, postText, [followersId, DISCOVER_GROUP_ID]);

    // ── Owner context: save the post into a NEW collection via the sheet. ──
    const ownerCtx = await browser.newContext();
    const page = await ownerCtx.newPage();
    const logs = captureConsoleLogs(page, '[social');
    await setTokenCookie(ownerCtx, 'social.localhost', owner.token);
    await setTokenCookie(ownerCtx, 'auth.localhost', owner.token);
    await settle();

    // The following feed (the owner's non-discover groups' posts) shows the post.
    await page.goto(`${SOCIAL_BASE}/feed?tab=following`);
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="post-card"]', { hasText: postText }).first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // Open the post's kebab → "Save to…".
    await card.locator('[data-testid="post-options-button"]').click();
    await page.locator('[data-testid="post-option-save"]').click();
    await expect(page.locator('[data-testid="save-sheet"]')).toBeVisible({ timeout: 15000 });

    // New collection → name → Create (createCollection + savePostToCollection,
    // both through the app contract — the `saved` service must be granted).
    const colName = `My Playlist ${Date.now()}`;
    await page.locator('[data-testid="save-new-collection"]').click();
    await page.locator('[data-testid="save-new-collection-input"]').fill(colName);
    await page.locator('[data-testid="save-new-collection-create"]').click();

    // The save landed: the sheet shows the new collection checked. (Poll — the
    // CH read side can lag the write by a beat under load, and the owner's
    // membership row can settle a beat after the group create. Use a
    // non-throwing read so a transient 403 retries instead of failing.)
    const slug = colName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const groupId = collectionGroupId(owner.username, slug);
    await pollUntil(
      async () => (await rawReadSaved(request, owner.token, groupId)).docs,
      (docs) => docs.length >= 1,
    );
    await ownerCtx.close();

    // ── Owner context 2: the post appears on the Saved tab; open the collection. ──
    const ownerCtx2 = await browser.newContext();
    const page2 = await ownerCtx2.newPage();
    await setTokenCookie(ownerCtx2, 'social.localhost', owner.token);
    await setTokenCookie(ownerCtx2, 'auth.localhost', owner.token);
    await settle();

    await page2.goto(`${SOCIAL_BASE}/u/${owner.username}?tab=saved`);
    await page2.waitForLoadState('networkidle');
    // The collection card renders on the Saved tab.
    const savedCard = page2.locator('[data-testid="saved-collection-card"]', { hasText: colName }).first();
    await expect(savedCard).toBeVisible({ timeout: 15000 });

    // Open the collection (the deep-linkable route) — the saved post renders.
    await savedCard.click();
    await expect(page2).toHaveURL(/\/u\/[^/]+\/saved\//, { timeout: 15000 });
    await expect(page2.locator('[data-testid="saved-post-cell"]')).toBeVisible({ timeout: 15000 });

    // The owner sees the visibility toggle (private by default) → flip public.
    const visBtn = page2.locator('[data-testid="saved-collection-visibility"]');
    await expect(visBtn).toBeVisible();
    await expect(page2.getByText(/· Private/)).toBeVisible();
    await visBtn.click();
    // The flip landed: the `anyone` reader row is added (the D58 role-grant).
    await pollUntil(
      async () => {
        const res = await request.post(`${API_BASE}/v3/groups/members/list`, {
          data: JSON.stringify({ token: owner.token, group_id: groupId }),
          headers: { 'Content-Type': 'application/json' },
        });
        return ((await res.json()) as any[]).some((m) => m.member_key === 'anyone');
      },
      (has) => has,
    );
    await expect(page2.getByText(/· Public/)).toBeVisible();
    await ownerCtx2.close();

    // ── Second account: opens the now-public collection read-only. ──
    const viewer = await signupAndLogin(request, 'svdviewer');
    await addSocialAppContract(request, viewer.token);
    const viewerCtx = await browser.newContext();
    const page3 = await viewerCtx.newPage();
    await setTokenCookie(viewerCtx, 'social.localhost', viewer.token);
    await setTokenCookie(viewerCtx, 'auth.localhost', viewer.token);
    await settle();

    // Deep link straight to the collection (the URL is shareable — the "address
    // bar is part of the product" rule). The public collection's contents are
    // readable via the `anyone` grant; the viewer sees a READ-ONLY wall (no
    // owner affordances — no visibility toggle, no per-item remove).
    await page3.goto(`${SOCIAL_BASE}/u/${owner.username}/saved/${encodeURIComponent(groupId)}`);
    await page3.waitForLoadState('networkidle');
    await expect(page3.locator('[data-testid="saved-post-cell"]')).toBeVisible({ timeout: 15000 });
    expect(await page3.locator('[data-testid="saved-collection-visibility"]').count()).toBe(0);
    expect(await page3.locator('[data-testid="saved-post-remove"]').count()).toBe(0);

    // The app recognized the signed-in state (log sequence).
    const logStr = logs.join('\n');
    expect(logStr).toContain('isSignedIn');
  });
});
