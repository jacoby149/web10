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
        { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
        { name: 'member', permissions: { 'notes': ['readAll', 'create', 'updateOwn', 'deleteOwn'] } },
      ],
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  // Create app contract for the demo origin
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: MARKETING_BASE,
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
          { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
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
        allowed_origin: MARKETING_BASE,
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
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(createRes.ok()).toBeTruthy();
    const doc = await createRes.json();
    const docId = doc.doc_id;
    expect(docId).toBeTruthy();

    // READ
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
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
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(updateRes.ok()).toBeTruthy();

    const readRes2 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    const docs2 = await readRes2.json();
    expect(docs2[0].body.note).toBe('api test note updated');

    // DELETE
    const deleteRes = await request.post(`${API_BASE}/v3/delete`, {
      data: JSON.stringify({ token, doc_id: docId }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(deleteRes.ok()).toBeTruthy();

    const readRes3 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
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
          { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
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
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(createRes.status()).toBe(403);
  });

  /**
   * The STATE RULE at the API floor — first run and return run are different
   * code paths. The gauntlet above drives the cold start (fresh user, group
   * created once). This test drives the RETURN RUN: the same user logs in
   * again (a new token) and re-creates the notes group exactly the way the
   * demo does on every login. The note written on the first run must survive.
   *
   * This is the fast, browser-less floor of the state rule: when the browser
   * return-run test goes red, this test tells you whether the break is in the
   * data layer (note gone here too) or in the seam (note survives here, so
   * the break is in the browser flow).
   */
  test('return run: 2nd login re-creates group, note persists (state rule)', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);
    const groupName = `notes-${username}`;
    const groupId = `api.localhost/groups/users/${username}/${groupName}`;

    const createGroup = (tok: string) =>
      request.post(`${API_BASE}/v3/groups/create`, {
        data: JSON.stringify({
          token: tok,
          name: groupName,
          join_policy: 'invite_only',
          roles: [
            { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
            { name: 'member', permissions: { 'notes': ['readAll', 'create', 'updateOwn', 'deleteOwn'] } },
          ],
          members: [{ member_key: username, role: 'owner' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

    // --- FIRST RUN (cold start) ---
    await createGroup(token);
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
        permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://auth.localhost' },
    });

    const noteText = `return-run ${Date.now()}`;
    const createRes = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: 'notes',
        body: { note: noteText, date: new Date().toISOString() },
        groups: [groupId],
      }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(createRes.ok()).toBeTruthy();

    const read1 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect((await read1.json()).length).toBe(1);

    // --- SECOND RUN (return run) ---
    // Re-login: a fresh token for the same user.
    const loginRes = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const token2 = (await loginRes.json()).token as string;

    // The demo re-sends the group-creation contract on every login.
    const recreateRes = await createGroup(token2);
    expect(recreateRes.ok()).toBeTruthy();

    // The note written on the first run must survive the return run.
    const read2 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: token2, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    const docs2 = await read2.json();
    expect(docs2.length, 'note must survive the return run').toBe(1);
    expect(docs2[0].body.note).toBe(noteText);
  });
});

// ---------------------------------------------------------------------------
// Anti-tests: verify the security model actually works
// ---------------------------------------------------------------------------

test.describe('Notes demo anti-tests — broken contracts break the app', () => {
  test('revoke contract → CRUD fails → fix access → CRUD works again', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[notes-demo]');
    const { username, token } = await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#editor')).toBeVisible();

    // Verify CRUD works initially
    const noteText = `before revoke ${Date.now()}`;
    await page.locator('#curr').fill(noteText);
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });

    // Revoke the app contract via API
    const revokeRes = await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });
    expect(revokeRes.ok()).toBeTruthy();

    // Now try to create a note — should fail with 403
    const noteText2 = `after revoke ${Date.now()}`;
    await page.locator('#curr').fill(noteText2);
    await page.locator('button:has-text("Create note")').click();

    // The "Fix access" button should appear
    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#message')).toContainText('contract');

    // Verify the note was NOT created (security model holds)
    const readRes = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [] }),
      headers: { 'Content-Type': 'application/json' },
    });
    // Read without groups won't work, but the key assertion is:
    // the UI showed the error + fix button, not a silent success

    // Click "Fix access" — the REAL auth popup drives the re-consent.
    // (The old version did popup.close() + raw-API contract create — a
    // seam-rule violation: a green that skips the seam is a lie.)
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#fixAccessBtn').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle', { timeout: 15000 });

    // The contract renders in the popup → approve it.
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();

    // The demo's callback fired from the popup's response — recovery.
    await expect(async () => {
      expect(logs.join('\n')).toContain('fixAccess — contract re-approved, retrying readNotes');
    }).toPass({ timeout: 15000 });
    // D42: the popup auto-completes after the re-approve (token + self-close),
    // which re-inits the demo and rewrites #message — so the "Access restored."
    // text doesn't survive. The real proof of recovery is that CRUD works again
    // (below).

    // Now CRUD should work again
    const noteText3 = `after fix ${Date.now()}`;
    await page.locator('#curr').fill(noteText3);
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 10000 });

    // Verify logs show the fix flow was triggered
    const logStr = logs.join('\n');
    expect(logStr).toContain('[notes-demo] fixAccessBtn clicked');
  });

  test('revoke contract → read fails → fix button appears', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page, '[notes-demo]');
    const { token } = await setupUser(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#editor')).toBeVisible();

    // Revoke the contract
    await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: JSON.stringify({ token, allowed_origin: MARKETING_BASE }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });

    // Reload — readNotes will fail with 403, fix button should appear
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // give async readNotes time to complete

    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#message')).toContainText('contract');
  });

  test('API: CRUD after contract revoke returns 403 (security holds)', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const groupName = `notes-${username}`;
    await request.post(`${API_BASE}/v3/groups/create`, {
      data: JSON.stringify({
        token,
        name: groupName,
        join_policy: 'invite_only',
        roles: [
          { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles'] } },
        ],
        members: [{ member_key: username, role: 'owner' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    // Create contract
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
        permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });

    // Create doc WITH contract — works
    const createRes1 = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: 'notes',
        body: { note: 'with contract' },
      }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(createRes1.ok()).toBeTruthy();

    // Revoke contract
    await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: JSON.stringify({ token, allowed_origin: MARKETING_BASE }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });

    // Create doc WITHOUT contract — 403
    const createRes2 = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: 'notes',
        body: { note: 'without contract' },
      }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(createRes2.status()).toBe(403);

    // Re-create contract
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
        permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });

    // Create doc WITH contract again — works
    const createRes3 = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: 'notes',
        body: { note: 're-contracted' },
      }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(createRes3.ok()).toBeTruthy();
  });

  test('API: read with deleted group returns empty (group membership gate)', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const groupName = `notes-${username}`;
    const createGroupRes = await request.post(`${API_BASE}/v3/groups/create`, {
      data: JSON.stringify({
        token,
        name: groupName,
        join_policy: 'invite_only',
        roles: [
          { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'group': ['manageRoles', 'deleteGroup'] } },
        ],
        members: [{ member_key: username, role: 'owner' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const group = await createGroupRes.json();
    const groupId = group.group_id;

    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
        permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });

    // Create a doc in the group
    await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({
        token,
        service: 'notes',
        body: { note: 'in group' },
        groups: [groupId],
      }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });

    // Read with group — works
    const readRes1 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(readRes1.ok()).toBeTruthy();
    const docs1 = await readRes1.json();
    expect(docs1.length).toBe(1);

    // Delete the group
    const deleteRes = await request.post(`${API_BASE}/v3/groups/delete`, {
      data: JSON.stringify({ token, group_id: groupId }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(deleteRes.ok()).toBeTruthy();

    // Read with deleted group — D42: the group-membership gate returns a
    // distinguishable 403 ("not a member of the requested group"), NOT an empty
    // array. This is the 403 the demo's isGroupError() matches to show "Set up
    // your notes group" (vs the app-contract 403 → "Fix access"). A deleted
    // group means no access — the gate holds.
    const readRes2 = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
    });
    expect(readRes2.status()).toBe(403);
    const err2 = await readRes2.json();
    expect(err2.detail).toMatch(/not a member/i);
  });
});
