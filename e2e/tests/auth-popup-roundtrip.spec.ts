import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Auth popup round-trip — the INTEGRATION layer of the test ladder.
 *
 * This is the hard, slow, real-UI test that the API-level specs
 * (notes-demo.spec.ts, hello-demo.spec.ts) deliberately do not cover.
 * It drives the actual consent handshake: a signed-out demo opens the
 * auth popup, the app contract is delivered to the popup, the user
 * approves it in the popup, and the token comes back to the demo.
 *
 * The load-bearing assertion is that the contract RENDERS in the popup.
 * Without it, a broken handshake shows "You're all set" (zero pending
 * contracts) and every other check still passes — which is exactly how
 * the "never asked to approve" bug shipped. A green that skips this seam
 * is a corrupted measure.
 *
 * Setup is intentionally minimal:
 *   - The POPUP (auth.localhost) is pre-authenticated so this test isolates
 *     the contract handshake from the login form (a separate concern).
 *   - The DEMO (marketing.localhost) starts SIGNED-OUT — no cookie.
 *   - NO app contract is pre-granted — it must arrive through the popup.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('rt');
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

/**
 * Capture EVERYTHING from a page — full console (all levels) plus uncaught
 * exceptions (pageerror). This is the diagnostic net: a throw inside the
 * message handler is an uncaught exception, and it is the single most likely
 * reason a contract is received but never rendered.
 */
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

test.describe('Auth popup round-trip — real consent handshake', () => {
  test('signed-out demo → login → contract renders in popup → approve → token lands → demo signed-in', async ({ context, request }) => {
    const { token } = await signupFreshUser(request);

    // Pre-auth ONLY the popup. The demo stays signed-out and gets no
    // pre-granted contract — the handshake must do the work.
    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);

    const page = await context.newPage();
    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);

    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');

    // Demo starts signed-out.
    await expect(page.locator('#authButton')).toHaveText('Log in');

    // Open the real auth popup.
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');

    // THE seam assertion: the app contract must actually render in the popup.
    // (D42: a fresh user has no contract, so the consent row renders — the old
    // "You're all set" screen is gone, replaced by zero-UI auto-complete.)
    await popup
      .locator('[data-testid="consent-req-0"]')
      .waitFor({ state: 'visible', timeout: 15000 });
    const contractRendered = await popup.locator('[data-testid="consent-req-0"]').isVisible();
    if (!contractRendered) {
      throw new Error(
        'CONTRACT NEVER RENDERED in the auth popup — the popup showed no consent row ' +
          'instead of the app contract.\n\n' +
          handshakeDiagnostics(demoLogs, popupFull),
      );
    }

    // Approve it in the popup.
    await popup.locator('[data-testid="consent-approve-0"]').click();

    // Demo receives the approval.
    try {
      await expect(async () => {
        expect(demoLogs.join('\n')).toContain('app contract APPROVED');
      }).toPass({ timeout: 15000 });
    } catch {
      throw new Error('Approval did not complete — the demo never logged "app contract APPROVED".\n\n' + handshakeDiagnostics(demoLogs, popupFull));
    }

    // D42: the popup auto-completes (token + self-close) — no "Close window"
    // tap. The token lands on the demo via the auto-complete.
    try {
      await expect(async () => {
        expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
      }).toPass({ timeout: 15000 });
    } catch {
      throw new Error('Token did not land on the demo after the auto-complete.\n\n' + handshakeDiagnostics(demoLogs, popupFull));
    }

    // Both sides logged the handshake — the round-trip is real, not assumed.
    expect(popupFull.console.join('\n')).toContain('[auth-ui] auth_ready sent to opener');
    expect(demoLogs.join('\n')).toContain('[wapi] auth_ready');

    await popup.close().catch(() => {});
  });

  test('full sign-in: app contract (login popup) + lazy group contract (setup button)', async ({ context, request }) => {
    const { token } = await signupFreshUser(request);
    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);

    const page = await context.newPage();
    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in');

    // 1. Login popup: approve the app contract.
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('app contract APPROVED');
    }).toPass({ timeout: 15000 });

    // 2. D42: the login popup auto-completes (token + self-close). The demo signs in.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });

    // 3. D42: the group contract is LAZY — not sent on login. The demo reads,
    //    the group is missing (fresh user), so the "Set up your notes group"
    //    button appears.
    await expect(page.locator('#setupGroupBtn')).toBeVisible({ timeout: 15000 });

    // 4. Click the button (a user gesture) → the group popup opens.
    const groupPopupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#setupGroupBtn').click();
    const groupPopup = await groupPopupPromise;
    const groupPopupFull = captureFull(groupPopup);
    await groupPopup.waitForLoadState('networkidle');
    await groupPopup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    // D42: the group popup auto-completes (self-close) the moment the group is
    // created — which races with the demo's "group created" log. Start listening
    // for the close BEFORE the approve so the event isn't missed.
    const groupClosePromise = groupPopup.waitForEvent('close', { timeout: 15000 });
    await groupPopup.locator('[data-testid="consent-approve-0"]').click();

    // 5. Group created → the demo re-reads → notes view is ready.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('setupGroup — group created, retrying readNotes');
    }).toPass({ timeout: 15000 });
    try {
      await groupClosePromise;
    } catch {
      throw new Error('GROUP POPUP DID NOT CLOSE after approve.\n\n' + [
        '--- GROUP POPUP uncaught exceptions ---', groupPopupFull.errors.join('\n') || '(none)',
        '--- GROUP POPUP full console ---', groupPopupFull.console.join('\n') || '(none)',
      ].join('\n'));
    }
  });

  /**
   * The APPROVE-ALL fork.
   *
   * The two tests above drive the single "Allow" button (consent-approve-0).
   * "Approve all & continue" (consent-approve-all) is a SEPARATE code path —
   * I.approveAll — that shares the same wire seam but was never driven. That
   * is exactly the fork-seam gap: testing the seam through one fork does not
   * test the seam through the other. This test drives approve-all end to end.
   *
   * The load-bearing assertion is the bug-catcher: approve-all must send the
   * app-contract approval response. The demo logs "app contract APPROVED" when
   * that response arrives. Because the group contract is only requested AFTER
   * the token lands (which is sent after the app approval), the app response
   * must be in the logs by the time "authListen fired" appears. In the buggy
   * approve-all the app branch never calls sendContractResponse, so that log
   * only shows up later — mis-delivered from the group's response.
   */
  test('approve-all fork: app contract via "Approve all" (not single Allow) + lazy group', async ({ context, request }) => {
    const { token } = await signupFreshUser(request);
    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);

    const page = await context.newPage();
    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in');

    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');

    // 1. App contract renders. Approve it via "Approve all" (NOT single Allow).
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-all"]').click();

    // Token lands → demo signs in (D42: auto-complete, no Close window).
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });

    // THE bug-catcher: the app-contract approval response must have arrived by
    // now (before the group is even set up — it's lazy now).
    expect(
      demoLogs.join('\n'),
      'approve-all did not send the app-contract approval response — the demo never logged ' +
        '"app contract APPROVED" before the group was set up.\n\n' +
        handshakeDiagnostics(demoLogs, popupFull),
    ).toContain('app contract APPROVED');

    // 2. D42: the group contract is LAZY. The demo reads, the group is missing,
    //    so the "Set up your notes group" button appears. Click it (a user
    //    gesture) → the group popup opens. Approve via "Approve all".
    await expect(page.locator('#setupGroupBtn')).toBeVisible({ timeout: 15000 });
    const groupPopupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#setupGroupBtn').click();
    const groupPopup = await groupPopupPromise;
    await groupPopup.waitForLoadState('networkidle');
    await groupPopup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    // D42: the group popup self-closes the moment the group is created (races
    // with the demo's "group created" log) — listen for the close before the
    // approve so the event isn't missed.
    const groupClosePromise = groupPopup.waitForEvent('close', { timeout: 15000 });
    await groupPopup.locator('[data-testid="consent-approve-all"]').click();

    // 3. Group created → the demo re-reads → signed in.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('setupGroup — group created, retrying readNotes');
    }).toPass({ timeout: 15000 });
    await groupClosePromise;
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });
  });

  test('handshake logs are ordered: auth_ready before contract on the demo side', async ({ context, request }) => {
    const { token } = await signupFreshUser(request);
    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);

    const page = await context.newPage();
    const demoLogs = captureConsoleLogs(page, ['[wapi]']);

    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');

    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');

    // Give the handshake a moment to run, then assert ordering.
    await page.waitForTimeout(3000);

    const readyIdx = demoLogs.findIndex((l) => l.includes('[wapi] auth_ready'));
    const sendIdx = demoLogs.findIndex((l) => l.includes('contractRequest — sending contract to popup'));
    expect(readyIdx, handshakeDiagnostics(demoLogs, popupFull)).toBeGreaterThanOrEqual(0);
    expect(sendIdx, handshakeDiagnostics(demoLogs, popupFull)).toBeGreaterThanOrEqual(0);
    expect(readyIdx).toBeLessThan(sendIdx);

    await popup.close().catch(() => {});
  });

  /**
   * The STATE RULE — first run and return run are different code paths.
   *
   * Every test above drives the COLD START: a fresh user, no cookie, no
   * approved contract, no data. This test drives the RETURN RUN: a user who
   * has already used the app (approved the contracts, created a note), logs
   * out, and logs back in through the real popup. The return run is where
   * persistence, idempotency, and session restore actually live — and it is
   * the state a real user is in almost all the time.
   *
   * The load-bearing assertion is the last one: the note created on the first
   * run must still be there after the second run. If the return run clobbers
   * the group, re-scopes the read, or drops the session, the note vanishes —
   * which is exactly the "it worked the first time, then it broke" report no
   * cold-start test can produce.
   */
  test('return run: 2nd login through real popup, note persists (state rule)', async ({ context, request }) => {
    const { token } = await signupFreshUser(request);
    // Pre-auth ONLY the popup (auth.localhost). The demo starts signed-out.
    await context.addCookies([
      { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
    ]);

    const page = await context.newPage();
    const demoLogs = captureConsoleLogs(page, ['[notes-demo]', '[wapi]']);
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in');

    // --- FIRST RUN (cold start) ---
    const popupPromise1 = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup1 = await popupPromise1;
    const popup1Full = captureFull(popup1);
    await popup1.waitForLoadState('networkidle');

    // Approve the app contract.
    await popup1.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup1.locator('[data-testid="consent-approve-0"]').click();
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('app contract APPROVED');
    }).toPass({ timeout: 15000 });

    // D42: the login popup auto-completes (token + self-close). The demo signs in.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });

    // D42: the group contract is LAZY. The demo reads, the group is missing, so
    // the "Set up your notes group" button appears. Click it (a user gesture) →
    // the group popup opens. Approve it; the group is created.
    await expect(page.locator('#setupGroupBtn')).toBeVisible({ timeout: 15000 });
    const groupPopupPromise1 = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#setupGroupBtn').click();
    const groupPopup1 = await groupPopupPromise1;
    await groupPopup1.waitForLoadState('networkidle');
    await groupPopup1.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    // D42: the group popup self-closes the moment the group is created (races
    // with the demo's "group created" log) — listen for the close before the
    // approve so the event isn't missed.
    const groupClosePromise1 = groupPopup1.waitForEvent('close', { timeout: 15000 });
    await groupPopup1.locator('[data-testid="consent-approve-0"]').click();
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('setupGroup — group created, retrying readNotes');
    }).toPass({ timeout: 15000 });
    await groupClosePromise1;

    // Create a note on the first run.
    await page.locator('#curr').fill('return-run note');
    await page.locator('button:has-text("Create note")').click();
    await expect(page.locator('.note textarea').first()).toHaveValue('return-run note', { timeout: 10000 });

    // --- LOG OUT (wipe the demo's session, keep the server state) ---
    await page.locator('#authButton').click(); // now "log out"
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in', { timeout: 15000 });

    // --- SECOND RUN (return run) ---
    // The demo logged out, which scrubs its token cookie — so the SDK
    // return-run fast path (which requires a token) does NOT apply here. The
    // popup opens. The app contract is already approved, so the popup
    // auto-completes (token + self-close, zero UI) — no "all set" screen, no
    // Close window. The group already exists from the first run, so the demo
    // re-reads and the note is there. No group contract on the return run.
    const popupPromise2 = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup2 = await popupPromise2;
    const popup2Full = captureFull(popup2);
    await popup2.waitForLoadState('networkidle');

    // D42: the app contract is already approved, so the popup auto-completes
    // (token + self-close). The demo signs in and re-reads — the group already
    // exists, so the note persists.
    await expect(async () => {
      expect(demoLogs.join('\n')).toContain('authListen fired — user is signed in');
    }).toPass({ timeout: 15000 });
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });

    // THE state-rule assertion: the note from the first run must survive the
    // return run. A red here is the "my notes disappeared" bug.
    try {
      await expect(page.locator('.note textarea').first()).toHaveValue('return-run note', { timeout: 15000 });
    } catch {
      throw new Error(
        'NOTE DID NOT SURVIVE THE RETURN RUN — the note created on the first login was gone ' +
          'after logging out and back in.\n\n' +
        '--- DEMO logs ---\n' + demoLogs.join('\n') + '\n\n' +
        '--- POPUP (2nd login) uncaught exceptions ---\n' + popup2Full.errors.join('\n') + '\n\n' +
        '--- POPUP (2nd login) full console ---\n' + popup2Full.console.join('\n'),
      );
    }
  });
});
