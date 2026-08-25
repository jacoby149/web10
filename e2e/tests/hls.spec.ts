import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHmac } from 'crypto';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'media';
const ORIGIN = 'http://marketing.localhost';

// The node's HS256 signing secret (api/app/settings.py dev default — the e2e
// stack runs with it, and the repo is open source). Used to mint stream
// sigs directly, including EXPIRED ones (the anti-tests).
const NODE_SECRET = '8cbec8.....';

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// The committed 8s 320x240 H.264/AAC test video (e2e/fixtures/test-video.mp4).
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const here = dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO = readFileSync(resolve(here, '../fixtures/test-video.mp4'));

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('hls');
  await request.post(`${API_BASE}/v3/signup`, {
    data: JSON.stringify({ username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) }),
    headers: { 'Content-Type': 'application/json' },
  });
  const res = await request.post(`${API_BASE}/v3/login`, {
    data: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  const token = (await res.json()).token as string;
  return { username, token };
}

async function addAppContract(request: APIRequestContext, token: string) {
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: ORIGIN,
      permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] },
    }),
    headers: { 'Content-Type': 'application/json', Origin: 'http://auth.localhost' },
  });
}

async function createMediaGroup(request: APIRequestContext, token: string, username: string): Promise<string> {
  const name = `media-${username}`;
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name,
      join_policy: 'invite_only',
      roles: [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
        { name: 'member', services: [SERVICE], permissions: ['readAll', 'create', 'deleteOwn'] },
      ],
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).group_id as string;
}

async function uploadVideoToMinio(request: APIRequestContext, token: string): Promise<string> {
  const uploadRes = await request.post(`${API_BASE}/v3/media/upload-url`, {
    data: JSON.stringify({ token, body: { filename: 'test-video.mp4', mime_type: 'video/mp4' } }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(uploadRes.ok()).toBeTruthy();
  const { upload_url, fields, object_key } = (await uploadRes.json()) as any;
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    ...(fields as Record<string, string>),
    file: { name: 'test-video.mp4', mimeType: 'video/mp4', buffer: TEST_VIDEO },
  };
  const putRes = await request.post(upload_url, { multipart });
  const status = putRes.status();
  const body = await putRes.text();
  if (status >= 300 || body.includes('<Error>')) {
    throw new Error(`MinIO upload failed: status ${status}, body: ${body}`);
  }
  return object_key;
}

/**
 * Upload the test video, create the doc, queue the transcode, and poll the
 * document until transcoding settles. Returns the settled document.
 */
async function uploadAndTranscode(
  request: APIRequestContext,
  token: string,
  username: string,
  groupId: string,
): Promise<any> {
  const objectKey = await uploadVideoToMinio(request, token);
  const createRes = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: SERVICE,
      body: {
        video: { type: 'minio', value: objectKey },
        filename: 'test-video.mp4',
        mime_type: 'video/mp4',
        date: new Date().toISOString(),
      },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(createRes.ok()).toBeTruthy();
  const docId = (await createRes.json()).doc_id as string;

  const tcRes = await request.post(`${API_BASE}/v3/media/transcode`, {
    data: JSON.stringify({ token, doc_id: docId }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(tcRes.ok()).toBeTruthy();
  expect((await tcRes.json()).status).toBe('queued');

  // Poll the document — it is the status surface (processing → done|failed).
  const deadline = Date.now() + 180_000;
  let doc: any = null;
  while (Date.now() < deadline) {
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: SERVICE, doc_id: docId }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.ok()).toBeTruthy();
    doc = await readRes.json();
    const ts = doc.body?.transcoding_settings;
    if (ts && (ts.status === 'done' || ts.status === 'failed')) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const ts = doc.body?.transcoding_settings;
  expect(ts, 'transcoding_settings never appeared').toBeTruthy();
  expect(ts.status, `transcode did not finish: ${JSON.stringify(ts)}`).toBe('done');
  return doc;
}

/** Mint a stream sig the way the read path does (same secret, same claims).
 *  HS256 = HMAC-SHA256 over "header.payload" — built-in crypto, no dep. */
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function mintSig(username: string, docId: string, prefix: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(
    Buffer.from(JSON.stringify({ username, doc_id: docId, prefix, iat: now, exp: now + ttlSeconds })),
  );
  const sig = b64url(createHmac('sha256', NODE_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function hlsPrefix(objectKey: string): string {
  return objectKey.slice(0, objectKey.lastIndexOf('/')) + '/hls';
}

// ---------------------------------------------------------------------------
// API floor — the full pipeline: upload → transcode → manifest → variant → segment
// ---------------------------------------------------------------------------

test.describe('HLS — API floor', () => {
  test('upload → transcode → doc carries variants → manifest/variant/segment all serve', async ({ request }) => {
    test.setTimeout(240_000);
    const { username, token } = await signupFreshUser(request);
    const groupId = await createMediaGroup(request, token, username);
    await addAppContract(request, token);

    const doc = await uploadAndTranscode(request, token, username, groupId);
    const ts = doc.body.transcoding_settings;

    // The document is the manifest: variants + thumbnails, each a minio ref.
    expect(ts.enabled).toBe(true);
    expect(Array.isArray(ts.variants)).toBeTruthy();
    expect(ts.variants.length).toBeGreaterThanOrEqual(2);
    for (const v of ts.variants) {
      expect(v.url.type).toBe('minio');
      expect(v.url.value).toMatch(/\/hls\/\d+p\/index\.m3u8$/);
      expect(v.width).toBeGreaterThan(0);
      expect(v.height).toBeGreaterThan(0);
      expect(v.bitrate_kbps).toBeGreaterThan(0);
    }
    expect(ts.thumbnails.length).toBeGreaterThanOrEqual(1);

    // The read minted a manifest_url with a sig for the reader.
    expect(typeof ts.manifest_url).toBe('string');
    expect(ts.manifest_url).toContain(`/v3/media/hls/manifest?doc_id=${doc.doc_id}`);
    expect(ts.manifest_url).toContain('sig=');

    // 1. Master manifest — synthesized from the variants array.
    const manifestRes = await request.get(`${API_BASE}${ts.manifest_url}`);
    expect(manifestRes.ok()).toBeTruthy();
    expect(manifestRes.headers()['content-type']).toContain('mpegurl');
    const master = await manifestRes.text();
    expect(master).toContain('#EXTM3U');
    expect(master.match(/#EXT-X-STREAM-INF/g)?.length).toBe(ts.variants.length);

    // 2. Variant manifest — segments rewritten to signed URLs.
    const variantLine = master.split('\n').find((l) => l.includes('/v3/media/hls/variant?'));
    expect(variantLine).toBeTruthy();
    const variantRes = await request.get(`${API_BASE}${variantLine!.trim()}`);
    expect(variantRes.ok()).toBeTruthy();
    const variantManifest = await variantRes.text();
    expect(variantManifest).toContain('#EXTM3U');
    const segLine = variantManifest.split('\n').find((l) => l.includes('/v3/media/hls/segment?'));
    expect(segLine, 'variant manifest has no signed segment URL').toBeTruthy();

    // 3. Segment — the actual MPEG-TS bytes.
    const segRes = await request.get(`${API_BASE}${segLine!.trim()}`);
    expect(segRes.ok()).toBeTruthy();
    expect(segRes.headers()['content-type']).toBe('video/MP2T');
    const segBytes = await segRes.body();
    expect(segBytes.length).toBeGreaterThan(1000);
    // MPEG-TS packets start with the 0x47 sync byte.
    expect(segBytes[0]).toBe(0x47);
  });

  test('anti-test: manifest without a sig is 403', async ({ request }) => {
    test.setTimeout(240_000);
    const { username, token } = await signupFreshUser(request);
    const groupId = await createMediaGroup(request, token, username);
    await addAppContract(request, token);
    const doc = await uploadAndTranscode(request, token, username, groupId);

    const res = await request.get(`${API_BASE}/v3/media/hls/manifest?doc_id=${doc.doc_id}`);
    expect(res.status()).toBe(403);
  });

  test('anti-test: an EXPIRED sig is 403 (the re-check cadence)', async ({ request }) => {
    test.setTimeout(240_000);
    const { username, token } = await signupFreshUser(request);
    const groupId = await createMediaGroup(request, token, username);
    await addAppContract(request, token);
    const doc = await uploadAndTranscode(request, token, username, groupId);

    // Mint a sig that expired 60s ago (same secret, past exp).
    const prefix = hlsPrefix(doc.body.video.value);
    const expiredSig = mintSig(username, doc.doc_id, prefix, -60);
    const res = await request.get(`${API_BASE}/v3/media/hls/manifest?doc_id=${doc.doc_id}&sig=${expiredSig}`);
    expect(res.status()).toBe(403);
    expect(res.json()).resolves.toMatchObject({ detail: expect.stringMatching(/invalid or expired/i) });
  });

  test('anti-test: a sig for doc A cannot open doc B (I3 holds at the stream layer)', async ({ request }) => {
    test.setTimeout(300_000);
    const A = await signupFreshUser(request);
    const B = await signupFreshUser(request);
    const groupA = await createMediaGroup(request, A.token, A.username);
    const groupB = await createMediaGroup(request, B.token, B.username);
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);

    const docA = await uploadAndTranscode(request, A.token, A.username, groupA);
    const docB = await uploadAndTranscode(request, B.token, B.username, groupB);

    // B's sig (valid, unexpired) — but for B's doc, pointed at A's doc.
    const prefixB = hlsPrefix(docB.body.video.value);
    const sigB = mintSig(B.username, docB.doc_id, prefixB, 600);
    const res = await request.get(`${API_BASE}/v3/media/hls/manifest?doc_id=${docA.doc_id}&sig=${sigB}`);
    expect(res.status()).toBe(403);
  });

  test('anti-test: a valid sig from a NON-MEMBER is 403 (membership re-check)', async ({ request }) => {
    test.setTimeout(240_000);
    const A = await signupFreshUser(request);
    const B = await signupFreshUser(request);
    const groupA = await createMediaGroup(request, A.token, A.username);
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);

    const docA = await uploadAndTranscode(request, A.token, A.username, groupA);

    // B is not a member of A's media group. Mint B a sig bound to A's doc —
    // the sig verifies, but the membership re-check must fail.
    const prefix = hlsPrefix(docA.body.video.value);
    const sigB = mintSig(B.username, docA.doc_id, prefix, 600);
    const res = await request.get(`${API_BASE}/v3/media/hls/manifest?doc_id=${docA.doc_id}&sig=${sigB}`);
    expect(res.status()).toBe(403);
    expect(res.json()).resolves.toMatchObject({ detail: expect.stringMatching(/not a member/i) });
  });

  test('anti-test: segment traversal is rejected (400)', async ({ request }) => {
    test.setTimeout(240_000);
    const { username, token } = await signupFreshUser(request);
    const groupId = await createMediaGroup(request, token, username);
    await addAppContract(request, token);
    const doc = await uploadAndTranscode(request, token, username, groupId);

    const sig = doc.body.transcoding_settings.manifest_url.split('sig=')[1];
    // seg with a path traversal — must be rejected before it touches S3.
    const res = await request.get(
      `${API_BASE}/v3/media/hls/segment?doc_id=${doc.doc_id}&variant=360p&seg=..%2F..%2Fetc%2Fpasswd&sig=${sig}`,
    );
    expect(res.status()).toBe(400);
  });

  test('transcode endpoint: 400 for a doc without a video ref', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);
    const groupId = await createMediaGroup(request, token, username);
    await addAppContract(request, token);

    const createRes = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: SERVICE,
        body: { text: 'no video here', date: new Date().toISOString() },
        groups: [groupId],
      }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(createRes.ok()).toBeTruthy();
    const docId = (await createRes.json()).doc_id as string;

    const res = await request.post(`${API_BASE}/v3/media/transcode`, {
      data: JSON.stringify({ token, doc_id: docId }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real demo: upload a video, watch it become HLS
// ---------------------------------------------------------------------------

test.describe('HLS demo gauntlet — upload → transcode → play', () => {
  test('full flow: upload a video, it transcodes, and the player gets the manifest', async ({ page, context, request }) => {
    test.setTimeout(240_000);
    const logs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[media-demo]')) logs.push(text);
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const { username, token } = await signupFreshUser(request);
    await context.addCookies([
      { name: 'token', value: token, domain: 'marketing.localhost', path: '/', secure: false, httpOnly: false },
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);
    await createMediaGroup(request, token, username);
    await addAppContract(request, token);

    await page.goto(`${MARKETING_BASE}/docs/media/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#editor')).toBeVisible();

    // Upload the video through the demo.
    await page.setInputFiles('[data-testid="video-input"]', {
      name: 'gauntlet-video.mp4',
      mimeType: 'video/mp4',
      buffer: TEST_VIDEO,
    });
    await page.locator('[data-testid="video-upload-button"]').click();

    // The card appears (processing), then settles to "HLS ready".
    const status = page.locator('[data-testid="transcode-status"]').first();
    await expect(status).toBeVisible({ timeout: 15_000 });
    await expect(status).toContainText('HLS ready', { timeout: 200_000 });

    // hls.js parsed the manifest (the log is the seam — levels > 0 proves the
    // master manifest listed renditions and the player consumed them).
    await expect
      .poll(
        () => logs.some((l) => l.includes('hls — manifest parsed, levels:') && !l.includes('levels: 0')),
        { timeout: 30_000 },
      )
      .toBeTruthy();

    // The video element has a real duration (the player got playable media).
    const video = page.locator('[data-testid="video-player"]').first();
    await expect(video).toBeVisible();
    await expect
      .poll(
        async () => (await video.evaluate((el) => (el as HTMLVideoElement).duration)) || 0,
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    // The round-trip logs are present and ordered.
    const logStr = logs.join('\n');
    expect(logStr).toContain('[media-demo] uploadVideo — called');
    expect(logStr).toContain('[media-demo] uploadVideo — file uploaded to MinIO');
    expect(logStr).toContain('[media-demo] uploadVideo — doc created');
    expect(logStr).toContain('[media-demo] uploadVideo — queueing transcode');
    expect(logStr).toContain('[media-demo] pollTranscode — poll 1');
    expect(logStr).toContain('[media-demo] attachPlayer — doc:');

    const noVideoIdx = logs.findIndex((l) => l.includes('uploadVideo — doc created'));
    const queueIdx = logs.findIndex((l) => l.includes('uploadVideo — queueing transcode'));
    const firstPollIdx = logs.findIndex((l) => l.includes('pollTranscode — poll 1'));
    const attachIdx = logs.findIndex((l) => l.includes('attachPlayer — doc:'));
    expect(noVideoIdx).toBeLessThan(queueIdx);
    expect(queueIdx).toBeLessThan(firstPollIdx);
    expect(firstPollIdx).toBeLessThan(attachIdx);

    // No demo errors, no uncaught exceptions.
    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('hls error'));
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});