import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { API_BASE, v3Login, v3Signup } from '../v3-helpers';

/**
 * Ads — the end-to-end gauntlet for the creator-owned ad layer (D55, the v3
 * `pinned` | `none` model). The read serves a pinned post WITH its ad inline
 * (I3-checked, 3.27.4); the Studio's Ads tab creates the ads/albums (3.28.0);
 * the composer's pin control + the ad block render it (3.29.0).
 *
 * The API floor pins the data model + the read's ad-serving, fast +
 * deterministic (no browser): create an ad (a `posts` doc tagged `ad` with the
 * leaf-typed `offer` + `status`), pin it to a post (the post's `ad_preference`
 * column), and the feed read returns the post with the ad inline. The I3
 * anti-test proves a non-follower never gets the ad (the ad rides the reader's
 * access, not just the post's). Unpin (ad_preference → none) removes it. An ad
 * tagged into two albums carries both `album:<id>` tags (the client-side split
 * shows it under both).
 *
 * The browser gauntlet drives the real web10-social surfaces (pre-authed via
 * the token cookie): the creator composes a post, pins an ad via the composer's
 * pin control, and posts → the FOLLOWER's feed renders the post with the ad
 * block (creative + offer + disclosure, the disclosure always shown).
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
const DISCOVER_GROUP_ID = 'web10.app/groups/web10/discover';
const SERVICE = 'posts';

// Chromium ignores /etc/hosts (it queries the container's DNS, which answers
// *.localhost with 127.0.0.1 — the playwright container's own loopback).
// The vhosts are mapped in /etc/hosts by the runner (scripts/run-e2e.sh), so
// resolve the proxy IP from there and pin it with --host-resolver-rules.
// On the CI runner (no container) getent returns 127.0.0.1, which is correct
// there too; when unresolvable the args stay empty (unchanged behavior).
function vhostResolverArgs(): string[] {
  try {
    const out = execSync('getent hosts api.localhost', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const ip = out.split(/\s+/)[0];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return [];
    const hosts = ['api', 'auth', 'sdk', 'marketing', 'social', 'marketing-api'];
    return [`--host-resolver-rules=${hosts.map((h) => `MAP ${h}.localhost ${ip}`).join(', ')}`];
  } catch {
    return [];
  }
}

test.use({
  launchOptions: { args: vhostResolverArgs() },
});

const password = 'TestPass123!';
const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// The app's followers-group roles (src/data/groups.ts FOLLOWER_ROLES).
const FOLLOWER_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE], permissions: ['readAll'] },
];

// The app contract the SOCIAL origin needs for the feed + composer surface.
const SOCIAL_CONTRACT_PERMISSIONS: Record<string, string[]> = {
  posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  profile: ['readAll', 'create', 'updateOwn'],
  settings: ['readAll', 'create', 'updateOwn'],
  reactions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  media: ['readAll'],
  public_media: ['readAll'],
};

// ── leaf-typed offer (D55) ──────────────────────────────────────────────────
const leaf = (v: string) => ({ type: 'text', value: v });
function makeOffer(over: Partial<Record<'kind' | 'partner' | 'link' | 'cta' | 'disclosure', string>> = {}) {
  return {
    kind: leaf(over.kind || 'affiliate'),
    partner: leaf(over.partner || 'Amazon'),
    link: leaf(over.link || 'https://amzn.to/abc?tag=test-20'),
    cta: leaf(over.cta || 'Get it'),
    disclosure: leaf(over.disclosure || 'I may earn a commission.'),
  };
}

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
  expect(res.ok(), `app-contracts/add failed (${res.status()})`).toBeTruthy();
}

async function createFollowersGroupViaApi(request: APIRequestContext, token: string, creator: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token, name: 'followers', join_policy: 'open', roles: FOLLOWER_ROLES,
      members: [{ member_key: creator, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create followers group failed (${res.status()})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

async function joinGroup(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/groups/join`, {
    data: JSON.stringify({ token, group_id: groupId }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `join ${groupId} failed (${res.status()})`).toBeTruthy();
}

/** Create a doc in a group (a post, an ad, or an album — the tags/body decide). */
async function createDoc(
  request: APIRequestContext, token: string, groupId: string, body: Record<string, unknown>,
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: SERVICE, body, groups: [groupId] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `create doc failed (${res.status()})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Create an ad (a `posts` doc tagged `ad`, the leaf-typed offer + status). */
async function createAd(
  request: APIRequestContext, token: string, groupId: string, text: string,
  offer: Record<string, unknown>, albumIds: string[] = [], status: 'active' | 'paused' = 'active',
): Promise<string> {
  return createDoc(request, token, groupId, {
    text,
    tags: ['ad', ...albumIds.map((id) => `album:${id}`)],
    offer,
    status,
  });
}

/** Create an ad album (a `posts` doc tagged `ad_album`, name in the body). */
async function createAlbum(request: APIRequestContext, token: string, groupId: string, name: string): Promise<string> {
  return createDoc(request, token, groupId, { name, tags: ['ad_album'] });
}

/** Pin an ad to a post (set the post's ad_preference to pinned + the ad's id). */
async function pinAdToPost(request: APIRequestContext, token: string, postDocId: string, adDocId: string) {
  const res = await request.post(`${API_BASE}/v3/update`, {
    data: JSON.stringify({ token, doc_id: postDocId, body: {}, ad_preference: { mode: 'pinned', target: adDocId } }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `pin ad failed (${res.status()})`).toBeTruthy();
}

/** Unpin the ad from a post (set the post's ad_preference to none). */
async function unpinAdFromPost(request: APIRequestContext, token: string, postDocId: string) {
  const res = await request.post(`${API_BASE}/v3/update`, {
    data: JSON.stringify({ token, doc_id: postDocId, body: {}, ad_preference: { mode: 'none' } }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `unpin ad failed (${res.status()})`).toBeTruthy();
}

/** Read a group's posts WITH the inline ad field (the read serves doc.ad). */
async function readGroupWithAds(
  request: APIRequestContext, token: string, groupId: string, limit = 50,
): Promise<{ doc_id: string; text: string; ad_mode?: string; ad_target?: string; ad?: { doc_id: string; body: Record<string, unknown>; tags: string[] } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [groupId], limit }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `read ${groupId} failed (${res.status()})`).toBeTruthy();
  const docs = await res.json();
  return docs.map((d: any) => ({
    doc_id: d.doc_id,
    text: d.body?.text || '',
    ad_mode: d.ad_mode,
    ad_target: d.ad_target,
    ad: d.ad,
  }));
}

/** Find a post by text in a group's read (polls for ClickHouse eventual consistency). */
async function findPostByText(
  request: APIRequestContext, token: string, groupId: string, text: string, timeout = 15000,
): Promise<{ doc_id: string; text: string; ad_mode?: string; ad_target?: string; ad?: any }> {
  let found: any;
  await expect(async () => {
    const docs = await readGroupWithAds(request, token, groupId);
    found = docs.find((d) => d.text === text);
    expect(found, `post "${text}" not in ${groupId}`).toBeTruthy();
  }).toPass({ timeout });
  return found;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// API floor — the ad object + the read's ad-serving (fast, no browser)
// ---------------------------------------------------------------------------

test.describe('Ads — API floor (the ad object + the read serves doc.ad)', () => {
  test('create an ad, pin it to a post, the feed read returns the post with the ad inline', async ({ request }) => {
    const creator = await signupAndLogin(request, 'adc1');
    const viewer = await signupAndLogin(request, 'adv1');
    for (const u of [creator, viewer]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }

    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    const adDocId = await createAd(request, creator.token, f, 'Everything I use, linked.', makeOffer());
    const postDocId = await createDoc(request, creator.token, f, { text: 'my pinned post', tags: [] });
    await pinAdToPost(request, creator.token, postDocId, adDocId);
    await joinGroup(request, viewer.token, f);

    // The follower's feed read of the followers group returns the post WITH the
    // ad inline (doc.ad) — the offer + disclosure present.
    const post = await findPostByText(request, viewer.token, f, 'my pinned post');
    expect(post.ad_mode).toBe('pinned');
    expect(post.ad_target).toBe(adDocId);
    expect(post.ad, 'the read should serve the pinned ad inline').toBeTruthy();
    expect(post.ad.doc_id).toBe(adDocId);
    expect(post.ad.body.offer.link.value).toBe('https://amzn.to/abc?tag=test-20');
    expect(post.ad.body.offer.disclosure.value).toBe('I may earn a commission.');
    expect(post.ad.body.status).toBe('active');
  });

  test('I3: a non-follower never gets the ad (the ad rides the reader\'s access)', async ({ request }) => {
    const creator = await signupAndLogin(request, 'adi1');
    const follower = await signupAndLogin(request, 'adi2');
    const stranger = await signupAndLogin(request, 'adi3');
    for (const u of [creator, follower, stranger]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }

    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    // The ad lives in the creator's followers group. The post is on the shared
    // discover board (public) so BOTH the follower and the stranger can read it
    // — the only difference is the ad's group membership.
    const adDocId = await createAd(request, creator.token, f, 'Sponsored setup.', makeOffer({ partner: 'Acme' }));
    const postDocId = await createDoc(request, creator.token, DISCOVER_GROUP_ID, { text: 'discover pinned post', tags: [] });
    await pinAdToPost(request, creator.token, postDocId, adDocId);
    await joinGroup(request, follower.token, f);
    // stranger is in discover (auto) but NOT in the creator's followers group.

    // The follower (in the ad's group) gets the post WITH the ad.
    const followerPost = await findPostByText(request, follower.token, DISCOVER_GROUP_ID, 'discover pinned post');
    expect(followerPost.ad, 'follower should get the ad (in the ad\'s group)').toBeTruthy();
    expect(followerPost.ad.doc_id).toBe(adDocId);

    // The stranger (NOT in the ad's group) gets the post but NO ad (I3).
    const strangerPost = await findPostByText(request, stranger.token, DISCOVER_GROUP_ID, 'discover pinned post');
    expect(strangerPost.ad, 'stranger must NOT get the ad (I3)').toBeUndefined();
  });

  test('unpin (ad_preference → none) removes the ad from the read', async ({ request }) => {
    const creator = await signupAndLogin(request, 'adu1');
    const viewer = await signupAndLogin(request, 'adu2');
    for (const u of [creator, viewer]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }

    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    const adDocId = await createAd(request, creator.token, f, 'A pinned ad.', makeOffer());
    const postDocId = await createDoc(request, creator.token, f, { text: 'unpin me', tags: [] });
    await pinAdToPost(request, creator.token, postDocId, adDocId);
    await joinGroup(request, viewer.token, f);

    // Pinned: the read serves the ad.
    let post = await findPostByText(request, viewer.token, f, 'unpin me');
    expect(post.ad, 'pinned post should serve the ad').toBeTruthy();

    // Unpin: the read no longer serves the ad.
    await unpinAdFromPost(request, creator.token, postDocId);
    await expect(async () => {
      post = await findPostByText(request, viewer.token, f, 'unpin me');
      expect(post.ad, 'unpinned post should NOT serve the ad').toBeUndefined();
      expect(post.ad_mode).toBe('none');
    }).toPass({ timeout: 15000 });
  });

  test('an ad in two albums carries both album tags (the client split shows it under both)', async ({ request }) => {
    const creator = await signupAndLogin(request, 'ada2');
    await addAppContract(request, creator.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);

    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    const album1 = await createAlbum(request, creator.token, f, 'Summer 2026');
    const album2 = await createAlbum(request, creator.token, f, 'Fall 2026');
    // The ad is tagged into BOTH albums (the tag-like ad→album link).
    const adDocId = await createAd(request, creator.token, f, 'In two albums.', makeOffer(), [album1, album2]);

    // The creator's catalog read (their posts) returns the ad with both album
    // tags + both album docs — the client-side split (readMyAds) puts the ad
    // under both albums.
    const docs = await readGroupWithAds(request, creator.token, f);
    const ad = docs.find((d) => d.doc_id === adDocId);
    expect(ad, 'the ad should be in the catalog read').toBeTruthy();
    // readGroupWithAds doesn't surface tags; re-read the raw doc for the tags.
    const rawRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: creator.token, service: SERVICE, groups: [f], limit: 50 }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
    const rawDocs: any[] = await rawRes.json();
    const rawAd = rawDocs.find((d) => d.doc_id === adDocId);
    expect(rawAd.tags).toContain('album:' + album1);
    expect(rawAd.tags).toContain('album:' + album2);
    // Both album docs exist in the catalog (the split's other side).
    const albumDocs = rawDocs.filter((d) => (d.tags || []).includes('ad_album'));
    expect(albumDocs.map((d) => d.doc_id).sort()).toEqual([album1, album2].sort());
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real composer pin + ad block render (pre-authed)
// ---------------------------------------------------------------------------

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

async function expectFeedShowsPost(page: Page, text: string, timeout = 20000) {
  await expect(async () => {
    const texts = await page.locator('[data-testid="post-card"]').allTextContents();
    expect(texts.some((t) => t.includes(text))).toBeTruthy();
  }).toPass({ timeout });
}

test.describe('Ads gauntlet — composer pin → follower sees the ad block', () => {
  test('creator pins an ad to a new post; the follower\'s feed renders the ad block + disclosure', async ({ browser, request }) => {
    // Setup (API): a creator with a followers group + an ad; a viewer who
    // follows them (so the follower's feed has the creator's posts).
    const creator = await signupAndLogin(request, 'adg1');
    const viewer = await signupAndLogin(request, 'adg2');
    for (const u of [creator, viewer]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }
    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    const adText = 'Everything I use, linked.';
    const adDocId = await createAd(request, creator.token, f, adText, makeOffer());
    await joinGroup(request, viewer.token, f);

    // Two pre-authed contexts (token cookies on social.localhost +
    // auth.localhost) — creator composes, viewer reads.
    const contextC = await browser.newContext();
    const contextV = await browser.newContext();
    await setTokenCookie(contextC, 'social.localhost', creator.token);
    await setTokenCookie(contextC, 'auth.localhost', creator.token);
    await setTokenCookie(contextV, 'social.localhost', viewer.token);
    await setTokenCookie(contextV, 'auth.localhost', viewer.token);
    const pageC = await contextC.newPage();
    const pageV = await contextV.newPage();

    const logsC = captureConsoleLogs(pageC, '[social-feed]');
    const pageErrorsC: string[] = [];
    pageC.on('pageerror', (e) => pageErrorsC.push(e.message));
    const pageErrorsV: string[] = [];
    pageV.on('pageerror', (e) => pageErrorsV.push(e.message));

    // --- The creator composes a post, pins the ad, and posts ---
    await pageC.goto(`${SOCIAL_BASE}/feed`);
    await pageC.waitForLoadState('networkidle');
    await expect(pageC.locator('[data-testid="post-composer"]')).toBeVisible();

    const myPost = `pinned ad post ${Date.now()}`;
    await pageC.locator('[data-testid="post-composer"] textarea').fill(myPost);

    // Open the pin picker → it lists the creator's ad (the catalog read).
    await pageC.locator('[data-testid="pin-ad-button"]').click();
    await expect(pageC.locator('[data-testid="ad-picker"]')).toBeVisible();
    await expect(pageC.locator(`[data-testid="ad-picker-item-${adDocId}"]`)).toBeVisible();

    // Select the ad → the pinned-ad chip appears in the composer.
    await pageC.locator(`[data-testid="ad-picker-item-${adDocId}"]`).click();
    await expect(pageC.locator('[data-testid="pinned-ad-chip"]')).toBeVisible();

    // Post → the composer succeeds (no error) and the create carries the
    // ad_preference (the [social-feed] createPost log shows it).
    await pageC.locator('[data-testid="post-submit"]').click();
    await expect(pageC.locator('[data-testid="composer-error"]')).toHaveCount(0);
    await expectFeedShowsPost(pageC, myPost);

    // The creator's OWN feed renders the ad block under the post (the read
    // serves doc.ad inline; the ad block renders the creative + offer +
    // disclosure).
    await expect(pageC.locator('[data-testid="ad-block"]')).toBeVisible({ timeout: 20000 });
    await expect(pageC.locator('[data-testid="ad-disclosure"]')).toBeVisible();
    await expect(pageC.locator('[data-testid="ad-cta"]')).toBeVisible();

    // --- The FOLLOWER's feed renders the same post with the ad block ---
    await pageV.goto(`${SOCIAL_BASE}/feed`);
    await pageV.waitForLoadState('networkidle');
    await expectFeedShowsPost(pageV, myPost);
    await expect(pageV.locator('[data-testid="ad-block"]')).toBeVisible({ timeout: 20000 });
    // The disclosure is always shown (part of the object, not a UI option).
    await expect(pageV.locator('[data-testid="ad-disclosure"]')).toHaveText('I may earn a commission.');
    await expect(pageV.locator('[data-testid="ad-cta"]')).toBeVisible();

    // --- The create carried the ad_preference (the [social-feed] log) ---
    const createLog = logsC.find((l) => l.includes('createPost — visibility'));
    expect(createLog, 'expected a [social-feed] createPost log').toBeTruthy();
    expect(createLog).toContain('ad_preference');
    expect(createLog).toContain(adDocId);

    // No page errors on either surface.
    expect(pageErrorsC, 'creator pageerrors').toEqual([]);
    expect(pageErrorsV, 'viewer pageerrors').toEqual([]);

    await contextC.close();
    await contextV.close();
  });
});
