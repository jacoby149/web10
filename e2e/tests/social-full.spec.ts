import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;

const uniqueUser = () => `socialtest${Date.now()}`;

test.describe('social post with media -> feed -> comment -> DM', () => {
  let username: string;
  let token: string;
  const password = 'TestPass123!';

  test.beforeEach(async ({ request }) => {
    username = uniqueUser();
    // Random phone (like the other social specs): the fixed number collided
    // across the two tests in this block (beforeEach runs per-test, and
    // Playwright runs them in parallel), so the second signup hit "phone
    // already registered."
    const phone = '+1555' + Math.floor(Math.random() * 10000000);

    const signupRes = await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone,
        betacode: 'web10betacode',
      },
    });
    expect(signupRes.ok()).toBeTruthy();

    // Owner token: no site/target → self-access
    const tokenRes = await request.post(`${API_BASE}/v3/login`, {
      data: { username, password },
    });
    expect(tokenRes.ok()).toBeTruthy();
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
    const DISCOVER = 'web10.app/groups/web10/discover';

    const postRes = await request.post(`${API_BASE}/v3/create`, {
      data: { token, service: 'posts', body: { text: 'ref test post' }, groups: [DISCOVER] },
    });
    expect(postRes.ok()).toBeTruthy();
    const post = await postRes.json();
    const postId: string = post.doc_id;
    expect(postId).toBeTruthy();

    const commentRes = await request.post(`${API_BASE}/v3/create`, {
      data: {
        token,
        service: 'comments',
        body: { text: 'ref test comment', post_id: postId },
        groups: [DISCOVER],
        ref_value: postId,
      },
    });
    expect(commentRes.ok()).toBeTruthy();
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
    const DISCOVER = 'web10.app/groups/web10/discover';

    const postRes = await request.post(`${API_BASE}/v3/create`, {
      data: { token, service: 'posts', body: { text: 'ref test post' }, groups: [DISCOVER] },
    });
    expect(postRes.ok()).toBeTruthy();
    const post = await postRes.json();
    const postId: string = post.doc_id;
    expect(postId).toBeTruthy();

    const reactionRes = await request.post(`${API_BASE}/v3/create`, {
      data: {
        token,
        service: 'reactions',
        body: { type: 'like', target_id: postId },
        groups: [DISCOVER],
        ref_value: postId,
      },
    });
    expect(reactionRes.ok()).toBeTruthy();
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