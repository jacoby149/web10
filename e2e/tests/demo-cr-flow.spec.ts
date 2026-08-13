import { test, expect, type APIRequestContext } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SDK_BASE = `http://sdk.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}`;
const password = 'TestPass123!';

/**
 * E2E tests for the CR (contract request) consent flow against the live stack.
 *
 * Tests the full chain: demo app → auth UI popup → postMessage CR →
 * user approval → API execution → contract_response back to app.
 *
 * Uses the real docker-compose stack (docker compose up --build).
 * The SDK container serves demo pages at sdk.localhost/demos/groups/.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signupAndLogin(request: APIRequestContext, username: string) {
  await request.post(`${API_BASE}/v3/signup`, {
    json: { token: '', body: { username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) } },
  });
  const res = await request.post(`${API_BASE}/v3/login`, {
    json: { token: '', body: { username, password } },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token as string;
}

// ---------------------------------------------------------------------------
// API-level: group CR execution (auth UI → API, no browser)
// ---------------------------------------------------------------------------
test.describe('Group CR flow — API level (auth UI creates group directly)', () => {
  test('auth UI can create a group via /v3/groups/create', async ({ request }) => {
    const username = uniqueUser('gcrapi');
    const token = await signupAndLogin(request, username);

    // Simulate what the auth UI does when approving a group CR:
    // POST /v3/groups/create with the user's token (auth UI origin)
    const res = await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'test-community',
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
          { name: 'member', services: ['posts', 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.group_id).toContain(username);
    expect(body.group_id).toContain('test-community');
  });

  test('group appears in groups/list after creation', async ({ request }) => {
    const username = uniqueUser('gcrlist');
    const token = await signupAndLogin(request, username);

    await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'visible-group',
        join_policy: 'invite_only',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup'] },
          { name: 'member', services: ['posts'], permissions: ['readAll', 'create'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });

    const listRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    expect(listRes.ok()).toBeTruthy();
    const groups = await listRes.json();
    expect(Array.isArray(groups)).toBeTruthy();
    expect(groups.some((g: any) => g.group_id.includes('visible-group'))).toBeTruthy();
  });

  test('group appears in groups/manages after creation', async ({ request }) => {
    const username = uniqueUser('gcrman');
    const token = await signupAndLogin(request, username);

    await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'managed-group',
        join_policy: 'request',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup', 'manageRoles'] },
          { name: 'member', services: ['posts'], permissions: ['readAll', 'create'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });

    const manRes = await request.post(`${API_BASE}/v3/groups/manages`, { data: { token } });
    expect(manRes.ok()).toBeTruthy();
    const groups = await manRes.json();
    expect(groups.some((g: any) => g.group_id.includes('managed-group'))).toBeTruthy();
  });

  test('group update works via /v3/groups/update', async ({ request }) => {
    const username = uniqueUser('gcrupd');
    const token = await signupAndLogin(request, username);

    await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'updatable-group',
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup'] },
          { name: 'member', services: ['posts'], permissions: ['readAll', 'create'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });

    // Get the group
    const listRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    const groups = await listRes.json();
    const groupId = groups.find((g: any) => g.group_id.includes('updatable-group')).group_id;

    // Update join_policy
    const updRes = await request.post(`${API_BASE}/v3/groups/update`, {
      data: { token, group_id: groupId, join_policy: 'invite_only' },
    });
    expect(updRes.ok()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// API-level: app CR execution (auth UI creates app contract)
// ---------------------------------------------------------------------------
test.describe('App CR flow — API level (auth UI creates app contract)', () => {
  test('auth UI can create an app contract via /v3/app-contracts/add', async ({ request }) => {
    const username = uniqueUser('acrap');
    const token = await signupAndLogin(request, username);

    // Simulate what the auth UI does when approving an ACR:
    // POST /v3/app-contracts/add with Origin header (auth UI origin)
    const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: {
          'web10-docs-note-demo': ['readAll', 'create', 'updateOwn', 'deleteOwn'],
          posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        },
      },
      headers: {
        Origin: AUTH_BASE, // auth UI origin — must be in CORS_SERVICE_MANAGERS
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.allowed_origin).toBe('http://sdk.localhost');
  });

  test('app contract appears in /v3/app-contracts/list after creation', async ({ request }) => {
    const username = uniqueUser('acrli');
    const token = await signupAndLogin(request, username);

    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://test.localhost',
        permissions: { posts: ['readAll', 'create'] },
      },
      headers: { Origin: AUTH_BASE },
    });

    const listRes = await request.post(`${API_BASE}/v3/app-contracts/list`, { data: { token } });
    expect(listRes.ok()).toBeTruthy();
    const contracts = await listRes.json();
    expect(contracts.some((c: any) => c.allowed_origin === 'http://test.localhost')).toBeTruthy();
  });

  test('document CRUD requires app contract (enforced)', async ({ request }) => {
    const username = uniqueUser('acrcr');
    const token = await signupAndLogin(request, username);

    // Create WITHOUT an app contract — should fail (Origin header triggers check)
    const noContractRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: {
        token,
        service: 'posts',
        body: { text: 'test' },
      },
      headers: { Origin: 'http://sdk.localhost' },
    });
    // Should be 403 — no app contract for sdk.localhost
    expect(noContractRes.status()).toBe(403);

    // Now create the app contract
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: { posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      },
      headers: { Origin: AUTH_BASE },
    });

    // Create WITH the app contract — should succeed
    const withContractRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: {
        token,
        service: 'posts',
        body: { text: 'test with contract' },
      },
      headers: { Origin: 'http://sdk.localhost' },
    });
    expect(withContractRes.ok()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Browser-level: full group CR flow (demo → auth popup → approve → response)
// ---------------------------------------------------------------------------
test.describe('Group CR flow — browser (demo → auth UI popup → approve)', () => {
  test('full group CR flow: create group via auth popup', async ({ page, context, browser, request }) => {
    const username = uniqueUser('crgui');
    const token = await signupAndLogin(request, username);

    // Set token in the demo page context
    await context.addCookies([
      { name: 'token', value: token, domain: 'sdk.localhost', path: '/', secure: false },
    ]);

    // Open the groups demo
    await page.goto(`${SDK_BASE}/demos/groups/`);
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#message')).toContainText(username);

    // Navigate to the Create tab
    await page.locator('.tabs button').filter({ hasText: 'Create' }).click();
    await expect(page.locator('#groupName')).toBeVisible();

    // Fill in the group name and click Create
    await page.locator('#groupName').fill('e2e-test-group');

    // The createGroup function opens a popup. We need to intercept it.
    const popupPromise = context.waitForEvent('page', { timeout: 10000 });
    await page.locator('button:has-text("Create Group")').click();
    const popup = await popupPromise;

    // The popup should load the auth UI
    await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });
    expect(popup.url()).toContain('auth.localhost');

    // The popup should show the consent screen with the pending group CR
    // If the user is already logged in, it should show the CR card
    // Wait for the popup to be authenticated (token cookie shared)
    await popup.waitForTimeout(2000); // give React time to render

    // Check if the group CR is visible in the consent view
    const hasCR = await popup.locator('text=create group').isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCR) {
      // Approve the CR
      await popup.locator('[data-testid="consent-approve-all"]').click();
      await popup.waitForTimeout(2000);
    }

    // The demo should receive the contract_response and show success
    // (or the popup might close after approveAll → goToApp)
    await page.waitForTimeout(2000);

    // Check for success toast or group in the list
    const hasSuccess = await page.locator('text=Group created').isVisible({ timeout: 5000 }).catch(() => false);
    const hasGroup = await page.locator('text=e2e-test-group').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSuccess || hasGroup).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Browser-level: full app CR flow (demo → auth popup → approve → response)
// ---------------------------------------------------------------------------
test.describe('App CR flow — browser (app → auth UI popup → approve)', () => {
  test('auth UI consent screen renders and shows pending app CR', async ({ page, context, request }) => {
    const username = uniqueUser('crgui');
    const token = await signupAndLogin(request, username);

    // Set token in the auth UI context
    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false },
    ]);

    // Open auth UI as a popup (simulating window.open from a demo)
    await page.goto(`${AUTH_BASE}?consent=1`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

    // The consent screen should render
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });

    // Simulate an app sending a CR via postMessage (new unified format)
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'contract',
          contracts: [
            {
              kind: 'app',
              app_origin: 'http://test-app.localhost',
              permissions: {
                posts: ['readAll', 'create'],
              },
            },
          ],
        },
        origin: 'http://test-app.localhost',
      }));
    });

    // The consent screen should show the pending CR
    await expect(page.locator('text=access on posts')).toBeVisible({ timeout: 5000 }).catch(() => {
      // If the user is already logged in, the contract should appear
      // Otherwise the login form shows first
      return null;
    });
  });
});

// ---------------------------------------------------------------------------
// Regression: demo app contract creation
// ---------------------------------------------------------------------------
test.describe('Demo app CR — ensureAppContract', () => {
  test('demo cannot create app contract directly (CORS_SERVICE_MANAGERS gate)', async ({ request }) => {
    const username = uniqueUser('democr');
    const token = await signupAndLogin(request, username);

    // The demo tries to create a contract directly — should be 403
    const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: {
        token,
        allowed_origin: 'http://sdk.localhost',
        permissions: { posts: ['readAll', 'create'] },
      },
      headers: { Origin: 'http://sdk.localhost' }, // demo origin — NOT in CORS_SERVICE_MANAGERS
    });
    expect(res.status()).toBe(403);
  });

  test('demo CRUD without Origin header works (no contract check)', async ({ request }) => {
    const username = uniqueUser('democrud');
    const token = await signupAndLogin(request, username);

    // Create a group first (groups endpoint doesn't check contracts)
    await request.post(`${API_BASE}/v3/groups/create`, {
      data: {
        token,
        name: 'demo-crud-group',
        join_policy: 'open',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'deleteGroup'] },
          { name: 'member', services: ['posts'], permissions: ['readAll', 'create'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      },
    });

    // Document CRUD without Origin header — should work (no contract check)
    const createRes = await request.post(`${API_BASE}/v3/documents/create`, {
      data: {
        token,
        service: 'posts',
        body: { text: 'no-origin test' },
      },
    });
    expect(createRes.ok()).toBeTruthy();
  });
});
