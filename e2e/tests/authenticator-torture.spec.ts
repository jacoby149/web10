import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Authenticator torture test — the authenticator (ui/) held to the AI testing
 * theory: anti-tests, forks, states. The core-core features: contracts
 * (app + group), login, signup, and the configuration wizard.
 *
 * Ladder: API floor (fast, deterministic) + browser (real UI, real popup).
 * Every browser test captures console + pageerror from BOTH sides of the
 * seam (diagnostic dump) and asserts the errors array is empty (no crash).
 *
 * Plan: .context/authenticator-torture-plan.md
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('tort');
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

function captureConsoleLogs(page: Page, prefixes: string[]): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (prefixes.some((prefix) => text.includes(prefix))) {
      logs.push(text);
    }
  });
  return logs;
}

/** Full diagnostic net: console (all levels) + uncaught exceptions. */
function captureFull(page: Page): { console: string[]; errors: string[] } {
  const console: string[] = [];
  const errors: string[] = [];
  page.on('console', (msg) => {
    console.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    errors.push(String(err));
  });
  return { console, errors };
}

function handshakeDiagnostics(demoLogs: string[], popup: { console: string[]; errors: string[] }): string {
  return [
    'The auth popup consent handshake is broken — see both sides below.',
    '',
    '--- DEMO logs ([notes-demo], [wapi]) ---',
    demoLogs.join('\n') || '(none)',
    '',
    '--- POPUP uncaught exceptions (pageerror) ---',
    popup.errors.join('\n') || '(none)',
    '',
    '--- POPUP full console ---',
    popup.console.join('\n') || '(none)',
  ].join('\n');
}

/**
 * Signed-out notes demo + real auth popup (pre-authenticated popup only —
 * the demo must get its token through the handshake).
 */
async function openSignedOutDemo(
  page: Page,
  context: any,
  request: APIRequestContext,
): Promise<{ token: string; demoLogs: string[]; popup: Page; popupFull: { console: string[]; errors: string[] } }> {
  const { token } = await signupFreshUser(request);
  await setTokenCookie(context, 'auth.localhost', token);

  const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
  await page.goto(`${MARKETING_BASE}/docs/notes/`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authButton')).toHaveText('Log in');

  const popupPromise = context.waitForEvent('page', { timeout: 15000 });
  await page.locator('#authButton').click();
  const popup = await popupPromise;
  const popupFull = captureFull(popup);
  await popup.waitForLoadState('networkidle');
  return { token, demoLogs, popup, popupFull };
}

// ---------------------------------------------------------------------------
// API floor — signup
// ---------------------------------------------------------------------------

test.describe('API floor — signup', () => {
  test('valid signup → user created → login works', async ({ request }) => {
    const username = uniqueUser('su');
    const res = await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551230001' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBeTruthy();

    const login = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(login.ok()).toBeTruthy();
    expect((await login.json()).token).toBeDefined();
  });

  test('invalid usernames rejected, no user created', async ({ request }) => {
    const bad = ['Alice', '-leading', 'a'.repeat(31), 'has_underscore', 'trailing-'];
    for (const name of bad) {
      const res = await request.post(`${API_BASE}/v3/signup`, {
        data: JSON.stringify({ username: name, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status(), `signup "${name}" should be 401`).toBe(401);

      // Consequence, not just the code: no user exists to log in as.
      const login = await request.post(`${API_BASE}/v3/login`, {
        data: JSON.stringify({ username: name, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(login.status(), `login "${name}" must fail — no user was created`).toBe(401);
    }
  });

  test('duplicate signup → EXISTS, original login still works', async ({ request }) => {
    const username = uniqueUser('dup');
    const first = await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551230002' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(first.ok()).toBeTruthy();

    const dup = await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551230003' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(dup.status()).toBe(401);
    expect((await dup.json()).detail).toContain('already exists');

    const login = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(login.ok()).toBeTruthy();
  });

  test('empty password rejected, no user created', async ({ request }) => {
    const username = uniqueUser('emptypw');
    const res = await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password: '', phone: '+15551230004' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);

    const login = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password: '' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(login.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// API floor — login
// ---------------------------------------------------------------------------

test.describe('API floor — login', () => {
  test('valid login → JWT with username/provider/site/expires', async ({ request }) => {
    const { username, token } = await signupFreshUser(request);
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    expect(payload.username).toBe(username);
    expect(payload.provider).toBe('api.localhost');
    expect(payload.site).toBe('web10');
    expect(payload.expires).toBeDefined();
  });

  test('wrong password → 401, no token', async ({ request }) => {
    const { username } = await signupFreshUser(request);
    const res = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password: 'WrongPassword1!' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).token).toBeUndefined();
  });

  test('non-existent user → 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username: uniqueUser('ghost'), password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });

  test('malformed username → 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username: 'UPPER-case!', password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// API floor — setup
// ---------------------------------------------------------------------------

test.describe('API floor — setup', () => {
  test('POST /setup returns status shape {configured, has_admin}', async ({ request }) => {
    const res = await request.post(`${API_BASE}/setup`, { data: {} });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.configured).toBe('boolean');
    expect(typeof body.has_admin).toBe('boolean');
  });

  test('setup/configure on a node with users → 400 "Node already configured"', async ({ request }) => {
    // The e2e node always has users (global-setup creates the admin on a
    // fresh stack; tests create more). First-run setup is a one-way door.
    const res = await request.post(`${API_BASE}/setup/configure`, {
      data: {
        provider: 'api.localhost',
        admin_username: uniqueUser('admin'),
        admin_password: 'AdminPass123!',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).detail).toContain('already configured');
  });

  test('setup/configure missing admin_password → 422', async ({ request }) => {
    const res = await request.post(`${API_BASE}/setup/configure`, {
      data: { provider: 'api.localhost', admin_username: 'someadmin' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Browser — signup (real SignupForm)
// ---------------------------------------------------------------------------

test.describe('Browser — signup (real SignupForm)', () => {
  async function gotoSignup(page: Page) {
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="login-create-account"]').click();
    await expect(page.locator('[data-testid="signup-submit"]')).toBeVisible();
  }

  test('full signup through the real form → signed in', async ({ page, request }) => {
    const username = uniqueUser('breg');
    await gotoSignup(page);
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#retypepass').fill(password);
    await page.locator('#phone').fill('5551234567');
    await page.locator('[data-testid="signup-submit"]').click();

    // Signup chains into login — the console (contracts) renders signed-in.
    await expect(page.locator('[data-testid="topbar-username"]')).toHaveText(username, { timeout: 20000 });
  });

  test('password mismatch → error shown, account NOT created', async ({ page, request }) => {
    const username = uniqueUser('mism');
    await gotoSignup(page);
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#retypepass').fill('Different123!');
    await page.locator('[data-testid="signup-submit"]').click();

    await expect(page.locator('[data-testid="credential-status"]')).toContainText('do not match');

    // Consequence: no account exists.
    const login = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(login.status()).toBe(401);
  });

  test('invalid username → error shown, account NOT created', async ({ page, request }) => {
    await gotoSignup(page);
    await page.locator('#username').fill('BadUser!');
    await page.locator('#password').fill(password);
    await page.locator('#retypepass').fill(password);
    await page.locator('#phone').fill('5551234567');
    await page.locator('[data-testid="signup-submit"]').click();

    await expect(page.locator('[data-testid="credential-status"]')).toContainText('Failed to Sign Up');

    const login = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username: 'BadUser!', password }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(login.status()).toBe(401);
  });

  test('duplicate username → error shown', async ({ page, request }) => {
    const username = uniqueUser('dupform');
    await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551230005' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await gotoSignup(page);
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#retypepass').fill(password);
    await page.locator('#phone').fill('5551234567');
    await page.locator('[data-testid="signup-submit"]').click();

    await expect(page.locator('[data-testid="credential-status"]')).toContainText('Failed to Sign Up');
  });
});

// ---------------------------------------------------------------------------
// Browser — login (real LoginForm) + state rule
// ---------------------------------------------------------------------------

test.describe('Browser — login (real LoginForm) + state rule', () => {
  test('login through the real form → signed in', async ({ page, request }) => {
    const { username } = await signupFreshUser(request);
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.locator('[data-testid="topbar-username"]')).toHaveText(username, { timeout: 20000 });
  });

  test('wrong password → error shown, NOT signed in', async ({ page, request }) => {
    const { username } = await signupFreshUser(request);
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill('WrongPassword1!');
    await page.locator('[data-testid="login-submit"]').click();

    await expect(page.locator('[data-testid="credential-status"]')).toContainText('Failed to Log In');
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
  });

  test('non-existent user → error shown', async ({ page }) => {
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('#username').fill(uniqueUser('ghostui'));
    await page.locator('#password').fill(password);
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.locator('[data-testid="credential-status"]')).toContainText('Failed to Log In');
  });

  test('return run: session survives reload (state rule)', async ({ page, request }) => {
    const { username } = await signupFreshUser(request);
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.locator('[data-testid="topbar-username"]')).toHaveText(username, { timeout: 20000 });

    // The return run: reload restores the session from the token cookie —
    // no re-login, no empty authenticated screen.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="topbar-username"]')).toHaveText(username, { timeout: 20000 });
  });

  test('logout → signed out, token cookie scrubbed', async ({ page, request }) => {
    const { username } = await signupFreshUser(request);
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.locator('[data-testid="topbar-username"]')).toHaveText(username, { timeout: 20000 });

    await page.locator('[data-testid="topbar-account"]').click();
    await page.locator('[data-testid="account-logout"]').click();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 15000 });

    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).not.toContain('token=');
  });

  test('admin panel: Node Config visible to the node admin, hidden to a regular user', async ({ page, request }) => {
    // The seam: checkAdmin → POST /am_admin → isAdmin → the adminOnly
    // nav item renders. A config-read failure used to 500 this (v3 stacks
    // run no Mongo, and the config lived in Mongo) — hiding the panel
    // from the real admin.
    const { username } = await signupFreshUser(request);
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.locator('[data-testid="topbar-username"]')).toHaveText(username, { timeout: 20000 });
    // regular user — the adminOnly item is filtered out
    await expect(page.locator('[data-testid="sidebar-nav-config"]')).toHaveCount(0);

    // switch to the node admin (global-setup's admin) — the item appears
    await page.locator('[data-testid="topbar-account"]').click();
    await page.locator('[data-testid="account-logout"]').click();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 15000 });
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('admin123');
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page.locator('[data-testid="topbar-username"]')).toHaveText('admin', { timeout: 20000 });
    await expect(page.locator('[data-testid="sidebar-nav-config"]')).toBeVisible({ timeout: 20000 });
  });
});

// ---------------------------------------------------------------------------
// Browser — consent forks (real popup)
// ---------------------------------------------------------------------------

test.describe('Browser — consent forks (real popup)', () => {
  test('deny fork: deny app contract → "app contract denied", no crash', async ({ page, context, request }) => {
    const { demoLogs, popup, popupFull } = await openSignedOutDemo(page, context, request);

    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-deny-0"]').click();

    // The demo handles the denial gracefully — the denial response reached it
    // (no crash). D42: the popup then auto-completes (token + self-close), which
    // re-inits the demo and rewrites #message — so the user-facing "denied"
    // message doesn't survive, but the response reaching the demo is the seam.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('app contract DENIED');
    }).toPass({ timeout: 15000 });

    // D42: pending list cleared → the popup auto-completes (no "all set"
    // screen). The denial response reached the demo; no crash.
    expect(popupFull.errors, handshakeDiagnostics(demoLogs, popupFull)).toEqual([]);
  });

  test('deny group + mixed session: approve app, deny group — each response to its own contract, demo proceeds', async ({ page, context, request }) => {
    const { demoLogs, popup, popupFull } = await openSignedOutDemo(page, context, request);

    // 1. Approve the app contract.
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('app contract APPROVED');
    }).toPass({ timeout: 15000 });

    // 2. D42: the login popup auto-completes (token + self-close). The demo signs in.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });

    // 3. D42: the group contract is LAZY. The demo reads, the group is missing,
    //    so the "Set up your notes group" button appears. Click it (a user
    //    gesture) → the group popup opens. Deny the group contract.
    await expect(page.locator('#setupGroupBtn')).toBeVisible({ timeout: 15000 });
    const groupPopupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#setupGroupBtn').click();
    const groupPopup = await groupPopupPromise;
    await groupPopup.waitForLoadState('networkidle');
    await groupPopup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await groupPopup.locator('[data-testid="consent-deny-0"]').click();

    // Each response matched its own contract: app APPROVED, group DENIED.
    // (Asserted on the demo's console — the setup-group callback rewrites
    // #message after the denial, so the DOM text doesn't survive.)
    expect(demoLogs.join('\n')).toContain('app contract APPROVED');
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('setupGroup — contract request failed');
    }).toPass({ timeout: 15000 });

    // The group denial did not break the app flow — the demo is still signed in.
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });
    expect(popupFull.errors, handshakeDiagnostics(demoLogs, popupFull)).toEqual([]);
  });

  test('skip fork: "Continue without sharing" → token to referrer origin (never *), fix-access on first CRUD', async ({ page, context, request }) => {
    const { demoLogs, popup, popupFull } = await openSignedOutDemo(page, context, request);

    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-skip"]').click();

    // Token lands — the demo signs in with NO contracts granted.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });

    // The token postMessage targeted the referrer origin, never '*'.
    const consoleStr = popupFull.console.join('\n');
    expect(consoleStr, handshakeDiagnostics(demoLogs, popupFull)).toContain(
      `goToApp — sending auth token to opener, target: ${MARKETING_BASE}`,
    );
    expect(consoleStr).not.toContain('target: *');

    // D42: the group contract is LAZY (not sent on login). The app contract
    // was skipped, so the first CRUD 403s with an app-contract error → the
    // "Fix access" button appears (the group is also missing, but the
    // app-contract error takes precedence in the demo's readNotes).
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });
    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 15000 });
    expect(popupFull.errors, handshakeDiagnostics(demoLogs, popupFull)).toEqual([]);
  });

  test('all-set fork: pre-granted ACR → zero-UI auto-complete → token lands (no "all set" screen)', async ({ page, context, request }) => {
    const { token } = await signupFreshUser(request);
    // Pre-grant the demo's app contract (full permissions) — the popup must
    // filter it out and auto-complete (zero UI), not show the contract row.
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
        permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });
    await setTokenCookie(context, 'auth.localhost', token);

    const pageFull = captureFull(page);
    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in');

    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    // D42: the app contract is already granted, so the popup auto-completes
    // (token + self-close, zero UI) — it may close before reaching networkidle,
    // so do NOT wait for its networkidle. The assertions below verify the flow.

    // D42: the app contract is already granted, so the popup auto-completes
    // (token + self-close, zero UI) — no "all set" screen, no Close window.
    // The token lands on the demo via the auto-complete.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });
    // No contract row rendered (the pre-granted ACR was filtered out). The
    // popup may already be closed (auto-complete), so tolerate that.
    expect(await popup.locator('[data-testid="consent-req-0"]').count().catch(() => 0)).toBe(0);

    expect(popupFull.errors, handshakeDiagnostics(demoLogs, popupFull)).toEqual([]);
    expect(pageFull.errors).toEqual([]);
  });

  test('details fork: permission change renders diff chips (3 added + 1 same)', async ({ page, context, request }) => {
    const { token } = await signupFreshUser(request);
    // Existing contract grants readAll only — the demo requests readAll +
    // create + updateOwn + deleteOwn, so the re-request must show the diff.
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
        permissions: { notes: ['readAll'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });
    await setTokenCookie(context, 'auth.localhost', token);

    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in');

    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');

    // New permissions exist → the row renders (not filtered).
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });

    // Expand the details — the permission diff renders.
    await popup.locator('[data-testid="consent-details-0"]').click();
    const row = popup.locator('[data-testid="consent-req-0"]');
    await expect(row).toContainText('Permissions (notes)');
    // 3 added permissions (Plus icon per added chip) + readAll unchanged.
    await expect(row.locator('svg.lucide-plus')).toHaveCount(3, { timeout: 5000 });
    expect(popupFull.errors, handshakeDiagnostics(demoLogs, popupFull)).toEqual([]);
  });

  test('logout fork: "Not you? Log out" → login form, pending contracts cleared, no stale state', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'auth.localhost', token);

    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in');

    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');

    // A contract is pending.
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });

    // "Not you? Log out" → back to login.
    await popup.locator('[data-testid="consent-logout"]').click();
    await expect(popup.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 10000 });

    // Re-login through the form. Logout cleared the pending list — after
    // login the popup auto-completes (D42: no "all set" screen), not the
    // stale contract.
    await popup.locator('#username').fill(username);
    await popup.locator('#password').fill(password);
    await popup.locator('[data-testid="login-submit"]').click();
    // D42: after re-login, the popup auto-completes (token + self-close). The
    // token lands on the demo.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });
    // No stale contract row. The popup may have already self-closed (D42
    // auto-complete fires the moment the token is delivered — the demo log
    // above is the proof it delivered), so guard the query: a closed popup
    // means the auto-complete path ran, which only happens when no contract
    // was pending (a stale contract would have kept the popup open on the
    // consent screen).
    if (!popup.isClosed()) {
      expect(await popup.locator('[data-testid="consent-req-0"]').count()).toBe(0);
    }

    expect(popupFull.errors, handshakeDiagnostics(demoLogs, popupFull)).toEqual([]);
  });

  test('fix-access fork: revoke → REAL popup → re-approve → "Access restored." (no popup.close workaround)', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'marketing.localhost', token);
    await setTokenCookie(context, 'auth.localhost', token);

    // Group + contract, like a completed first run.
    await request.post(`${API_BASE}/v3/groups/create`, {
      data: JSON.stringify({
        token,
        name: `notes-${username}`,
        join_policy: 'invite_only',
        roles: [
          { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
          { name: 'member', services: ['notes'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
        ],
        members: [{ member_key: username, role: 'owner' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await request.post(`${API_BASE}/v3/app-contracts/add`, {
      data: JSON.stringify({
        token,
        allowed_origin: MARKETING_BASE,
        permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });

    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out');

    // Revoke the contract → reload → first CRUD 403s → fix-access appears.
    await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
      data: JSON.stringify({ token, allowed_origin: MARKETING_BASE }),
      headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 15000 });

    // Click "Fix access" — the REAL popup drives the re-consent.
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#fixAccessBtn').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');

    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();

    // The demo's own callback fired from the popup's response — recovery.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('fixAccess — contract re-approved, retrying readNotes');
    }).toPass({ timeout: 15000 });
    // D42: the popup auto-completes after the re-approve (token + self-close),
    // which re-inits the demo and rewrites #message — so the "Access restored."
    // text doesn't survive. The real proof of recovery is that the read now
    // succeeds (the contract was re-granted).
    await expect(async () => {
      expect(demoLogs.join('\n')).toMatch(/readNotes — got \d+ docs/);
    }).toPass({ timeout: 15000 });
    expect(popupFull.errors, handshakeDiagnostics(demoLogs, popupFull)).toEqual([]);
  });

  test('edge: approveAll with zero pending → goToApp early return, no crash', async ({ context, request }) => {
    const { token } = await signupFreshUser(request);
    await setTokenCookie(context, 'auth.localhost', token);

    const page = await context.newPage();
    const full = captureFull(page);
    // Consent preview mode (no opener) — zero pending contracts. D42: no
    // "all set" screen; the consent list renders (empty — no contract row).
    await page.goto(`${AUTH_BASE}/?consent=1`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="consent-approve-all"]')).toBeVisible({ timeout: 15000 });
    expect(await page.locator('[data-testid="consent-req-0"]').count()).toBe(0);

    // Drive the defensive path directly: zero pending → goToApp → no opener
    // → "not closing". No crash, no navigation.
    await page.evaluate(() => (window as any).I.approveAll());
    await page.waitForTimeout(500);
    expect(full.errors).toEqual([]);
    // Still on the consent screen (no navigation, no crash).
    await expect(page.locator('[data-testid="consent-approve-all"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Browser — config wizard (real SetupWizard)
// ---------------------------------------------------------------------------

test.describe('Browser — config wizard (real SetupWizard)', () => {
  /**
   * Force the "unconfigured node" state so the wizard renders, regardless of
   * the shared e2e node's user count. The configure POST is intercepted so
   * the test is deterministic on the shared node — the URL + payload
   * assertions are the bug-catchers (the wizard used to POST the config to
   * the status endpoint /setup, which ignored the body).
   */
  async function openWizard(
    page: Page,
    captured: { url: string | null; body: any },
    respond?: (route: any) => void,
  ) {
    await page.route('**/ready', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', configured: false }),
      }),
    );
    await page.route('**/setup**', async (route) => {
      if (route.request().method() === 'POST') {
        captured.url = route.request().url();
        captured.body = JSON.parse(route.request().postData() || '{}');
      }
      if (respond) {
        respond(route);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'configured', message: 'Node setup complete. You can now log in.', key_id: 'test' }),
      });
    });
    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="setup-wizard"]')).toBeVisible({ timeout: 15000 });
  }

  test('renders when node unconfigured', async ({ page }) => {
    const captured = { url: null as string | null, body: null };
    await openWizard(page, captured);
    await expect(page.locator('[data-testid="wizard-welcome-get-started"]')).toBeVisible();
  });

  test('happy path: submit POSTs /setup/configure with payload → "You\'re All Set!" → Go to Login', async ({ page }) => {
    const captured = { url: null as string | null, body: null as any };
    const full = captureFull(page);
    await openWizard(page, captured);

    // Welcome → Node Identity (provider pre-filled from the auth hostname).
    await page.locator('[data-testid="wizard-welcome-get-started"]').click();
    await expect(page.locator('[data-testid="wizard-provider-domain"]')).toHaveValue('api.localhost');
    await page.locator('[data-testid="wizard-node-identity-next"]').click();

    // Admin Account.
    await page.locator('[data-testid="wizard-admin-username"]').fill('wizardadmin');
    await page.locator('[data-testid="wizard-admin-password"]').fill('WizardPass123!');
    await page.locator('[data-testid="wizard-admin-password-confirm"]').fill('WizardPass123!');
    await page.locator('[data-testid="wizard-admin-account-next"]').click();

    // Access Policy (defaults) → Storage (defaults) → submit.
    await page.locator('[data-testid="wizard-access-policy-next"]').click();
    await page.locator('[data-testid="wizard-storage-next"]').click();

    // THE bug-catcher pair: straight to Complete (the off-by-one used to loop
    // back to Welcome), and the POST went to /setup/configure (the old code
    // POSTed the config to the status endpoint /setup, which ignored it).
    await expect(page.locator('[data-testid="wizard-complete-login"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("You're All Set!")).toBeVisible();
    expect(captured.url).toBe(`${API_BASE}/setup/configure`);
    expect(captured.body.admin_username).toBe('wizardadmin');
    expect(captured.body.admin_password).toBe('WizardPass123!');
    expect(full.errors).toEqual([]);

    // "Go to Login" → login mode.
    await page.locator('[data-testid="wizard-complete-login"]').click();
    await expect(page.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 10000 });
  });

  test('node identity: Next disabled until provider entered', async ({ page }) => {
    const captured = { url: null as string | null, body: null };
    await openWizard(page, captured);
    await page.locator('[data-testid="wizard-welcome-get-started"]').click();

    await expect(page.locator('[data-testid="wizard-node-identity-next"]')).toBeEnabled();
    await page.locator('[data-testid="wizard-provider-domain"]').fill('');
    await expect(page.locator('[data-testid="wizard-node-identity-next"]')).toBeDisabled();
    await page.locator('[data-testid="wizard-provider-domain"]').fill('api.localhost');
    await expect(page.locator('[data-testid="wizard-node-identity-next"]')).toBeEnabled();
  });

  test('admin: password mismatch → error + Next disabled; match → enabled', async ({ page }) => {
    const captured = { url: null as string | null, body: null };
    await openWizard(page, captured);
    await page.locator('[data-testid="wizard-welcome-get-started"]').click();
    await page.locator('[data-testid="wizard-node-identity-next"]').click();

    await expect(page.locator('[data-testid="wizard-admin-account-next"]')).toBeDisabled();
    await page.locator('[data-testid="wizard-admin-username"]').fill('wizardadmin');
    await page.locator('[data-testid="wizard-admin-password"]').fill('WizardPass123!');
    await page.locator('[data-testid="wizard-admin-password-confirm"]').fill('Different!');
    await expect(page.locator('[data-testid="wizard-password-mismatch"]')).toBeVisible();
    await expect(page.locator('[data-testid="wizard-admin-account-next"]')).toBeDisabled();

    await page.locator('[data-testid="wizard-admin-password-confirm"]').fill('WizardPass123!');
    await expect(page.locator('[data-testid="wizard-password-mismatch"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="wizard-admin-account-next"]')).toBeEnabled();
  });

  test('back navigation preserves entered data', async ({ page }) => {
    const captured = { url: null as string | null, body: null };
    await openWizard(page, captured);
    await page.locator('[data-testid="wizard-welcome-get-started"]').click();
    await page.locator('[data-testid="wizard-node-identity-next"]').click();

    await page.locator('[data-testid="wizard-admin-username"]').fill('wizardadmin');
    await page.locator('[data-testid="wizard-admin-password"]').fill('WizardPass123!');
    await page.locator('[data-testid="wizard-admin-password-confirm"]').fill('WizardPass123!');

    // Back to Node Identity — data intact.
    await page.locator('[data-testid="wizard-admin-account-back"]').click();
    await expect(page.locator('[data-testid="wizard-provider-domain"]')).toHaveValue('api.localhost');

    // Forward again — admin data preserved.
    await page.locator('[data-testid="wizard-node-identity-next"]').click();
    await expect(page.locator('[data-testid="wizard-admin-username"]')).toHaveValue('wizardadmin');
    await expect(page.locator('[data-testid="wizard-admin-password"]')).toHaveValue('WizardPass123!');
  });

  test('anti-test: configure 400 → "Setup Failed" shown with detail, no crash', async ({ page }) => {
    const captured = { url: null as string | null, body: null };
    const full = captureFull(page);
    await openWizard(page, captured, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Node already configured' }),
      }),
    );

    await page.locator('[data-testid="wizard-welcome-get-started"]').click();
    await page.locator('[data-testid="wizard-node-identity-next"]').click();
    await page.locator('[data-testid="wizard-admin-username"]').fill('wizardadmin');
    await page.locator('[data-testid="wizard-admin-password"]').fill('WizardPass123!');
    await page.locator('[data-testid="wizard-admin-password-confirm"]').fill('WizardPass123!');
    await page.locator('[data-testid="wizard-admin-account-next"]').click();
    await page.locator('[data-testid="wizard-access-policy-next"]').click();
    await page.locator('[data-testid="wizard-storage-next"]').click();

    // The error renders as "Setup Failed" with the server detail — not a crash.
    await expect(page.getByText('Setup Failed')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Node already configured')).toBeVisible();
    await expect(page.locator('[data-testid="wizard-complete-login"]')).toBeVisible();
    expect(full.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Anti-tests — security model (API floor)
// ---------------------------------------------------------------------------

test.describe('Anti-tests — security model (API floor)', () => {
  test('no contract → CRUD 403 (a contract the user never consented to grants nothing)', async ({ request }) => {
    const { token } = await signupFreshUser(request);
    const res = await request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({ token, service: 'notes', body: { note: 'x' }, groups: [] }),
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.localhost' },
    });
    expect(res.status()).toBe(403);
  });

  test('revoke contract → CRUD 403 → re-grant → CRUD works', async ({ request }) => {
    const { token } = await signupFreshUser(request);
    const origin = 'http://torture-app.localhost';
    const create = () =>
      request.post(`${API_BASE}/v3/create`, {
        data: JSON.stringify({ token, service: 'notes', body: { note: 'x' }, groups: [] }),
        headers: { 'Content-Type': 'application/json', Origin: origin },
      });
    const grant = () =>
      request.post(`${API_BASE}/v3/app-contracts/add`, {
        data: JSON.stringify({ token, allowed_origin: origin, permissions: { notes: ['readAll', 'create'] } }),
        headers: { 'Content-Type': 'application/json' },
      });
    const revoke = () =>
      request.post(`${API_BASE}/v3/app-contracts/revoke`, {
        data: JSON.stringify({ token, allowed_origin: origin }),
        headers: { 'Content-Type': 'application/json' },
      });

    // Broken state: no contract → denied.
    expect((await create()).status()).toBe(403);

    // Grant → works.
    expect((await grant()).status()).toBe(200);
    expect((await create()).status()).toBe(200);

    // Revoke → denied again (the KB with teeth).
    expect((await revoke()).status()).toBe(200);
    expect((await create()).status()).toBe(403);

    // Recovery: re-grant → works.
    expect((await grant()).status()).toBe(200);
    expect((await create()).status()).toBe(200);
  });
});
