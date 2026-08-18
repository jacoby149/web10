import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('notes');
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

/**
 * Set up a fresh user with group + contract, return the username.
 * Pre-authenticates the browser context so the demo loads in signed-in state.
 */
async function setupUser(
  page: Page,
  context: any,
  request: APIRequestContext,
): Promise<{ username: string; token: string }> {
  const { username, token } = await signupFreshUser(request);
  await setTokenCookie(context, 'marketing.localhost', token);
  await setTokenCookie(context, 'auth.localhost', token);

  // Create the notes group
  const groupName = `notes-${username}`;
  await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name: groupName,
      join_policy: 'invite_only',
      roles: [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
        { name: 'member', services: ['notes'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      ],
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  // Create app contract for the demo origin
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: 'http://marketing.localhost',
      permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
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
// Gauntlet: demo app CRUD + console log verification
// ---------------------------------------------------------------------------

test.describe('Notes demo gauntlet — CRUD + console logs', () => {
  test('full CRUD: create, read, update, delete, persist — with log verification', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[notes-demo]');
    const { username } = await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');

    // Verify signed-in state
    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#message')).toContainText(username);
    await expect(page.locator('#editor')).toBeVisible();

    // --- CREATE ---
    const noteText = `gauntlet note ${Date.now()}`;
    await page.locator('#curr').fill(noteText);
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.note textarea').first()).toHaveValue(noteText);

    // --- UPDATE ---
    const updatedText = `updated ${Date.now()}`;
    await page.locator('.note textarea').first().fill(updatedText);
    await page.locator('.note button:has-text("Update")').first().click();
    await expect(page.locator('.note textarea').first()).toHaveValue(updatedText, { timeout: 10000 });

    // --- DELETE ---
    await page.locator('.note button:has-text("Delete")').first().click();
    await expect(page.locator('.note')).toHaveCount(0, { timeout: 10000 });

    // --- PERSIST: create, reload, verify ---
    const persistText = `persist ${Date.now()}`;
    await page.locator('#curr').fill(persistText);
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.note textarea').first()).toHaveValue(persistText);

    // --- Verify console logs ---
    const logStr = logs.join('\n');
    expect(logStr).toContain('[notes-demo] init — host:');
    expect(logStr).toContain('[notes-demo] page load — already signed in');
    expect(logStr).toContain('[notes-demo] initApp — setting up signed-in state');
    expect(logStr).toContain('[notes-demo] readNotes — called');
    expect(logStr).toContain('[notes-demo] createNote — called');
    expect(logStr).toContain('[notes-demo] createNote — success');
    expect(logStr).toContain('[notes-demo] updateNote — success');
    expect(logStr).toContain('[notes-demo] deleteNote — success');

    // No errors
    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });

  test('log sequence is ordered correctly', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[notes-demo]');
    await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#editor')).toBeVisible();

    // Do a create to generate more logs
    await page.locator('#curr').fill('seq test');
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });

    const initIdx = logs.findIndex((l) => l.includes('init — host:'));
    const signedInIdx = logs.findIndex((l) => l.includes('page load — already signed in'));
    const initAppIdx = logs.findIndex((l) => l.includes('initApp — setting up signed-in state'));
    const readIdx = logs.findIndex((l) => l.includes('readNotes — called'));
    const createIdx = logs.findIndex((l) => l.includes('createNote — called'));
    const createOkIdx = logs.findIndex((l) => l.includes('createNote — success'));

    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(signedInIdx).toBeGreaterThanOrEqual(0);
    expect(initAppIdx).toBeGreaterThanOrEqual(0);
    expect(readIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(createOkIdx).toBeGreaterThanOrEqual(0);

    expect(initIdx).toBeLessThan(signedInIdx);
    expect(signedInIdx).toBeLessThan(initAppIdx);
    expect(initAppIdx).toBeLessThan(readIdx);
    expect(readIdx).toBeLessThan(createIdx);
    expect(createIdx).toBeLessThan(createOkIdx);
  });

  test('no console errors during full CRUD', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[notes-demo]');
    await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#editor')).toBeVisible();

    const text = `error check ${Date.now()}`;
    await page.locator('#curr').fill(text);
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });

    await page.locator('.note textarea').first().fill('updated');
    await page.locator('.note button:has-text("Update")').first().click();
    await expect(page.locator('.note textarea').first()).toHaveValue('updated', { timeout: 10000 });

    await page.locator('.note button:has-text("Delete")').first().click();
    await expect(page.locator('.note')).toHaveCount(0, { timeout: 10000 });

    const errors = logs.filter((l) => l.includes('FAILED') || l.includes('Error'));
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// API-level tests (fast, no browser)
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
        allowed_origin: 'http://marketing.localhost',
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
      headers: { 'Content-Type': 'application/json', Origin: 'http://marketing.localhost' },
    });
    expect(createRes.ok()).toBeTruthy();
    const doc = await createRes.json();
    const docId = doc.doc_id;
    expect(docId).toBeTruthy();

    // READ
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://marketing.localhost' },
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
      headers: { 'Content-Type': 'application/json', Origin: 'http://marketing.localhost' },
    });
    expect(updateRes.ok()).toBeTruthy();

    const readRes2 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://marketing.localhost' },
    });
    const docs2 = await readRes2.json();
    expect(docs2[0].body.note).toBe('api test note updated');

    // DELETE
    const deleteRes = await request.post(`${API_BASE}/v3/delete`, {
      data: JSON.stringify({ token, doc_id: docId }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://marketing.localhost' },
    });
    expect(deleteRes.ok()).toBeTruthy();

    const readRes3 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://marketing.localhost' },
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
      headers: { 'Content-Type': 'application/json', Origin: 'http://marketing.localhost' },
    });
    expect(createRes.status()).toBe(403);
  });
});
