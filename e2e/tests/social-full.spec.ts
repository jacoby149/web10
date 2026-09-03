import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;

const uniqueUser = () => `socialtest${Date.now()}`;

// The e2e ClickHouse (ReplacingMergeTree) is eventually consistent and the
// shared multi-workspace stack can be transiently unhealthy (a create insert
// can lose the merge race). Retry to ride it out — same pattern as the
// signup/login retry. Returns the first OK response, or the last response
// (so the caller's assertion fails with the real status).
//
// [llm-debug] every failed attempt logs its status + body so a red run is
// self-explanatory (the seam: what actually crossed the wire).
async function createWithRetry(request: any, payload: Record<string, unknown>, label: string) {
  let res: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok()) return res;
    const body = await res.text().catch(() => '');
    console.log(`[llm-debug] ${label} attempt ${attempt + 1}/5 -> ${res.status()} ${body.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  return res;
}

// Assert a response is OK, embedding its status + body in the failure message
// so a red run shows exactly what the API returned (not just "falsy").
async function expectOk(res: any, label: string) {
  const body = await res.text().catch(() => '');
  expect(
    res.ok(),
    `${label} -> status=${res.status()} body=${body.slice(0, 500)}`,
  ).toBeTruthy();
  return res;
}

test.describe('social post with media -> feed -> comment -> DM', () => {
  let username: string;
  let token: string;
  const password = 'TestPass123!';

  test.beforeEach(async ({ request }) => {
    username = uniqueUser();
    // Random phone (like the other social specs): the fixed number collided
    // across the two tests in this block (beforeEach runs per-test, and
    // Playwright runs them in parallel).
    const phone = '+1555' + Math.floor(Math.random() * 10000000);

    // The e2e ClickHouse (ReplacingMergeTree) is eventually consistent and the
    // shared multi-workspace stack can be transiently unhealthy (a signup
    // insert or the login's authenticate query can lose the merge race). Retry
    // both to ride it out — the CI serial run is stable, but the parallel/
    // shared run needs this (same pattern as the other social specs).
    let signupOk = false;
    let signupStatus = 0;
    let signupBody = '';
    for (let attempt = 0; attempt < 5 && !signupOk; attempt++) {
      const signupRes = await request.post(`${API_BASE}/v3/signup`, {
        data: JSON.stringify({ username, password, phone }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (signupRes.ok()) {
        signupOk = true;
      } else {
        signupStatus = signupRes.status();
        signupBody = await signupRes.text().catch(() => '');
        console.log(`[llm-debug] signup attempt ${attempt + 1}/5 -> ${signupStatus} ${signupBody.slice(0, 300)}`);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    expect(signupOk, `signup failed for ${username} -> status=${signupStatus} body=${signupBody.slice(0, 500)}`).toBeTruthy();

    // Owner token: no site/target → self-access. Retry on the transient race.
    let tokenRes = null;
    let loginStatus = 0;
    let loginBody = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      tokenRes = await request.post(`${API_BASE}/v3/login`, {
        data: JSON.stringify({ username, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (tokenRes.ok()) break;
      loginStatus = tokenRes.status();
      loginBody = await tokenRes.text().catch(() => '');
      console.log(`[llm-debug] login attempt ${attempt + 1}/5 -> ${loginStatus} ${loginBody.slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(tokenRes.ok(), `login failed -> status=${loginStatus} body=${loginBody.slice(0, 500)}`).toBeTruthy();
    const body = await tokenRes.json();
    token = body.token;
  });

  test.skip('create post and read it back', async () => {
    // GUTTED (v2→v3): tested /{username}/posts (removed). Posts exist in v3 via
    // /v3/create (service=posts) + /v3/read. v3 rewrite: service-based CRUD.
  });

  test('create post -> create comment -> read comment back by ref_value', async ({ request }) => {
    // The ref round-trip (the regression this proves): a comment is created with
    // ref_value = the post's doc_id, and the read (filtered by ref_value) finds
    // it. Before the fix, ref_value was set client-side only, the server stored
    // '', and the ref filter never matched — the comment was orphaned.
    // Provider-derived discover group (ffcd5876): e2e's PROVIDER is
    // api.localhost, so the real discover board is api.localhost/groups/...
    // (not the production web10.app/... ID). The wrong ID fails the D58 write
    // gate (can_write_group) with a 403 — the group doesn't exist in e2e.
    const DISCOVER = 'api.localhost/groups/web10/discover';

    const postRes = await createWithRetry(request, {
      token, service: 'posts', body: { text: 'ref test post' }, groups: [DISCOVER],
    }, 'create post (comment test)');
    await expectOk(postRes, 'create post (comment test)');
    const post = await postRes.json();
    const postId: string = post.doc_id;
    expect(postId).toBeTruthy();

    const commentRes = await createWithRetry(request, {
      token,
      service: 'comments',
      body: { text: 'ref test comment', post_id: postId },
      groups: [DISCOVER],
      ref_value: postId,
    }, 'create comment');
    await expectOk(commentRes, 'create comment');
    const comment = await commentRes.json();
    // The server persisted ref_value (not '').
    expect(comment.ref_value).toBe(postId);

    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: { token, service: 'comments', groups: [DISCOVER] },
    });
    expect(readRes.ok()).toBeTruthy();
    const comments: { ref_value: string; body: { text: string } }[] = await readRes.json();
    const matching = comments.filter((c) => c.ref_value === postId);
    expect(matching.length).toBeGreaterThanOrEqual(1);
    expect(matching[0].body.text).toBe('ref test comment');
  });

  test('create post -> create reaction -> read reaction back by ref_value', async ({ request }) => {
    // Same ref round-trip for reactions: a like is created with ref_value = the
    // post's doc_id, and the read (filtered by ref_value) finds it.
    // Provider-derived discover group (ffcd5876): e2e's PROVIDER is
    // api.localhost, so the real discover board is api.localhost/groups/...
    // (not the production web10.app/... ID). The wrong ID fails the D58 write
    // gate (can_write_group) with a 403 — the group doesn't exist in e2e.
    const DISCOVER = 'api.localhost/groups/web10/discover';

    const postRes = await createWithRetry(request, {
      token, service: 'posts', body: { text: 'ref test post' }, groups: [DISCOVER],
    }, 'create post (reaction test)');
    await expectOk(postRes, 'create post (reaction test)');
    const post = await postRes.json();
    const postId: string = post.doc_id;
    expect(postId).toBeTruthy();

    const reactionRes = await createWithRetry(request, {
      token,
      service: 'reactions',
      body: { type: 'like', target_id: postId },
      groups: [DISCOVER],
      ref_value: postId,
    }, 'create reaction');
    await expectOk(reactionRes, 'create reaction');
    const reaction = await reactionRes.json();
    expect(reaction.ref_value).toBe(postId);

    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: { token, service: 'reactions', groups: [DISCOVER] },
    });
    expect(readRes.ok()).toBeTruthy();
    const reactions: { ref_value: string; body: { type: string } }[] = await readRes.json();
    const matching = reactions.filter((r) => r.ref_value === postId);
    expect(matching.length).toBeGreaterThanOrEqual(1);
    expect(matching[0].body.type).toBe('like');
  });

  test.skip('create DM between two users', async () => {
    // GUTTED (v2→v3): tested /{username}/{dm-service} (removed). DMs exist in v3 as
    // private (invite_only) groups with a deterministic ID + /v3/create documents.
    // v3 rewrite: DM group contract + group-scoped CRUD.
  });

  test.fixme('media upload flow: request presigned URL', async ({ request }) => {
    // FIXME (Lane A): is_permitted(token, user, "media", "create") fails because
    // media endpoints check the "media" service, but the default services_record
    // created at signup doesn't have a "media" whitelist entry. Need either:
    // (a) is_permitted to auto-approve self-access for any service, or
    // (b) create_user to seed a media terms record.
    // Media endpoints need target=PROVIDER for is_permitted to work
    const mediaTokenRes = await request.post(`${API_BASE}/v3/login`, {
      data: { username, password, target: 'api.localhost' },
    });
    expect(mediaTokenRes.ok()).toBeTruthy();
    const { token: mediaToken } = await mediaTokenRes.json();

    const uploadRes = await request.post(`${API_BASE}/${username}/upload`, {
      data: {
        token: mediaToken,
        filename: 'test-image.png',
        mime_type: 'image/png',
        size_bytes: 1024,
      },
    });
    expect(uploadRes.ok()).toBeTruthy();
    const uploadData = await uploadRes.json();
    expect(uploadData.upload_url).toBeDefined();
    expect(uploadData.object_key).toBeDefined();
  });

  test.fixme('media upload flow: full cycle (presign -> upload -> confirm)', async ({ request }) => {
    // FIXME (Lane A): same is_permitted bug as above — media service not whitelisted for self
    const mediaTokenRes = await request.post(`${API_BASE}/v3/login`, {
      data: { username, password, target: 'api.localhost' },
    });
    expect(mediaTokenRes.ok()).toBeTruthy();
    const { token: mediaToken } = await mediaTokenRes.json();

    const uploadRes = await request.post(`${API_BASE}/${username}/upload`, {
      data: {
        token: mediaToken,
        filename: 'e2e-test.png',
        mime_type: 'image/png',
        size_bytes: 1024,
      },
    });
    expect(uploadRes.ok()).toBeTruthy();
    const { upload_url, object_key } = await uploadRes.json();

    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8D4HwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      'base64',
    );

    const uploadResp = await request.put(upload_url, {
      data: tinyPng,
      headers: { 'Content-Type': 'image/png' },
    });
    expect(uploadResp.status()).toBe(200);

    const confirmRes = await request.post(`${API_BASE}/${username}/upload/confirm`, {
      data: {
        token: mediaToken,
        url: `http://minio:9000/${object_key}`,
        filename: 'e2e-test.png',
        mime_type: 'image/png',
        size_bytes: 68,
      },
    });
    expect(confirmRes.ok()).toBeTruthy();
    const mediaRecord = await confirmRes.json();
    expect(mediaRecord.filename).toBe('e2e-test.png');
  });

  test.fixme('list media records after upload', async ({ request }) => {
    // FIXME (Lane A): same is_permitted bug — media service not whitelisted for self
    const mediaTokenRes = await request.post(`${API_BASE}/v3/login`, {
      data: { username, password, target: 'api.localhost' },
    });
    expect(mediaTokenRes.ok()).toBeTruthy();
    const { token: mediaToken } = await mediaTokenRes.json();

    const uploadRes = await request.post(`${API_BASE}/${username}/upload`, {
      data: {
        token: mediaToken,
        filename: 'list-test.png',
        mime_type: 'image/png',
        size_bytes: 100,
      },
    });
    expect(uploadRes.ok()).toBeTruthy();
    const { object_key } = await uploadRes.json();

    const confirmRes = await request.post(`${API_BASE}/${username}/upload/confirm`, {
      data: {
        token: mediaToken,
        url: `http://minio:9000/${object_key}`,
        filename: 'list-test.png',
        mime_type: 'image/png',
        size_bytes: 68,
      },
    });
    expect(confirmRes.ok()).toBeTruthy();

    const listRes = await request.post(`${API_BASE}/${username}/list`, {
      data: { token: mediaToken },
    });
    expect(listRes.ok()).toBeTruthy();
    const media = await listRes.json();
    expect(Array.isArray(media)).toBeTruthy();
    expect(media.length).toBeGreaterThanOrEqual(1);
  });

  test.skip('social app renders login screen', async () => {
    // GUTTED (v2→v3): social app (web10-social) login-screen render check. The app is
    // the v3 integration surface — needs a fresh render test once the login route is
    // stable. Tracked in the retire-obsolete-e2e lane.
  });
});