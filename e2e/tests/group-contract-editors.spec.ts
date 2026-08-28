import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Group contract editors — the authenticator's (ui/) group management held to
 * the AI testing theory: anti-tests, forks, states. The contract policy
 * editors (roles + join policy) and the "List in directory" (discoverable)
 * toggle must WORK end to end: UI → v3UpdateGroup → API → persisted.
 *
 * Ladder: API floor (fast, deterministic) + browser (real UI). Every browser
 * test captures console + pageerror (diagnostic dump) and asserts the errors
 * array is empty (no crash).
 *
 * The group contract is `group_contracts`: roles (permission roles),
 * join_policy (open/request/invite_only), discoverable (the blasting flag).
 * All three are edited through `POST /v3/groups/update`.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function v3Post(request: APIRequestContext, url: string, body: Record<string, unknown>) {
  return request.post(url, { data: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('gcedit');
  await v3Post(request, `${API_BASE}/v3/signup`, { username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) });
  const res = await v3Post(request, `${API_BASE}/v3/login`, { username, password });
  expect(res.ok()).toBeTruthy();
  const token = (await res.json()).token as string;
  return { username, token };
}

/** Create a group the user owns, with known roles + join policy. */
async function createOwnedGroup(request: APIRequestContext, token: string, username: string, joinPolicy = 'open') {
  const slug = `torture-${Math.random().toString(36).slice(2, 8)}`;
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name: slug,
    join_policy: joinPolicy,
    roles: [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles', 'assignRoles', 'deleteGroup'] },
      { name: 'member', services: ['posts'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ],
    members: [{ member_key: username, role: 'owner' }],
  });
  expect(res.ok(), `group create should succeed: ${res.status()}`).toBeTruthy();
  const { group_id } = await res.json();
  return { group_id, slug };
}

/** Read the group contract back from the API (the persistence oracle). */
async function readGroup(request: APIRequestContext, token: string, group_id: string) {
  const res = await v3Post(request, `${API_BASE}/v3/groups/get`, { token, group_id });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { join_policy: string; discoverable: boolean; roles: { name: string; permissions: string[] }[] };
}

/** Sign the browser in to the authenticator and land on the Group Contracts page. */
async function openGroupsPage(page: Page, context: any, token: string): Promise<{ console: string[]; errors: string[] }> {
  const full = { console: [] as string[], errors: [] as string[] };
  page.on('console', (m) => full.console.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => full.errors.push(String(e)));

  await context.addCookies([{ name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false }]);
  await page.goto(AUTH_BASE);
  await page.waitForLoadState('networkidle');
  // The token cookie restores the session — the topbar shows the username.
  await expect(page.locator('[data-testid="topbar-username"]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid="sidebar-nav-groups"]').click();
  await expect(page.locator('[data-testid="groups-page"]')).toBeVisible({ timeout: 20000 });
  return full;
}

/** Expand the managed group card by its slug (the card header shows the name). */
async function expandManagedGroup(page: Page, slug: string) {
  const card = page.locator('[data-testid="group-card-header"]', { hasText: slug });
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.click();
}

// ---------------------------------------------------------------------------
// API floor — the update endpoint is the persistence oracle
// ---------------------------------------------------------------------------

test.describe('API floor — group contract update', () => {
  test('join_policy update persists', async ({ request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id } = await createOwnedGroup(request, token, username, 'open');

    const upd = await v3Post(request, `${API_BASE}/v3/groups/update`, { token, group_id, join_policy: 'invite_only' });
    expect(upd.ok()).toBeTruthy();
    const after = await readGroup(request, token, group_id);
    expect(after.join_policy).toBe('invite_only');
  });

  test('roles update persists', async ({ request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id } = await createOwnedGroup(request, token, username, 'open');

    const newRoles = [
      { name: 'owner', services: ['*'], permissions: ['readAll', 'manageRoles', 'deleteGroup'] },
      { name: 'mod', services: ['posts'], permissions: ['readAll', 'hideAll'] },
    ];
    const upd = await v3Post(request, `${API_BASE}/v3/groups/update`, { token, group_id, roles: newRoles });
    expect(upd.ok()).toBeTruthy();
    const after = await readGroup(request, token, group_id);
    expect(after.roles.map((r) => r.name)).toEqual(['owner', 'mod']);
  });

  test('discoverable update persists (opt-in listing)', async ({ request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id } = await createOwnedGroup(request, token, username, 'open');

    // New groups default to NOT discoverable (D53 amendment).
    const before = await readGroup(request, token, group_id);
    expect(before.discoverable).toBe(false);

    const upd = await v3Post(request, `${API_BASE}/v3/groups/update`, { token, group_id, discoverable: true });
    expect(upd.ok()).toBeTruthy();
    const after = await readGroup(request, token, group_id);
    expect(after.discoverable).toBe(true);
  });

  test('anti-test: a non-member cannot update the contract (I3)', async ({ request }) => {
    const owner = await signupFreshUser(request);
    const { group_id } = await createOwnedGroup(request, owner.token, owner.username, 'invite_only');

    // A second user (not a member) tries to update the contract. The API maps
    // a permission denial to the `CRUD` exception (401) — the point is the
    // update is REJECTED, not that it's 200.
    const intruder = await signupFreshUser(request);
    const upd = await v3Post(request, `${API_BASE}/v3/groups/update`, {
      token: intruder.token,
      group_id,
      join_policy: 'open',
    });
    expect(upd.status()).toBe(401);

    // The contract is unchanged.
    const after = await readGroup(request, owner.token, group_id);
    expect(after.join_policy).toBe('invite_only');
  });
});

// ---------------------------------------------------------------------------
// Browser — join policy editor (real GroupSettingsDialog)
// ---------------------------------------------------------------------------

test.describe('Browser — join policy editor (real UI)', () => {
  test('change join policy through the editor → persisted', async ({ page, context, request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id, slug } = await createOwnedGroup(request, token, username, 'open');
    const full = await openGroupsPage(page, context, token);
    await expandManagedGroup(page, slug);

    // Open the Settings (join policy editor).
    await page.locator('[data-testid="group-settings-btn"]').click();
    await expect(page.locator('[data-testid="join-policy-open"]')).toBeVisible({ timeout: 10000 });
    // The current policy (open) is selected.
    await expect(page.locator('[data-testid="join-policy-open"]')).toHaveAttribute('aria-pressed', 'true');

    // Pick invite_only and save.
    await page.locator('[data-testid="join-policy-invite_only"]').click();
    await page.getByRole('button', { name: 'Save settings' }).click();

    // Persisted through the API (the oracle).
    await expect(async () => {
      const after = await readGroup(request, token, group_id);
      expect(after.join_policy).toBe('invite_only');
    }).toPass({ timeout: 15000 });

    // The card badge reflects the new policy.
    await expect(page.locator('[data-testid="group-card-header"]', { hasText: slug })).toContainText('Invite');
    expect(full.errors, `pageerror: ${full.errors.join('\n')}\nconsole:\n${full.console.join('\n')}`).toEqual([]);
  });

  test('fork: cancel the editor → no change persisted', async ({ page, context, request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id, slug } = await createOwnedGroup(request, token, username, 'open');
    const full = await openGroupsPage(page, context, token);
    await expandManagedGroup(page, slug);

    await page.locator('[data-testid="group-settings-btn"]').click();
    await page.locator('[data-testid="join-policy-request"]').click();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // The policy is unchanged.
    const after = await readGroup(request, token, group_id);
    expect(after.join_policy).toBe('open');
    expect(full.errors).toEqual([]);
  });

  test('fork: save failure → error status, no crash, dialog stays open', async ({ page, context, request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id, slug } = await createOwnedGroup(request, token, username, 'open');
    const full = await openGroupsPage(page, context, token);
    await expandManagedGroup(page, slug);

    // Force the update to fail (the API returns 500).
    await page.route('**/v3/groups/update', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'boom' }) }),
    );

    await page.locator('[data-testid="group-settings-btn"]').click();
    await page.locator('[data-testid="join-policy-request"]').click();
    await page.getByRole('button', { name: 'Save settings' }).click();

    // The failure is surfaced in the status bar, not a crash.
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Failed to update join policy', { timeout: 10000 });
    // The dialog is still open (not closed on failure).
    await expect(page.locator('[data-testid="join-policy-request"]')).toBeVisible();
    expect(full.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Browser — roles editor (real GroupRolesDialog)
// ---------------------------------------------------------------------------

test.describe('Browser — roles editor (real UI)', () => {
  test('add a role through the editor → persisted', async ({ page, context, request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id, slug } = await createOwnedGroup(request, token, username, 'open');
    const full = await openGroupsPage(page, context, token);
    await expandManagedGroup(page, slug);

    // Open the roles editor.
    await page.getByRole('button', { name: 'Edit roles' }).click();
    await expect(page.getByText('Roles —')).toBeVisible({ timeout: 10000 });

    // Add a new role, name it, grant it a permission, save.
    await page.getByRole('button', { name: 'Add role' }).click();
    const roleInputs = page.getByRole('textbox', { name: 'Role name' });
    await expect(roleInputs).toHaveCount(3, { timeout: 5000 }); // owner, member, + new
    await roleInputs.nth(2).fill('mod');
    // Grant the new role the "Hide all (mod)" permission.
    await page.getByRole('button', { name: 'Hide all (mod)' }).last().click();
    await page.getByRole('button', { name: 'Save roles' }).click();

    // Persisted through the API (the oracle).
    await expect(async () => {
      const after = await readGroup(request, token, group_id);
      expect(after.roles.map((r) => r.name)).toContain('mod');
    }).toPass({ timeout: 15000 });
    expect(full.errors, `pageerror: ${full.errors.join('\n')}`).toEqual([]);
  });

  test('anti-test: empty role name → blocked, nothing saved', async ({ page, context, request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id, slug } = await createOwnedGroup(request, token, username, 'open');
    const full = await openGroupsPage(page, context, token);
    await expandManagedGroup(page, slug);

    await page.getByRole('button', { name: 'Edit roles' }).click();
    await page.getByRole('button', { name: 'Add role' }).click();
    // Leave the new role's name empty and try to save.
    await page.getByRole('button', { name: 'Save roles' }).click();

    // Blocked with a status — and the contract is unchanged (still 2 roles).
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Role names cannot be empty', { timeout: 10000 });
    const after = await readGroup(request, token, group_id);
    expect(after.roles).toHaveLength(2);
    expect(full.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Browser — discoverable toggle (real UI) + directory consequence
// ---------------------------------------------------------------------------

test.describe('Browser — discoverable toggle (real UI)', () => {
  test('toggle ON → listed in the public directory', async ({ page, context, request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id, slug } = await createOwnedGroup(request, token, username, 'open');
    const full = await openGroupsPage(page, context, token);
    await expandManagedGroup(page, slug);

    // New groups default to NOT listed (D53 amendment) — the toggle is off.
    await expect(page.locator('[data-testid="discoverable-toggle"]')).toHaveAttribute('aria-checked', 'false');

    // Toggle on.
    await page.locator('[data-testid="discoverable-toggle"]').click();
    await expect(page.locator('[data-testid="discoverable-toggle"]')).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });

    // Persisted (the oracle) AND the consequence: the anon directory now lists it.
    await expect(async () => {
      const after = await readGroup(request, token, group_id);
      expect(after.discoverable).toBe(true);
    }).toPass({ timeout: 15000 });

    const dir = await request.get(`${API_BASE}/v3/groups/directory`);
    expect(dir.ok()).toBeTruthy();
    const dirBody = await dir.json();
    const listed = (dirBody.groups || dirBody).map((g: any) => g.group_id);
    expect(listed).toContain(group_id);
    expect(full.errors).toEqual([]);
  });

  test('toggle OFF → delisted from the public directory', async ({ page, context, request }) => {
    const { token, username } = await signupFreshUser(request);
    const { group_id, slug } = await createOwnedGroup(request, token, username, 'open');
    // Start listed.
    await v3Post(request, `${API_BASE}/v3/groups/update`, { token, group_id, discoverable: true });

    const full = await openGroupsPage(page, context, token);
    await expandManagedGroup(page, slug);
    await expect(page.locator('[data-testid="discoverable-toggle"]')).toHaveAttribute('aria-checked', 'true');

    // Toggle off.
    await page.locator('[data-testid="discoverable-toggle"]').click();
    await expect(page.locator('[data-testid="discoverable-toggle"]')).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });

    // Delisted from the anon directory.
    await expect(async () => {
      const dir = await request.get(`${API_BASE}/v3/groups/directory`);
      const dirBody = await dir.json();
      const listed = (dirBody.groups || dirBody).map((g: any) => g.group_id);
      expect(listed).not.toContain(group_id);
    }).toPass({ timeout: 15000 });
    expect(full.errors).toEqual([]);
  });
});
