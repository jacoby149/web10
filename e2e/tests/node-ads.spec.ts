import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { API_BASE, v3Login, v3Signup } from '../v3-helpers';

/**
 * Node ads (D57) — the end-to-end gauntlet for the node operator's ad layer
 * (the second layer of the two-layer ad model). The read attaches active node
 * ads to posts at the operator's `node_ad_percentage` (deterministic per
 * (doc, reader), round-robin through active node ads). The response is a
 * THIRD JOIN: a post can carry BOTH `doc.ad` (the creator's pinned ad) AND
 * `doc.node_ad` (the node's ad) — neither suppresses the other (the non-steal
 * principle). A node ad is a `posts` doc on the discover group, tagged
 * `ad` + `node_ad`, authored by the node operator.
 *
 * The API floor pins the data model + the read's node-ad-serving, fast +
 * deterministic (no browser): the operator (the node admin) creates a node ad
 * on the discover group, sets the percentage, and a reader's feed read returns
 * a post WITH `doc.node_ad`. A pinned post returns BOTH `doc.ad` AND
 * `doc.node_ad`. Percentage 0 = no node ads; percentage 100 = every post gets
 * one.
 *
 * The browser gauntlet drives the real surfaces (pre-authed via the token
 * cookie): the operator creates a node ad via the Ad Inventory card (the
 * authenticator's Studio), and a follower's feed (web10-social) renders a post
 * with the "Sponsored" node ad block. A creator's pinned post shows BOTH the
 * creator's ad AND the node's ad.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
const DISCOVER_GROUP_ID = 'api.localhost/groups/web10/discover';
const SERVICE = 'posts';

// Chromium ignores /etc/hosts (it queries the container's DNS, which answers
// *.localhost with 127.0.0.1). The vhosts are mapped in /etc/hosts by the
// runner, so resolve the proxy IP from there and pin it with
// --host-resolver-rules. On the CI runner (no container) getent returns
// 127.0.0.1, which is correct there too.
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

// The app contract the SOCIAL origin needs for the feed surface.
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
    kind: leaf(over.kind || 'direct'),
    partner: leaf(over.partner || 'WorkflowCo'),
    link: leaf(over.link || 'https://workflowco.com?ref=node'),
    cta: leaf(over.cta || 'Learn more'),
    disclosure: leaf(over.disclosure || 'Sponsored'),
  };
}

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, password, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, password);
  return { username, token };
}

/** The node admin (global-setup's admin) — the operator. */
async function adminToken(request: APIRequestContext): Promise<string> {
  return v3Login(request, 'admin', 'admin123');
}

async function addAppContract(request: APIRequestContext, token: string, allowedOrigin: string, permissions: Record<string, string[]>) {
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: allowedOrigin, permissions }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
  const body = await res.text().catch(() => '');
  expect(res.ok(), `app-contracts/add failed (${res.status()}) ${body.slice(0, 200)}`).toBeTruthy();
}

/** Set the node's `node_ad_percentage` (admin only, the density control). */
async function setNodeAdPercentage(request: APIRequestContext, adminTok: string, pct: number) {
  const res = await request.post(`${API_BASE}/config/update`, {
    data: JSON.stringify({ token: { token: adminTok }, update: { node_ad_percentage: pct } }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `config/update node_ad_percentage failed (${res.status()})`).toBeTruthy();
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

/** Create a doc in a group (a post, a creator ad, or a node ad — the tags decide).
 *  Retries on the "No app contract" 403 — ClickHouse is eventually consistent,
 *  so a create issued right after the app-contract INSERT can race the read. */
async function createDoc(
  request: APIRequestContext, token: string, groupId: string, body: Record<string, unknown>,
): Promise<string> {
  const doCreate = async () => {
    const res = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({ token, service: SERVICE, body, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
    return res;
  };
  let res = await doCreate();
  for (let i = 0; i < 10 && res.status() === 403 && (await res.text().catch(() => '')).includes('No app contract'); i++) {
    await new Promise((r) => setTimeout(r, 500));
    res = await doCreate();
  }
  const detail = res.ok() ? '' : ` — ${await res.text().catch(() => '')}`;
  expect(res.ok(), `create doc failed (${res.status()})${detail}`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Create a node ad (a `posts` doc on the discover group, tagged `ad` + `node_ad`).
 *  The operator (node admin) creates it — an admin operation, not an app
 *  operation — so it's a direct API call (no Origin header → the app-contract
 *  check is skipped; the D58 write gate still enforces membership). */
async function createNodeAd(
  request: APIRequestContext, token: string, text: string,
  offer: Record<string, unknown>, status: 'active' | 'paused' = 'active',
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token, service: SERVICE,
      body: { text, tags: ['ad', 'node_ad'], offer, status },
      groups: [DISCOVER_GROUP_ID],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  const detail = res.ok() ? '' : ` — ${await res.text().catch(() => '')}`;
  expect(res.ok(), `create node ad failed (${res.status()})${detail}`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Pin a creator ad to a post (set the post's ad_preference to pinned). */
async function pinAdToPost(request: APIRequestContext, token: string, postDocId: string, adDocId: string) {
  const res = await request.post(`${API_BASE}/v3/update`, {
    data: JSON.stringify({ token, doc_id: postDocId, body: {}, ad_preference: { mode: 'pinned', target: adDocId } }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `pin ad failed (${res.status()})`).toBeTruthy();
}

/** Read the discover group's posts WITH the inline ad fields (doc.ad + doc.node_ad). */
async function readDiscoverWithAds(
  request: APIRequestContext, token: string, limit = 50,
): Promise<{ doc_id: string; text: string; ad_mode?: string; ad_target?: string; ad?: any; node_ad?: any }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [DISCOVER_GROUP_ID], limit }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `read discover failed (${res.status()})`).toBeTruthy();
  const docs = await res.json();
  return docs.map((d: any) => ({
    doc_id: d.doc_id,
    text: d.body?.text || '',
    ad_mode: d.ad_mode,
    ad_target: d.ad_target,
    ad: d.ad,
    node_ad: d.node_ad,
  }));
}

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([{ name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false }]);
}

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// ---------------------------------------------------------------------------
// The tests below mutate the shared node config (`node_ad_percentage`), so they
// must run serially — a parallel run would have one test set 100 while another
// sets 0, and the reads would see whichever was written last. CI already runs
// workers=1; the serial mode makes it hold at any worker count.
// ---------------------------------------------------------------------------

test.describe('Node ads (D57)', () => {
  test.describe.configure({ mode: 'serial' });

  // Reset the shared node config after the suite — these tests set
  // `node_ad_percentage` to 0/100 and create node ads on the discover group.
  // Leaving it at 100 would attach node ads to every post in subsequent e2e
  // tests. 0 = off (the node ads stay on the board but never attach).
  test.afterAll(async ({ request }) => {
    try {
      const admin = await adminToken(request);
      await setNodeAdPercentage(request, admin, 0);
    } catch {
      // best-effort cleanup
    }
  });

// ---------------------------------------------------------------------------
// API floor — the node ad object + the read's node-ad-serving (fast, no browser)
// ---------------------------------------------------------------------------

  test.describe('API floor (the read serves doc.node_ad)', () => {
  test('operator creates a node ad + percentage 100 → a reader\'s feed read returns a post with doc.node_ad', async ({ request }) => {
    const admin = await adminToken(request);
    const reader = await signupAndLogin(request, 'nar1');
    await addAppContract(request, reader.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);

    // A regular post on the discover board (the post that gets the node ad).
    const postText = `node ad target post ${Date.now()}`;
    await createDoc(request, reader.token, DISCOVER_GROUP_ID, { text: postText, tags: [] });
    // The operator's node ad (active, on the discover group).
    await createNodeAd(request, admin, `node ad ${Date.now()}`, makeOffer());
    // Density: every post gets a node ad.
    await setNodeAdPercentage(request, admin, 100);

    // Poll until the node ad is attached (the node ad's INSERT + the config
    // update are eventually consistent — the read may run before they're visible).
    await expect(async () => {
      const docs = await readDiscoverWithAds(request, reader.token);
      const post = docs.find((d) => d.text === postText);
      expect(post, `post "${postText}" not in discover`).toBeTruthy();
      if (!post) throw new Error('post not found');
      // The read attaches an active node ad (the third join's node side).
      expect(post.node_ad, 'the read should attach a node ad at percentage 100').toBeTruthy();
      expect(post.node_ad.tags).toContain('node_ad');
      expect(post.node_ad.body.status).toBe('active');
      expect(post.node_ad.body.offer.link.value).toBe('https://workflowco.com?ref=node');
    }).toPass({ timeout: 15000 });
  });

  test('a pinned post returns BOTH doc.ad (the creator\'s ad) AND doc.node_ad (the node\'s ad)', async ({ request }) => {
    const admin = await adminToken(request);
    const creator = await signupAndLogin(request, 'nac1');
    const follower = await signupAndLogin(request, 'naf1');
    for (const u of [creator, follower]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }

    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    // The creator's ad (in their followers group) + a post on the discover
    // board with the creator ad pinned.
    const adDocId = await createDoc(request, creator.token, f, {
      text: 'creator pinned ad', tags: ['ad'], offer: makeOffer({ partner: 'Amazon', link: 'https://amzn.to/abc?tag=test-20', disclosure: 'I may earn a commission.' }), status: 'active',
    });
    const postText = `pinned + node ad post ${Date.now()}`;
    const postDocId = await createDoc(request, creator.token, DISCOVER_GROUP_ID, { text: postText, tags: [] });
    await pinAdToPost(request, creator.token, postDocId, adDocId);
    // The follower follows the creator (so the I3 check serves doc.ad).
    await joinGroup(request, follower.token, f);
    // The operator's node ad + density 100.
    await createNodeAd(request, admin, `node ad ${Date.now()}`, makeOffer());
    await setNodeAdPercentage(request, admin, 100);

    // Poll until BOTH ads are attached (the node ad's INSERT + the config update
    // are eventually consistent).
    await expect(async () => {
      const docs = await readDiscoverWithAds(request, follower.token);
      const post = docs.find((d) => d.text === postText);
      expect(post, `post "${postText}" not in discover`).toBeTruthy();
      if (!post) throw new Error('post not found');
      // The third join: BOTH ads on the same post. The creator's monetization is
      // never suppressed by the node's.
      expect(post.ad_mode).toBe('pinned');
      expect(post.ad, 'the read should serve the creator\'s pinned ad (doc.ad)').toBeTruthy();
      expect(post.ad.doc_id).toBe(adDocId);
      expect(post.node_ad, 'the read should ALSO attach the node ad (doc.node_ad)').toBeTruthy();
      expect(post.node_ad.tags).toContain('node_ad');
      expect(post.node_ad.doc_id).not.toBe(adDocId);
    }).toPass({ timeout: 15000 });
  });

  test('percentage 0 = no node ads (the density control off)', async ({ request }) => {
    const admin = await adminToken(request);
    const reader = await signupAndLogin(request, 'na0');
    await addAppContract(request, reader.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);

    const postText = `no node ad post ${Date.now()}`;
    await createDoc(request, reader.token, DISCOVER_GROUP_ID, { text: postText, tags: [] });
    // An active node ad exists.
    await createNodeAd(request, admin, `node ad ${Date.now()}`, makeOffer());
    // First turn density ON and confirm the node ad attaches (so the "absent"
    // assertion below is meaningful — not a premature pass from the node ad's
    // INSERT not being visible yet).
    await setNodeAdPercentage(request, admin, 100);
    await expect(async () => {
      const docs = await readDiscoverWithAds(request, reader.token);
      const post = docs.find((d) => d.text === postText);
      expect(post, `post "${postText}" not in discover`).toBeTruthy();
      if (!post) throw new Error('post not found');
      expect(post.node_ad, 'node ad should attach at percentage 100').toBeTruthy();
    }).toPass({ timeout: 15000 });
    // Now turn density OFF.
    await setNodeAdPercentage(request, admin, 0);
    await expect(async () => {
      const docs = await readDiscoverWithAds(request, reader.token);
      const post = docs.find((d) => d.text === postText);
      expect(post, `post "${postText}" not in discover`).toBeTruthy();
      if (!post) throw new Error('post not found');
      expect(post.node_ad, 'percentage 0 must NOT attach a node ad').toBeUndefined();
    }).toPass({ timeout: 15000 });
  });

  test('percentage 100 = every post in the feed gets a node ad', async ({ request }) => {
    const admin = await adminToken(request);
    const reader = await signupAndLogin(request, 'na100');
    await addAppContract(request, reader.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);

    // Two regular posts + an active node ad + density 100.
    const t1 = `p100-a-${Date.now()}`;
    const t2 = `p100-b-${Date.now()}`;
    await createDoc(request, reader.token, DISCOVER_GROUP_ID, { text: t1, tags: [] });
    await createDoc(request, reader.token, DISCOVER_GROUP_ID, { text: t2, tags: [] });
    await createNodeAd(request, admin, `node ad ${Date.now()}`, makeOffer());
    await setNodeAdPercentage(request, admin, 100);

    await expect(async () => {
      const docs = await readDiscoverWithAds(request, reader.token);
      const a = docs.find((d) => d.text === t1);
      const b = docs.find((d) => d.text === t2);
      expect(a, 'post a should be in the feed').toBeTruthy();
      expect(b, 'post b should be in the feed').toBeTruthy();
      if (!a || !b) throw new Error('post not found in feed');
      expect(a.node_ad, 'post a should get a node ad at 100%').toBeTruthy();
      expect(b.node_ad, 'post b should get a node ad at 100%').toBeTruthy();
    }).toPass({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the Ad Inventory card + the feed's "Sponsored" render
// ---------------------------------------------------------------------------

test.describe('Node ads gauntlet — Ad Inventory card → follower feed renders the Sponsored block', () => {
  test('operator creates a node ad via the Ad Inventory card; the follower\'s feed renders the Sponsored node ad block', async ({ browser, request }) => {
    // Setup (API): a creator with a followers group + a target post in it; a
    // follower who follows the creator (so the target post is in their feed —
    // the feed reads all groups EXCEPT discover, so the target must be on a
    // followers group, not the discover board). Density 100.
    const admin = await adminToken(request);
    // The operator creates node ads via the card (the authenticator's v3 client,
    // Origin: auth.localhost). The document create is app-contract-gated, so the
    // admin needs a contract for the authenticator origin to write posts.
    await addAppContract(request, admin, AUTH_BASE, SOCIAL_CONTRACT_PERMISSIONS);
    const creator = await signupAndLogin(request, 'nag1c');
    const follower = await signupAndLogin(request, 'nag1f');
    for (const u of [creator, follower]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }
    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    const targetText = `gauntlet node ad target ${Date.now()}`;
    await createDoc(request, creator.token, f, { text: targetText, tags: [] });
    await joinGroup(request, follower.token, f);
    await setNodeAdPercentage(request, admin, 100);

    // --- The OPERATOR creates a node ad via the Ad Inventory card ---
    const ctxOp = await browser.newContext();
    const pageOp = await ctxOp.newPage();
    const opErrors = capturePageErrors(pageOp);
    await pageOp.goto(AUTH_BASE);
    // Wait for the login form (networkidle can hang on the authenticator's
    // continuous contract-polling).
    await pageOp.locator('#username').waitFor({ state: 'visible', timeout: 30000 });
    // Log in as the node admin (the operator).
    await pageOp.locator('#username').fill('admin');
    await pageOp.locator('#password').fill('admin123');
    await pageOp.locator('[data-testid="login-submit"]').click();
    await expect(pageOp.locator('[data-testid="topbar-username"]')).toHaveText('admin', { timeout: 20000 });
    // Navigate to the Studio → the Ad Inventory card.
    await pageOp.locator('[data-testid="sidebar-nav-studio"]').click();
    await expect(pageOp.locator('[data-testid="node-ads-card"]')).toBeVisible({ timeout: 20000 });

    // Create a node ad through the card.
    const nodeAdText = `gauntlet node ad ${Date.now()}`;
    await pageOp.locator('[data-testid="node-ads-new"]').click();
    await pageOp.locator('[data-testid="node-ad-text"]').fill(nodeAdText);
    await pageOp.locator('[data-testid="node-ad-link"]').fill('https://workflowco.com?ref=gauntlet');
    await pageOp.locator('[data-testid="node-ad-save"]').click();
    // The card reloads and shows the new node ad (poll for CH consistency).
    await expect(pageOp.locator(`text=${nodeAdText}`)).toBeVisible({ timeout: 20000 });
    expect(opErrors, 'operator pageerrors').toEqual([]);
    await ctxOp.close();

    // --- The FOLLOWER's feed renders a post with the "Sponsored" node ad block ---
    const ctxF = await browser.newContext();
    const pageF = await ctxF.newPage();
    const fErrors = capturePageErrors(pageF);
    await setTokenCookie(ctxF, 'social.localhost', follower.token);
    await setTokenCookie(ctxF, 'auth.localhost', follower.token);
    await pageF.goto(`${SOCIAL_BASE}/feed`);
    await pageF.waitForLoadState('networkidle');
    // The target post is in the follower's feed (the creator's followers group).
    await expect(async () => {
      const texts = await pageF.locator('[data-testid="post-card"]').allTextContents();
      expect(texts.some((t) => t.includes(targetText))).toBeTruthy();
    }).toPass({ timeout: 20000 });
    // At density 100, the target post renders a node ad block (the "Sponsored"
    // dressing). Scope to the target post's card (other posts may also get node
    // ads — the unscoped locator would match 2+ and violate strict mode).
    const targetCard = pageF.locator('[data-testid="post-card"]').filter({ hasText: targetText });
    await expect(targetCard.locator('[data-testid="ad-block"][data-ad-variant="node"]')).toBeVisible({ timeout: 20000 });
    // The "Sponsored" badge is the node ad's label.
    await expect(targetCard.locator('[data-testid="ad-provenance-badge"]', { hasText: 'Sponsored' })).toBeVisible();
    expect(fErrors, 'follower pageerrors').toEqual([]);
    await ctxF.close();
  });

  test('a creator\'s pinned post shows BOTH the creator\'s ad AND the node\'s ad', async ({ browser, request }) => {
    // Setup (API): a creator with a followers group + a creator ad; a post in the
    // followers group with the creator ad pinned (the feed reads all groups
    // EXCEPT discover, so the post must be on a followers group); a node ad;
    // density 100; a follower who follows the creator.
    const admin = await adminToken(request);
    const creator = await signupAndLogin(request, 'nag2c');
    const follower = await signupAndLogin(request, 'nag2f');
    for (const u of [creator, follower]) {
      await addAppContract(request, u.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
    }
    const f = await createFollowersGroupViaApi(request, creator.token, creator.username);
    const adDocId = await createDoc(request, creator.token, f, {
      text: 'gauntlet creator ad', tags: ['ad'], offer: makeOffer({ partner: 'Amazon', link: 'https://amzn.to/abc?tag=gauntlet-20', disclosure: 'I may earn a commission.' }), status: 'active',
    });
    const postText = `gauntlet both ads post ${Date.now()}`;
    const postDocId = await createDoc(request, creator.token, f, { text: postText, tags: [] });
    await pinAdToPost(request, creator.token, postDocId, adDocId);
    await joinGroup(request, follower.token, f);
    await createNodeAd(request, admin, `gauntlet node ad ${Date.now()}`, makeOffer());
    await setNodeAdPercentage(request, admin, 100);

    // The follower's feed renders the pinned post with BOTH ad blocks.
    const ctxF = await browser.newContext();
    const pageF = await ctxF.newPage();
    const fErrors = capturePageErrors(pageF);
    await setTokenCookie(ctxF, 'social.localhost', follower.token);
    await setTokenCookie(ctxF, 'auth.localhost', follower.token);
    await pageF.goto(`${SOCIAL_BASE}/feed`);
    await pageF.waitForLoadState('networkidle');
    await expect(async () => {
      const texts = await pageF.locator('[data-testid="post-card"]').allTextContents();
      expect(texts.some((t) => t.includes(postText))).toBeTruthy();
    }).toPass({ timeout: 20000 });
    // The third join in the UI: the creator's ad (violet) + the node's ad
    // (amber, "Sponsored") both render on the SAME post. Scope to the pinned
    // post's card (at density 100, other posts also get node ads — the
    // unscoped locator would match 2+ and violate strict mode).
    const pinnedCard = pageF.locator('[data-testid="post-card"]').filter({ hasText: postText });
    await expect(pinnedCard.locator('[data-testid="ad-block"][data-ad-variant="creator"]')).toBeVisible({ timeout: 20000 });
    await expect(pinnedCard.locator('[data-testid="ad-block"][data-ad-variant="node"]')).toBeVisible({ timeout: 20000 });
    expect(fErrors, 'follower pageerrors').toEqual([]);
    await ctxF.close();
  });
  });
});
