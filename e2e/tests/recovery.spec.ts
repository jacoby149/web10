import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_BASE, v3Post, v3Signup } from '../v3-helpers';

/**
 * Contact-anchored auth (D61) — the recovery flow end-to-end.
 *
 * The account is anchored on a contact (phone OR email), verified by a
 * 6-digit code. Enter contact → code → pick an account (or create one) →
 * signed in. Sign-up, sign-in, and password-change are the same flow; a
 * contact can carry many usernames.
 *
 * The e2e stack runs the API in local-Twilio mode (TWILIO_E2E=true in
 * e2e/docker-compose.yml) — a deterministic in-memory code store, so the fixed
 * code "123456" completes the flow without real Twilio credentials (CI has
 * none). The unit tests (api/tests/test_recovery.py) cover the same logic with
 * Twilio mocked; this spec drives the real /v3/recovery/* endpoints + the real
 * auth UI.
 *
 * Ladder: API floor (fast, deterministic) + browser gauntlet (the real auth
 * screen: login → contact → code → pick → sign in).
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const AUTH_BASE = `http://auth.localhost${p}`;

const E2E_CODE = '123456'; // the fixed code from the API's local-Twilio mode
const password = 'TestPass123!';
// Cap at 30 chars (the username limit) — Date.now() is 13 digits, so a long
// prefix + the random suffix can overflow; the slice is the safety net.
const uniqueUser = (prefix: string) =>
  `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 30);
// Collision-free by construction (a counter, not a random range — a 7-digit
// random range collided once in CI). 10-digit US body, +1 prefixed.
let phoneCounter = Math.floor(Math.random() * 100000);
const uniquePhone = () => `+1${(5550000000 + phoneCounter++).toString()}`;
const uniqueEmail = () => `${Math.random().toString(36).slice(2, 10)}@recovery.test`;

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

/** Drive the recovery flow at the API floor: request → verify → complete. */
async function recoveryFlow(
  request: APIRequestContext,
  contact: string,
  username: string,
  newPassword?: string,
): Promise<{ token: string; kind: string }> {
  const req = await v3Post(request, `${API_BASE}/v3/recovery/request`, { contact });
  expect(req.ok(), `recovery/request failed (${req.status})`).toBeTruthy();
  const reqBody = await req.json();
  const ver = await v3Post(request, `${API_BASE}/v3/recovery/verify`, { contact, code: E2E_CODE });
  expect(ver.ok(), `recovery/verify failed (${ver.status})`).toBeTruthy();
  const verify_token = (await ver.json()).verify_token as string;
  const body: Record<string, unknown> = { verify_token, username };
  if (newPassword) body.new_password = newPassword;
  const comp = await v3Post(request, `${API_BASE}/v3/recovery/complete`, body);
  expect(comp.ok(), `recovery/complete failed (${comp.status})`).toBeTruthy();
  return { token: (await comp.json()).token as string, kind: reqBody.kind as string };
}

// ---------------------------------------------------------------------------
// API floor
// ---------------------------------------------------------------------------

test.describe('API floor — phone path', () => {
  test('request → verify → complete signs in to an existing account', async ({ request }) => {
    const username = uniqueUser('recph');
    const phone = uniquePhone();
    await v3Signup(request, username, password, phone);

    const { token } = await recoveryFlow(request, phone, username);
    expect(token).toBeTruthy();

    // The returned token is a real login token — it authenticates.
    const prof = await v3Post(request, `${API_BASE}/v3/profile`, { token });
    expect(prof.ok()).toBeTruthy();
    expect((await prof.json()).username).toBe(username);
  });
});

test.describe('API floor — email path', () => {
  test('request → verify → complete signs in to an existing account (email)', async ({ request }) => {
    const username = uniqueUser('recrem');
    const email = uniqueEmail();
    const su = await v3Post(request, `${API_BASE}/v3/signup`, { username, password, email });
    expect(su.ok(), `signup failed (${su.status})`).toBeTruthy();

    const { token, kind } = await recoveryFlow(request, email, username);
    expect(token).toBeTruthy();
    expect(kind).toBe('email');
  });
});

test.describe('API floor — create-on-complete', () => {
  test('a contact with no account → verify returns [] → complete creates it', async ({ request }) => {
    const phone = uniquePhone();
    const username = uniqueUser('reccreate');

    // No account on this contact yet.
    await v3Post(request, `${API_BASE}/v3/recovery/request`, { contact: phone });
    const ver = await v3Post(request, `${API_BASE}/v3/recovery/verify`, { contact: phone, code: E2E_CODE });
    expect(ver.ok()).toBeTruthy();
    expect((await ver.json()).accounts).toEqual([]);

    // Complete with a new username → creates the account carrying the contact.
    const comp = await v3Post(request, `${API_BASE}/v3/recovery/complete`, {
      verify_token: (await ver.json()).verify_token,
      username,
    });
    expect(comp.ok(), `create-on-complete failed (${comp.status})`).toBeTruthy();

    // The account now exists on the contact: a fresh verify lists it.
    await v3Post(request, `${API_BASE}/v3/recovery/request`, { contact: phone });
    const ver2 = await v3Post(request, `${API_BASE}/v3/recovery/verify`, { contact: phone, code: E2E_CODE });
    const accounts = (await ver2.json()).accounts as { username: string }[];
    expect(accounts.map((a) => a.username)).toContain(username);
  });
});

test.describe('API floor — password-change', () => {
  test('complete with new_password changes the password (old fails, new works)', async ({ request }) => {
    const username = uniqueUser('recpw');
    const phone = uniquePhone();
    await v3Signup(request, username, password, phone);
    const newPassword = 'NewPass456!';

    await recoveryFlow(request, phone, username, newPassword);

    const ok = await v3Post(request, `${API_BASE}/v3/login`, { username, password: newPassword });
    expect(ok.ok(), 'new password should work').toBeTruthy();
    const bad = await v3Post(request, `${API_BASE}/v3/login`, { username, password });
    expect(bad.status(), 'old password should fail').toBe(401);
  });
});

test.describe('API floor — anti-tests', () => {
  test("a verify_token for contact X can't sign in to an account without X", async ({ request }) => {
    const phoneA = uniquePhone();
    const phoneB = uniquePhone();
    const userA = uniqueUser('recmA');
    const userB = uniqueUser('recmB');
    await v3Signup(request, userA, password, phoneA);
    await v3Signup(request, userB, password, phoneB);

    await v3Post(request, `${API_BASE}/v3/recovery/request`, { contact: phoneA });
    const ver = await v3Post(request, `${API_BASE}/v3/recovery/verify`, { contact: phoneA, code: E2E_CODE });
    const verify_token = (await ver.json()).verify_token as string;

    // Complete to user B (who has phone B, not phone A) → CONTACT_NOT_LINKED.
    const comp = await v3Post(request, `${API_BASE}/v3/recovery/complete`, { verify_token, username: userB });
    expect(comp.status()).toBe(401);
    expect((await comp.json()).detail).toMatch(/isn't linked/);
  });

  test('a garbage verify_token 401s', async ({ request }) => {
    const username = uniqueUser('recbad');
    await v3Signup(request, username, password, uniquePhone());
    const comp = await v3Post(request, `${API_BASE}/v3/recovery/complete`, {
      verify_token: 'garbage',
      username,
    });
    expect(comp.status()).toBe(401);
  });

  test('a wrong code 401s (WRONG_CODE)', async ({ request }) => {
    const phone = uniquePhone();
    await v3Post(request, `${API_BASE}/v3/recovery/request`, { contact: phone });
    const ver = await v3Post(request, `${API_BASE}/v3/recovery/verify`, { contact: phone, code: '000000' });
    expect(ver.status()).toBe(401);
  });

  test('a second send to the same contact within the window 429s (rate limit)', async ({ request }) => {
    const phone = uniquePhone();
    const first = await v3Post(request, `${API_BASE}/v3/recovery/request`, { contact: phone });
    expect(first.ok()).toBeTruthy();
    const second = await v3Post(request, `${API_BASE}/v3/recovery/request`, { contact: phone });
    expect(second.status()).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real auth screen: login → contact → code → pick → in
// ---------------------------------------------------------------------------

test.describe('Recovery gauntlet — the contact-anchored sign-in', () => {
  test('login screen → phone → code → pick account → signed in', async ({ page, context, request }) => {
    const full = captureFull(page);

    // Setup (API): an account with a phone, so the pick step has something real.
    const username = uniqueUser('recui');
    const phone = uniquePhone();
    await v3Signup(request, username, password, phone);

    await page.goto(AUTH_BASE);
    await page.waitForLoadState('networkidle');

    // The login screen's primary CTA opens the contact flow.
    await expect(page.locator('[data-testid="login-contact-cta"]')).toBeVisible();
    await page.locator('[data-testid="login-contact-cta"]').click();

    // Contact step: enter the phone, send the code.
    await expect(page.locator('[data-testid="recovery-contact-input"]')).toBeVisible();
    await page.locator('[data-testid="recovery-contact-input"]').fill(phone);
    await page.locator('[data-testid="recovery-send-code"]').click();

    // Code step: enter the (local-Twilio) code, verify.
    await expect(page.locator('[data-testid="recovery-code-input"]')).toBeVisible();
    await page.locator('[data-testid="recovery-code-input"]').fill(E2E_CODE);
    await page.locator('[data-testid="recovery-verify"]').click();

    // Pick step: the account on the phone is listed — pick it, sign in.
    await expect(page.locator('[data-testid="recovery-account-list"]')).toBeVisible();
    await page.locator(`[data-testid="recovery-account-${username}"]`).click();
    await page.locator('[data-testid="recovery-sign-in"]').click();

    // Signed in: the token cookie is set on the auth origin.
    await expect
      .poll(async () => (await context.cookies(AUTH_BASE)).some((c) => c.name === 'token' && c.value), {
        timeout: 10000,
      })
      .toBeTruthy();

    expect(full.errors, `pageerror during the recovery flow:\n${full.errors.join('\n')}`).toEqual([]);
  });
});
