import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'media';
const ORIGIN = MARKETING_BASE;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// A small valid 1x1 PNG — enough to prove the object round-trips through MinIO.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('media');
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

async function setTokenCookie(context: any, domain: string, token: string) {
  await context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

async function addAppContract(request: APIRequestContext, token: string) {
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: ORIGIN,
      permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] },
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
}

// Create the media group exactly the way the demo's group contract does:
// invite_only, the user is the owner, deterministic name.
async function createMediaGroup(request: APIRequestContext, token: string, username: string): Promise<string> {
  const name = `media-${username}`;
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name,
      join_policy: 'invite_only',
      roles: [
        { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
        { name: 'member', permissions: { [SERVICE]: ['readAll', 'create', 'deleteOwn'] } },
      ],
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).group_id as string;
}

/**
 * Set up a fresh user with the media group + app contract, and pre-auth the
 * browser context so the demo loads in signed-in state.
 */
async function setupUser(
  page: Page,
  context: any,
  request: APIRequestContext,
): Promise<{ username: string; token: string }> {
  const { username, token } = await signupFreshUser(request);
  await setTokenCookie(context, 'marketing.localhost', token);
  await setTokenCookie(context, 'auth.localhost', token);
  await createMediaGroup(request, token, username);
  await addAppContract(request, token);
  return { username, token };
}

/**
 * Upload a file to MinIO through the API's presigned POST — the same two-step
 * flow the demo drives (request upload-url, then POST the file to the object
 * store). Returns the object_key the document will reference.
 */
async function uploadToMinio(
  request: APIRequestContext,
  token: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const uploadRes = await request.post(`${API_BASE}/v3/media/upload-url`, {
    data: JSON.stringify({ token, body: { filename, mime_type: mimeType } }),
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  });
  expect(uploadRes.ok()).toBeTruthy();
  const { upload_url, fields, object_key } = (await uploadRes.json()) as any;

  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    ...(fields as Record<string, string>),
    file: { name: filename, mimeType, buffer },
  };
  const putRes = await request.post(upload_url, { multipart });
  const status = putRes.status();
  const body = await putRes.text();
  // S3/MinIO presigned POST: 204 on success; errors come back as a 200 with an
  // XML <Error> body or a 4xx, so check both.
  if (status >= 300 || body.includes('<Error>')) {
    throw new Error(`MinIO upload failed: status ${status}, body: ${body}`);
  }
  return object_key;
}

function captureConsoleLogs(page: Page, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes(prefix)) {
      logs.push(text);
    }
  });
  return logs;
}

// ---------------------------------------------------------------------------
// API floor — upload → create minio-type doc → read → presigned URL → image
// ---------------------------------------------------------------------------

test.describe('Media demo — API floor', () => {
  test('upload → create minio-type doc → read resolves a presigned URL → valid image', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);
    const groupId = await createMediaGroup(request, token, username);
    await addAppContract(request, token);

    // 1. Upload the image to MinIO.
    const objectKey = await uploadToMinio(request, token, 'test.png', 'image/png', PNG_1x1);
    expect(objectKey).toContain(username);

    // 2. Create a document with the minio type in the body.
    const createRes = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: SERVICE,
        body: {
          image: { type: 'minio', value: objectKey },
          filename: 'test.png',
          date: new Date().toISOString(),
        },
        groups: [groupId],
      }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(createRes.ok()).toBeTruthy();
    expect((await createRes.json()).doc_id).toBeTruthy();

    // 3. Read the document back — the minio type must resolve to a presigned URL.
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: SERVICE, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.ok()).toBeTruthy();
    const docs = (await readRes.json()) as any[];
    expect(docs.length).toBe(1);
    const image = docs[0].body.image;
    // The minio type keeps its value (the object key) and gains a fresh url.
    expect(image.type).toBe('minio');
    expect(image.value).toBe(objectKey);
    expect(typeof image.url).toBe('string');
    expect(image.url.length).toBeGreaterThan(0);
    // The presigned URL points at the object store and names the object.
    expect(image.url).toContain(objectKey);

    // 4. Fetch the presigned URL — it must return the actual image bytes.
    const imgRes = await request.get(image.url);
    expect(imgRes.ok()).toBeTruthy();
    expect(imgRes.headers()['content-type']).toContain('image/png');
    const imgBytes = await imgRes.body();
    expect(imgBytes.length).toBe(PNG_1x1.length);
    expect(imgBytes.equals(PNG_1x1)).toBeTruthy();
  });

  test('anti-test: read without an app contract fails 403 (contract gate)', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);
    await createMediaGroup(request, token, username);
    // NO app contract.
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: SERVICE, groups: [`${PROVIDER}/groups/users/${username}/media-${username}`] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.status()).toBe(403);
  });

  test('anti-test: a non-member cannot read the media group (I3 holds)', async ({ request }) => {
    const A = await signupFreshUser(request);
    const B = await signupFreshUser(request);
    await addAppContract(request, A.token);
    await addAppContract(request, B.token);

    const groupId = await createMediaGroup(request, A.token, A.username);
    const objectKey = await uploadToMinio(request, A.token, 'private.png', 'image/png', PNG_1x1);
    await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token: A.token,
        service: SERVICE,
        body: { image: { type: 'minio', value: objectKey }, date: new Date().toISOString() },
        groups: [groupId],
      }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });

    // B is not a member of A's media group.
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: B.token, service: SERVICE, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    });
    expect(readRes.status()).toBe(403);
    const err = await readRes.json();
    expect(err.detail).toMatch(/not a member/i);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real upload → create → read → display flow
// ---------------------------------------------------------------------------

test.describe('Media demo gauntlet — upload → create → read → display', () => {
  test('full flow: upload an image, it displays from the presigned URL — with log verification', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[media-demo]');
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    const { username } = await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/media/`);
    await page.waitForLoadState('networkidle');

    // Verify signed-in state.
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#message')).toContainText(username);
    await expect(page.locator('#editor')).toBeVisible();

    // --- UPLOAD ---
    await page.setInputFiles('[data-testid="file-input"]', {
      name: 'gauntlet.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    });
    await page.locator('[data-testid="upload-button"]').click();

    // The image card appears and the image loads from the presigned URL.
    await expect(page.locator('[data-testid="media-card"]').first()).toBeVisible({ timeout: 15000 });
    const img = page.locator('[data-testid="media-image"]').first();
    await expect(img).toBeVisible({ timeout: 15000 });
    // naturalWidth > 0 proves the image actually loaded from the presigned URL.
    await expect(async () => {
      const w = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      expect(w).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    // The object key is shown in the card (the reference the doc carries).
    await expect(page.locator('[data-testid="media-key"]').first()).not.toBeEmpty();

    // --- PERSIST: reload, the image is still there (and re-resolved) ---
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="media-card"]').first()).toBeVisible({ timeout: 15000 });
    const img2 = page.locator('[data-testid="media-image"]').first();
    await expect(async () => {
      const w = await img2.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      expect(w).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });

    // --- Verify console logs (the full round-trip) ---
    const logStr = logs.join('\n');
    expect(logStr).toContain('[media-demo] init — host:');
    expect(logStr).toContain('[media-demo] page load — already signed in');
    expect(logStr).toContain('[media-demo] initApp — setting up signed-in state');
    expect(logStr).toContain('[media-demo] readMedia — called');
    expect(logStr).toContain('[media-demo] uploadImage — called');
    expect(logStr).toContain('[media-demo] uploadImage — presigned POST ok');
    expect(logStr).toContain('[media-demo] uploadImage — file uploaded to MinIO');
    expect(logStr).toContain('[media-demo] uploadImage — doc created');
    expect(logStr).toContain('[media-demo] displayMedia — rendering');

    // No demo errors and no uncaught page exceptions.
    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('log sequence is ordered correctly', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[media-demo]');
    await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/media/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#editor')).toBeVisible();

    await page.setInputFiles('[data-testid="file-input"]', {
      name: 'seq.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    });
    await page.locator('[data-testid="upload-button"]').click();
    await expect(page.locator('[data-testid="media-card"]').first()).toBeVisible({ timeout: 15000 });

    // Init sequence.
    const initIdx = logs.findIndex((l) => l.includes('init — host:'));
    const signedInIdx = logs.findIndex((l) => l.includes('page load — already signed in'));
    const initAppIdx = logs.findIndex((l) => l.includes('initApp — setting up signed-in state'));
    const firstReadIdx = logs.findIndex((l) => l.includes('readMedia — called'));

    // Upload sequence.
    const uploadIdx = logs.findIndex((l) => l.includes('uploadImage — called'));
    const presignedIdx = logs.findIndex((l) => l.includes('uploadImage — presigned POST ok'));
    const uploadedIdx = logs.findIndex((l) => l.includes('uploadImage — file uploaded to MinIO'));
    const createdIdx = logs.findIndex((l) => l.includes('uploadImage — doc created'));

    // A display happens AFTER the create (the read that resolves the new image).
    const displayAfterCreateIdx = logs.findIndex((l, i) => i > createdIdx && l.includes('displayMedia — rendering'));

    for (const idx of [initIdx, signedInIdx, initAppIdx, firstReadIdx, uploadIdx, presignedIdx, uploadedIdx, createdIdx, displayAfterCreateIdx]) {
      expect(idx, 'expected log not found').toBeGreaterThanOrEqual(0);
    }

    // Init is ordered.
    expect(initIdx).toBeLessThan(signedInIdx);
    expect(signedInIdx).toBeLessThan(initAppIdx);
    expect(initAppIdx).toBeLessThan(firstReadIdx);

    // The upload comes after the initial read, and is internally ordered.
    expect(firstReadIdx).toBeLessThan(uploadIdx);
    expect(uploadIdx).toBeLessThan(presignedIdx);
    expect(presignedIdx).toBeLessThan(uploadedIdx);
    expect(uploadedIdx).toBeLessThan(createdIdx);

    // The display (resolving the new image) comes after the create.
    expect(createdIdx).toBeLessThan(displayAfterCreateIdx);
  });

  test('no console errors during the full flow', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[media-demo]');
    await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/media/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#editor')).toBeVisible();

    await page.setInputFiles('[data-testid="file-input"]', {
      name: 'errcheck.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    });
    await page.locator('[data-testid="upload-button"]').click();
    await expect(page.locator('[data-testid="media-card"]').first()).toBeVisible({ timeout: 15000 });

    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });
});
