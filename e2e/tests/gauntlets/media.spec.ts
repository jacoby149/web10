import { test, expect, type BrowserContext, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_BASE, SOCIAL_BASE, SOCIAL_ORIGIN,
  signupAndLogin, createFollowersGroup, joinGroup, setTokenCookie,
} from './helpers/setup';
import { mediaTruth, assertMediaTranscoded } from './helpers/truth-media';

/**
 * media — the upload → transcode → HLS → playback state machine, tortured
 * (gauntlets/media.md).
 *
 * Media is the heaviest surface in the suite: an upload (the presigned MinIO
 * path), a transcode (a real in-process ffmpeg run → HLS renditions +
 * thumbnails), and a playback (hls.js on desktop). The load-bearing assertion
 * is the transcode-truth — the media doc's `transcoding_settings.status`
 * reaches `done` WITH variants, and the read mints a `manifest_url` — not "the
 * player rendered." A doc that stays `processing` forever, or reaches `done`
 * with no variants, is a transcode bug the player-render assertion misses
 * (the player renders the raw fallback while the transcode is broken).
 *
 * This is the LIGHTER build the gauntlet plan calls for (the heaviest surface —
 * the full playback + transcode-at-scale are noted as the stretch):
 *   - API floor (the transcode pipeline): upload → create doc → queue transcode
 *     → poll to `done` → assert the variants + the minted manifest + fetch the
 *     synthesized master manifest. The diagnostic anchor — a red here is a
 *     backend (transcode) bug.
 *   - Browser gauntlet (the player): a user with a transcoded video post opens
 *     the feed → the hls.js player renders → RELOAD → the player re-renders
 *     (the manifest re-mints). The client proof.
 *   - Multi-user (the manifest at N readers): reader A's transcoded doc read by
 *     reader B → both get a valid per-reader `manifest_url`. The per-reader sig
 *     (bifurcated auth) holds at 2 readers.
 *
 * STRETCH (not built here — the heaviest parts, noted per the plan):
 *   - The full playback truth: the hls.js `MANIFEST_PARSED` event, the video
 *     duration > 0, the quality (level) switch. This build asserts the player
 *     is in the DOM, not that the video actually plays.
 *   - The transcode at scale: 10 users upload 10 videos in parallel → all 10
 *     reach `done` (the worker's bounded concurrency holds — no queue
 *     starvation, no lost jobs).
 *   - The manifest at N=10 readers: 10 readers each get a valid per-reader
 *     `manifest_url` (this build drives 2 readers).
 *   - The anti-tests: a source that fails to transcode (the designed error
 *     state), a stale sig past its 10-min TTL (the revocation), a non-member
 *     sig (the bifurcated auth), the raw-file fallback (native <video>).
 */

const here = dirname(fileURLToPath(import.meta.url));
// The committed 8s 720x1280 (9:16 vertical) H.264/AAC test video — the same
// fixture the standalone hls.spec.ts drives. (gauntlets live one level deeper
// than tests/, so the fixture is two levels up.)
const TEST_VIDEO = readFileSync(resolve(here, '../../fixtures/test-video-vertical.mp4'));

const MEDIA_GROUP_PREFIX = 'media-gauntlet';

// ── Media pipeline helpers (the upload → create → transcode-queue) ──────────
// The gauntlet's shared `addAppContract` grants `media: ['readAll']` only — the
// upload needs `create` too, and an app contract is a per-origin upsert (the
// latest row wins), so the media gauntlet carries its own full-surface contract
// (the social surface + media create/delete) rather than stacking a second one.

/** The full social surface + media write (the contract the media gauntlet needs). */
async function addMediaAppContract(request: APIRequestContext, token: string): Promise<void> {
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: SOCIAL_ORIGIN,
      permissions: {
        posts: ['create', 'readAll', 'updateOwn', 'deleteOwn'],
        profile: ['readAll', 'create', 'updateOwn'],
        settings: ['readAll', 'create', 'updateOwn'],
        reactions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        media: ['readAll', 'create', 'deleteOwn'],
        media_metadata: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        public_media: ['readAll'],
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create the media group (the doc's home). `open` join lets a second reader
 * walk in for the multi-user test; the member role reads media so a follower
 * can stream the creator's video.
 */
async function createMediaGroup(
  request: APIRequestContext,
  token: string,
  username: string,
  joinPolicy: 'open' | 'invite_only' = 'open',
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name: `${MEDIA_GROUP_PREFIX}-${username}`,
      join_policy: joinPolicy,
      roles: [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles', 'assignRoles'] },
        { name: 'member', services: ['media'], permissions: ['readAll'] },
      ],
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create media group failed (${res.status})`);
  return (await res.json()).group_id as string;
}

/**
 * Upload a video to MinIO through the API's presigned POST (the same two-step
 * flow the social app + the standalone hls.spec.ts drive: request an
 * upload-url, then POST the file to the object store). Returns the object_key
 * the media doc will reference.
 */
async function uploadVideoToMinio(request: APIRequestContext, token: string): Promise<string> {
  const uploadRes = await request.post(`${API_BASE}/v3/media/upload-url`, {
    data: JSON.stringify({ token, body: { filename: 'gauntlet-video.mp4', mime_type: 'video/mp4' } }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!uploadRes.ok()) throw new Error(`upload-url failed (${uploadRes.status})`);
  const { upload_url, fields, object_key } = (await uploadRes.json()) as {
    upload_url: string; fields: Record<string, string>; object_key: string;
  };
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Uint8Array }> = {
    ...fields,
    file: { name: 'gauntlet-video.mp4', mimeType: 'video/mp4', buffer: TEST_VIDEO },
  };
  const putRes = await request.post(upload_url, { multipart });
  const status = putRes.status();
  const body = await putRes.text();
  // S3/MinIO presigned POST: 2xx on success; errors come back as a 200 with an
  // XML <Error> body or a 4xx, so check both.
  if (status >= 300 || body.includes('<Error>')) {
    throw new Error(`MinIO upload failed: status ${status}, body: ${body}`);
  }
  return object_key;
}

/**
 * Confirm the media upload — the social app's `uploadMedia` path. This lands
 * the doc in the `media_metadata` collection (NOT `/v3/create` with
 * `service: 'media'`, which the feed's media-ref resolution never queries). The
 * body carries the minio `video` ref the transcode worker reads + the metadata
 * the feed resolves (object_key, mime_type, dimensions). Returns the doc_id.
 */
async function confirmMediaDoc(
  request: APIRequestContext,
  token: string,
  objectKey: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/media/confirm`, {
    data: JSON.stringify({
      token,
      body: {
        object_key: objectKey,
        filename: 'gauntlet-video.mp4',
        mime_type: 'video/mp4',
        size_bytes: TEST_VIDEO.length,
        width: 720,
        height: 1280,
        duration_seconds: null,
        thumbnail_object_key: null,
        alt_text: null,
        service: 'media',
        video: { type: 'minio', value: objectKey },
      },
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`confirm media doc failed (${res.status})`);
  return (await res.json()).doc_id as string;
}

/**
 * Attach the media doc to a group (the multi-user access model). `/v3/media/
 * confirm` creates a group-less doc, so a second reader has no access to it; an
 * update with `groups` attaches it (the update preserves the `media_metadata`
 * collection — only the group attachment changes). Members of the group can
 * then read the doc directly (the per-reader manifest mint).
 */
async function attachMediaDocToGroup(
  request: APIRequestContext,
  token: string,
  mediaDocId: string,
  groupId: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/v3/update`, {
    data: JSON.stringify({ token, doc_id: mediaDocId, body: {}, groups: [groupId] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`attach media doc to group failed (${res.status})`);
}

/** Queue the transcode (the in-process ffmpeg worker picks it up). */
async function queueTranscode(request: APIRequestContext, token: string, mediaDocId: string): Promise<void> {
  const res = await request.post(`${API_BASE}/v3/media/transcode`, {
    data: JSON.stringify({ token, doc_id: mediaDocId }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`queue transcode failed (${res.status})`);
  const { status } = (await res.json()) as { status: string };
  expect(['queued', 'processing']).toContain(status);
}

/**
 * The full upload → confirm → attach → transcode-queue pipeline. Returns the
 * media doc_id + the group it's attached to (the transcode runs in the
 * background; the caller polls `assertMediaTranscoded`). The doc is confirmed
 * into `media_metadata` (the feed's collection) and attached to the group (the
 * multi-user access model).
 */
async function uploadAndQueueTranscode(
  request: APIRequestContext,
  token: string,
  username: string,
  joinPolicy: 'open' | 'invite_only' = 'open',
): Promise<{ mediaDocId: string; groupId: string }> {
  const groupId = await createMediaGroup(request, token, username, joinPolicy);
  const objectKey = await uploadVideoToMinio(request, token);
  const mediaDocId = await confirmMediaDoc(request, token, objectKey);
  await attachMediaDocToGroup(request, token, mediaDocId, groupId);
  await queueTranscode(request, token, mediaDocId);
  return { mediaDocId, groupId };
}

// The feed can hold many posts; scope the card by a unique caption.
const captionFor = (who: string) => `gauntlet media ${who} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Post a video to a group: a `posts` doc whose `media_refs` carry the media
 * doc_id (the feed resolves the ref inline and carries the transcoding_settings
 * + the read-minted manifest_url). The shared `postToGroup` is text-only, so the
 * media gauntlet posts its own.
 */
async function postMediaToGroup(
  request: APIRequestContext,
  token: string,
  groupId: string,
  text: string,
  mediaDocId: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: 'posts',
      body: { text, media_refs: [mediaDocId], date: new Date().toISOString() },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create media post failed (${res.status})`);
  return (await res.json()).doc_id as string;
}

// The video player testids (media.md): the hls.js rack for a transcoded clip,
// the native <video> for a raw (non-transcoded) one.
function anyVideoPlayer(page: Page) {
  return page.locator('[data-testid="hls-video-player"], [data-testid="media-video"]');
}

// ---------------------------------------------------------------------------
// API floor — the transcode pipeline via raw calls (the diagnostic anchor).
// upload → create doc → queue transcode → poll to `done` → assert the variants
// + the minted manifest + fetch the synthesized master manifest.
// ---------------------------------------------------------------------------

test.describe('media — API floor (the transcode pipeline)', () => {
  test('upload → transcode → the doc carries variants → the minted manifest serves', async ({ request }) => {
    test.setTimeout(180_000);
    const user = await signupAndLogin(request, 'mda');
    await addMediaAppContract(request, user.token);

    const { mediaDocId } = await uploadAndQueueTranscode(request, user.token, user.username);

    // The transcode-truth (the load-bearing one): poll to `done`, assert the
    // variants exist. A doc stuck at `processing` or `done`-with-no-variants
    // is a transcode bug the player-render assertion would miss.
    const truth = await assertMediaTranscoded(request, user.token, mediaDocId);
    expect(truth.status).toBe('done');
    expect(truth.hasVariants).toBe(true);
    expect(truth.variantCount).toBeGreaterThanOrEqual(1);

    // The read minted a per-reader manifest_url (the 10-min JWT sig).
    expect(truth.hasManifestUrl).toBe(true);
    expect(truth.manifestUrl).toContain(`/v3/media/hls/manifest?doc_id=${mediaDocId}`);
    expect(truth.manifestUrl).toContain('sig=');

    // The master manifest is a VIEW over the variants array — it serves, is
    // an M3U8, and lists exactly the doc's renditions.
    const manifestRes = await request.get(`${API_BASE}${truth.manifestUrl}`);
    expect(manifestRes.ok(), `master manifest fetch failed (${manifestRes.status})`).toBe(true);
    expect(manifestRes.headers()['content-type']).toContain('mpegurl');
    const master = await manifestRes.text();
    expect(master).toContain('#EXTM3U');
    expect(master.match(/#EXT-X-STREAM-INF/g)?.length).toBe(truth.variantCount);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the player (the client proof). A user with a transcoded
// video post opens the feed → the hls.js player renders → RELOAD → the player
// re-renders (the manifest re-mints). The basic check: the player is in the
// DOM, not that the video actually plays (the full playback is the stretch).
// ---------------------------------------------------------------------------

test.describe('media — browser gauntlet (the player)', () => {
  test('a transcoded video post renders the player in the feed → RELOAD → it re-renders', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const user = await signupAndLogin(request, 'mdb');
    await addMediaAppContract(request, user.token);
    const followers = await createFollowersGroup(request, user.token, user.username);

    // Upload → transcode the video (the feed renders the hls.js player only for
    // a `done` doc with a minted manifest_url).
    const { mediaDocId } = await uploadAndQueueTranscode(request, user.token, user.username);
    await assertMediaTranscoded(request, user.token, mediaDocId);

    // Post the video to the user's followers group (so it's in their own feed —
    // the feed resolves the media ref for the author, who owns the media doc).
    const caption = captionFor('browser');
    await postMediaToGroup(request, user.token, followers, caption, mediaDocId);

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', user.token);
    await page.goto(`${SOCIAL_BASE}/feed`);

    // The video player renders for the post (the hls.js rack for a transcoded
    // clip; the native <video> if the transcode fell back). Wait for it.
    const player = anyVideoPlayer(page);
    await expect(async () => {
      expect(await player.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 30000 });

    // RELOAD → the player re-renders (the read re-mints the manifest_url with a
    // fresh sig — a stale sig that 403s on the manifest is the bug this catches).
    await page.reload();
    await expect(async () => {
      expect(await anyVideoPlayer(page).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 30000 });

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Multi-user — the manifest at N readers (the per-reader sig, bifurcated auth).
// Reader A's transcoded doc, read by reader B (a member of the media group) →
// both get a valid per-reader manifest_url, and both manifests serve. The
// transcode-at-scale (10 parallel uploads) + N=10 readers is the stretch.
// ---------------------------------------------------------------------------

test.describe('media — multi-user (the manifest at N readers)', () => {
  test('reader A\'s transcoded doc: reader B (a member) also gets a valid manifest_url', async ({ request }) => {
    test.setTimeout(180_000);
    // A uploads + transcodes the video (the doc's owner).
    const a = await signupAndLogin(request, 'mda2');
    await addMediaAppContract(request, a.token);
    const { mediaDocId, groupId } = await uploadAndQueueTranscode(request, a.token, a.username);
    await assertMediaTranscoded(request, a.token, mediaDocId);

    // B is a separate reader who joins A's media group (open join) → B can read
    // the doc. The read mints a fresh per-reader manifest_url for B.
    const b = await signupAndLogin(request, 'mdb2');
    await addMediaAppContract(request, b.token);
    await joinGroup(request, b.token, groupId);

    // Both readers read the same doc → both get a valid manifest_url, and the
    // sigs differ (the per-reader mint — a sig minted for one reader must never
    // ride the read to another).
    const truthA = await mediaTruth(request, a.token, mediaDocId);
    const truthB = await mediaTruth(request, b.token, mediaDocId);
    expect(truthA.hasManifestUrl, 'A (owner) manifest_url missing').toBe(true);
    expect(truthB.hasManifestUrl, 'B (member) manifest_url missing').toBe(true);
    expect(truthA.manifestUrl, 'the sig must be minted per reader').not.toBe(truthB.manifestUrl);

    // Both manifests serve (the sig verifies + the membership re-check passes
    // for each reader — the bifurcated auth holds at 2 readers).
    for (const [who, truth] of [['A', truthA], ['B', truthB]] as const) {
      const res = await request.get(`${API_BASE}${truth.manifestUrl}`);
      expect(res.ok(), `reader ${who} manifest fetch failed (${res.status})`).toBe(true);
      expect(await res.text()).toContain('#EXTM3U');
    }
  });
});
