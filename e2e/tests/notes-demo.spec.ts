import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SDK_BASE = `http://sdk.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('notes');
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

/**
 * Gauntlet: captures console logs from BOTH the demo page and the auth popup.
 * This is as much an authenticator test as a demo test — it verifies the
 * full round-trip between the two apps.
 */
interface GauntletLogs {
  demo: string[];    // [notes-demo] logs from the main page
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
 * Full auth flow: load notes page → click login → log in in popup →
 * approve app contract → approve group contract → editor visible.
 * Captures logs from BOTH sides of the wire.
 */
async function fullAuthFlow(
  page: Page,
  context: any,
  request: APIRequestContext,
): Promise<{ username: string; logs: GauntletLogs }> {
  const { username } = await signupFreshUser(request);

  // Attach log capture to the main page BEFORE navigation
  const demoLogs = attachLogCapture(page, '[notes-demo]');

  // Load the notes page — no token, should show "Log in"
  await page.goto(`${SDK_BASE}/docs/notes/`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authButton')).toHaveText('Log in');

  // Click "Log in" — opens the auth popup
  const popupPromise = context.waitForEvent('page', { timeout: 15000 });
  await page.locator('#authButton').click();
  const popup = await popupPromise;

  // Attach log capture to the popup
  const authLogs = attachLogCapture(popup, '[auth-ui]');

  // Wait for auth UI to load in the popup
  await popup.waitForLoadState('domcontentloaded', { timeout: 15000 });
  expect(popup.url()).toContain('auth.localhost');

  // Log in in the popup
  await popup.getByTestId('username-input').fill(username);
  await popup.getByTestId('password-input').fill(password);
  await popup.getByTestId('login-submit').click();

  // Wait for the consent view to render (app contract is pending)
  await popup.getByTestId('consent-approve-all').waitFor({ timeout: 15000 });

  // Approve the app contract
  await popup.getByTestId('consent-approve-all').click();

  // Wait for the main page to receive the token and send the group contract.
  // The popup will show a new consent view for the group creation.
  await popup.waitForTimeout(3000);

  // The popup may show the group consent now — approve it if visible.
  const groupApprove = popup.getByTestId('consent-approve-all');
  try {
    await groupApprove.waitFor({ timeout: 10000 });
    await groupApprove.click();
  } catch {
    // Group consent may have already been handled
  }

  // Wait for the main page to reach the signed-in state
  await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });
  await expect(page.locator('#editor')).toBeVisible({ timeout: 15000 });

  // Close the popup if still open
  if (!popup.isClosed()) {
    await popup.close();
  }

  return { username, logs: { demo: demoLogs, auth: authLogs } };
}

// ---------------------------------------------------------------------------
// Gauntlet: full E2E with both-sides log verification
// ---------------------------------------------------------------------------

test.describe('Notes demo gauntlet — demo + authenticator round-trip', () => {
  test('complete flow: auth popup → contracts → CRUD → persist, both sides logged', async ({ page, context, request }) => {
    const { username, logs } = await fullAuthFlow(page, context, request);
    const { demo, auth } = logs;
    const demoStr = demo.join('\n');
    const authStr = auth.join('\n');

    // =========================================================================
    // DEMO SIDE — verify [notes-demo] logs prove the flow
    // =========================================================================

    // Init
    expect(demoStr).toContain('[notes-demo] init — host:');
    expect(demoStr).toContain('[notes-demo] AUTH_ORIGIN:');
    expect(demoStr).toContain('[notes-demo] API_ORIGIN:');

    // Auth click
    expect(demoStr).toContain('[notes-demo] authButton clicked');
    expect(demoStr).toContain('[notes-demo] sending app contract:');

    // Token received
    expect(demoStr).toContain('[notes-demo] authListen fired');
    expect(demoStr).toContain('[notes-demo] token payload:');
    expect(demoStr).toContain('[notes-demo] NOTES_GROUP set to:');

    // Group contract
    expect(demoStr).toContain('[notes-demo] requesting group creation');

    // App init
    expect(demoStr).toContain('[notes-demo] initApp — setting up signed-in state');
    expect(demoStr).toContain('[notes-demo] readNotes — called');

    // =========================================================================
    // AUTH SIDE — verify [auth-ui] logs prove the authenticator worked
    // =========================================================================

    // Authenticator initialized as a popup
    expect(authStr).toContain('[auth-ui] initAuthenticator — initializing, window.opener: present');

    // Received the contract from the demo
    expect(authStr).toContain('[auth-ui] contract message received');
    expect(authStr).toContain('[auth-ui] pendingContracts state set');

    // Sent auth_ready back to the demo
    expect(authStr).toContain('[auth-ui] auth_ready sent to opener via postMessage');

    // Login succeeded
    expect(authStr).toContain('[auth-ui] login — v3.login succeeded');
    expect(authStr).toContain('[auth-ui] finishLogin — setting auth=true, mode=contracts');

    // Contract approved
    expect(authStr).toContain('[auth-ui] approveContract — kind: app');
    expect(authStr).toContain('[auth-ui] approveContract — ACR applied successfully');
    expect(authStr).toContain('[auth-ui] sendContractResponse — status: approved');

    // Token sent back to the demo
    expect(authStr).toContain('[auth-ui] goToApp — sending auth token to opener');
    expect(authStr).toContain('[auth-ui] goToApp — auth token sent, NOT closing — waiting for contracts');

    // =========================================================================
    // CRUD — do it and verify both sides stay clean
    // =========================================================================

    const noteText = `gauntlet note ${Date.now()}`;
    await page.locator('#curr').fill(noteText);
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.note textarea').first()).toHaveValue(noteText);

    const updatedText = `updated ${Date.now()}`;
    await page.locator('.note textarea').first().fill(updatedText);
    await page.locator('.note button:has-text("Update")').first().click();
    await expect(page.locator('.note textarea').first()).toHaveValue(updatedText, { timeout: 10000 });

    await page.locator('.note button:has-text("Delete")').first().click();
    await expect(page.locator('.note')).toHaveCount(0, { timeout: 10000 });

    // Persist check
    const persistText = `persist ${Date.now()}`;
    await page.locator('#curr').fill(persistText);
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.note textarea').first()).toHaveValue(persistText);

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
    const groupIdx = demo.findIndex((l) => l.includes('NOTES_GROUP set to:'));
    const groupReqIdx = demo.findIndex((l) => l.includes('requesting group creation'));
    const initAppIdx = demo.findIndex((l) => l.includes('initApp — setting up signed-in state'));
    const readIdx = demo.findIndex((l) => l.includes('readNotes — called'));

    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(clickIdx).toBeGreaterThanOrEqual(0);
    expect(contractIdx).toBeGreaterThanOrEqual(0);
    expect(authListenIdx).toBeGreaterThanOrEqual(0);
    expect(tokenIdx).toBeGreaterThanOrEqual(0);
    expect(groupIdx).toBeGreaterThanOrEqual(0);
    expect(groupReqIdx).toBeGreaterThanOrEqual(0);
    expect(initAppIdx).toBeGreaterThanOrEqual(0);
    expect(readIdx).toBeGreaterThanOrEqual(0);

    expect(initIdx).toBeLessThan(clickIdx);
    expect(clickIdx).toBeLessThan(contractIdx);
    expect(contractIdx).toBeLessThan(authListenIdx);
    expect(authListenIdx).toBeLessThan(tokenIdx);
    expect(tokenIdx).toBeLessThan(groupIdx);
    expect(groupIdx).toBeLessThan(groupReqIdx);
    expect(groupReqIdx).toBeLessThan(initAppIdx);
    expect(initAppIdx).toBeLessThan(readIdx);
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
});

// ---------------------------------------------------------------------------
// API-level tests (fast, no browser — verify the backend contract)
// ---------------------------------------------------------------------------

test.describe('Notes demo — API-level CRUD', () => {
  test('full CRUD cycle via API', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const groupName = `notes-${username}`;
    const createGroupRes = await request.post(`${API_BASE}/v3/groups/create`, {
      data: JSON.stringify({
        token,
        name: groupName,
        join_policy: 'invite_only',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createGroupRes.ok()).toBeTruthy();
    const group = await createGroupRes.json();
    const groupId = group.group_id;

    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });

    // CREATE
    const createRes = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: 'notes',
        body: { note: 'api test note', date: new Date().toISOString() },
        groups: [groupId],
      }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://sdk.localhost' },
    });
    expect(createRes.ok()).toBeTruthy();
    const doc = await createRes.json();
    const docId = doc.doc_id;
    expect(docId).toBeTruthy();

    // READ
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, collection: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://sdk.localhost' },
    });
    expect(readRes.ok()).toBeTruthy();
    const docs = await readRes.json();
    expect(docs.length).toBe(1);
    expect(docs[0].body.note).toBe('api test note');

    // UPDATE
    const updateRes = await request.post(`${API_BASE}/v3/update`, {
      data: JSON.stringify({
        token,
        doc_id: docId,
        body: { note: 'api test note updated' },
      }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://sdk.localhost' },
    });
    expect(updateRes.ok()).toBeTruthy();

    const readRes2 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, collection: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://sdk.localhost' },
    });
    const docs2 = await readRes2.json();
    expect(docs2[0].body.note).toBe('api test note updated');

    // DELETE
    const deleteRes = await request.post(`${API_BASE}/v3/delete`, {
      data: JSON.stringify({ token, doc_id: docId }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://sdk.localhost' },
    });
    expect(deleteRes.ok()).toBeTruthy();

    const readRes3 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, collection: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://sdk.localhost' },
    });
    const docs3 = await readRes3.json();
    expect(docs3.length).toBe(0);
  });

  test('CRUD without contract fails with 403', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const groupName = `notes-${username}`;
    await request.post(`${API_BASE}/v3/groups/create`, {
      data: JSON.stringify({
        token,
        name: groupName,
        join_policy: 'invite_only',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const createRes = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: 'notes',
        body: { note: 'no contract', date: new Date().toISOString() },
      }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://sdk.localhost' },
    });
    expect(createRes.status()).toBe(403);
  });
});
