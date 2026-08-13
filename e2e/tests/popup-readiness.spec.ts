import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SDK_BASE = `http://sdk.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('popup');
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

async function setTokenCookie(context: BrowserContext, domain: string, token: string) {
  await context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

// ---------------------------------------------------------------------------
// Popup readiness: auth_ready → contract → consent → response
// ---------------------------------------------------------------------------
test.describe('Popup readiness flow', () => {
  test('popup broadcasts auth_ready, contract is delivered, consent renders, approve sends response', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'sdk.localhost', token);
    await setTokenCookie(context, 'auth.localhost', token);

    // Open the groups demo
    await page.goto(`${SDK_BASE}/demos/groups/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');

    // Navigate to Create tab
    await page.locator('.tabs button').filter({ hasText: 'Create' }).click();
    const groupName = `popup-e2e-${Date.now()}`;
    await page.locator('#groupName').fill(groupName);

    // Collect messages between popup and opener
    const popupMessages: string[] = [];
    const openerMessages: string[] = [];

    // Intercept postMessage on the opener (main page)
    await page.evaluate(() => {
      (window as any)._msgLog = [];
      window.addEventListener('message', (e) => {
        (window as any)._msgLog.push(JSON.stringify(e.data));
      });
    });

    // Open the auth popup
    const popupPromise = context.waitForEvent('page', { timeout: 10000 });
    await page.locator('button:has-text("Create Group")').click();
    const popup = await popupPromise;

    // Intercept postMessage on the popup
    await popup.evaluate(() => {
      (window as any)._msgLog = [];
      window.addEventListener('message', (e) => {
        (window as any)._msgLog.push(JSON.stringify(e.data));
      });
    });

    // Wait for popup to load React
    await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });

    // Wait for auth_ready to arrive at the opener — this proves the popup
    // broadcast reached the SDK. Use a short timeout because auth_ready
    // fires immediately on mount (and every 1s after).
    await page.waitForFunction(
      () => (window as any)._msgLog?.some((m: string) => JSON.parse(m).type === 'auth_ready'),
      { timeout: 3000 },
    );

    // Wait for the contract message to arrive at the popup — this proves
    // the SDK waited for auth_ready before sending.
    await popup.waitForFunction(
      () => (window as any)._msgLog?.some((m: string) => JSON.parse(m).type === 'contract'),
      { timeout: 5000 },
    );

    // Wait for consent view to render — the contract was delivered and
    // React rendered the approval UI.
    await popup.waitForSelector('[data-testid="consent-approve-all"]', { timeout: 5000 });

    // Verify the group name appears in the consent view
    await expect(popup.locator(`text=${groupName}`)).toBeVisible({ timeout: 5000 });

    // Approve
    await popup.locator('[data-testid="consent-approve-all"]').click();

    // Wait for contract_response to arrive at the opener
    await page.waitForFunction(
      () => (window as any)._msgLog?.some((m: string) => JSON.parse(m).type === 'contract_response'),
      { timeout: 5000 },
    );

    // Verify the response status
    const responseMsg = await page.evaluate(() => {
      const log = (window as any)._msgLog as string[];
      return JSON.parse(log.find((m: string) => JSON.parse(m).type === 'contract_response')!);
    });
    expect(responseMsg.status).toBe('approved');

    // Verify group was created via API
    const groupsRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    expect(groupsRes.ok()).toBeTruthy();
    const groups = await groupsRes.json();
    const found = groups.find((g: any) => g.group_id.includes(groupName));
    expect(found).toBeTruthy();
  });

  test('contract delivered even when contractRequest fires after popup is already open', async ({ page, context, request }) => {
    // Simulate: popup opens, user logs in (already logged in), then clicks
    // "Create Group" — contractRequest must still deliver via auth_ready broadcast.
    const { username, token } = await signupFreshUser(request);
    await setTokenCookie(context, 'sdk.localhost', token);
    await setTokenCookie(context, 'auth.localhost', token);

    await page.goto(`${SDK_BASE}/demos/groups/`);
    await page.waitForLoadState('networkidle');

    // Intercept messages
    await page.evaluate(() => {
      (window as any)._msgLog = [];
      window.addEventListener('message', (e) => {
        (window as any)._msgLog.push(JSON.stringify(e.data));
      });
    });

    await page.locator('.tabs button').filter({ hasText: 'Create' }).click();
    const groupName = `late-cr-${Date.now()}`;
    await page.locator('#groupName').fill(groupName);

    const popupPromise = context.waitForEvent('page', { timeout: 10000 });
    await page.locator('button:has-text("Create Group")').click();
    const popup = await popupPromise;

    await popup.evaluate(() => {
      (window as any)._msgLog = [];
      window.addEventListener('message', (e) => {
        (window as any)._msgLog.push(JSON.stringify(e.data));
      });
    });

    await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });

    // Wait for auth_ready broadcast (should arrive within 1s)
    await page.waitForFunction(
      () => (window as any)._msgLog?.some((m: string) => JSON.parse(m).type === 'auth_ready'),
      { timeout: 3000 },
    );

    // Wait for contract to arrive at popup
    await popup.waitForFunction(
      () => (window as any)._msgLog?.some((m: string) => JSON.parse(m).type === 'contract'),
      { timeout: 5000 },
    );

    // Consent should render
    await popup.waitForSelector('[data-testid="consent-approve-all"]', { timeout: 5000 });
    await expect(popup.locator(`text=${groupName}`)).toBeVisible({ timeout: 5000 });

    // Approve and verify response
    await popup.locator('[data-testid="consent-approve-all"]').click();
    await page.waitForFunction(
      () => (window as any)._msgLog?.some((m: string) => JSON.parse(m).type === 'contract_response'),
      { timeout: 5000 },
    );

    const responseMsg = await page.evaluate(() => {
      const log = (window as any)._msgLog as string[];
      return JSON.parse(log.find((m: string) => JSON.parse(m).type === 'contract_response')!);
    });
    expect(responseMsg.status).toBe('approved');

    // Verify group exists
    const groupsRes = await request.post(`${API_BASE}/v3/groups/list`, { data: { token } });
    expect(groupsRes.ok()).toBeTruthy();
    const groups = await groupsRes.json();
    const found = groups.find((g: any) => g.group_id.includes(groupName));
    expect(found).toBeTruthy();
  });
});
