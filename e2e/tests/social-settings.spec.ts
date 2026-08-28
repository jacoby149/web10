import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_BASE, v3Login, v3Signup } from '../v3-helpers';

/**
 * Social settings — the web10-social app's /settings surface (Phase 3: the
 * social app is the integration test).
 *
 * The settings doc is a `settings`-collection document attached to the user's
 * OWN followers group — the one group the user owns (owner role: services
 * `*`; member role: `posts` only, so followers never read the settings doc).
 *
 * The API floor pins the app's exact read/write (src/data/settings.ts):
 * service `settings`, the followers group, create-then-update, latest wins —
 * plus the I3 anti-test (a stranger's read 403s) and the app-contract gate.
 *
 * The browser gauntlet drives the real /settings screen: a pre-authed viewer
 * (token cookie on social.localhost + auth.localhost) → change the default
 * visibility → it persists across a reload → sign out → sign back in (the D42
 * popup auto-completes: the popup is already signed in on auth.localhost and
 * the contract already granted, so it re-hands the token with zero UI) → a
 * FRESH page load still shows the saved value (module cache can't fake it).
 * Console log-sequence verified.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const PROVIDER = 'api.localhost';
const SERVICE = 'settings';
// The origin the social app's consent contract is granted to
// (src/interfaces/auth.ts — socialAppContract() uses window.location.origin).
const SOCIAL_ORIGIN = SOCIAL_BASE;

// The v3 services + operations the social app's contract grants
// (src/interfaces/auth.ts SOCIAL_SERVICES / SOCIAL_OPERATIONS).
const SOCIAL_SERVICES = [
  'posts', 'media', 'public_media', 'profile', 'settings',
  'comments', 'reactions', 'contacts', 'staging_posts',
];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

// The followers group the settings doc lives in. The API derives created-group
// IDs as {provider}/groups/users/{creator}/{name} (api/app/v3/endpoints/
// groups.py create_group) — name 'followers', creator = the bare username.
const followersGroupId = (username: string) => `${PROVIDER}/groups/users/${username}/followers`;

// The canonical followers roles (src/data/groups.ts FOLLOWER_ROLES).
const FOLLOWER_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: ['posts'], permissions: ['readAll'] },
];

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, password, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, password);
  return { username, token };
}

/**
 * The app contract the social app's consent popup would grant — added from
 * the authenticator origin (the only origin allowed to create contracts).
 */
async function addSocialAppContract(request: APIRequestContext, token: string) {
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: SOCIAL_ORIGIN,
      permissions: Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, SOCIAL_OPERATIONS])),
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
  expect(res.ok(), `app contract add failed (${res.status})`).toBeTruthy();
}

/**
 * Create the user's followers group exactly as the app's ensure logic does
 * (src/data/settings.ts ensureFollowersGroup — name 'followers', open join,
 * the user as owner under the bare-username member key).
 */
async function createFollowersGroup(request: APIRequestContext, token: string, username: string): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name: 'followers',
      join_policy: 'open',
      roles: FOLLOWER_ROLES,
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `create followers group failed (${res.status})`).toBeTruthy();
  const groupId = (await res.json()).group_id as string;
  expect(groupId).toBe(followersGroupId(username));
  return groupId;
}

/** The app's exact settings read (src/data/settings.ts readSettings). */
async function readSettingsDoc(request: APIRequestContext, token: string, username: string) {
  return request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [followersGroupId(username)] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
}

/** The app's exact settings write (src/data/settings.ts saveSettings). */
async function writeSettingsDoc(
  request: APIRequestContext,
  token: string,
  username: string,
  defaultVisibility: 'public' | 'private',
  docId?: string,
) {
  const body = { defaultVisibility };
  if (docId) {
    return request.post(`${API_BASE}/v3/update`, {
      data: JSON.stringify({ token, doc_id: docId, body }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
  }
  return request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: SERVICE, body, groups: [followersGroupId(username)] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
}

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

// The app's own log prefixes: [settings] (the data layer under test),
// [social] (App + the auth seam), [wapi] (the SDK browser build).
function captureConsoleLogs(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[settings]') || text.includes('[social]') || text.includes('[wapi]')) {
      logs.push(text);
    }
  });
  return logs;
}

function captureErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  return { consoleErrors, pageErrors };
}

// ---------------------------------------------------------------------------
// API floor — the app's exact settings read/write, fast + deterministic
// ---------------------------------------------------------------------------

test.describe('Social settings — API floor (settings doc read/write)', () => {
  test('round-trip: write a value → read it back; a second write replaces (latest wins)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'setapi');
    await addSocialAppContract(request, owner.token);
    await createFollowersGroup(request, owner.token, owner.username);

    // Write #1 — the app's exact create (no settings doc yet).
    const createRes = await writeSettingsDoc(request, owner.token, owner.username, 'private');
    expect(createRes.ok(), `create settings doc failed (${createRes.status})`).toBeTruthy();
    const docId = (await createRes.json()).doc_id as string;
    expect(docId).toBeTruthy();

    // Read back — the app's exact read.
    const readRes = await readSettingsDoc(request, owner.token, owner.username);
    expect(readRes.ok(), `read settings doc failed (${readRes.status})`).toBeTruthy();
    const docs = (await readRes.json()) as any[];
    expect(docs.length).toBe(1);
    expect(docs[0].doc_id).toBe(docId);
    expect(docs[0].body.defaultVisibility).toBe('private');

    // Write #2 — the app's exact update (same doc, new value). Latest wins.
    const updateRes = await writeSettingsDoc(request, owner.token, owner.username, 'public', docId);
    expect(updateRes.ok(), `update settings doc failed (${updateRes.status})`).toBeTruthy();

    const read2 = await readSettingsDoc(request, owner.token, owner.username);
    expect(read2.ok()).toBeTruthy();
    const docs2 = (await read2.json()) as any[];
    expect(docs2.length).toBe(1);
    expect(docs2[0].doc_id).toBe(docId);
    expect(docs2[0].body.defaultVisibility).toBe('public');
  });

  test('anti-test: a stranger cannot read the settings doc (I3 holds)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'seti3a');
    const stranger = await signupAndLogin(request, 'seti3b');
    await addSocialAppContract(request, owner.token);
    await addSocialAppContract(request, stranger.token);
    const ownerGroup = await createFollowersGroup(request, owner.token, owner.username);
    await writeSettingsDoc(request, owner.token, owner.username, 'private');

    // The stranger is not a member of the owner's followers group.
    const res = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: stranger.token, service: SERVICE, groups: [ownerGroup] }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
    expect(res.status()).toBe(403);
    const err = await res.json();
    expect(err.detail).toMatch(/not a member/i);
  });

  test('anti-test: read without an app contract fails 403 (contract gate)', async ({ request }) => {
    const user = await signupAndLogin(request, 'setgate');
    // NO app contract. Group ops are not contract-gated, so the group exists.
    await createFollowersGroup(request, user.token, user.username);

    const res = await readSettingsDoc(request, user.token, user.username);
    expect(res.status()).toBe(403);
    const err = await res.json();
    expect(err.detail).toMatch(/No app contract/i);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real /settings screen (pre-authed viewer → change →
// reload → sign-out/sign-in), log-sequence verified
// ---------------------------------------------------------------------------

test.describe('Social settings gauntlet — real flow + log sequence', () => {
  // A long journey: two full page loads + a reload + a sign-out/sign-in popup
  // round-trip. The D42 auto-complete's "already granted" check is an async
  // API call, so under node load this needs headroom beyond the 30s default.
  test.setTimeout(120_000);

  test('change a setting → persists across reload + sign-out/sign-in', async ({ page, context, request }) => {
    const logs = captureConsoleLogs(page);
    const { consoleErrors, pageErrors } = captureErrors(page);

    // Viewer pre-authed via the token cookie (the session's source of truth)
    // on both the app origin and the auth origin (the D42 popup's session).
    const viewer = await signupAndLogin(request, 'setui');
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);
    await addSocialAppContract(request, viewer.token);

    // --- Pre-authed viewer lands on /settings (cookie-first, no popup) ---
    await page.goto(`${SOCIAL_BASE}/settings`);
    await expect(page.locator('[data-testid="settings-visibility-public"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="settings-visibility-private"]')).toBeVisible();

    // Fresh user: the default (public) is selected.
    await expect(page.locator('[data-testid="settings-visibility-public"]')).toHaveClass(/bg-brand-muted/);
    await expect(page.locator('[data-testid="settings-visibility-private"]')).not.toHaveClass(/bg-brand-muted/);

    // --- Change the setting ---
    await page.locator('[data-testid="settings-visibility-private"]').click();
    await expect(page.getByRole('status')).toHaveText('Saved.', { timeout: 20000 });
    await expect(page.locator('[data-testid="settings-visibility-private"]')).toHaveClass(/bg-brand-muted/);

    // Node-level check: the doc exists with the new value.
    const apiRead = await readSettingsDoc(request, viewer.token, viewer.username);
    expect(apiRead.ok()).toBeTruthy();
    const apiDocs = (await apiRead.json()) as any[];
    expect(apiDocs.length).toBe(1);
    expect(apiDocs[0].body.defaultVisibility).toBe('private');

    // --- Reload: it persisted (fresh module state — the read hits the node) ---
    await page.reload();
    await expect(page.locator('[data-testid="settings-visibility-private"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="settings-visibility-private"]')).toHaveClass(/bg-brand-muted/);
    await expect(page.locator('[data-testid="settings-visibility-public"]')).not.toHaveClass(/bg-brand-muted/);

    // --- Sign out (scrubs the token cookie) ---
    await page.locator('[data-testid="settings-logout-button"]').click();
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible({ timeout: 10000 });

    // --- Sign back in: the D42 popup auto-completes (already signed in on
    //     auth.localhost + contract already granted → zero UI, token re-hand) ---
    await page.locator('[data-testid="login-button"]').click();
    await expect(page.locator('[data-testid="settings-visibility-private"]')).toBeVisible({ timeout: 60000 });

    // --- Still persisted: a FRESH page load (no in-memory cache) reads the
    //     saved value back from the node ---
    await page.goto(`${SOCIAL_BASE}/settings`);
    await expect(page.locator('[data-testid="settings-visibility-private"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="settings-visibility-private"]')).toHaveClass(/bg-brand-muted/);
    await expect(page.locator('[data-testid="settings-visibility-public"]')).not.toHaveClass(/bg-brand-muted/);

    const apiRead2 = await readSettingsDoc(request, viewer.token, viewer.username);
    expect(apiRead2.ok()).toBeTruthy();
    const apiDocs2 = (await apiRead2.json()) as any[];
    expect(apiDocs2.length).toBe(1);
    expect(apiDocs2[0].body.defaultVisibility).toBe('private');

    // --- Verify console logs (the real flow, in order) ---
    const idx = (needle: string) => logs.findIndex((l) => l.includes(needle));
    const mountIdx = idx('[social] app mount — isSignedIn:');
    const readIdx = idx('[settings] readSettings —');
    const saveIdx = idx('[settings] saveSettings —');
    const signOutIdx = idx('[social] signOut — scrubbing token cookie');
    const loginIdx = idx('[social] login tapped — opening auth portal');
    const popupIdx = idx('[wapi] openAuthPortal — opening popup:');
    const contractIdx = idx('[wapi] contractRequest — called with');
    const authEventIdx = idx('[wapi] auth event received from popup, setting token cookie');
    const authListenIdx = idx('[social] authListen fired — signed in as');

    for (const [name, i] of Object.entries({ mountIdx, readIdx, saveIdx, signOutIdx, loginIdx, popupIdx, contractIdx, authEventIdx, authListenIdx })) {
      expect(i, `missing expected log line: ${name}`).toBeGreaterThanOrEqual(0);
    }
    expect(mountIdx).toBeLessThan(readIdx);
    expect(readIdx).toBeLessThan(saveIdx);
    expect(saveIdx).toBeLessThan(signOutIdx);
    expect(signOutIdx).toBeLessThan(loginIdx);
    expect(loginIdx).toBeLessThan(popupIdx);
    expect(popupIdx).toBeLessThan(contractIdx);
    expect(contractIdx).toBeLessThan(authEventIdx);
    expect(authEventIdx).toBeLessThan(authListenIdx);

    // The post re-login fresh load re-reads the settings from the node.
    // (Array.lastIndexOf is strict-equality — scan manually for the last
    // line containing the needle.)
    let lastReadIdx = -1;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].includes('[settings] readSettings —')) { lastReadIdx = i; break; }
    }
    expect(lastReadIdx).toBeGreaterThan(authListenIdx);

    // No uncaught exceptions.
    expect(pageErrors).toEqual([]);
    // The fresh-user flow is designed to hit handled network errors: the
    // settings read 403s until the followers group exists (StrictMode mounts
    // the effect twice in dev → 2× on load, 1× in saveSettings' pre-read),
    // and ensureFollowersGroup's getGroup 404s before the lazy create. The
    // app degrades to defaults / creates the group — those resource failures
    // are expected. Anything beyond them is a bug.
    const unexpectedConsoleErrors = consoleErrors.filter(
      (l) => !/^Failed to load resource: the server responded with a status of (403|404)/.test(l),
    );
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});
