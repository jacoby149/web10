import { test, expect, type APIRequestContext } from '@playwright/test';
import { v3Post, v3Login, v3Signup, API_BASE } from '../v3-helpers';

/**
 * The consent popup's dead-session scrub (5.23.4) — the operator's phone
 * death loop, driven through the REAL popup + the REAL node.
 *
 * A cookie that is alive LOCALLY but dead on the node (bad signature → 401
 * "incorrect token" on every v3 call) used to masquerade as "Signed in as …"
 * in the consent popup: the "Signed in as" footer is local cookie state and
 * every on-mount read swallowed its 401, so every consent approve dead-ended
 * on "Some requests failed. Start a new request from the app." with the
 * manual log-out link as the only escape. After the fix, the on-mount
 * profile read's 401 scrubs the session and routes the popup to the login
 * screen — re-login mints a token the node accepts.
 *
 * The anti-test (a live token must NOT be scrubbed) guards against
 * over-scrub: a flaky connection or a 5xx must not log a healthy session out
 * on every return visit.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const AUTH_BASE = `http://auth.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// A JWT that decodes locally (the client never verifies signatures — the
// payload is what restoreAuth + the footer read) but that the node rejects
// (signature check fails → 401 "incorrect token").
function deadToken(username: string): string {
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    username,
    provider: 'api.localhost',
    site: 'web10',
    expires: '2099-01-01T00:00:00',
  })}.dead-signature`;
}

test.describe('consent popup — dead-session scrub (the phone death loop)', () => {
  test('a cookie the node rejects scrubs the popup to the login screen', async ({ page, context }) => {
    await context.addCookies([
      { name: 'token', value: deadToken('deadcat'), domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto(`${AUTH_BASE}/?consent=1`);

    // The terminal state: the LOGIN screen — not the consent card, not the
    // "Signed in as deadcat" footer (the lie the loop was stuck on).
    await expect(page.getByTestId('login-submit')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('consent-logout')).toBeHidden({ timeout: 5000 });

    // The cookie is scrubbed (a reload must not restore the dead session).
    const cookies = await context.cookies(AUTH_BASE);
    expect(cookies.find((c) => c.name === 'token')).toBeUndefined();

    // The seam log proves the 401-scrub path ran (restored session → decisive
    // 401 → scrub), not some other route to the login screen.
    expect(consoleLogs.join('\n')).toContain('[auth-ui] profile read 401 — session dead server-side');
  });

  test('a live token is NOT scrubbed (no over-scrub of healthy sessions)', async ({ page, context, request }) => {
    const username = uniqueUser('dsslive');
    await v3Signup(request, username, password, '+1555' + Math.floor(Math.random() * 10000000));
    const token = await v3Login(request, username, password);

    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);
    await page.goto(`${AUTH_BASE}/?consent=1`);

    // The on-mount reads (profile / contracts / groups / /am_admin) all 200
    // for a live session — the signed-in footer survives, the login form does
    // not appear. (The consent card itself shows 0 requests: no opener sent
    // any — this test is about the SESSION, not the consent batch.)
    await expect(page.getByTestId('consent-logout')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('login-submit')).toBeHidden({ timeout: 5000 });

    const cookies = await context.cookies(AUTH_BASE);
    expect(cookies.find((c) => c.name === 'token')?.value).toBe(token);
  });

  test('the API floor: a dead token 401s the profile read with "incorrect token"', async ({ request }) => {
    // Pins the server side of the seam the scrub reacts to: the node's
    // verdict for an unverifiable cookie is a 401 (decisive), not a 500 or a
    // silent pass — and the 200 for a live token.
    const username = uniqueUser('dssfloor');
    await v3Signup(request, username, password);
    const live = await v3Login(request, username, password);

    const deadRes = await v3Post(request, `${API_BASE}/v3/profile`, { token: deadToken(username) });
    expect(deadRes.status()).toBe(401);
    const liveRes = await v3Post(request, `${API_BASE}/v3/profile`, { token: live });
    expect(liveRes.status()).toBe(200);
  });
});
