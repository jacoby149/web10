import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { API_BASE, v3Post, v3Login, v3Signup } from '../v3-helpers';

/**
 * Social trending — the /discover board surface (the in-app trending: the D36
 * knob rack over the node-default discover group).
 *
 * API floor: the anon board read (no token — discovery IS a group read) +
 * engagement counts via the ref pattern (reactions/comments docs whose
 * ref_value is the target post's doc_id). I3 anti-test: anon cannot read a
 * group it is not a member of.
 *
 * Browser gauntlet: the board renders seeded posts (with their engagement
 * counts), the D36 knobs re-rank it (a preset chip + a rotary knob), and the
 * knob state is deep-linkable — the URL holds the ranking (?knobs=) and a
 * refresh restores it. Console log-sequence verified.
 *
 * The discover board is a SHARED node default, so the board assertions are
 * contains-assertions + relative order of this test's own posts, never exact
 * counts.
 *
 * The login seam (the D42 consent popup) is infrastructure — torture-tested
 * by authenticator-torture + auth-popup-roundtrip. This spec pre-auths via
 * the token cookie + a pre-created app contract (mirroring SOCIAL_SERVICES
 * in src/interfaces/auth.ts) and never re-tests the popup.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const DISCOVER_GROUP_ID = `${PROVIDER}/groups/web10/discover`;
const SERVICE = 'posts';

// Mirror of SOCIAL_SERVICES / SOCIAL_OPERATIONS in
// marketing/web10-social/src/interfaces/auth.ts — the app contract the D42
// popup would create for this origin.
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

const password = 'TestPass123!';
const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, password);
  const token = await v3Login(request, username, password);
  return { username, token };
}

/** Pre-create the app contract the D42 popup would grant for the social origin. */
async function addSocialAppContract(request: APIRequestContext, token: string) {
  const res = await v3Post(request, `${API_BASE}/v3/app-contracts/add`, {
    token,
    allowed_origin: SOCIAL_BASE,
    permissions: Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, [...SOCIAL_OPERATIONS]])),
  });
  expect(res.ok(), `app-contracts/add failed (${res.status})`).toBeTruthy();
}

async function postToDiscover(request: APIRequestContext, token: string, text: string): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/create`, {
    token,
    service: SERVICE,
    body: { text, origin: 'web10', created_at: new Date().toISOString() },
    groups: [DISCOVER_GROUP_ID],
  });
  expect(res.ok(), `create post failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** A reaction in the `reactions` service pointing at the post via ref_value (the ref pattern). */
async function addReaction(request: APIRequestContext, token: string, targetDocId: string) {
  const res = await v3Post(request, `${API_BASE}/v3/create`, {
    token,
    service: 'reactions',
    body: { type: '\u2764\ufe0f', target_service: 'posts', target_id: targetDocId },
    groups: [DISCOVER_GROUP_ID],
    ref_value: targetDocId,
  });
  expect(res.ok(), `create reaction failed (${res.status})`).toBeTruthy();
}

/** A comment in the `comments` service pointing at the post via ref_value (the ref pattern). */
async function addComment(request: APIRequestContext, token: string, targetDocId: string, text: string) {
  const res = await v3Post(request, `${API_BASE}/v3/create`, {
    token,
    service: 'comments',
    body: { text, target_service: 'posts', target_id: targetDocId },
    groups: [DISCOVER_GROUP_ID],
    ref_value: targetDocId,
  });
  expect(res.ok(), `create comment failed (${res.status})`).toBeTruthy();
}

/** Anon read (NO token) — the public board path. */
async function anonRead(request: APIRequestContext, service: string, groups: string[], limit = 100) {
  return request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ service, groups, limit }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Pre-auth a browser context: token cookie (the session is cookie-backed). */
async function setupViewer(
  request: APIRequestContext,
  context: BrowserContext,
  prefix: string,
): Promise<{ username: string; token: string }> {
  const viewer = await signupAndLogin(request, prefix);
  await addSocialAppContract(request, viewer.token);
  await context.addCookies([
    { name: 'token', value: viewer.token, domain: 'social.localhost', path: '/', secure: false, httpOnly: false },
  ]);
  return viewer;
}

function captureConsoleLogs(page: Page, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes(prefix)) logs.push(text);
  });
  return logs;
}

/** The board's card order as text (the rank order is the DOM order). */
async function boardTexts(page: Page): Promise<string[]> {
  return page.locator('[data-testid="discover-card"]').allTextContents();
}

function indexOfText(texts: string[], needle: string): number {
  return texts.findIndex((t) => t.includes(needle));
}

/** Assert `first` renders before `second` on the board (relative order — the
 * board is shared, so never exact positions). */
async function expectBefore(page: Page, first: string, second: string) {
  await expect(async () => {
    const texts = await boardTexts(page);
    const i1 = indexOfText(texts, first);
    const i2 = indexOfText(texts, second);
    expect(i1, `"${first}" not on the board`).toBeGreaterThanOrEqual(0);
    expect(i2, `"${second}" not on the board`).toBeGreaterThanOrEqual(0);
    expect(i1, `"${first}" should rank before "${second}"`).toBeLessThan(i2);
  }).toPass({ timeout: 15000 });
}

function indexOfAfter(logs: string[], needle: string, from: number): number {
  for (let i = from + 1; i < logs.length; i++) {
    if (logs[i].includes(needle)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// API floor — the anon board read + engagement counts (no browser)
// ---------------------------------------------------------------------------

test.describe('Social trending — API floor (anon board read + engagement)', () => {
  test('anon read of the node-default discover group returns the board', async ({ request }) => {
    const u1 = await signupAndLogin(request, 'trendapi1');
    const u2 = await signupAndLogin(request, 'trendapi2');
    const text1 = `anon board post one ${Date.now()}`;
    const text2 = `anon board post two ${Date.now()}`;
    await postToDiscover(request, u1.token, text1);
    await postToDiscover(request, u2.token, text2);

    // NO token — the discover group is anon-readable (the public board).
    const res = await anonRead(request, SERVICE, [DISCOVER_GROUP_ID]);
    expect(res.ok(), `anon board read failed (${res.status})`).toBeTruthy();
    const docs = (await res.json()) as any[];
    expect(Array.isArray(docs)).toBeTruthy();
    const texts = docs.map((d) => d.body.text);
    // The board is a shared node default — contains, not exact counts.
    expect(texts).toContain(text1);
    expect(texts).toContain(text2);
  });

  test('engagement counts come back for the posts (the ref pattern)', async ({ request }) => {
    const poster = await signupAndLogin(request, 'trendref1');
    const reactor = await signupAndLogin(request, 'trendref2');
    const postText = `ref pattern post ${Date.now()}`;
    const docId = await postToDiscover(request, poster.token, postText);

    // 3 reactions + 2 comments, all pointing at the post via ref_value.
    await addReaction(request, reactor.token, docId);
    await addReaction(request, reactor.token, docId);
    await addReaction(request, poster.token, docId);
    await addComment(request, reactor.token, docId, `first comment ${Date.now()}`);
    await addComment(request, poster.token, docId, `second comment ${Date.now()}`);

    // Anon reads of the reactions + comments groups: the docs come back with
    // ref_value intact; counting by ref_value is how the engagement is derived.
    const reactions = (await (await anonRead(request, 'reactions', [DISCOVER_GROUP_ID])).json()) as any[];
    const comments = (await (await anonRead(request, 'comments', [DISCOVER_GROUP_ID])).json()) as any[];
    // ref_value is scoped to this test's unique doc_id — exact counts hold.
    expect(reactions.filter((d) => d.ref_value === docId).length).toBe(3);
    expect(comments.filter((d) => d.ref_value === docId).length).toBe(2);
  });

  test('anti-test: I3 holds — anon cannot read a non-member group; a non-member user gets 403', async ({ request }) => {
    const owner = await signupAndLogin(request, 'trendi3');
    const outsider = await signupAndLogin(request, 'trendi3x');
    const roles = [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
      { name: 'member', services: [SERVICE], permissions: ['readAll'] },
    ];
    const create = await v3Post(request, `${API_BASE}/v3/groups/create`, {
      token: owner.token,
      name: 'followers',
      join_policy: 'open',
      roles,
      members: [{ member_key: owner.username, role: 'owner' }],
    });
    expect(create.ok(), `create group failed (${create.status})`).toBeTruthy();
    const groupId = (await create.json()).group_id as string;
    expect(groupId).toBe(`${PROVIDER}/groups/users/${owner.username}/followers`);
    const postText = `group post ${Date.now()}`;
    const postRes = await v3Post(request, `${API_BASE}/v3/create`, {
      token: owner.token,
      service: SERVICE,
      body: { text: postText },
      groups: [groupId],
    });
    expect(postRes.ok()).toBeTruthy();

    // Anon is only a member of the discover group. Anon reads are exempt from
    // the 403 membership check (an empty board is a valid result) — I3 for
    // anon is the membership JOIN: the group's posts simply do not come back.
    const anonRes = await anonRead(request, SERVICE, [groupId]);
    expect(anonRes.ok()).toBeTruthy();
    const anonDocs = (await anonRes.json()) as any[];
    expect(anonDocs.map((d) => d.body.text)).not.toContain(postText);

    // A real user who is not a member gets the actionable 403.
    const outsiderRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: outsider.token, service: SERVICE, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(outsiderRes.status()).toBe(403);
    const err = await outsiderRes.json();
    expect(err.detail).toMatch(/not a member/i);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the board renders, the knobs re-rank, the URL holds it
// ---------------------------------------------------------------------------

test.describe('Social trending gauntlet — /discover board + D36 knobs + deep link', () => {
  test('board renders seeded posts; knobs re-rank; the URL holds the ranking', async ({ page, context, request }) => {
    test.setTimeout(90_000);
    const logs = captureConsoleLogs(page, '[social:discover]');
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // --- Seed via API: an OLD post with engagement + a NEW post with none ---
    const viewer = await setupViewer(request, context, 'trendui');
    const c1 = await signupAndLogin(request, 'trenduic1');

    const postA = `trending old post ${Date.now()}`;
    const docA = await postToDiscover(request, c1.token, postA);
    // 5 reactions + 2 comments on the old post (the ref pattern).
    await addReaction(request, viewer.token, docA);
    await addReaction(request, c1.token, docA);
    await addReaction(request, viewer.token, docA);
    await addReaction(request, c1.token, docA);
    await addReaction(request, viewer.token, docA);
    await addComment(request, c1.token, docA, `comment one ${Date.now()}`);
    await addComment(request, viewer.token, docA, `comment two ${Date.now()}`);
    const postB = `trending new post ${Date.now()}`;
    await postToDiscover(request, c1.token, postB);

    // --- Load the board (pre-authed: the token cookie is the session) ---
    await page.goto(`${SOCIAL_BASE}/discover`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="discover-grid"]')).toBeVisible({ timeout: 30_000 });

    // The seeded posts render (contains — the board is shared).
    {
      const texts = await boardTexts(page);
      expect(indexOfText(texts, postA)).toBeGreaterThanOrEqual(0);
      expect(indexOfText(texts, postB)).toBeGreaterThanOrEqual(0);
    }

    // Engagement counts render on the old post's card (the ref pattern,
    // counted client-side from the reactions/comments groups).
    const cardA = page.locator('[data-testid="discover-card"]', { hasText: postA });
    await expect(cardA.getByLabel('5 likes')).toBeVisible({ timeout: 15_000 });
    await expect(cardA.getByLabel('2 comments')).toBeVisible();

    // Default (Balanced): the high-engagement old post ranks before the
    // zero-engagement new post.
    await expectBefore(page, postA, postB);

    // --- The "Newest" preset re-ranks: the newer post comes first ---
    await page.locator('[data-testid="preset-newest"]').click();
    expect(new URL(page.url()).searchParams.get('knobs')).toBe('5,0,0,0,0');
    await expectBefore(page, postB, postA);

    // --- Deep link: refresh restores the ranking from the URL ---
    // (The default Balanced would put postA first — so postB-first after a
    // reload proves the URL held the ranking, not the default.)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="discover-grid"]')).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('knobs')).toBe('5,0,0,0,0');
    await expectBefore(page, postB, postA);
    // The preset chip reflects the restored state.
    await expect(page.locator('[data-testid="preset-newest"]')).toHaveClass(/border-brand/);

    // --- A rotary knob re-ranks: crank Likes to max (the synth rack) ---
    await page.locator('[data-testid="knobs-advanced-toggle"]').click();
    await expect(page.locator('[data-testid="knobs-advanced-toggle"]')).toHaveAttribute('aria-expanded', 'true');
    const likesKnob = page.locator('[data-testid="knob-likes"] [role="slider"]');
    await likesKnob.focus();
    // One detent per keypress, confirmed before the next: the knob's
    // snap-to-detent steps off its current value, so a press faster than the
    // re-render is a no-op (human drag/keypress timing never hits this).
    for (let i = 1; i <= 5; i++) {
      await likesKnob.press('ArrowUp');
      await expect(likesKnob).toHaveAttribute('aria-valuenow', String(i), { timeout: 5000 });
    }
    // State is now (recency 5, likes 5, comments 0, halfLife 0, character 0)
    // — custom (no preset match) — and the engagement wins: postA first.
    expect(new URL(page.url()).searchParams.get('knobs')).toBe('5,5,0,0,0');
    await expectBefore(page, postA, postB);

    // --- Console log sequence (the real flow, in order) ---
    const start1 = logs.findIndex((l) => l.includes('loadDiscover — start'));
    const eng1 = logs.findIndex((l) => l.includes('engagement — counted'));
    const knobNewest = logs.findIndex((l) => l.includes('knob state — 5,0,0,0,0 (preset: newest)'));
    const deepLink = logs.findIndex((l) => l.includes('deep-link — knob state restored from URL: 5,0,0,0,0'));
    const start2 = indexOfAfter(logs, 'loadDiscover — start', deepLink);
    const knobCustom = logs.findIndex((l) => l.includes('knob state — 5,5,0,0,0 (custom)'));

    for (const [name, i] of [
      ['loadDiscover start', start1],
      ['engagement counted', eng1],
      ['knob newest', knobNewest],
      ['deep-link restore', deepLink],
      ['loadDiscover start (after reload)', start2],
      ['knob custom', knobCustom],
    ] as const) {
      expect(i, `missing log: ${name}`).toBeGreaterThanOrEqual(0);
    }
    expect(start1).toBeLessThan(eng1);
    expect(eng1).toBeLessThan(knobNewest);
    expect(knobNewest).toBeLessThan(deepLink);
    expect(deepLink).toBeLessThan(start2);
    expect(start2).toBeLessThan(knobCustom);

    // No errors in the surface's console, no uncaught page errors.
    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
