import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('hello');
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

async function setupUser(
  page: Page,
  context: any,
  request: APIRequestContext,
): Promise<{ username: string; token: string }> {
  const { username, token } = await signupFreshUser(request);
  await setTokenCookie(context, 'marketing.localhost', token);
  await setTokenCookie(context, 'auth.localhost', token);

  // Create app contract for the demo origin
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: MARKETING_BASE,
      permissions: { profile: ['readAll'] },
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });

  return { username, token };
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
// Gauntlet: hello demo + console log verification
// ---------------------------------------------------------------------------

test.describe('Hello demo gauntlet — auth state + groups + console logs', () => {
  test('signed-in user sees greeting + groups, logs are correct', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[hello-demo]');
    const { username, token } = await setupUser(page, context, request);

    // Create a group so it shows up
    const groupName = `hello-test-${Date.now()}`;
    await request.post(`${API_BASE}/v3/groups/create`, {
      data: JSON.stringify({
        token,
        name: groupName,
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    await page.goto(`${MARKETING_BASE}/docs/hello/`);
    await page.waitForLoadState('networkidle');

    // Verify signed-in state
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#message')).toContainText(username);

    // Verify group is listed
    await expect(page.locator('#message')).toContainText(groupName, { timeout: 10000 });

    // Verify console logs
    const logStr = logs.join('\n');
    expect(logStr).toContain('[hello-demo] init — host:');
    expect(logStr).toContain('[hello-demo] page load — already signed in');
    expect(logStr).toContain('[hello-demo] initApp — setting up signed-in state');
    expect(logStr).toContain('[hello-demo] loadGroups — fetching user groups');
    expect(logStr).toContain('[hello-demo] loadGroups — got');

    // No errors
    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });

  test('log sequence is ordered correctly', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[hello-demo]');
    await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/hello/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');

    const initIdx = logs.findIndex((l) => l.includes('init — host:'));
    const signedInIdx = logs.findIndex((l) => l.includes('page load — already signed in'));
    const initAppIdx = logs.findIndex((l) => l.includes('initApp — setting up signed-in state'));
    const groupsIdx = logs.findIndex((l) => l.includes('loadGroups — fetching user groups'));
    const groupsGotIdx = logs.findIndex((l) => l.includes('loadGroups — got'));

    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(signedInIdx).toBeGreaterThanOrEqual(0);
    expect(initAppIdx).toBeGreaterThanOrEqual(0);
    expect(groupsIdx).toBeGreaterThanOrEqual(0);
    expect(groupsGotIdx).toBeGreaterThanOrEqual(0);

    expect(initIdx).toBeLessThan(signedInIdx);
    expect(signedInIdx).toBeLessThan(initAppIdx);
    expect(initAppIdx).toBeLessThan(groupsIdx);
    expect(groupsIdx).toBeLessThan(groupsGotIdx);
  });

  test('session persists after reload', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[hello-demo]');
    const { username } = await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/hello/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#message')).toContainText(username);

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Still signed in
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#message')).toContainText(username);

    // No errors
    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });

  test('no console errors during full flow', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[hello-demo]');
    await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/hello/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');

    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// API-level test (fast, no browser)
// ---------------------------------------------------------------------------

test.describe('Hello demo — API-level', () => {
  test('getMyGroups returns only the discover group for fresh user, populated after group create', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const listRes1 = await request.post(`${API_BASE}/v3/groups/list`, {
      data: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(listRes1.ok()).toBeTruthy();
    const groups1 = await listRes1.json();
    // A fresh user is auto-enrolled in the node-default discover group (#686)
    // — that is the ONLY group they start with.
    expect(groups1.length).toBe(1);
    expect(groups1[0].group_id).toBe('web10.app/groups/web10/discover');

    await request.post(`${API_BASE}/v3/groups/create`, {
      data: JSON.stringify({
        token,
        name: 'api-hello-group',
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const listRes2 = await request.post(`${API_BASE}/v3/groups/list`, {
      data: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(listRes2.ok()).toBeTruthy();
    const groups2 = await listRes2.json();
    // discover + the created group
    expect(groups2.length).toBe(2);
    const created = groups2.find((g: { group_id: string }) => g.group_id.includes('api-hello-group'));
    expect(created, 'created group missing from groups/list').toBeTruthy();
  });
});
