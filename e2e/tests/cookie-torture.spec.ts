import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * COOKIE TORTURE — the scenarios our clean-context e2e suite never touches.
 *
 * Every other e2e test runs in a FRESH Playwright context: zero cookies. A real
 * browser carries the `token=` cookie across visits, on TWO domains
 * (marketing.localhost for the demo, auth.localhost for the popup). The SDK's
 * return-run fast path skips the popup when a token cookie exists; the popup
 * restores ITS OWN session from its own cookie; the demo auto-inits from ITS
 * cookie. When those three pieces of persisted state disagree, the behavior is
 * the "glitchy, unpredictable, asks me to approve over and over" a real user
 * hits — and a clean-context test can never reproduce it.
 *
 * Each test below seeds persistent cookies the way a returning browser would,
 * then asserts the CORRECT behavior. A red here is a discovered bug.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function setTokenCookie(context: any, domain: string, token: string) {
  await context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

function captureFull(page: Page): { console: string[]; errors: string[] } {
  const console: string[] = [];
  const errors: string[] = [];
  page.on('console', (m) => console.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(String(e)));
  return { console, errors };
}

function demoLogsOf(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[notes-demo]') || t.includes('[wapi]')) logs.push(t);
  });
  return logs;
}

async function grantContract(request: APIRequestContext, token: string, origin: string) {
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: origin, permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] } }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
}

async function revokeContract(request: APIRequestContext, token: string, origin: string) {
  await request.post(`${API_BASE}/v3/app-contracts/revoke`, {
    data: JSON.stringify({ token, allowed_origin: origin }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
}

async function createGroup(request: APIRequestContext, token: string, username: string) {
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
}

async function writeNote(request: APIRequestContext, token: string, username: string, text: string) {
  await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: 'notes',
      body: { note: text, date: new Date().toISOString() },
      groups: [`api.localhost/groups/users/${username}/notes-${username}`],
    }),
    headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
  });
}

/**
 * A "previous visit": the user fully logged in as `username` through the real
 * popup, so the demo cookie, the popup cookie, the app contract, the group, and
 * a note all exist for that user. Returns the demo page (still open).
 */
async function previousVisit(
  context: any,
  request: APIRequestContext,
  username: string,
): Promise<{ page: Page; token: string; logs: string[] }> {
  // The caller has already signed `username` up. Log in to get a token.
  const login = await request.post(`${API_BASE}/v3/login`, {
    data: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(login.ok()).toBeTruthy();
  const realToken = (await login.json()).token as string;

  await grantContract(request, realToken, MARKETING_BASE);
  await createGroup(request, realToken, username);
  await writeNote(request, realToken, username, `note from ${username}`);
  await setTokenCookie(context, 'auth.localhost', realToken);
  await setTokenCookie(context, 'marketing.localhost', realToken);

  const page = await context.newPage();
  const logs = demoLogsOf(page);
  await page.goto(`${MARKETING_BASE}/docs/notes/`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });
  await expect(page.locator('.note').first()).toBeVisible({ timeout: 15000 });
  return { page, token: realToken, logs };
}

test.describe('Cookie torture — persistent-state scenarios clean-context tests never see', () => {
  test('baseline: clean return run restores session, note loads, NO re-prompt', async ({ context, request }) => {
    const username = uniqueUser('base');
    await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551230101' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { page } = await previousVisit(context, request, username);

    // The return run: reload with the persistent cookies. No popup, no re-prompt.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 15000 });
  });

  test('return run, contract revoked between visits: demo recovers via Fix access, still the same user', async ({ context, request }) => {
    const username = uniqueUser('revk');
    await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551230102' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { page, token, logs } = await previousVisit(context, request, username);

    // Between visits, the contract is lost (revoked).
    await revokeContract(request, token, MARKETING_BASE);

    // Return run: the demo auto-inits, the read 403s, Fix access appears.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 15000 });

    // Recover through the REAL popup.
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#fixAccessBtn').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();

    // The note comes back AND the demo is still the same user.
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 15000 });
    const cookie = await page.evaluate(() => document.cookie);
    const demoToken = (cookie.match(/token=([^;]+)/) || [])[1] || '';
    const demoUser = demoToken
      ? JSON.parse(Buffer.from(demoToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).username
      : '(none)';
    expect(demoUser, `recovery switched the user: expected ${username}, got ${demoUser}`).toBe(username);
    expect(popupFull.errors, popupFull.console.join('\n')).toEqual([]);
    void logs;
  });

  test('IDENTITY: a stale popup session for a DIFFERENT user must not hijack the demo', async ({ context, request }) => {
    // User A is the one using the demo. User B is a stale session sitting in
    // the popup's cookie (e.g. logged in as B in the popup earlier).
    const userA = uniqueUser('usera');
    const userB = uniqueUser('userb');
    for (const u of [userA, userB]) {
      await request.post(`${API_BASE}/v3/signup`, {
        data: JSON.stringify({ username: u, password, phone: '+15551230103' }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const { page, token: tokenA } = await previousVisit(context, request, userA);

    // The popup now holds B's session (stale), the demo still holds A's.
    const loginB = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username: userB, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    const tokenB = (await loginB.json()).token as string;
    await setTokenCookie(context, 'auth.localhost', tokenB);

    // A's contract is lost, so the demo's read fails and Fix access appears.
    await revokeContract(request, tokenA, MARKETING_BASE);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 15000 });

    // Recover. The popup restores B and will grant the contract to B and hand
    // back B's token — silently switching the demo's identity from A to B.
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#fixAccessBtn').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle');
    // D42: the mismatch (popup's B ≠ opener's A) shows the request unfiltered
    // plus a notice — never "all set", never the auto-complete.
    await popup.locator('[data-testid="consent-req-0"], [data-testid="consent-mismatch"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const row = popup.locator('[data-testid="consent-req-0"]');
    if (await row.count()) await row.locator('[data-testid="consent-approve-0"]').click();
    // D42: the Close-window button is gone. The token handoff — the seam the
    // identity check guards — now happens on "continue": Approve all & continue
    // calls goToApp, which posts the popup's (B's) token back to the demo and
    // self-closes. The demo's authListen must reject B's token (it acts as A).
    await popup.locator('[data-testid="consent-approve-all"]').click();
    await popup.waitForEvent('close', { timeout: 5000 });
    await page.waitForTimeout(500);

    // THE assertion: the demo must still be user A — the person using it.
    // (Red = the popup's stale B session hijacked the demo's identity.)
    const cookie = await page.evaluate(() => document.cookie);
    const demoToken = (cookie.match(/token=([^;]+)/) || [])[1] || '';
    const demoUser = demoToken ? JSON.parse(Buffer.from(demoToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).username : '(none)';
    expect(demoUser, `demo identity was hijacked: expected ${userA}, got ${demoUser}`).toBe(userA);
  });

  test('DIVERGENCE: popup says "all set" for its user while the demo is a different user with no contract', async ({ context, request }) => {
    const userA = uniqueUser('diva');
    const userB = uniqueUser('divb');
    for (const u of [userA, userB]) {
      await request.post(`${API_BASE}/v3/signup`, {
        data: JSON.stringify({ username: u, password, phone: '+15551230104' }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // A has the full setup (contract + group + note). The demo, however, is
    // holding B's cookie — B has nothing.
    const { token: tokenA } = await previousVisit(context, request, userA);
    const loginB = await request.post(`${API_BASE}/v3/login`, {
      data: JSON.stringify({ username: userB, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    const tokenB = (await loginB.json()).token as string;
    await setTokenCookie(context, 'marketing.localhost', tokenB); // demo thinks it's B
    // popup still A (from previousVisit)

    const page = await context.newPage();
    await page.goto(`${MARKETING_BASE}/docs/notes/`);
    await page.waitForLoadState('networkidle');
    // Demo auto-inits as B → B has no contract → read 403s → Fix access.
    await expect(page.locator('#fixAccessBtn')).toBeVisible({ timeout: 15000 });

    // Click Fix access. The popup restores A, sees A already has the contract,
    // and shows "all set" — even though the DEMO is B and has none.
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#fixAccessBtn').click();
    const popup = await popupPromise;
    const popupFull = captureFull(popup);
    await popup.waitForLoadState('networkidle');
    await popup.locator('[data-testid="consent-req-0"], [data-testid="consent-allset"]').first().waitFor({ state: 'visible', timeout: 15000 });

    // THE assertion: the popup must NOT show "all set" when the demo's user has
    // no contract. (Red = the two cookie domains diverged and the popup
    // answered for the wrong user.)
    const allset = await popup.locator('[data-testid="consent-allset"]').count();
    expect(allset, 'popup showed "all set" for its own user while the demo is a different user with no contract').toBe(0);
    void tokenA;
    expect(popupFull.errors).toEqual([]);
  });

  test('RE-LOGIN LOOP: log out then log in again must settle, not re-prompt forever', async ({ context, request }) => {
    const username = uniqueUser('loop');
    await request.post(`${API_BASE}/v3/signup`, {
      data: JSON.stringify({ username, password, phone: '+15551230105' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { page } = await previousVisit(context, request, username);

    // Log out (scrubs the demo cookie; the popup cookie survives).
    await page.locator('#authButton').click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log in', { timeout: 15000 });

    // Log back in. D42: the login popup is an automatic handshake — the app
    // contract is already granted (previousVisit), so the popup auto-completes:
    // it hands back the token and closes itself, zero UI (no consent row, no
    // Close-window button). The group contract is lazy — a successful read is
    // the confirmation, so there is no second popup. The flow settles by the
    // demo becoming signed-in and the popup closing. If a consent row DID
    // appear (contract not yet granted), drive it to completion instead.
    let popupsSeen = 0;
    const onPopup = () => {
      popupsSeen++;
    };
    context.on('page', onPopup);

    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#authButton').click();
    const popup = await popupPromise;
    // Do NOT wait for the popup's networkidle — the auto-complete may close the
    // popup first, and that is the expected D42 behavior.

    for (let i = 0; i < 20; i++) {
      // Settled? (the auto-complete handed the token back — demo is signed in)
      if ((await page.locator('#authButton').textContent().catch(() => ''))?.trim() === 'log out') break;
      // Otherwise, is there a consent row to approve? (first-login path)
      const row = popup.locator('[data-testid="consent-req-0"]');
      const rowCount = await row.count().catch(() => 0);
      if (rowCount > 0) {
        await row.locator('[data-testid="consent-approve-0"]').click().catch(() => {});
      }
      await page.waitForTimeout(500);
    }
    context.off('page', onPopup);

    // THE assertion: the demo settles signed-in with the note, and the flow did
    // not spawn an unbounded number of popups / re-prompts.
    await expect(page.locator('#authButton')).toHaveText('log out', { timeout: 15000 });
    await expect(page.locator('.note').first()).toBeVisible({ timeout: 15000 });
    expect(popupsSeen, `re-login spawned ${popupsSeen} popups — should be 1`).toBeLessThanOrEqual(1);
  });
});
