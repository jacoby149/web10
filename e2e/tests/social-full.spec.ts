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

    const signupRes = await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15558880001',
        betacode: 'web10betacode',
      },
    });
    expect(signupRes.ok()).toBeTruthy();

    // Owner token: no site/target → self-access
    const tokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username, password },
    });
    expect(tokenRes.ok()).toBeTruthy();
    const body = await tokenRes.json();
    token = body.token;
  });

  test('create post and read it back', async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/${username}/posts`, {
      data: {
        token,
        query: {
          text: 'e2e test post',
          created_at: new Date().toISOString(),
        },
      },
    });
    expect(createRes.ok()).toBeTruthy();

    const readRes = await request.patch(`${API_BASE}/${username}/posts`, {
      data: { token, query: {} },
    });
    expect(readRes.ok()).toBeTruthy();
    const posts = await readRes.json();
    expect(Array.isArray(posts)).toBeTruthy();
    expect(posts.length).toBeGreaterThanOrEqual(1);
    const found = posts.find((p: any) => p.text === 'e2e test post');
    expect(found).toBeDefined();
  });

  test('create post -> create comment on post', async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/${username}/posts`, {
      data: {
        token,
        query: {
          text: 'commentable post',
          created_at: new Date().toISOString(),
        },
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const post = await createRes.json();
    const postId = post._id;

    const commentRes = await request.post(`${API_BASE}/${username}/comments`, {
      data: {
        token,
        query: {
          text: 'e2e test comment',
          post_id: postId,
          created_at: new Date().toISOString(),
        },
      },
    });
    expect(commentRes.ok()).toBeTruthy();
    const comment = await commentRes.json();
    expect(comment.text).toBe('e2e test comment');
    expect(comment.post_id).toBe(postId);
  });

  test('create reaction on post', async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/${username}/posts`, {
      data: {
        token,
        query: {
          text: 'reactable post',
          created_at: new Date().toISOString(),
        },
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const post = await createRes.json();
    const postId = post._id;

    const reactionRes = await request.post(`${API_BASE}/${username}/reactions`, {
      data: {
        token,
        query: {
          post_id: postId,
          type: 'like',
          created_at: new Date().toISOString(),
        },
      },
    });
    expect(reactionRes.ok()).toBeTruthy();
    const reaction = await reactionRes.json();
    expect(reaction.type).toBe('like');
  });

  test('create DM between two users', async ({ request }) => {
    const user2 = `${username}-dm`;
    const signup2Res = await request.post(`${API_BASE}/signup`, {
      data: {
        provider: 'api.localhost',
        username: user2,
        password,
        new_pass: password,
        retypepass: password,
        phone: '+15558880002',
        betacode: 'web10betacode',
      },
    });
    expect(signup2Res.ok()).toBeTruthy();

    const [first, second] = [username, user2].sort();
    const dmService = `dm-${first}--${second}`;

    const dmRes = await request.post(`${API_BASE}/${username}/${dmService}`, {
      data: {
        token,
        query: {
          text: 'e2e test DM',
          from: username,
          to: user2,
          created_at: new Date().toISOString(),
        },
      },
    });
    expect(dmRes.ok()).toBeTruthy();
    const dm = await dmRes.json();
    expect(dm.text).toBe('e2e test DM');
  });

  test('media upload flow: request presigned URL', async ({ request }) => {
    // Media endpoints need target=PROVIDER for is_permitted to work
    const mediaTokenRes = await request.post(`${API_BASE}/web10token`, {
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

  test('media upload flow: full cycle (presign -> upload -> confirm)', async ({ request }) => {
    const mediaTokenRes = await request.post(`${API_BASE}/web10token`, {
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

  test('list media records after upload', async ({ request }) => {
    const mediaTokenRes = await request.post(`${API_BASE}/web10token`, {
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

  test('social app renders login screen', async ({ page }) => {
    await page.goto(SOCIAL_BASE);
    await expect(page.locator('text=web10')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Log in')).toBeVisible({ timeout: 10000 });
  });
});