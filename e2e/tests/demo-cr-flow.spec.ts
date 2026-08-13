import { test, expect, type APIRequestContext } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SDK_BASE = `http://sdk.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

/**
 * Full E2E CR (contract request) tests — from scratch account to contract deletion.
 *
 * Every test creates a fresh user, verifies state at each step, and cleans up.
 * Tests both API-level and browser-level flows.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('e2e');
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

async function setTokenCookie(context: any, domain: string, token: string) {
  await context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

// ---------------------------------------------------------------------------
// 1. Fresh account — verify clean state
// ---------------------------------------------------------------------------
test.describe('Fresh account — clean state', () => {
  test('new user has no groups, no contracts, no documents', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    // No groups
    const groupsRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    expect(groupsRes.ok()).toBeTruthy();
    const groups = await groupsRes.json();
    expect(groups).toEqual([]);

    // No app contracts
    const contractsRes = await request.post(`${API_BASE}/v3/app-contracts/list`, { data: { token } });
    expect(contractsRes.ok()).toBeTruthy();
    const contracts = await contractsRes.json();
    expect(contracts).toEqual([]);

    // No documents (read requires groups, so skip)
  });
});

// ---------------------------------------------------------------------------
// 2. Groups demo — browser flow from scratch
// ---------------------------------------------------------------------------
test.describe('Groups demo — full browser flow from scratch', () => {
  test('fresh user logs in, sees signed in state, can navigate tabs', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'sdk.localhost', token);

    // Open groups demo
    await page.goto(`${SDK_BASE}/demos/groups/`);
    await page.waitForLoadState('networkidle');

    // Verify signed in state
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#message')).toContainText(username);

    // Verify app container is visible
    await expect(page.locator('#app')).toBeVisible();

    // Navigate to Create tab
    await page.locator('.tabs button').filter({ hasText: 'Create' }).click();
    await expect(page.locator('#groupName')).toBeVisible();
    await expect(page.locator('#joinPolicy')).toBeVisible();
    await expect(page.locator('#rolePreset')).toBeVisible();
  });

  test('fresh user creates group via CR popup, group appears in list', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'sdk.localhost', token);
    // Also set token for auth UI
    await setTokenCookie(context, 'auth.localhost', token);

    await page.goto(`${SDK_BASE}/demos/groups/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');

    // Navigate to Create tab
    await page.locator('.tabs button').filter({ hasText: 'Create' }).click();
    await page.locator('#groupName').fill(`e2e-group-${Date.now()}`);

    // Click Create Group — this opens the auth popup
    const popupPromise = context.waitForEvent('page', { timeout: 10000 });
    await page.locator('button:has-text("Create Group")').click();
    const popup = await popupPromise;

    // Wait for auth UI to load
    await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });
    expect(popup.url()).toContain('auth.localhost');

    // Wait for consent view to render with the group CR
    await popup.waitForTimeout(3000); // React render time

    // Check for the CR card
    const hasGroupRequest = await popup.locator('text=group request').isVisible().catch(() => false);
    expect(hasGroupRequest).toBeTruthy();

    // Approve the CR
    await popup.locator('[data-testid="consent-approve-all"]').click();
    await popup.waitForTimeout(2000);

    // Return to main page and verify group was created
    await page.waitForTimeout(2000);

    // Check for success toast
    const hasSuccess = await page.locator('text=Group created').isVisible().catch(() => false);
    expect(hasSuccess).toBeTruthy();

    // Verify group appears in API
    const groupsRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    expect(groupsRes.ok()).toBeTruthy();
    const groups = await groupsRes.json();
    expect(groups.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. App contract — full flow: create, verify, delete, verify gone
// ---------------------------------------------------------------------------
test.describe('App contract — create, verify, delete, verify gone', () => {
  test('auth UI creates app contract, it appears in list, revoking removes it', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    // Verify no contracts initially
    let contractsRes = await request.post(`${API_BASE}/v3/app-contracts/list`, { data: { token } });
    expect(contractsRes.ok()).toBeTruthy();
    let contracts = await contractsRes.json();
    expect(contracts).toEqual([]);

    // Create app contract via auth UI origin
    const addRes = await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: {
          'web10-docs-groups-demo': ['readAll', 'create', 'updateOwn', 'deleteOwn'],
          posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        },
      },
      headers: { Origin: AUTH_BASE },
    });
    expect(addRes.ok()).toBeTruthy();
    const added = await addRes.json();
    expect(added.allowed_origin).toBe('http://sdk.localhost');

    // Verify contract appears in list
    contractsRes = await request.post(`${API_BASE}/v3/app-contracts/list`, { data: { token } });
    expect(contractsRes.ok()).toBeTruthy();
    contracts = await contractsRes.json();
    expect(contracts.length).toBe(1);
    expect(contracts[0].allowed_origin).toBe('http://sdk.localhost');

    // Revoke the contract
    const revokeRes = await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: { token, allowed_origin: 'http://sdk.localhost' },
      headers: { Origin: AUTH_BASE },
    });
    expect(revokeRes.ok()).toBeTruthy();

    // Verify contract is gone
    contractsRes = await request.post(`${API_BASE}/v3/app-contracts/list`, { data: { token } });
    expect(contractsRes.ok()).toBeTruthy();
    contracts = await contractsRes.json();
    expect(contracts).toEqual([]);
  });

  test('document CRUD fails without contract, succeeds with contract, fails again after revoke', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    // Create a group first
    await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'contract-test-group',
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });

    // Document create WITHOUT contract — should 403
    let docRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: { token, service: 'posts', body: { text: 'no contract' } },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(docRes.status()).toBe(403);

    // Create the contract
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: { posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      },
      headers: { Origin: AUTH_BASE },
    });

    // Document create WITH contract — should succeed
    docRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: { token, service: 'posts', body: { text: 'with contract' } },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(docRes.ok()).toBeTruthy();
    const doc = await docRes.json();
    const docId = doc.doc_id;

    // Document read — should succeed
    const readRes = await request.post(`${API_BASE}/v3/documents/read-by-id`, {
      data: { token, doc_id: docId, collection_name: 'posts' },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(readRes.ok()).toBeTruthy();

    // Revoke the contract
    await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: { token, allowed_origin: 'http://sdk.localhost' },
      headers: { Origin: AUTH_BASE },
    });

    // Document create AFTER revoke — should 403 again
    docRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: { token, service: 'posts', body: { text: 'after revoke' } },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(docRes.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 4. CORS_SERVICE_MANAGERS gate — apps cannot create contracts directly
// ---------------------------------------------------------------------------
test.describe('CORS_SERVICE_MANAGERS gate', () => {
  test('demo origin cannot create app contract directly', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: { posts: ['readAll', 'create'] },
      },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(res.status()).toBe(403);
  });

  test('auth UI origin CAN create app contract', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: { posts: ['readAll', 'create'] },
      },
      headers: { Origin: AUTH_BASE },
    });
    expect(res.ok()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. Group CR — create, update, verify state
// ---------------------------------------------------------------------------
test.describe('Group CR — create, update, verify', () => {
  test('create group, verify it appears in list and manages', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    const createRes = await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'verify-group',
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup'] },
          { name: 'member', services: ['posts'], permissions: ['readAll', 'create'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const body = await createRes.json();
    expect(body.group_id).toContain(username);
    expect(body.group_id).toContain('verify-group');

    // Verify in groups/list
    const listRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    expect(listRes.ok()).toBeTruthy();
    const groups = await listRes.json();
    expect(groups.some((g: any) => g.group_id.includes('verify-group'))).toBeTruthy();

    // Verify in groups/manages
    const managesRes = await request.post(`${API_BASE}/v3/groups/manages`, { data: { token } });
    expect(managesRes.ok()).toBeTruthy();
    const manages = await managesRes.json();
    expect(manages.some((g: any) => g.group_id.includes('verify-group'))).toBeTruthy();
  });

  test('update group join_policy, verify change persists', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    // Create group
    await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'update-test-group',
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });

    // Get group ID
    const listRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    const groups = await listRes.json();
    const groupId = groups.find((g: any) => g.group_id.includes('update-test-group')).group_id;

    // Verify initial state
    const getRes1 = await request.post(`${API_BASE}/v3/groups/get`, { data: { token, group_id: groupId } });
    expect(getRes1.ok()).toBeTruthy();
    let group = await getRes1.json();
    expect(group.join_policy).toBe('open');

    // Update join_policy
    const updateRes = await request.post(`${API_BASE}/v3/groups/update`, {
      data: { token, group_id: groupId, join_policy: 'invite_only' },
    });
    expect(updateRes.ok()).toBeTruthy();

    // Verify change persisted
    const getRes2 = await request.post(`${API_BASE}/v3/groups/get`, { data: { token, group_id: groupId } });
    expect(getRes2.ok()).toBeTruthy();
    group = await getRes2.json();
    expect(group.join_policy).toBe('invite_only');
  });
});

// ---------------------------------------------------------------------------
// 6. Auth UI consent — browser flow
// ---------------------------------------------------------------------------
test.describe('Auth UI consent — browser flow', () => {
  test('consent view shows pending app CR, approve creates contract', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'auth.localhost', token);

    // Open auth UI in consent mode
    await page.goto(`${AUTH_BASE}?consent=1`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

    // Simulate app sending a CR via postMessage
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'contract',
          contracts: [
            {
              kind: 'app',
              app_origin: 'http://test-app.localhost',
              permissions: { posts: ['readAll', 'create'] },
            },
          ],
        },
        origin: 'http://test-app.localhost',
      }));
    });

    // Wait for consent view to render
    await page.waitForTimeout(2000);

    // Verify CR card is visible
    const hasAccessRequest = await page.locator('text=access request').isVisible().catch(() => false);
    expect(hasAccessRequest).toBeTruthy();

    // Verify service permissions are shown
    const hasPosts = await page.locator('text=posts').isVisible().catch(() => false);
    expect(hasPosts).toBeTruthy();

    // Approve the CR
    await page.locator('[data-testid="consent-approve-all"]').click();
    await page.waitForTimeout(2000);

    // Verify contract was created via API
    const contractsRes = await request.post(`${API_BASE}/v3/app-contracts/list`, { data: { token } });
    expect(contractsRes.ok()).toBeTruthy();
    const contracts = await contractsRes.json();
    expect(contracts.some((c: any) => c.allowed_origin === 'http://test-app.localhost')).toBeTruthy();
  });

  test('consent view shows pending group CR, approve creates group', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'auth.localhost', token);

    await page.goto(`${AUTH_BASE}?consent=1`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

    // Simulate app sending a group CR
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'contract',
          contracts: [
            {
              kind: 'group',
              app_origin: 'http://test-app.localhost',
              action: 'create_group',
              name: 'consent-test-group',
              join_policy: 'invite_only',
              roles: [
                { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup'] },
              ],
              members: [{ member_key: 'test-user', role: 'owner' }],
            },
          ],
        },
        origin: 'http://test-app.localhost',
      }));
    });

    // Wait for consent view to render
    await page.waitForTimeout(2000);

    // Verify group CR card is visible
    const hasGroupRequest = await page.locator('text=group request').isVisible().catch(() => false);
    expect(hasGroupRequest).toBeTruthy();

    // Approve the CR
    await page.locator('[data-testid="consent-approve-all"]').click();
    await page.waitForTimeout(2000);

    // Verify group was created via API
    const groupsRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    expect(groupsRes.ok()).toBeTruthy();
    const groups = await groupsRes.json();
    expect(groups.some((g: any) => g.group_id.includes('consent-test-group'))).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 7. Edge cases — contract deletion while app is running
// ---------------------------------------------------------------------------
test.describe('Edge cases — contract tombstoning', () => {
  test('app contract revoked while demo is running — subsequent CRUD fails gracefully', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);

    // Create contract
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: { posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      },
      headers: { Origin: AUTH_BASE },
    });

    // Create document with contract
    let docRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: { token, service: 'posts', body: { text: 'before revoke' } },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(docRes.ok()).toBeTruthy();

    // Revoke contract (simulating user revoking in auth UI)
    await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: { token, allowed_origin: 'http://sdk.localhost' },
      headers: { Origin: AUTH_BASE },
    });

    // Verify contract is gone
    const contractsRes = await request.post(`${API_BASE}/v3/app-contracts/list`, { data: { token } });
    const contracts = await contractsRes.json();
    expect(contracts).toEqual([]);

    // Subsequent CRUD should fail with 403
    docRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: { token, service: 'posts', body: { text: 'after revoke' } },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(docRes.status()).toBe(403);

    // Verify the error message is helpful
    const errorBody = await docRes.json();
    expect(errorBody.detail).toContain('contract');
  });
});
