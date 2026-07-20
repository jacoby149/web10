import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;

const uniqueUser = () => `termstest${Date.now()}`;

test.describe('terms grant and revoke', () => {
  const password = 'TestPass123!';

  test('grant terms via whitelist, then revoke via blacklist', async ({ request }) => {
    const owner = uniqueUser();
    const reader = `${uniqueUser()}r`;

    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: owner, password, new_pass: password, retypepass: password, phone: '+15557770001', betacode: 'web10betacode' },
    });
    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: reader, password, new_pass: password, retypepass: password, phone: '+15557770002', betacode: 'web10betacode' },
    });

    // Owner token: no site/target → self-access
    const ownerTokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username: owner, password },
    });
    expect(ownerTokenRes.ok()).toBeTruthy();
    const { token: ownerToken } = await ownerTokenRes.json();

    // Reader token: no site/target → self-access
    const readerTokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username: reader, password },
    });
    expect(readerTokenRes.ok()).toBeTruthy();
    const { token: readerToken } = await readerTokenRes.json();

    // Owner creates a post
    const createRes = await request.post(`${API_BASE}/${owner}/posts`, {
      data: { token: ownerToken, query: { text: 'owner post', created_at: new Date().toISOString() } },
    });
    expect(createRes.ok()).toBeTruthy();

    // Reader tries to read BEFORE grant — should fail
    const readBeforeRes = await request.patch(`${API_BASE}/${owner}/posts`, {
      data: { token: readerToken, query: {} },
    });
    expect(readBeforeRes.ok()).toBeFalsy();

    // Owner grants reader read access via services record
    const grantRes = await request.post(`${API_BASE}/${owner}/services`, {
      data: {
        token: ownerToken,
        query: {
          service: 'posts',
          cross_origins: ['.*'],
          whitelist: [
            { username: reader, provider: 'api.localhost', read: true },
          ],
        },
      },
    });
    expect(grantRes.ok()).toBeTruthy();

    // Reader can now read
    const readAfterRes = await request.patch(`${API_BASE}/${owner}/posts`, {
      data: { token: readerToken, query: {} },
    });
    expect(readAfterRes.ok()).toBeTruthy();
    const posts = await readAfterRes.json();
    expect(Array.isArray(posts)).toBeTruthy();
    expect(posts.length).toBeGreaterThanOrEqual(1);

    // Owner revokes reader via blacklist
    const revokeRes = await request.put(`${API_BASE}/${owner}/services`, {
      data: {
        token: ownerToken,
        query: { service: 'posts' },
        update: {
          $set: {
            blacklist: [
              { username: reader, provider: 'api.localhost' },
            ],
          },
        },
      },
    });
    expect(revokeRes.ok()).toBeTruthy();

    // Reader is now denied
    const readAfterRevokeRes = await request.patch(`${API_BASE}/${owner}/posts`, {
      data: { token: readerToken, query: {} },
    });
    expect(readAfterRevokeRes.ok()).toBeFalsy();
  });

  test('blacklist takes precedence over whitelist', async ({ request }) => {
    const owner = uniqueUser();
    const reader = `${uniqueUser()}b`;

    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: owner, password, new_pass: password, retypepass: password, phone: '+15557770003', betacode: 'web10betacode' },
    });
    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: reader, password, new_pass: password, retypepass: password, phone: '+15557770004', betacode: 'web10betacode' },
    });

    const ownerTokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username: owner, password },
    });
    const { token: ownerToken } = await ownerTokenRes.json();

    const readerTokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username: reader, password },
    });
    const { token: readerToken } = await readerTokenRes.json();

    // Create services record with BOTH whitelist and blacklist
    const grantRes = await request.post(`${API_BASE}/${owner}/services`, {
      data: {
        token: ownerToken,
        query: {
          service: 'posts',
          cross_origins: ['.*'],
          whitelist: [
            { username: reader, provider: 'api.localhost', read: true },
          ],
          blacklist: [
            { username: reader, provider: 'api.localhost' },
          ],
        },
      },
    });
    expect(grantRes.ok()).toBeTruthy();

    // Blacklist takes precedence — reader denied
    const readRes = await request.patch(`${API_BASE}/${owner}/posts`, {
      data: { token: readerToken, query: {} },
    });
    expect(readRes.ok()).toBeFalsy();
  });

  test('cross_origins on service record allows access for matching site', async ({ request }) => {
    const owner = uniqueUser();
    const reader = `${uniqueUser()}c`;

    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: owner, password, new_pass: password, retypepass: password, phone: '+15557770005', betacode: 'web10betacode' },
    });
    await request.post(`${API_BASE}/signup`, {
      data: { provider: 'api.localhost', username: reader, password, new_pass: password, retypepass: password, phone: '+15557770006', betacode: 'web10betacode' },
    });

    const ownerTokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username: owner, password },
    });
    const { token: ownerToken } = await ownerTokenRes.json();

    const readerTokenRes = await request.post(`${API_BASE}/web10token`, {
      data: { username: reader, password },
    });
    const { token: readerToken } = await readerTokenRes.json();

    const grantRes = await request.post(`${API_BASE}/${owner}/services`, {
      data: {
        token: ownerToken,
        query: {
          service: 'posts',
          cross_origins: ['.*'],
          whitelist: [
            { username: reader, provider: 'api.localhost', read: true },
          ],
        },
      },
    });
    expect(grantRes.ok()).toBeTruthy();

    const readRes = await request.patch(`${API_BASE}/${owner}/posts`, {
      data: { token: readerToken, query: {} },
    });
    expect(readRes.ok()).toBeTruthy();
  });
});