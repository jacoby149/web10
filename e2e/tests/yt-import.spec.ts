import { test, expect, type APIRequestContext } from '@playwright/test';
import { buildYtTakeout } from '../fixtures/yt-takeout.mjs';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const PROVIDER = 'api.localhost';

const password = 'TestPass123!';
const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// The "real test": the operator's actual YouTube Takeout (the 14-part export at
// YT_EXPORT_DIR / the default path). The fixture reads the real CSVs and packs
// them into a small zip (the pipeline never reads the 27GB of MP4s). When the
// export isn't present (CI / fresh checkout) it falls back to a committed
// synthetic Takeout with the identical schema, so the test is always green.
const takeout = buildYtTakeout();
const EXPECTED = takeout.expected;
const TAKEOUT_ZIP = takeout.zip;
const TAKEOUT_NAME = 'takeout.zip';

const followersGroupId = (username: string) => `${PROVIDER}/groups/users/${username}/followers`;

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('ytimport');
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

/**
 * Drive the real import pipeline end-to-end against the node:
 *   POST /v3/imports  -> presigned upload URL
 *   presigned POST    -> the Takeout zip lands in the node's MinIO
 *   POST /v3/imports/start -> the durable worker picks it up
 *   POST /v3/imports/status -> poll until the job reaches a terminal phase
 * Returns the settled job row.
 */
async function runImport(request: APIRequestContext, token: string): Promise<any> {
  const createRes = await request.post(`${API_BASE}/v3/imports`, {
    data: JSON.stringify({
      token,
      platform: 'youtube',
      parts: [{ filename: TAKEOUT_NAME, size_bytes: TAKEOUT_ZIP.length }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = (await createRes.json()) as any;
  expect(created.job_id).toBeTruthy();
  expect(created.uploads.length).toBe(1);

  // Upload the zip straight to MinIO via the presigned POST (the same path the
  // authenticator's Import card uses).
  const up = created.uploads[0];
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    ...(up.fields as Record<string, string>),
    file: { name: TAKEOUT_NAME, mimeType: 'application/zip', buffer: TAKEOUT_ZIP },
  };
  const putRes = await request.post(up.upload_url, { multipart });
  const putStatus = putRes.status();
  const putBody = await putRes.text();
  if (putStatus >= 300 || putBody.includes('<Error>')) {
    throw new Error(`MinIO upload failed: status ${putStatus}, body: ${putBody}`);
  }

  const startRes = await request.post(`${API_BASE}/v3/imports/start`, {
    data: JSON.stringify({ token, job_id: created.job_id }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(startRes.ok()).toBeTruthy();

  // Poll until the job settles (complete or error). The worker is in-process
  // and the export is tiny, so this is fast; bound it so a stuck job fails loud.
  const deadline = Date.now() + 120_000;
  let job: any = null;
  while (Date.now() < deadline) {
    const statusRes = await request.post(`${API_BASE}/v3/imports/status`, {
      data: JSON.stringify({ token, job_id: created.job_id }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(statusRes.ok()).toBeTruthy();
    job = (await statusRes.json()).job;
    if (job.phase === 'complete' || job.phase === 'error') break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return job;
}

/** Read a service's docs for the user (no Origin header -> the app-contract
 *  gate is skipped for a direct API call, so no contract is needed).
 *  `expectOk=false` allows the D42 403 ("not a member") a non-member gets —
 *  the I3 anti-test reads with it and treats a 403 as "sees nothing". */
async function readService(request: APIRequestContext, token: string, service: string, groups: string[], limit = 500, expectOk = true): Promise<any[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service, groups, limit }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (expectOk) {
    expect(res.ok(), `read ${service} failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  } else if (res.status() === 403) {
    return []; // D42: not a member -> no access (the I3 guarantee)
  } else {
    expect(res.ok(), `read ${service} failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  }
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

// ---------------------------------------------------------------------------
// API floor — the real pipeline with the real export
// ---------------------------------------------------------------------------

test.describe(`YouTube import e2e (source: ${takeout.source})`, () => {
  // The import downloads one thumbnail per video (81 for the real export) from
  // YouTube's CDN — bound it well above the 30s default so a slow network
  // doesn't flake the test.
  test.setTimeout(180_000);

  test('the real Takeout imports into a fresh account', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);
    const job = await runImport(request, token);

    // The job must have completed. The only expected errors are thumbnail 404s
    // — YouTube's CDN does not serve a public thumbnail for private/unlisted
    // videos, so the worker logs a `[media] <id>: 404` per one (non-fatal: the
    // post still imports). No DATA error (post/comment/profile) may appear.
    expect(job.phase, `import job did not complete: ${JSON.stringify(job)}`).toBe('complete');
    const dataErrors = (job.errors as string[]).filter((e) => !e.startsWith('[media]'));
    expect(dataErrors, `import logged non-media errors: ${JSON.stringify(dataErrors)}`).toEqual([]);

    // The catalog: every importable video -> a staging post (D30: staged
    // owner-only, never auto-published).
    const posts = await readService(request, token, 'staging_posts', [followersGroupId(username)]);
    expect(posts.length).toBe(EXPECTED.stagingPosts);

    // The D30 safe default: only `Public`-source videos stage public; the rest
    // stage private (never auto-exposed).
    const publicStaged = posts.filter((d) => d.body?.visibility === 'public').length;
    const privateStaged = posts.filter((d) => d.body?.visibility === 'private').length;
    expect(publicStaged).toBe(EXPECTED.publicStaged);
    expect(privateStaged).toBe(EXPECTED.privateStaged);

    // The D62 join: comments land with ref_value = the imported post's doc_id
    // (a comment on a video not in the export is an orphan -> dropped).
    const comments = await readService(request, token, 'comments', [followersGroupId(username)]);
    expect(comments.length).toBe(EXPECTED.commentsWritten);
    for (const c of comments) {
      expect(c.ref_value, 'every imported comment must join an imported post').toBeTruthy();
    }

    // The channel -> the creator profile (display_name + the channel URL).
    const profiles = await readService(request, token, 'profile', [followersGroupId(username)]);
    expect(profiles.length).toBe(1);
    expect(profiles[0].body?.display_name).toBe(EXPECTED.profile.displayName);
    expect(profiles[0].body?.website).toContain(EXPECTED.profile.channelId);
  });

  test('a re-import is idempotent (origin_id dedup — no duplicates)', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);
    await runImport(request, token);
    const again = await runImport(request, token);
    expect(again.phase).toBe('complete');

    const posts = await readService(request, token, 'staging_posts', [followersGroupId(username)]);
    expect(posts.length, 'a re-run must not duplicate the catalog').toBe(EXPECTED.stagingPosts);
    const comments = await readService(request, token, 'comments', [followersGroupId(username)]);
    expect(comments.length).toBe(EXPECTED.commentsWritten);
  });

  test('I3: a stranger cannot read the imported catalog', async ({ request }) => {
    const owner = await signupFreshUser(request);
    const stranger = await signupFreshUser(request);
    await runImport(request, owner.token);

    // The owner sees the catalog...
    const ownerPosts = await readService(request, owner.token, 'staging_posts', [followersGroupId(owner.username)]);
    expect(ownerPosts.length).toBe(EXPECTED.stagingPosts);

    // ...but a stranger with no membership sees nothing (I3: a token never
    // reaches another user's data). The followers group is owner-only, so the
    // stranger's read is a D42 403 ("not a member") — read with expectOk=false.
    const strangerPosts = await readService(request, stranger.token, 'staging_posts', [followersGroupId(owner.username)], 500, false);
    expect(strangerPosts.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real Import card drives the real pipeline
// ---------------------------------------------------------------------------

test.describe('YouTube import — the authenticator UI', () => {
  // The browser gauntlet needs the stack on the DEFAULT port (80): the
  // authenticator derives its API origin from the token's portless `provider`
  // claim (`api.localhost`), so the browser calls `http://api.localhost/...`.
  // On a non-default port (a local workaround to dodge a port collision) that
  // origin is wrong and the UI can't reach the node — skip rather than fail.
  // CI runs the stack on port 80, so this runs there.
  test.skip(port !== '80', 'browser gauntlet requires the e2e stack on the default port (80)');

  test('the Import card ports the Takeout through the real UI', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);

    // Capture any page crash / console error so a failure is diagnosable.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(`console: ${msg.text()}`);
    });

    // Pre-authenticate the browser context (the authenticator reads the token
    // cookie), then navigate to the Settings view where the Import card lives.
    // The authenticator is mode-driven (no router): a signed-in user lands on
    // the contracts view, so we click the Settings nav to switch modes.
    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);
    await page.goto(AUTH_BASE);
    await expect(page.locator('[data-testid="sidebar-nav-settings"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="sidebar-nav-settings"]').click();
    // The Settings view can crash on a card's mount error (the error boundary
    // shows "Something went wrong"). If the Import card never appears, report
    // the captured page errors so the crash is diagnosable.
    await page.waitForTimeout(2500);
    if (!(await page.locator('[data-testid="import-section"]').isVisible().catch(() => false))) {
      throw new Error(`Import card did not render. Page errors: ${pageErrors.join(' | ') || '(none captured)'}`);
    }
    await expect(page.locator('[data-testid="import-section"]')).toBeVisible({ timeout: 15_000 });

    // Expand the card, pick the Takeout zip, and start the import.
    await page.locator('[data-testid="import-toggle"]').click();
    await page.locator('[data-testid="import-file-input"]').setInputFiles({
      name: TAKEOUT_NAME,
      mimeType: 'application/zip',
      buffer: TAKEOUT_ZIP,
    });
    await expect(page.locator('[data-testid="import-file-item"]')).toHaveCount(1);
    await page.locator('[data-testid="import-start"]').click();

    // The card polls the job and flips to the complete state.
    await expect(page.locator('[data-testid="import-complete"]')).toBeVisible({ timeout: 120_000 });

    // The node actually wrote the catalog (the UI is a thin client — the
    // assertion is that the data landed in the account).
    const posts = await readService(request, token, 'staging_posts', [followersGroupId(username)]);
    expect(posts.length).toBe(EXPECTED.stagingPosts);
  });
});
