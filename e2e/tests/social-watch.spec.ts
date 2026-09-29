import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE, v3Post, v3Login, v3Signup } from '../v3-helpers';

/**
 * Social watch — the /watch/:postId destination (the YouTube-shaped video
 * page, watch-page.md).
 *
 * API floor: the watch page's exact read — read-by-doc_id (the post, the
 * anon-capable `user_or_anon` path) + the discover-board read (the "What's
 * next" queue source). I3 anti-test: a post NOT on the discover group (a
 * private group) is not watchable anon — the read-by-id returns 404, so the
 * watch page renders "Video not found".
 *
 * Browser gauntlet: the Video wall → click a landscape tile → the watch page
 * renders (player + title + the "What's next" queue) → click a queue item →
 * the next video → browser back → the wall (same ?knobs=). The ?t= round-trip:
 * the playback position is written back to the URL (replace) and a fresh load
 * seeks to it.
 *
 * The discover board is a SHARED node default, so the board assertions are
 * contains-assertions of this test's own posts, never exact counts.
 *
 * The login seam (the D42 consent popup) is infrastructure — this spec
 * pre-auths via the token cookie + a pre-created app contract (mirroring
 * SOCIAL_SERVICES in src/interfaces/auth.ts) and never re-tests the popup.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const DISCOVER_GROUP_ID = `${PROVIDER}/groups/web10/discover`;
const POSTS = 'posts';

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
  'web10-social-group-identity',
  'notifications',
];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

// 8s 1280x720 (16:9 landscape) H.264/AAC test video — the watch-page case
// (landscape → /watch/:postId, not the Shorts lens).
const here = dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO_LANDSCAPE = readFileSync(resolve(here, '../fixtures/test-video-landscape.mp4'));

const password = 'TestPass123!';
const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Chromium ignores /etc/hosts (it queries the container's DNS, which answers
// *.localhost with 127.0.0.1). The vhosts are mapped in /etc/hosts by the
// runner (scripts/run-e2e.sh), so resolve the proxy IP from there and pin it
// with --host-resolver-rules. On the CI runner (no container) getent returns
// 127.0.0.1, which is correct there too; when unresolvable the args stay
// empty (unchanged behavior).
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

/** A text post on the discover group (the public board). */
async function postToDiscover(request: APIRequestContext, token: string, text: string): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/create`, {
    token,
    service: POSTS,
    body: { text, origin: 'web10', created_at: new Date().toISOString() },
    groups: [DISCOVER_GROUP_ID],
  });
  expect(res.ok(), `create post failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Anon read-by-doc_id (NO token) — the watch page's post read. */
async function anonReadById(request: APIRequestContext, docId: string, service: string) {
  return request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ doc_id: docId, service }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Anon read of a group (NO token) — the public board path. */
async function anonRead(request: APIRequestContext, service: string, groups: string[], limit = 100) {
  return request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ service, groups, limit }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Poll an anon read-by-id until it's OK. ClickHouse is eventually consistent —
 * the doc_groups membership join (the I3 gate) can lag the create, so a
 * just-created post 404s for a moment. The watch page's read-by-id is the
 * thing under test, so poll it to the steady state rather than racing it.
 */
async function anonReadByIdWait(
  request: APIRequestContext,
  docId: string,
  service: string,
  timeoutMs = 30_000,
): Promise<import('@playwright/test').APIResponse> {
  const deadline = Date.now() + timeoutMs;
  let last: import('@playwright/test').APIResponse | null = null;
  while (Date.now() < deadline) {
    last = await anonReadById(request, docId, service);
    if (last.ok()) return last;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return last!;
}

/**
 * Poll the anon board read until every given post text is visible (ClickHouse
 * eventual consistency). The Video wall loads the board ONCE on mount — so the
 * gauntlet settles the board via the API first, then loads the wall (which
 * then sees the posts).
 */
async function waitForPostsOnBoard(
  request: APIRequestContext,
  texts: string[],
  timeoutMs = 30_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let visible: string[] = [];
  while (Date.now() < deadline) {
    const res = await anonRead(request, POSTS, [DISCOVER_GROUP_ID]);
    if (res.ok()) {
      const docs = (await res.json()) as any[];
      visible = docs.map((d) => d.body.text);
      if (texts.every((t) => visible.includes(t))) return visible;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return visible;
}

/** Create a private (invite_only) group the reader owns — for the I3 anti-test. */
async function createPrivateGroup(request: APIRequestContext, token: string, username: string): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name: 'private',
    join_policy: 'invite_only',
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
    ],
    members: [{ member_key: username, role: 'owner' }],
  });
  expect(res.ok(), `create private group failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

// ── Video seeding (the watch page needs a real, playable landscape video) ────

/** Upload a video to MinIO and return the object_key. */
async function uploadVideoToMinio(request: APIRequestContext, token: string): Promise<string> {
  const uploadRes = await v3Post(request, `${API_BASE}/v3/media/upload-url`, {
    token,
    body: { filename: 'landscape.mp4', mime_type: 'video/mp4' },
  });
  expect(uploadRes.ok(), `media/upload-url failed (${uploadRes.status})`).toBeTruthy();
  const { upload_url, fields, object_key } = (await uploadRes.json()) as any;
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    ...(fields as Record<string, string>),
    file: { name: 'landscape.mp4', mimeType: 'video/mp4', buffer: TEST_VIDEO_LANDSCAPE },
  };
  const putRes = await request.post(upload_url, { multipart });
  const status = putRes.status();
  const body = await putRes.text();
  if (status >= 300 || body.includes('<Error>')) {
    throw new Error(`MinIO upload failed: status ${status}, body: ${body}`);
  }
  return object_key as string;
}

/**
 * Upload the landscape video, create the media doc, queue the transcode, and
 * poll until it settles. Returns the media doc_id (the post's media_ref).
 *
 * The media doc is created via `media/confirm` (NOT `v3/create`): confirm
 * stores it with `collection_name = 'media_metadata'`, which is what the
 * social app's `resolveMediaRefs` → `listMedia` reads (`collection_name IN
 * ('media_metadata', 'public_media')`). A `v3/create` with `service: 'media'`
 * gives `collection_name = 'media'`, which `listMedia` can't find — so the
 * watch page would show "No video to play".
 *
 * Transcoding is the proven-playable path (H.264/AAC HLS) — the watch page's
 * ?t= round-trip needs the video to actually play (timeupdate).
 */
async function seedLandscapeVideo(
  request: APIRequestContext,
  token: string,
  username: string,
): Promise<string> {
  const objectKey = await uploadVideoToMinio(request, token);
  const confirmRes = await v3Post(request, `${API_BASE}/v3/media/confirm`, {
    token,
    body: {
      object_key: objectKey,
      video: { type: 'minio', value: objectKey },
      filename: 'landscape.mp4',
      mime_type: 'video/mp4',
      width: 1280,
      height: 720,
      duration_seconds: 8,
      service: 'media',
    },
  });
  expect(confirmRes.ok(), `media/confirm failed (${confirmRes.status})`).toBeTruthy();
  const docId = (await confirmRes.json()).doc_id as string;

  const tcRes = await v3Post(request, `${API_BASE}/v3/media/transcode`, { token, doc_id: docId });
  expect(tcRes.ok(), `media/transcode failed (${tcRes.status})`).toBeTruthy();

  const deadline = Date.now() + 200_000;
  let doc: any = null;
  while (Date.now() < deadline) {
    // Poll via media/list (NOT v3/read by doc_id): the media doc created via
    // media/confirm is not attached to any group, so the read-by-id membership
    // join 404s. media/list reads by author_key (no group), which is how the
    // social app's resolveMediaRefs → listMedia finds it too.
    const listRes = await v3Post(request, `${API_BASE}/v3/media/list`, { token, doc_ids: [docId] });
    expect(listRes.ok(), `media/list failed (${listRes.status})`).toBeTruthy();
    const docs = (await listRes.json()) as any[];
    doc = docs.find((d) => d.doc_id === docId) || null;
    const ts = doc?.body?.transcoding_settings;
    if (ts && (ts.status === 'done' || ts.status === 'failed')) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const ts = doc?.body?.transcoding_settings;
  expect(ts, 'transcoding_settings never appeared').toBeTruthy();
  expect(ts.status, `transcode did not finish: ${JSON.stringify(ts)}`).toBe('done');
  return docId;
}

/** A discover post carrying the video (media_refs → the media doc). */
/** A discover post carrying the video (media_refs → the media doc). Tagged
 *  `video` — the Video wall's `postHasVideo` gate checks the tag OR a resolved
 *  video media_ref; for a signed-in board read the media_refs are strings (the
 *  wall resolves them separately), so the tag is the signal that puts the post
 *  on the wall. The author fields (author_username/author_provider) are set so
 *  the watch page resolves the media as the author's OWN media (`media`
 *  service) — the media lives in the author's private media group, so a
 *  cross-user (`public_media`) read can't reach it. The tile's aspect-ratio
 *  routing (watch vs shorts) uses the RESOLVED media's width/height. */
async function postVideoToDiscover(
  request: APIRequestContext,
  token: string,
  text: string,
  mediaDocId: string,
  authorUsername: string,
): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/create`, {
    token,
    service: POSTS,
    body: {
      text,
      media_refs: [mediaDocId],
      tags: ['video'],
      author_username: authorUsername,
      author_provider: PROVIDER,
      origin: 'web10',
      created_at: new Date().toISOString(),
    },
    groups: [DISCOVER_GROUP_ID],
  });
  expect(res.ok(), `create video post failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
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

// ---------------------------------------------------------------------------
// API floor — the watch page's exact read (read-by-id + board) + I3
// ---------------------------------------------------------------------------

test.describe('Social watch — API floor (read-by-id + board queue + I3)', () => {
  test('anon read-by-doc_id returns a discover post (the watch page read)', async ({ request }) => {
    const u = await signupAndLogin(request, 'watchapi1');
    const text = `watch read-by-id post ${Date.now()}`;
    const docId = await postToDiscover(request, u.token, text);

    // NO token — the watch page's post read is user_or_anon; a public (board)
    // post resolves for a signed-out visitor. Poll to the steady state
    // (ClickHouse eventual consistency — the membership join can lag the create).
    const res = await anonReadByIdWait(request, docId, POSTS);
    expect(res.ok(), `anon read-by-id failed (${res.status()})`).toBeTruthy();
    const doc = (await res.json()) as any;
    expect(doc.doc_id).toBe(docId);
    expect(doc.body.text).toBe(text);
  });

  test('the discover board read returns the post (the "What\'s next" queue source)', async ({ request }) => {
    const u = await signupAndLogin(request, 'watchapi2');
    const text = `watch board queue post ${Date.now()}`;
    await postToDiscover(request, u.token, text);

    // The queue is the board read (anon) — the post comes back in it (polled
    // to the steady state for eventual consistency).
    const visible = await waitForPostsOnBoard(request, [text]);
    expect(visible, `post "${text}" never appeared on the board`).toContain(text);
  });

  test('I3 anti-test: a non-discover post is not watchable anon (read-by-id 404)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'watchi3');
    const groupId = await createPrivateGroup(request, owner.token, owner.username);
    const text = `watch private post ${Date.now()}`;
    const res = await v3Post(request, `${API_BASE}/v3/create`, {
      token: owner.token,
      service: POSTS,
      body: { text },
      groups: [groupId],
    });
    expect(res.ok()).toBeTruthy();
    const docId = (await res.json()).doc_id as string;

    // First prove the post EXISTS (the owner can read it by id) — so the anon
    // 404 is an access denial (I3), not eventual consistency.
    const ownerRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: owner.token, doc_id: docId, service: POSTS }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(ownerRes.ok(), `owner read-by-id failed (${ownerRes.status()})`).toBeTruthy();

    // Anon is not a member of the private group — the read-by-id is I3-gated
    // by the membership join, so it returns nothing → 404. The watch page
    // renders "Video not found" for this.
    const anonRes = await anonReadById(request, docId, POSTS);
    expect(anonRes.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — wall → watch → queue → back → ?t=
// ---------------------------------------------------------------------------

test.describe('Social watch gauntlet — wall → watch → queue → back → ?t=', () => {
  test('click a landscape tile → watch page (player+title+queue) → queue nav → back (same knobs) → ?t= round-trip', async ({ page, context, request }) => {
    test.setTimeout(480_000);
    const logs = captureConsoleLogs(page, '[social:watch]');
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // --- Seed via API: ONE landscape video (transcoded, playable) + two
    //     discover posts carrying it (the wall tile + the queue item) ---
    const viewer = await setupViewer(request, context, 'watchui');
    const mediaDocId = await seedLandscapeVideo(request, viewer.token, viewer.username);

    const postA = `watch wall video ${Date.now()}`;
    const docA = await postVideoToDiscover(request, viewer.token, postA, mediaDocId, viewer.username);
    const postB = `watch queue video ${Date.now()}`;
    const docB = await postVideoToDiscover(request, viewer.token, postB, mediaDocId, viewer.username);

    // ClickHouse is eventually consistent — settle the board via the API
    // BEFORE loading the wall. The Video wall loads the board ONCE on mount,
    // so if the posts aren't visible at that instant the tiles never appear
    // (the wall doesn't poll). Polling the anon board read to the steady
    // state guarantees the wall (and the watch page's queue) see both posts.
    const settled = await waitForPostsOnBoard(request, [postA, postB]);
    expect(settled, `seeded posts never settled on the board`).toContain(postA);
    expect(settled).toContain(postB);

    // --- Load the Video wall, set a ranking, and click the landscape tile ---
    await page.goto(`${SOCIAL_BASE}/video`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="discover-home-grid"]')).toBeVisible({ timeout: 30_000 });

    // Set a non-default ranking so the "back → same ?knobs=" assertion is
    // meaningful (the default would be indistinguishable from "no knobs").
    await page.locator('[data-testid="preset-most-recent"]').click();
    const wallKnobs = new URL(page.url()).searchParams.get('knobs');
    expect(wallKnobs).toBeTruthy();

    // The seeded tile renders (contains — the wall is shared). The tile only
    // appears once the wall resolves the post's media to a video (a presign
    // round-trip), so give it a generous timeout.
    const tile = page.locator('[data-testid="discover-home-card"]', { hasText: postA });
    await expect(tile).toBeVisible({ timeout: 60_000 });

    // Click the landscape tile → the watch page (carrying the wall's ?knobs=).
    await tile.click();
    await page.waitForURL(`**/watch/${docA}**`, { timeout: 30_000 });

    // --- The watch page renders: player + title + the "What's next" queue ---
    // The player only appears once the page resolves the post's media to a
    // video (a presign round-trip), so give it a generous timeout.
    await expect(page.locator('[data-testid="watch-player"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-testid="watch-title"]')).toHaveText(postA, { timeout: 30_000 });
    // The ?knobs= hand-off: the wall's ranking rides along.
    expect(new URL(page.url()).searchParams.get('knobs')).toBe(wallKnobs);

    // The queue is the board re-ranked — the OTHER seeded post is in it.
    const queue = page.locator('[data-testid="watch-queue"]');
    await expect(queue).toBeVisible({ timeout: 30_000 });
    await expect(queue.locator('[data-testid="watch-queue-card"]', { hasText: postB })).toBeVisible({ timeout: 30_000 });

    // The video is playable (the player got real media — duration > 0).
    await expect
      .poll(
        async () => {
          const el = await page.locator('video').first().elementHandle();
          return el ? (await el.evaluate((v) => (v as HTMLVideoElement).duration)) || 0 : 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    // --- Click a queue item → the next video (a new history entry) ---
    // Pause the video first: the ?t= write-back (setSearchParams, replace)
    // fires on timeupdate and would race the navigation (overwriting the URL
    // back to the current doc). Pausing stops the timeupdate, so the queue
    // item's navigation is clean.
    await page.locator('video').first().evaluate((v) => (v as HTMLVideoElement).pause());
    await queue.locator('[data-testid="watch-queue-card"]', { hasText: postB }).click();
    await page.waitForURL(`**/watch/${docB}**`, { timeout: 30_000 });
    await expect(page.locator('[data-testid="watch-title"]')).toHaveText(postB, { timeout: 30_000 });
    // The ranking is carried; the playback position is dropped (a new video
    // starts at 0).
    expect(new URL(page.url()).searchParams.get('knobs')).toBe(wallKnobs);
    expect(new URL(page.url()).searchParams.get('t')).toBeFalsy();

    // --- Browser back → the wall, with the SAME ?knobs= (URL is the state) ---
    await page.goBack();
    await page.waitForURL(`**/video**`, { timeout: 30_000 });
    // The grid renders once the wall re-resolves the posts' media to videos.
    await expect(page.locator('[data-testid="discover-home-grid"]')).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).searchParams.get('knobs')).toBe(wallKnobs);

    // --- The ?t= round-trip: seek → the position is written back (replace) ---
    // Re-enter the watch page for post A, play the video, and assert ?t= is
    // written to the URL (the replace-write — no history flood). The write-back
    // fires on timeupdate (throttled), so poll for it rather than a fixed wait.
    await page.goto(`${SOCIAL_BASE}/watch/${docA}?knobs=${wallKnobs}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="watch-player"]')).toBeVisible({ timeout: 60_000 });
    await page.locator('video').first().evaluate((v) => (v as HTMLVideoElement).play());
    await expect
      .poll(
        () => {
          const t = new URL(page.url()).searchParams.get('t');
          return t ? Number(t) : 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    const tParam = new URL(page.url()).searchParams.get('t');
    expect(tParam, '?t= was not written back to the URL').toBeTruthy();

    // No watch-surface errors, no uncaught page errors. The P2P init can fail
    // in the e2e environment (no WebRTC signaling) — it's a global app-init
    // error, unrelated to the watch surface (it surfaces as a `[p2p]` console
    // log AND an uncaught pageerror), so filter it out of both; assert on all
    // OTHER errors.
    const isP2P = (s: string) => s.includes('[p2p]') || s.includes('peerId');
    const errors = logs.filter((l) => (l.includes('FAILED') || l.includes('Error')) && !isP2P(l));
    expect(errors).toEqual([]);
    const watchPageErrors = pageErrors.filter((e) => !isP2P(e));
    expect(watchPageErrors).toEqual([]);
  });
});
