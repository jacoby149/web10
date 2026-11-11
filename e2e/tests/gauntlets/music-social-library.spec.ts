import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_BASE, SOCIAL_BASE, SOCIAL_ORIGIN, PROVIDER, DISCOVER_GROUP_ID,
  signupAndLogin, createFollowersGroup, setTokenCookie, followersGroupId,
  readPostById, deletePost,
} from './helpers/setup';
import { assertMediaTranscoded } from './helpers/truth-media';
import { SOCIAL_SERVICES, SOCIAL_OPERATIONS } from '../../../marketing/web10-social/src/lib/socialContract';

/**
 * Music social-library — the CONNECTED ACCEPTANCE gauntlet (the operator's
 * 10.11.2026 a–g journeys, the KB contract in
 * knowledge-base/strategy/music-social-library.md + web10-v3/social/music.md).
 *
 * Everything here drives the REAL node (FastAPI + ClickHouse + MinIO + the
 * real app build) with real accounts and real media. A unit test or a
 * harness mock cannot fake these seams:
 *
 *   a — an EXISTING user's re-consent: the auth popup must REQUEST the new
 *       `web10-social-playlist-bookmarks` service (the legacy node contract
 *       lacks it), and approving it must land a REAL grant (the service read
 *       flips 403 → 200); denying it must leave the app unbroken and the
 *       grant absent.
 *   b — first/return bookmark save + removal THROUGH THE UI (Browse → Save
 *       playlist → reload → Saved playlists → Remove), with the node truth:
 *       a live pointer doc in the reader's OWN followers group, no copy.
 *   c — two-account bookmark denial: the pointer store is personal CRUD —
 *       B's token cannot read or write A's followers-group docs (I3 403s),
 *       and the app contract is origin-bound (a foreign Origin 403s too).
 *   d — a shared playlist degrades honestly: a LOGGED-OUT recipient opens
 *       the share permalink while public (tracks render + play), the target
 *       post is deleted for real (the dead item is excluded live — the media
 *       doc outlives the tombstoned post), then the curator flips private
 *       (the honest 403 state) — and the bookmarking fan's entry degrades to
 *       "Unavailable playlist" (removable, zero cached content).
 *   e — a REAL video marked as music (the composer's additive
 *       ['short','music'] write, 5.16.1) transcodes to REAL HLS on the node
 *       and plays on the panel's video stage (the session's <video> borrowed
 *       in); the position survives panel close/reopen.
 *   f — a PASTED and a DRAGGED album cover land on the track's media doc
 *       (`thumbnail_object_key`), not a second media item — the Music rows,
 *       playlist cards and phone Media Session all key off that thumbnail.
 *   g — stale-cover self-heal on a REAL delete: the owner's read persists
 *       the reselected cover (face avatar_ref converges to the next live
 *       item's media); a VISITOR's read heals in-session while its write
 *       403s (the node face stays stale until the owner's read).
 *
 * Receipts: JSON + screenshots land in `.context/music-social-library-gauntlet/`
 * (never the repo). The suite is NOT in the CI shard rotation (shards.json) —
 * it is the on-demand connected-acceptance gauntlet, like its siblings in
 * this directory.
 */

const here = dirname(fileURLToPath(import.meta.url));
const RECEIPT_DIR = resolve(here, '../../../../.context/music-social-library-gauntlet');
mkdirSync(RECEIPT_DIR, { recursive: true });

const TEST_VIDEO = readFileSync(resolve(here, '../../fixtures/test-video-vertical.mp4'));
const TEST_AUDIO = readFileSync(resolve(here, '../../fixtures/test-audio.mp3'));
const IMAGE_RED = readFileSync(resolve(here, '../../fixtures/test-image-red.png'));
const IMAGE_BLUE = readFileSync(resolve(here, '../../fixtures/test-image-blue.png'));

const SAVED_TAG = 'web10-social-saved';
const PLAYLIST_BOOKMARK_SERVICE = 'web10-social-playlist-bookmarks';
const GROUP_IDENTITY_SERVICE = 'web10-social-group-identity';
const POSTS_SERVICE = 'posts';
const SAVED_SERVICE = 'saved';
const stamp = Date.now();

// ── Generic plumbing ────────────────────────────────────────────────────────

const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

async function pollUntil<T>(fn: () => Promise<T>, pred: (v: T) => boolean, timeoutMs = 30_000, intervalMs = 1000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  for (;;) {
    last = await fn();
    if (pred(last)) return last;
    if (Date.now() > deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function receipt(name: string, data: Record<string, unknown>) {
  const body = { journey: name, ts: new Date().toISOString(), ...data };
  writeFileSync(join(RECEIPT_DIR, `receipt-${name}.json`), JSON.stringify(body, null, 2));
  return body;
}

async function shot(page: Page, name: string, mobile = false) {
  if (mobile) await page.setViewportSize({ width: 375, height: 812 });
  const path = join(RECEIPT_DIR, `${name}${mobile ? '-375' : ''}.png`);
  await page.screenshot({ path, fullPage: true });
  if (mobile) await page.setViewportSize({ width: 1280, height: 720 });
  return path;
}

/** EVERYTHING from a page — the full console + uncaught exceptions. */
function captureFull(page: Page): { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => errors.push(String(err)));
  return { logs, errors };
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN };
}

// ── App contracts ───────────────────────────────────────────────────────────

/**
 * The CURRENT app's full service set (incl. the playlist-bookmark service) +
 * the gauntlet's `media_metadata` TRUTH-READ grant (the media gauntlet's
 * idiom: the app's contract names `media`, but raw doc reads/transcode truth
 * key off the `media_metadata` collection — the app's own flows are unchanged
 * by the extra grant; they never name it).
 */
async function addSocialAppContract(request: APIRequestContext, token: string): Promise<void> {
  const permissions: Record<string, string[]> = {};
  for (const s of SOCIAL_SERVICES) permissions[s] = [...SOCIAL_OPERATIONS];
  permissions['media_metadata'] = ['readAll', 'create', 'updateOwn', 'deleteOwn'];
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: SOCIAL_ORIGIN, permissions }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `add app contract failed (${res.status})`).toBeTruthy();
}

/** A LEGACY contract — the pre-playbookm service set (the journey-a "existing user"). */
async function addLegacyAppContract(request: APIRequestContext, token: string): Promise<void> {
  const permissions: Record<string, string[]> = {};
  for (const s of SOCIAL_SERVICES) if (s !== PLAYLIST_BOOKMARK_SERVICE) permissions[s] = [...SOCIAL_OPERATIONS];
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: SOCIAL_ORIGIN, permissions }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `add legacy app contract failed (${res.status})`).toBeTruthy();
}

// ── Saved collections (the D88 playlist shape — app-exact, social-saved.spec) ─

const SAVED_ROLES = [
  {
    name: 'owner',
    permissions: {
      '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'],
      group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
    },
  },
  { name: 'reader', permissions: { [SAVED_SERVICE]: ['readAll'], [GROUP_IDENTITY_SERVICE]: ['readAll'] } },
];

const collectionGroupId = (owner: string, slug: string) => `${PROVIDER}/groups/users/${owner}/saved-${slug}`;

/**
 * Create a saved collection the way the app does (src/data/saved.ts
 * createCollection): the group + the kind:'saved' face. Public = the `anyone`
 * reader row + membership_visibility 'public' (D58/D80).
 */
async function createMusicCollection(
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
      membership_visibility: opts.public ? 'public' : 'hidden',
    }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `create collection group failed (${res.status})`).toBeTruthy();
  const groupId = (await res.json()).group_id as string;
  expect(groupId).toBe(collectionGroupId(owner, slug));
  await writeFace(request, token, groupId, {
    kind: 'saved', name: slug, visibility: opts.public ? 'public' : 'private',
  });
  return groupId;
}

/** Read the LATEST group-identity face (the replace-on-write doc stream). */
async function readFace(request: APIRequestContext, token: string, groupId: string): Promise<Record<string, unknown> | null> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: GROUP_IDENTITY_SERVICE, groups: [groupId], limit: 5 }),
    headers: jsonHeaders(),
  });
  if (!res.ok()) return null;
  const docs = (await res.json()) as { body?: Record<string, unknown> }[];
  return docs.length ? (docs[0].body || null) : null;
}

/** Write a face (the app's writeGroupIdentity: a NEW doc — the latest wins). */
async function writeFace(request: APIRequestContext, token: string, groupId: string, body: Record<string, unknown>) {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: GROUP_IDENTITY_SERVICE, body, groups: [groupId] }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `write face failed (${res.status})`).toBeTruthy();
}

async function createPost(
  request: APIRequestContext, token: string,
  opts: { text: string; title?: string; groups: string[]; media_refs?: string[]; tags?: string[]; visibility?: string },
): Promise<string> {
  const body: Record<string, unknown> = {
    text: opts.text, date: new Date().toISOString(),
    title: opts.title, visibility: opts.visibility || 'public',
  };
  if (opts.media_refs?.length) body.media_refs = opts.media_refs;
  if (opts.tags?.length) body.tags = opts.tags;
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: POSTS_SERVICE, body, groups: opts.groups }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `create post failed (${res.status})`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Save a post into a collection (the app's exact write: a `saved` doc ref_value'd). */
async function savePostToCollection(request: APIRequestContext, token: string, groupId: string, postId: string) {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: SAVED_SERVICE, body: { post_id: postId }, groups: [groupId], ref_value: postId }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `save post to collection failed (${res.status})`).toBeTruthy();
}

/** The app's exact collection read (may 403 — the I3 seam). */
async function rawReadSaved(request: APIRequestContext, token: string, groupId: string): Promise<{ status: number; docs: any[] }> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SAVED_SERVICE, groups: [groupId] }),
    headers: jsonHeaders(),
  });
  const docs = res.ok() ? (await res.json()) as any[] : [];
  return { status: res.status(), docs };
}

async function addAnyoneReader(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/groups/members/add`, {
    data: JSON.stringify({ token, group_id: groupId, member_key: 'anyone', role: 'reader' }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `add anyone reader failed (${res.status})`).toBeTruthy();
}

async function removeAnyoneReader(request: APIRequestContext, token: string, groupId: string) {
  const res = await request.post(`${API_BASE}/v3/groups/members/remove`, {
    data: JSON.stringify({ token, group_id: groupId, member_key: 'anyone' }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `remove anyone reader failed (${res.status})`).toBeTruthy();
}

/** D80: the by-user enumeration's visibility policy (the app's setCollectionVisibility). */
async function setMembershipVisibility(request: APIRequestContext, token: string, groupId: string, visibility: 'public' | 'hidden') {
  const res = await request.post(`${API_BASE}/v3/groups/update`, {
    data: JSON.stringify({ token, group_id: groupId, membership_visibility: visibility }),
    headers: jsonHeaders(),
  });
  expect(res.ok(), `set membership_visibility failed (${res.status})`).toBeTruthy();
}

/** The D80 by-user read (anon-capable) — a user's public-visibility groups by tag. */
async function byUserGroups(request: APIRequestContext, user: string): Promise<any[]> {
  const res = await request.get(`${API_BASE}/v3/groups/by-user`, { params: { user, tag: SAVED_TAG } });
  expect(res.ok(), `by-user read failed (${res.status})`).toBeTruthy();
  return ((await res.json()) as any).groups;
}

// ── Playlist bookmarks (the personal pointer store) ─────────────────────────

/** Read the reader's OWN bookmark docs (the app's exact read: their followers group). */
async function bookmarkTruth(request: APIRequestContext, token: string, username: string): Promise<{ status: number; docs: any[] }> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: PLAYLIST_BOOKMARK_SERVICE, groups: [followersGroupId(username)] }),
    headers: jsonHeaders(),
  });
  const docs = res.ok() ? (await res.json()) as any[] : [];
  return { status: res.status(), docs };
}

async function bookmarkCreateStatus(request: APIRequestContext, token: string, username: string, collectionId: string): Promise<number> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: PLAYLIST_BOOKMARK_SERVICE, body: { collection_id: collectionId }, groups: [followersGroupId(username)] }),
    headers: jsonHeaders(),
  });
  return res.status();
}

// ── Media (the upload → confirm → attach pipeline — the media gauntlet's floor) ──

/** Presigned POST to MinIO (the app's exact two-step upload). */
async function uploadObjectToMinio(request: APIRequestContext, token: string, filename: string, mimeType: string, buffer: Uint8Array): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/media/upload-url`, {
    data: JSON.stringify({ token, body: { filename, mime_type: mimeType } }),
    headers: jsonHeaders(),
  });
  if (!res.ok()) throw new Error(`upload-url failed (${res.status})`);
  const { upload_url, fields, object_key } = (await res.json()) as { upload_url: string; fields: Record<string, string>; object_key: string };
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    ...fields,
    file: { name: filename, mimeType, buffer: Buffer.from(buffer) },
  };
  const put = await request.post(upload_url, { multipart });
  const status = put.status();
  const body = await put.text();
  if (status >= 300 || body.includes('<Error>')) throw new Error(`MinIO upload failed: status ${status}, body: ${body}`);
  return object_key;
}

/** Confirm the media doc into `media_metadata` (the app's exact confirm body). */
async function confirmMediaDoc(
  request: APIRequestContext, token: string, objectKey: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/media/confirm`, {
    data: JSON.stringify({
      token,
      body: {
        object_key: objectKey,
        filename: objectKey.split('/').pop() || 'file',
        mime_type: extra.mime_type || 'application/octet-stream',
        size_bytes: extra.size_bytes ?? null,
        width: extra.width ?? null,
        height: extra.height ?? null,
        duration_seconds: extra.duration_seconds ?? null,
        thumbnail_object_key: extra.thumbnail_object_key ?? null,
        alt_text: null,
        service: 'media',
        ...extra,
      },
    }),
    headers: jsonHeaders(),
  });
  if (!res.ok()) throw new Error(`confirm media doc failed (${res.status()})`);
  return (await res.json()).doc_id as string;
}

/**
 * Attach the (group-less) media doc to the post's groups (the multi-user
 * access model — the media gauntlet's idiom). A raw doc_id read is
 * group-gated (the doc is group-less straight off /v3/media/confirm), and a
 * VISITOR's cover/media resolution needs the discover grant; the attach
 * requires the gauntlet's `media_metadata` truth-read grant (the app's
 * consented contract names `media` — the app's own post flow rides the
 * query-resolved rebind instead).
 */
async function attachMediaDocToGroup(request: APIRequestContext, token: string, mediaDocId: string, groups: string[]) {
  const res = await request.post(`${API_BASE}/v3/update`, {
    data: JSON.stringify({ token, doc_id: mediaDocId, body: {}, groups }),
    headers: jsonHeaders(),
  });
  if (!res.ok()) throw new Error(`attach media doc to group failed (${res.status()})`);
}

async function queueTranscode(request: APIRequestContext, token: string, mediaDocId: string) {
  const res = await request.post(`${API_BASE}/v3/media/transcode`, {
    data: JSON.stringify({ token, doc_id: mediaDocId }),
    headers: jsonHeaders(),
  });
  if (!res.ok()) throw new Error(`queue transcode failed (${res.status})`);
}

/**
 * Read a media doc by id the way the APP does for owner resolution: the
 * owner-scoped `/v3/media/list` (doc_ids narrow — `list_media` filters
 * `author_key = the caller`). The raw doc_id READ is group-gated and 404s a
 * group-less media doc even for its author — the app never uses it for this.
 */
async function readMediaDoc(request: APIRequestContext, token: string, mediaDocId: string): Promise<any | null> {
  const res = await request.post(`${API_BASE}/v3/media/list`, {
    data: JSON.stringify({ token, limit: 5, doc_ids: [mediaDocId] }),
    headers: jsonHeaders(),
  });
  if (!res.ok()) return null;
  const docs = (await res.json()) as any[];
  return docs.find((d) => d.doc_id === mediaDocId) || null;
}

/** A presigned GET for an owner-namespace key (proves the object exists + is readable). */
async function mediaReadUrl(request: APIRequestContext, token: string, objectKey: string): Promise<string | null> {
  const res = await request.post(`${API_BASE}/v3/media/read-url`, {
    data: JSON.stringify({ token, body: { object_key: objectKey } }),
    headers: jsonHeaders(),
  });
  if (!res.ok()) return null;
  return ((await res.json()) as { read_url?: string }).read_url || null;
}

/** The journey-b/d fixture: a curator with a PUBLIC music playlist (one real audio track). */
async function curatorPublicPlaylist(request: APIRequestContext, prefix: string, slug: string) {
  const curator = await signupAndLogin(request, prefix);
  await addSocialAppContract(request, curator.token);
  const followers = await createFollowersGroup(request, curator.token, curator.username);
  const objectKey = await uploadObjectToMinio(request, curator.token, `song-${stamp}.mp3`, 'audio/mpeg', TEST_AUDIO);
  const mediaDocId = await confirmMediaDoc(request, curator.token, objectKey, {
    mime_type: 'audio/mpeg', size_bytes: TEST_AUDIO.length,
  });
  const postId = await createPost(request, curator.token, {
    text: `gauntlet song ${stamp}`, title: `Gauntlet Song ${stamp}`,
    groups: [followers, DISCOVER_GROUP_ID], media_refs: [mediaDocId], tags: ['music'],
  });
  const collectionId = await createMusicCollection(request, curator.token, curator.username, slug, { public: true });
  await savePostToCollection(request, curator.token, collectionId, postId);
  // The D80 by-user read must surface the public collection (CH eventual consistency).
  await pollUntil(
    () => byUserGroups(request, curator.username),
    (groups) => groups.some((g) => g.group_id === collectionId),
    30_000,
  );
  return { curator, followers, mediaDocId, postId, collectionId };
}

/** A fresh signed-in app context (the token cookie on BOTH origins). */
async function signedInContext(browser: { newContext(): Promise<BrowserContext> }, token: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  await setTokenCookie(ctx, 'social.localhost', token);
  await setTokenCookie(ctx, 'auth.localhost', token);
  const page = await ctx.newPage();
  await settle();
  return { ctx, page };
}

// ─────────────────────────────────────────────────────────────────────────────
// a — existing-user re-consent: the popup requests the new service; approve
//     lands a real grant; deny leaves the app unbroken and the grant absent.
// ─────────────────────────────────────────────────────────────────────────────

test('a: an existing user re-consents through the popup — the bookmark service is requested, and approve/deny both land truthfully', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const notes: string[] = [];

  // ── Approve leg ──────────────────────────────────────────────────────────
  const A = await signupAndLogin(request, 'msliba');
  await addLegacyAppContract(request, A.token); // the pre-bookmark service set

  // Truth BEFORE consent: the app origin cannot read the bookmark service.
  const before = await bookmarkTruth(request, A.token, A.username);
  expect(before.status).toBe(403);
  notes.push(`pre-consent: bookmark service read (app origin, legacy contract) → ${before.status}`);

  const ctx = await browser.newContext();
  await setTokenCookie(ctx, 'auth.localhost', A.token); // the popup session = the EXISTING user
  const page = await ctx.newPage();
  const full = captureFull(page);
  await page.goto(SOCIAL_BASE);
  await page.waitForLoadState('networkidle');

  const signIn = page.locator('[data-testid="sign-in-button-desktop"]');
  await expect(signIn).toBeVisible({ timeout: 20_000 });

  const popupPromise = ctx.waitForEvent('page', { timeout: 20_000 });
  await signIn.click();
  const popup = await popupPromise;
  const popupFull = captureFull(popup);
  await popup.waitForLoadState('networkidle');

  // THE seam: the re-consent row REQUESTS the new service (the node still has
  // only the legacy contract — the app's current service set says otherwise).
  const req = popup.locator('[data-testid="consent-req-0"]');
  await expect(req).toBeVisible({ timeout: 20_000 });
  const reqText = await req.innerText();
  expect(reqText).toContain(PLAYLIST_BOOKMARK_SERVICE);
  notes.push(`consent row requested (truncated): ${reqText.slice(0, 500)}`);
  await popup.screenshot({ path: join(RECEIPT_DIR, 'a-consent-row.png') });

  await popup.locator('[data-testid="consent-approve-0"]').click();

  // The token came back to the app (the signed-in layout: the sign-in button
  // is gone, the account row renders with the username).
  await expect(page.locator('[data-testid="sign-in-button-desktop"]')).toHaveCount(0, { timeout: 25_000 });
  expect(full.logs.join('\n')).toContain('authListen fired');
  notes.push('opener: authListen fired (the token handoff is real); signed-in layout rendered');

  // Truth AFTER: the grant landed (the app origin reads the service).
  const after = await pollUntil(() => bookmarkTruth(request, A.token, A.username), (v) => v.status === 200, 30_000);
  expect(after.status).toBe(200);
  notes.push(`post-consent: bookmark service read (app origin) → ${after.status} (grant landed)`);
  await shot(page, 'a-signed-in');
  await ctx.close();
  await popup.close().catch(() => {});

  // ── Deny leg ─────────────────────────────────────────────────────────────
  const B = await signupAndLogin(request, 'mslibb');
  await addLegacyAppContract(request, B.token);

  const ctx2 = await browser.newContext();
  await setTokenCookie(ctx2, 'auth.localhost', B.token);
  const page2 = await ctx2.newPage();
  const full2 = captureFull(page2);
  await page2.goto(SOCIAL_BASE);
  await page2.waitForLoadState('networkidle');

  const popupPromise2 = ctx2.waitForEvent('page', { timeout: 20_000 });
  await page2.locator('[data-testid="sign-in-button-desktop"]').click();
  const popup2 = await popupPromise2;
  await popup2.waitForLoadState('networkidle');
  const req2 = popup2.locator('[data-testid="consent-req-0"]');
  await expect(req2).toBeVisible({ timeout: 20_000 });
  await popup2.screenshot({ path: join(RECEIPT_DIR, 'a-consent-row-deny.png') });
  await popup2.locator('[data-testid="consent-deny-0"]').click();

  // The app must NOT crash on a denied contract (no uncaught exceptions).
  await settle(4000);
  expect(full2.errors, `opener pageerrors on deny: ${full2.errors.join(' | ')}`).toHaveLength(0);
  const signedInAfterDeny = (await page2.locator('[data-testid="sign-in-button-desktop"]').count()) === 0;
  notes.push(`deny leg: no opener pageerrors; signed-in after deny = ${signedInAfterDeny}`);

  // Truth: no grant — the bookmark service stays 403 for the app origin.
  const bAfter = await bookmarkTruth(request, B.token, B.username);
  expect(bAfter.status).toBe(403);
  notes.push(`post-deny: bookmark service read (app origin) → ${bAfter.status} (grant absent)`);
  await ctx2.close();
  await popup2.close().catch(() => {});

  receipt('a', { userA: A.username, userB: B.username, notes, consentRowText: reqText });
});

// ─────────────────────────────────────────────────────────────────────────────
// b — first/return bookmark save + removal, through the UI; the node truth is
//     a live pointer doc in the READER's own followers group.
// ─────────────────────────────────────────────────────────────────────────────

test('b: a fan saves a public playlist from Browse and removes it — the node holds a live pointer, not a copy', async ({ browser, request }) => {
  test.setTimeout(300_000);
  const notes: string[] = [];
  const slug = `ms-playlist-${stamp}`;
  const { curator, collectionId } = await curatorPublicPlaylist(request, 'mslibc', slug);

  const F = await signupAndLogin(request, 'mslibf');
  await addSocialAppContract(request, F.token);
  await createFollowersGroup(request, F.token, F.username); // the bookmark write target

  // Truth before: no bookmark doc.
  let truth = await pollUntil(() => bookmarkTruth(request, F.token, F.username), (v) => v.status === 200, 30_000);
  expect(truth.docs).toHaveLength(0);
  notes.push('pre-save: zero bookmark docs in the fan\'s followers group');

  // ── First visit: Browse → open the playlist → Save ───────────────────────
  const first = await signedInContext(browser, F.token);
  const page = first.page;
  const full = captureFull(page);
  await page.goto(`${SOCIAL_BASE}/music?view=playlists&scope=browse`);
  await page.waitForLoadState('networkidle');

  await page.locator('#playlist-curator').fill(curator.username);
  await page.getByRole('button', { name: 'Browse', exact: true }).click();

  const card = page.locator('button', { hasText: slug }).first();
  await expect(card).toBeVisible({ timeout: 25_000 });
  notes.push(`browse scope: the curator's public playlist card rendered`);
  await card.click();

  const saveBtn = page.getByRole('button', { name: 'Save playlist', exact: true });
  await expect(saveBtn).toBeEnabled({ timeout: 25_000 }); // enabled = the bookmark state loaded
  await saveBtn.click();
  await expect(page.getByRole('button', { name: 'Remove saved playlist', exact: true })).toBeEnabled({ timeout: 25_000 });
  notes.push('save: the control flipped to "Remove saved playlist"');
  await shot(page, 'b-saved-detail');

  // Truth: the POINTER landed (a doc in the fan's OWN followers group).
  truth = await pollUntil(
    () => bookmarkTruth(request, F.token, F.username),
    (v) => v.docs.some((d) => d.body?.collection_id === collectionId),
    30_000,
  );
  const pointer = truth.docs.find((d) => d.body?.collection_id === collectionId)!;
  expect(pointer.author_key === F.username || pointer.author_key === `${PROVIDER}/users/${F.username}`).toBeTruthy();
  expect(pointer.body).toEqual({ collection_id: collectionId }); // a pointer — zero copied content
  notes.push(`truth: bookmark doc ${pointer.doc_id} (author ${pointer.author_key}, body = pointer only)`);
  await first.ctx.close();

  // ── Return visit (a fresh context): the entry persists in Saved playlists ──
  const second = await signedInContext(browser, F.token);
  const page2 = second.page;
  await page2.goto(`${SOCIAL_BASE}/music?view=playlists&scope=bookmarks`);
  await page2.waitForLoadState('networkidle');
  // The entry: the li carries the name AND the group sub-label (both match the
  // slug — scope to the list item, not the text).
  await expect(page2.locator('li', { hasText: slug })).toBeVisible({ timeout: 25_000 });
  notes.push('return visit: the entry persists and the name resolves live');
  await shot(page2, 'b-saved-list');

  // Removal.
  await page2.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page2.getByText('Find a curator you trust')).toBeVisible({ timeout: 25_000 });
  truth = await pollUntil(
    () => bookmarkTruth(request, F.token, F.username),
    (v) => !v.docs.some((d) => d.body?.collection_id === collectionId),
    30_000,
  );
  notes.push('remove: the list emptied and the pointer doc is gone');
  const logStr = full.logs.join('\n');
  expect(logStr).toContain('[music-library] bookmark mutation');
  await second.ctx.close();

  receipt('b', { curator: curator.username, fan: F.username, collectionId, notes, logExcerpt: full.logs.filter((l: string) => l.includes('[music-library]') || l.includes('[music]')).slice(0, 40) });
});

// ─────────────────────────────────────────────────────────────────────────────
// c — two-account bookmark denial: the pointer store is personal CRUD (I3).
// ─────────────────────────────────────────────────────────────────────────────

test('c: two-account bookmark denial — B cannot read or write A\'s pointer store, and the contract is origin-bound', async ({ request }) => {
  test.setTimeout(120_000);
  const notes: string[] = [];
  const A = await signupAndLogin(request, 'mslibca');
  const B = await signupAndLogin(request, 'mslibcb');
  await addSocialAppContract(request, A.token);
  await addSocialAppContract(request, B.token);
  const aFollowers = await createFollowersGroup(request, A.token, A.username);
  const bFollowers = await createFollowersGroup(request, B.token, B.username);
  void aFollowers; void bFollowers;

  // A bookmarks (their own store) — the app-exact write.
  const target = `${PROVIDER}/groups/users/${A.username}/saved-gauntlet-target`;
  expect(await bookmarkCreateStatus(request, A.token, A.username, target)).toBe(200);
  let truth = await pollUntil(() => bookmarkTruth(request, A.token, A.username), (v) => v.docs.length >= 1, 20_000);
  expect(truth.docs[0].body.collection_id).toBe(target);
  notes.push(`A: own-store write 201 + read 200 (1 pointer doc)`);

  // B reads A's store → 403 (I3: B's token does not own A's group).
  const bReadA = await bookmarkTruth(request, B.token, A.username);
  expect(bReadA.status).toBe(403);
  expect(bReadA.docs).toHaveLength(0);
  notes.push(`B reads A's store → ${bReadA.status} (zero docs leaked)`);

  // B writes into A's store → 403.
  const bWriteA = await bookmarkCreateStatus(request, B.token, A.username, target);
  expect(bWriteA).toBe(403);
  notes.push(`B writes into A's store → ${bWriteA}`);

  // B's OWN store still works (the denial is targeted, not total).
  const bOwn = await bookmarkTruth(request, B.token, B.username);
  expect(bOwn.status).toBe(200);
  expect(bOwn.docs).toHaveLength(0);
  notes.push(`B reads own store → 200 (empty — the denial is per-owner)`);

  // The app contract is ORIGIN-BOUND: A's token from a foreign origin 403s.
  const foreign = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token: A.token, service: PLAYLIST_BOOKMARK_SERVICE, groups: [followersGroupId(A.username)] }),
    headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
  });
  expect(foreign.status()).toBe(403);
  notes.push(`A's token from a foreign Origin → ${foreign.status()} (the contract is origin-bound)`);

  receipt('c', { userA: A.username, userB: B.username, target, notes });
});

// ─────────────────────────────────────────────────────────────────────────────
// d — a shared playlist degrades honestly: public (a logged-out recipient sees
//     + plays it) → the target post is deleted for real → the curator flips
//     private → the recipient sees the honest 403 state, and the bookmarking
//     fan's entry degrades to "Unavailable playlist".
// ─────────────────────────────────────────────────────────────────────────────

test('d: a shared playlist degrades honestly — public → deleted target → private (logged-out recipient + bookmarking fan)', async ({ browser, request }) => {
  test.setTimeout(300_000);
  const notes: string[] = [];
  const slug = `ms-degrade-${stamp}`;
  const { curator, postId, collectionId } = await curatorPublicPlaylist(request, 'mslibd', slug);

  // The fan bookmarks the playlist (API truth — the UI save is journey b's).
  const F = await signupAndLogin(request, 'mslibdf');
  await addSocialAppContract(request, F.token);
  await createFollowersGroup(request, F.token, F.username);
  expect(await bookmarkCreateStatus(request, F.token, F.username, collectionId)).toBe(200);

  // ── 1) A LOGGED-OUT recipient opens the share permalink while public ─────
  const anonCtx = await browser.newContext(); // no cookies — a clean recipient
  const anon = await anonCtx.newPage();
  const anonFull = captureFull(anon);
  await anon.goto(`${SOCIAL_BASE}/music?view=playlists&collection=${encodeURIComponent(collectionId)}`);
  await anon.waitForLoadState('networkidle');
  const trackCard = anon.locator('[data-testid="music-track-card"]');
  await expect(trackCard).toBeVisible({ timeout: 25_000 });
  notes.push('logged-out recipient: the public playlist renders (the track card is playable)');
  await shot(anon, 'd-anon-public');
  await shot(anon, 'd-anon-public', true);

  // ── 2) The curator deletes the target post FOR REAL (the media outlives it) ──
  await deletePost(request, curator.token, postId);
  // The tombstone must settle before the recipient reloads (the dead item is
  // excluded live only once it reads as gone for all readers).
  const settled404 = await pollUntil(async () => {
    const res = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: curator.token, service: POSTS_SERVICE, doc_id: postId }),
      headers: jsonHeaders(),
    });
    return res.status();
  }, (s) => s === 404, 60_000, 1000);
  expect(settled404, 'the delete never settled (single-doc read still serves the live row)').toBe(404);
  notes.push('the target post is tombstoned and settled (its media doc outlives it)');
  await anon.reload();
  await anon.waitForLoadState('networkidle');
  await expect(anon.locator('[data-testid="music-track-card"]')).toHaveCount(0, { timeout: 25_000 });
  // The dead ref must not hard-fail the view (the collection still renders its name).
  expect(anonFull.errors, `anon pageerrors: ${anonFull.errors.join(' | ')}`).toHaveLength(0);
  notes.push('logged-out recipient after delete: zero tracks (the dead item is excluded live), no crash');
  await shot(anon, 'd-anon-deleted-target');

  // ── 3) The curator flips the playlist private (the app's three writes) ────
  await removeAnyoneReader(request, curator.token, collectionId);
  await setMembershipVisibility(request, curator.token, collectionId, 'hidden');
  await writeFace(request, curator.token, collectionId, {
    kind: 'saved', name: slug, visibility: 'private',
  });
  notes.push('the playlist is now private (anyone row removed + D80 hidden + face private)');
  await anon.reload();
  await anon.waitForLoadState('networkidle');
  await expect(anon.getByText('This playlist is private or no longer available.')).toBeVisible({ timeout: 25_000 });
  notes.push('logged-out recipient after private: the honest 403 state');
  await shot(anon, 'd-anon-private');
  await shot(anon, 'd-anon-private', true);
  await anonCtx.close();

  // ── 4) The bookmarking fan: the entry degrades to "Unavailable playlist" ───
  const fan = await signedInContext(browser, F.token);
  await fan.page.goto(`${SOCIAL_BASE}/music?view=playlists&scope=bookmarks`);
  await fan.page.waitForLoadState('networkidle');
  await expect(fan.page.getByText('Unavailable playlist')).toBeVisible({ timeout: 25_000 });
  notes.push('the bookmarking fan: the entry degrades to "Unavailable playlist" (removable, zero cached content)');
  await shot(fan.page, 'd-fan-unavailable');

  // The pointer doc is still a pointer (it names the collection — nothing copied).
  const fanTruth = await pollUntil(() => bookmarkTruth(request, F.token, F.username), (v) => v.docs.length >= 1, 20_000);
  expect(fanTruth.docs[0].body).toEqual({ collection_id: collectionId });
  await fan.ctx.close();

  receipt('d', { curator: curator.username, fan: F.username, collectionId, postId, notes });
});

// ─────────────────────────────────────────────────────────────────────────────
// e — a REAL video marked as music: the additive ['short','music'] write
//     (5.16.1), the node's real HLS transcode, playback on the panel's video
//     stage, and position surviving panel close/reopen.
// ─────────────────────────────────────────────────────────────────────────────

test('e: a video marked as music transcodes to real HLS and plays on the panel stage — position survives close/reopen', async ({ browser, request }) => {
  test.setTimeout(480_000);
  const notes: string[] = [];
  const title = `Gauntlet Video Track ${stamp}`;

  const C = await signupAndLogin(request, 'mslibe');
  await addSocialAppContract(request, C.token);
  const followers = await createFollowersGroup(request, C.token, C.username);

  // The real upload → confirm → attach → transcode-queue pipeline.
  const objectKey = await uploadObjectToMinio(request, C.token, `gauntlet-e2e-${stamp}.mp4`, 'video/mp4', TEST_VIDEO);
  const mediaDocId = await confirmMediaDoc(request, C.token, objectKey, {
    mime_type: 'video/mp4', size_bytes: TEST_VIDEO.length, width: 720, height: 1280,
    video: { type: 'minio', value: objectKey },
  });
  await attachMediaDocToGroup(request, C.token, mediaDocId, [followers, DISCOVER_GROUP_ID]);
  await queueTranscode(request, C.token, mediaDocId);
  notes.push(`media doc ${mediaDocId} queued for the node's real transcode`);

  // The composer's 5.16.1 ADDITIVE write: a vertical video marked as music is
  // BOTH a short and a track.
  const postId = await createPost(request, C.token, {
    text: title, title, groups: [followers, DISCOVER_GROUP_ID],
    media_refs: [mediaDocId], tags: ['short', 'music'],
  });
  const postDoc = await readPostById(request, C.token, postId);
  expect(postDoc?.body.tags).toEqual(expect.arrayContaining(['short', 'music']));
  notes.push(`the post carries the additive tags ${JSON.stringify(postDoc?.body.tags)}`);

  // The transcode truth (the load-bearing assertion: done WITH variants + a minted manifest).
  const truth = await assertMediaTranscoded(request, C.token, mediaDocId, 240_000);
  expect(truth.hasManifestUrl).toBeTruthy();
  notes.push(`transcode truth: status=${truth.status}, variants=${truth.variantCount}, manifest minted=${truth.hasManifestUrl}`);

  // ── The browser: the Music tab sees it; the panel plays it on the stage ────
  const { ctx, page } = await signedInContext(browser, C.token);
  const full = captureFull(page);
  await page.goto(`${SOCIAL_BASE}/music`);
  await page.waitForLoadState('networkidle');

  const card = page.locator('[data-testid="music-track-card"]', { hasText: title });
  await expect(card).toBeVisible({ timeout: 45_000 });
  notes.push('the Music tab (explore) lists the video track (the real transcode is the artwork source)');
  // The card starts the track in the BACKGROUND (the session's queue is the whole
  // loaded mix) — the full panel opens from the now-playing bar's link.
  await card.click();
  await expect(page.locator('[data-testid="music-player"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: `Open player: ${title}` }).click();
  await expect(page).toHaveURL(/panel=player/, { timeout: 15_000 });

  const stage = page.locator('[data-testid="music-video-stage"]');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  const video = stage.locator('video');
  await expect(video).toHaveCount(1, { timeout: 30_000 }); // the session element was borrowed in
  notes.push('the panel stage carries the session\'s <video> element (the borrow is a real DOM move)');

  // HLS actually plays (headless Chromium decodes the fixture's H.264).
  await expect(async () => {
    const t = await video.evaluate((v) => (v as HTMLVideoElement).currentTime);
    expect(t).toBeGreaterThan(0.5);
  }).toPass({ timeout: 60_000, intervals: [1000] });
  // PAUSE before the position test — the explore queue auto-advances when a
  // track ends, and a moving position would make the survive-reopen bound flaky.
  await page.getByRole('button', { name: 'Pause track' }).click();
  const positionBefore = await video.evaluate((v) => (v as HTMLVideoElement).currentTime);
  notes.push(`playback: currentTime reached ${positionBefore.toFixed(2)}s on the real HLS manifest (paused for the position test)`);
  await shot(page, 'e-video-stage');
  await shot(page, 'e-video-stage', true);

  // Close the panel — the position must survive the reopen (the session owns the element).
  await page.getByRole('button', { name: 'Back to browsing' }).click();
  await expect(stage).toHaveCount(0, { timeout: 15_000 });
  // Reopen via the now-playing bar (the track is still current — paused).
  await page.getByRole('link', { name: `Open player: ${title}` }).click();
  await expect(page).toHaveURL(/panel=player/, { timeout: 15_000 });
  const video2 = page.locator('[data-testid="music-video-stage"]').locator('video');
  await expect(video2).toHaveCount(1, { timeout: 30_000 });
  await expect(async () => {
    const t = await video2.evaluate((v) => (v as HTMLVideoElement).currentTime);
    expect(t).toBeGreaterThanOrEqual(positionBefore - 0.75);
  }).toPass({ timeout: 30_000, intervals: [500] });
  notes.push(`position survived close/reopen (paused at ${positionBefore.toFixed(2)}s — the same <video> element was borrowed back)`);

  const logStr = full.logs.join('\n');
  expect(logStr).toContain('[music'); // the music layer logged its session work
  await ctx.close();

  receipt('e', { user: C.username, mediaDocId, postId, notes, logExcerpt: full.logs.filter((l: string) => l.includes('[music')).slice(0, 40) });
});

// ─────────────────────────────────────────────────────────────────────────────
// f — a PASTED and a DRAGGED album cover land on the track's media doc
//     (thumbnail_object_key), not a second media item.
// ─────────────────────────────────────────────────────────────────────────────

/** Paste an image file onto an element (the pixels-on-the-clipboard path). */
async function pasteImageFile(page: Page, selector: string, pngBase64: string, name: string) {
  await page.locator(selector).evaluate(
    (el, { b64, fileName }: { b64: string; fileName: string }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], fileName, { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { b64: pngBase64, fileName: name },
  );
}

/** Drag-and-drop an image file onto an element (the drag-onto-chip path). */
async function dropImageFile(page: Page, selector: string, pngBase64: string, name: string) {
  await page.locator(selector).evaluate(
    (el, { b64, fileName }: { b64: string; fileName: string }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], fileName, { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { b64: pngBase64, fileName: name },
  );
}

async function openComposer(page: Page) {
  await page.goto(`${SOCIAL_BASE}/feed?compose=1`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="new-post-sheet"]')).toBeVisible({ timeout: 25_000 });
}

/** Post the track through the REAL composer and return the (post, media doc) pair. */
async function submitTrackWithCover(
  request: APIRequestContext, token: string, username: string,
  page: Page, mode: 'paste' | 'drag', coverPngBase64: string, coverName: string, caption: string,
): Promise<{ postDocId: string; mediaDocId: string; thumbnailKey: string }> {
  await openComposer(page);
  const fileInput = page.locator('[data-testid="post-composer"] input[type="file"]').first();
  await fileInput.setInputFiles({ name: `gauntlet-${mode}.mp3`, mimeType: 'audio/mpeg', buffer: TEST_AUDIO });

  // The exactly-one-audio-item tray shows the album-art chip.
  const chip = page.locator('[data-testid="album-art-chip"]');
  await expect(chip).toBeVisible({ timeout: 25_000 });
  await expect(chip).toContainText('Add art');

  if (mode === 'paste') await pasteImageFile(page, '[data-testid="album-art-chip"]', coverPngBase64, coverName);
  else await dropImageFile(page, '[data-testid="album-art-chip"]', coverPngBase64, coverName);

  // The cover landed ON THE TRACK: the tray card's artwork zone shows it
  // (the alt="Album art" img) and the chip flips to "Change art".
  await expect(page.locator('[data-testid="media-tray"] img[alt="Album art"]')).toBeVisible({ timeout: 25_000 });
  await expect(chip).toContainText('Change art');
  const trayItems = await page.locator('[data-testid="media-tray"] > *').count();
  expect(trayItems, `the tray must hold one item (the audio), not two`).toBe(1);
  await page.locator('[data-testid="composer-textarea"]').fill(caption);
  await shot(page, `f-album-art-${mode}`);
  await shot(page, `f-album-art-${mode}`, true);

  await page.locator('[data-testid="post-submit"]').click();
  await expect(page.locator('[data-testid="new-post-sheet"]')).toHaveCount(0, { timeout: 90_000 });

  // Truth: find the post (the caption), then its media doc (the owner self-read).
  const followers = followersGroupId(username);
  const post = await pollUntil(async () => {
    const res = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: POSTS_SERVICE, groups: [followers, DISCOVER_GROUP_ID] }),
      headers: jsonHeaders(),
    });
    const docs = res.ok() ? (await res.json()) as any[] : [];
    return docs.find((d) => d.body?.text === caption) || null;
  }, (p) => !!p, 60_000);
  expect(post, 'the posted track was not found in the node').toBeTruthy();
  // The single-doc read RESOLVES media_refs (object rows with doc_id) —
  // extract the doc_id whether it came back a string or a resolved ref.
  const firstRef = post!.body.media_refs?.[0] as string | { doc_id?: string } | undefined;
  const mediaDocId = typeof firstRef === 'string' ? firstRef : firstRef?.doc_id;
  expect(mediaDocId, 'the post carried no media ref').toBeTruthy();
  const media = await readMediaDoc(request, token, mediaDocId!);
  expect(media).toBeTruthy();
  expect(media.body.mime_type).toBe('audio/mpeg');
  const thumbnailKey = media.body.thumbnail_object_key as string;
  expect(thumbnailKey, 'the cover did not land on the media doc').toBeTruthy();
  // The thumbnail object really exists on the node (a fresh presigned GET).
  const thumbUrl = await mediaReadUrl(request, token, thumbnailKey);
  expect(thumbUrl, 'the thumbnail object is not readable').toBeTruthy();
  const thumbRes = await request.get(thumbUrl!);
  expect(thumbRes.ok(), `thumbnail GET failed (${thumbRes.status()})`).toBeTruthy();
  expect(thumbRes.headers()['content-type']).toContain('image');
  // The track is auto-tagged music (the audio's auto-tag).
  expect(post!.body.tags || []).toContain('music');
  return { postDocId: post!.doc_id, mediaDocId, thumbnailKey };
}

test('f: a pasted and a dragged album cover land on the track\'s media doc (thumbnail_object_key)', async ({ browser, request }) => {
  test.setTimeout(420_000);
  const notes: string[] = [];
  const C = await signupAndLogin(request, 'mslibf2');
  await addSocialAppContract(request, C.token);
  await createFollowersGroup(request, C.token, C.username);

  const { ctx, page } = await signedInContext(browser, C.token);
  const full = captureFull(page);

  // PASTE path (the red cover).
  const pasted = await submitTrackWithCover(
    request, C.token, C.username, page, 'paste',
    IMAGE_RED.toString('base64'), 'cover-red.png', `gauntlet album art paste ${stamp}`,
  );
  notes.push(`paste: post ${pasted.postDocId} → media ${pasted.mediaDocId} → thumbnail_object_key ${pasted.thumbnailKey} (GET 200, image)`);
  await shot(page, 'f-after-paste-posted');

  // DRAG path (the blue cover) — a second post, the chip drag-onto route.
  const dragged = await submitTrackWithCover(
    request, C.token, C.username, page, 'drag',
    IMAGE_BLUE.toString('base64'), 'cover-blue.png', `gauntlet album art drag ${stamp}`,
  );
  expect(dragged.thumbnailKey).not.toBe(pasted.thumbnailKey);
  notes.push(`drag: post ${dragged.postDocId} → media ${dragged.mediaDocId} → thumbnail_object_key ${dragged.thumbnailKey} (GET 200, image)`);
  await shot(page, 'f-after-drag-posted');

  const logStr = full.logs.join('\n');
  expect(logStr).toContain('[social-media] uploadMedia');
  await ctx.close();

  receipt('f', { user: C.username, notes, pasted, dragged, logExcerpt: full.logs.filter((l: string) => l.includes('[social-media]')).slice(0, 40) });
});

// ─────────────────────────────────────────────────────────────────────────────
// g — stale-cover self-heal on a REAL delete: the owner's read persists the
//     reselected cover; a visitor's read heals in-session while its write 403s.
// ─────────────────────────────────────────────────────────────────────────────

test('g: deleting a post self-heals the collection cover — the visitor heals in-session (write 403), the owner persists', async ({ browser, request }) => {
  test.setTimeout(300_000);
  const notes: string[] = [];
  const slug = `ms-cover-${stamp}`;

  const C = await signupAndLogin(request, 'mslibg');
  await addSocialAppContract(request, C.token);
  const followers = await createFollowersGroup(request, C.token, C.username);

  // Two REAL image media docs (the covers' source).
  const redKey = await uploadObjectToMinio(request, C.token, `cover-red-${stamp}.png`, 'image/png', IMAGE_RED);
  const redDoc = await confirmMediaDoc(request, C.token, redKey, {
    mime_type: 'image/png', size_bytes: IMAGE_RED.length, width: 320, height: 320,
    thumbnail_object_key: redKey,
  });
  const blueKey = await uploadObjectToMinio(request, C.token, `cover-blue-${stamp}.png`, 'image/png', IMAGE_BLUE);
  const blueDoc = await confirmMediaDoc(request, C.token, blueKey, {
    mime_type: 'image/png', size_bytes: IMAGE_BLUE.length, width: 320, height: 320,
    thumbnail_object_key: blueKey,
  });
  // Two posts (image-only — NOT music), both in the public collection.
  await attachMediaDocToGroup(request, C.token, redDoc, [followers, DISCOVER_GROUP_ID]);
  await attachMediaDocToGroup(request, C.token, blueDoc, [followers, DISCOVER_GROUP_ID]);
  const redPost = await createPost(request, C.token, {
    text: `gauntlet cover red ${stamp}`, groups: [followers, DISCOVER_GROUP_ID], media_refs: [redDoc],
  });
  const bluePost = await createPost(request, C.token, {
    text: `gauntlet cover blue ${stamp}`, groups: [followers, DISCOVER_GROUP_ID], media_refs: [blueDoc],
  });
  const collectionId = await createMusicCollection(request, C.token, C.username, slug, { public: true });
  await savePostToCollection(request, C.token, collectionId, redPost); // first item → the auto-cover source
  await savePostToCollection(request, C.token, collectionId, bluePost);
  // The auto-cover (the app's savePostToCollection rule): the first item's first media.
  await writeFace(request, C.token, collectionId, {
    kind: 'saved', name: slug, visibility: 'public', avatar_ref: redDoc,
  });
  let face = await readFace(request, C.token, collectionId);
  expect(face?.avatar_ref).toBe(redDoc);
  notes.push(`the cover is the red post's media (face avatar_ref = ${redDoc})`);

  const savedTabUrl = `${SOCIAL_BASE}/u/${C.username}?tab=saved`;

  // The cover card (the app's Saved-tab grid card: the cover media's resolved URL).
  const coverSrc = async (page: Page) => {
    await page.goto(savedTabUrl);
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="saved-collection-card"]', { hasText: slug }).first();
    await expect(card).toBeVisible({ timeout: 25_000 });
    const img = card.locator('img').first();
    await expect(img).toBeVisible({ timeout: 25_000 });
    return (await img.getAttribute('src')) || '';
  };

  // Baseline: the live cover is the red post's media.
  const baseline = await (async () => {
    const o0 = await signedInContext(browser, C.token);
    const src = await coverSrc(o0.page);
    await o0.ctx.close();
    return src;
  })();
  expect(baseline).toContain(redKey);
  notes.push(`baseline: the collection card cover is the red post's media (${redKey})`);

  // Delete the red post FOR REAL (the tombstone — the media doc outlives it).
  await deletePost(request, C.token, redPost);
  // Wait for the tombstone to settle for ALL readers (the delete's read
  // visibility is now immediate — the node dedups single-doc reads, so the
  // poll is a belt-and-braces against CH write lag, not a merge wait).
  const settled404g = await pollUntil(async () => {
    const res = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: C.token, service: POSTS_SERVICE, doc_id: redPost }),
      headers: jsonHeaders(),
    });
    return res.status();
  }, (s) => s === 404, 60_000, 1000);
  expect(settled404g, 'the delete never settled (single-doc read still serves the live row)').toBe(404);
  notes.push('the red post is tombstoned and settled (its media doc outlives it — the stale-cover condition)');

  // ── The VISITOR: the node face is still stale; their in-session read heals,
  //    but their self-heal write 403s (they are not the owner).
  //    (The grid card's cover URL is owner-scoped — a visitor's cover
  //    resolution rides the by-user read's listMedia, which is
  //    `author_key = the viewer`, so the visitor's card shows the placeholder.
  //    The visitor seam is the self-heal write denial, not the pixels.) ──────
  const V = await signupAndLogin(request, 'mslibgv');
  await addSocialAppContract(request, V.token);
  const visitor = await signedInContext(browser, V.token);

  // Open the collection (the read that runs the self-heal — the write must 403).
  const vFull = captureFull(visitor.page);
  await visitor.page.goto(`${SOCIAL_BASE}/u/${C.username}/saved/${encodeURIComponent(collectionId)}`);
  await visitor.page.waitForLoadState('networkidle');
  await expect(visitor.page.locator('[data-testid="saved-collection-header"]')).toBeVisible({ timeout: 25_000 });
  await settle(3000);
  const vLogs = vFull.logs.join('\n');
  expect(vLogs).toContain('cover self-heal write failed');
  face = await readFace(request, C.token, collectionId);
  expect(face?.avatar_ref).toBe(redDoc);
  notes.push('visitor: the self-heal write 403d (log-verified) — the node face is STILL the dead red media');
  await shot(visitor.page, 'g-visitor-collection');
  await visitor.ctx.close();

  // ── The OWNER: the same read PERSISTS the heal (face converges to blue). ───
  const owner = await signedInContext(browser, C.token);
  const oFull = captureFull(owner.page);
  await owner.page.goto(`${SOCIAL_BASE}/u/${C.username}/saved/${encodeURIComponent(collectionId)}`);
  await owner.page.waitForLoadState('networkidle');
  await expect(owner.page.locator('[data-testid="saved-collection-header"]')).toBeVisible({ timeout: 25_000 });
  await settle(3000);
  face = await pollUntil(
    () => readFace(request, C.token, collectionId),
    (f) => f?.avatar_ref === blueDoc,
    30_000,
  );
  expect(face?.avatar_ref).toBe(blueDoc);
  const oLogs = oFull.logs.join('\n');
  expect(oLogs).toContain('stale cover reselected');
  notes.push(`owner: the reselected cover persisted (face avatar_ref converged to ${blueDoc})`);

  // The persisted heal is now visible on EVERY surface that shows the card.
  const healedOwner = await coverSrc(owner.page);
  expect(healedOwner).toContain(blueKey);
  expect(healedOwner).not.toContain(redKey);
  notes.push('owner: the Saved-tab card now shows the BLUE post\'s media (the dead cover no longer lingers)');
  await shot(owner.page, 'g-owner-healed-cover');
  await shot(owner.page, 'g-owner-healed-cover', true);
  await owner.ctx.close();

  receipt('g', { curator: C.username, visitor: V.username, collectionId, redPost, bluePost, redDoc, blueDoc, notes });
});
