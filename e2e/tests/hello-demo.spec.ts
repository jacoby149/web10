import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SDK_BASE = `http://sdk.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('hello');
  await request.post(`${API_BASE}/v3/signup`, {
    json: { token: '', body: { username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) } },
  });
  const res = await request.post(`${API_BASE}/v3/login`, {
    json: { token: '', body: { username, password } },
  });
  expect(res.ok()).toBeTruthy();
  const token = (await res.json()).token as string;
  return { username, token };
}

interface GauntletLogs {
  demo: string[];    // [hello-demo] logs from the main page
  auth: string[];    // [auth-ui] logs from the popup
}

function attachLogCapture(page: Page, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes(prefix)) {
      logs.push(text);
    }
  });
  return logs;
}

/**
 * Full auth flow for hello demo: load page → click login → log in in popup →
 * approve contract → verify signed-in state + groups.
 * Captures logs from BOTH sides of the wire.
 */
async function fullAuthFlow(
  page: Page,
  context: any,
  request: APIRequestContext,
): Promise<{ username: string; logs: GauntletLogs }> {
  const { username } = await signupFreshUser(request);

  const demoLogs = attachLogCapture(page, '[hello-demo]');

  await page.goto(`${SDK_BASE}/docs/hello/`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authButton')).toHaveText('Log in');

  const popupPromise = context.waitForEvent('page', { timeout: 15000 });
  await page.locator('#authButton').click();
  const popup = await popupPromise;

  const authLogs = attachLogCapture(popup, '[auth-ui]');

  await popup.waitForLoadState('domcontentloaded', { timeout: 15000 });
  expect(popup.url()).toContain('auth.localhost');

  // Log in in the popup
  await popup.getByTestId('username-input').fill(username);
  await popup.getByTestId('password-input').fill(password);
  await popup.getByTestId('login-submit').click();

  // Wait for consent view
  await popup.getByTestId('consent-approve-all').waitFor({ timeout: 15000 });

  // Approve the app contract
  await popup.getByTestId('consent-approve-all').click();

  // Wait for main page to reach signed-in state
  await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });

  if (!popup.isClosed()) {
    await popup.close();
  }

  return { username, logs: { demo: demoLogs, auth: authLogs } };
}

// ---------------------------------------------------------------------------
// Gauntlet: full E2E with both-sides log verification
// ---------------------------------------------------------------------------

test.describe('Hello demo gauntlet — demo + authenticator round-trip', () => {
  test('complete flow: auth popup → contract → greeting + groups, both sides logged', async ({ page, context, request }) => {
    const { username, logs } = await fullAuthFlow(page, context, request);
    const { demo, auth } = logs;
    const demoStr = demo.join('\n');
    const authStr = auth.join('\n');

    // =========================================================================
    // DEMO SIDE — [hello-demo] logs
    // =========================================================================

    expect(demoStr).toContain('[hello-demo] init — host:');
    expect(demoStr).toContain('[hello-demo] AUTH_ORIGIN:');
    expect(demoStr).toContain('[hello-demo] API_ORIGIN:');
    expect(demoStr).toContain('[hello-demo] authButton clicked');
    expect(demoStr).toContain('[hello-demo] sending app contract:');
    expect(demoStr).toContain('[hello-demo] authListen fired');
    expect(demoStr).toContain('[hello-demo] token payload:');
    expect(demoStr).toContain('[hello-demo] initApp — setting up signed-in state');
    expect(demoStr).toContain('[hello-demo] loadGroups — fetching user groups');
    expect(demoStr).toContain('[hello-demo] loadGroups — got');

    // Greeting shows the username
    await expect(page.locator('#message')).toContainText(username);

    // =========================================================================
    // AUTH SIDE — [auth-ui] logs
    // =========================================================================

    expect(authStr).toContain('[auth-ui] initAuthenticator — initializing, window.opener: present');
    expect(authStr).toContain('[auth-ui] contract message received');
    expect(authStr).toContain('[auth-ui] pendingContracts state set');
    expect(authStr).toContain('[auth-ui] auth_ready sent to opener via postMessage');
    expect(authStr).toContain('[auth-ui] login — v3.login succeeded');
    expect(authStr).toContain('[auth-ui] finishLogin — setting auth=true, mode=contracts');
    expect(authStr).toContain('[auth-ui] approveContract — kind: app');
    expect(authStr).toContain('[auth-ui] approveContract — ACR applied successfully');
    expect(authStr).toContain('[auth-ui] sendContractResponse — status: approved');
    expect(authStr).toContain('[auth-ui] goToApp — sending auth token to opener');
    expect(authStr).toContain('[auth-ui] goToApp — auth token sent, NOT closing — waiting for contracts');

    // =========================================================================
    // NO ERRORS on either side
    // =========================================================================
    const demoErrors = demo.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(demoErrors).toEqual([]);
    const authErrors = auth.filter((l) => l.includes('failed') || l.includes('Error'));
    expect(authErrors).toEqual([]);
  });

  test('log sequence: demo side is ordered correctly', async ({ page, context, request }) => {
    const { logs } = await fullAuthFlow(page, context, request);
    const { demo } = logs;

    const initIdx = demo.findIndex((l) => l.includes('init — host:'));
    const clickIdx = demo.findIndex((l) => l.includes('authButton clicked'));
    const contractIdx = demo.findIndex((l) => l.includes('sending app contract:'));
    const authListenIdx = demo.findIndex((l) => l.includes('authListen fired'));
    const tokenIdx = demo.findIndex((l) => l.includes('token payload:'));
    const initAppIdx = demo.findIndex((l) => l.includes('initApp — setting up signed-in state'));
    const groupsIdx = demo.findIndex((l) => l.includes('loadGroups — fetching user groups'));

    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(clickIdx).toBeGreaterThanOrEqual(0);
    expect(contractIdx).toBeGreaterThanOrEqual(0);
    expect(authListenIdx).toBeGreaterThanOrEqual(0);
    expect(tokenIdx).toBeGreaterThanOrEqual(0);
    expect(initAppIdx).toBeGreaterThanOrEqual(0);
    expect(groupsIdx).toBeGreaterThanOrEqual(0);

    expect(initIdx).toBeLessThan(clickIdx);
    expect(clickIdx).toBeLessThan(contractIdx);
    expect(contractIdx).toBeLessThan(authListenIdx);
    expect(authListenIdx).toBeLessThan(tokenIdx);
    expect(tokenIdx).toBeLessThan(initAppIdx);
    expect(initAppIdx).toBeLessThan(groupsIdx);
  });

  test('log sequence: auth side is ordered correctly', async ({ page, context, request }) => {
    const { logs } = await fullAuthFlow(page, context, request);
    const { auth } = logs;

    const initIdx = auth.findIndex((l) => l.includes('initAuthenticator — initializing'));
    const contractIdx = auth.findIndex((l) => l.includes('contract message received'));
    const pendingIdx = auth.findIndex((l) => l.includes('pendingContracts state set'));
    const readyIdx = auth.findIndex((l) => l.includes('auth_ready sent to opener'));
    const loginIdx = auth.findIndex((l) => l.includes('v3.login succeeded'));
    const finishIdx = auth.findIndex((l) => l.includes('finishLogin — setting auth=true'));
    const approveIdx = auth.findIndex((l) => l.includes('approveContract — kind: app'));
    const acrIdx = auth.findIndex((l) => l.includes('ACR applied successfully'));
    const respondIdx = auth.findIndex((l) => l.includes('sendContractResponse — status: approved'));
    const tokenIdx = auth.findIndex((l) => l.includes('goToApp — sending auth token'));

    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(contractIdx).toBeGreaterThanOrEqual(0);
    expect(pendingIdx).toBeGreaterThanOrEqual(0);
    expect(readyIdx).toBeGreaterThanOrEqual(0);
    expect(loginIdx).toBeGreaterThanOrEqual(0);
    expect(finishIdx).toBeGreaterThanOrEqual(0);
    expect(approveIdx).toBeGreaterThanOrEqual(0);
    expect(acrIdx).toBeGreaterThanOrEqual(0);
    expect(respondIdx).toBeGreaterThanOrEqual(0);
    expect(tokenIdx).toBeGreaterThanOrEqual(0);

    expect(initIdx).toBeLessThan(contractIdx);
    expect(contractIdx).toBeLessThan(pendingIdx);
    expect(pendingIdx).toBeLessThan(readyIdx);
    expect(readyIdx).toBeLessThan(loginIdx);
    expect(loginIdx).toBeLessThan(finishIdx);
    expect(finishIdx).toBeLessThan(approveIdx);
    expect(approveIdx).toBeLessThan(acrIdx);
    expect(acrIdx).toBeLessThan(respondIdx);
    expect(respondIdx).toBeLessThan(tokenIdx);
  });

  test('user with groups sees them listed after reload', async ({ page, context, request }) => {
    const { username } = await fullAuthFlow(page, context, request);

    // Get a token for API calls
    const res = await request.post(`${API_BASE}/v3/login`, {
      json: { token: '', body: { username, password } },
    });
    const token = (await res.json()).token as string;

    // Create a group via API
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

    // Reload — should restore session and show the group
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#message')).toContainText(groupName, { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// API-level test (fast, no browser)
// ---------------------------------------------------------------------------

test.describe('Hello demo — API-level', () => {
  test('getMyGroups returns empty for fresh user, populated after group create', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const listRes1 = await request.post(`${API_BASE}/v3/groups/list`, {
      data: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(listRes1.ok()).toBeTruthy();
    const groups1 = await listRes1.json();
    expect(groups1).toEqual([]);

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
    expect(groups2.length).toBe(1);
    expect(groups2[0].group_id).toContain('api-hello-group');
  });
});
