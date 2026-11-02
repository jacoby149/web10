import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// Paper evidence: screenshots are captured along the way (the operator's
// ask). They are evidence, not a pass/fail gate — a screenshot failure must
// not fail the interoperability assertions.
const shotDir = process.env.INTEROP_SHOT_DIR || join(here, '..', '..', '.context', 'interop-screenshots');
async function shot(page: Page, name: string) {
  try {
    mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: true });
  } catch (error) {
    console.warn(`[interop-demo] screenshot ${name} failed`, error);
  }
}

async function signupFreshUser(request: APIRequestContext): Promise<{ username: string; token: string }> {
  const username = uniqueUser('interop');
  await request.post(`${API_BASE}/v3/signup`, {
    data: JSON.stringify({ username, password }),
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

async function api(request: APIRequestContext, path: string, data: object, origin: string, status = 200) {
  const res = await request.post(`${API_BASE}${path}`, {
    data: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json', Origin: origin },
  });
  expect(res.status(), `${path} -> ${res.status()}: ${await res.text()}`).toBe(status);
  return res.json();
}

// The social app's bootstrap profile grant: an open followers group whose
// reader role grants profile readAll to anyone. This is what makes a user's
// social-written profile readable to an independent app.
async function ensureSocialProfileGrant(request: APIRequestContext, token: string, username: string) {
  const groups = await api(request, '/v3/groups/list', { token }, AUTH_BASE);
  const followers = (groups as any[]).find(g => g.name === 'followers');
  if (followers) return followers.group_id as string;
  const group = await api(request, '/v3/groups/create', {
    token,
    name: 'followers',
    join_policy: 'open',
    roles: [
      { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] } },
      { name: 'member', permissions: { posts: ['readAll'] } },
      { name: 'reader', permissions: { profile: ['readAll'] } },
    ],
    members: [{ member_key: username, role: 'owner' }, { member_key: 'anyone', role: 'reader' }],
  }, AUTH_BASE);
  return group.group_id as string;
}

async function waitForProfile(request: APIRequestContext, token: string, username: string, group: string) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const docs = await api(request, '/v3/read', { token, service: 'profile', groups: [group] }, AUTH_BASE);
    if ((docs as any[]).some(d => d.author_key === username)) return docs as any[];
    if (Date.now() > deadline) throw new Error('social-written profile never became readable');
    await new Promise(r => setTimeout(r, 500));
  }
}

async function grantAppContract(request: APIRequestContext, token: string, origin: string, service: string) {
  await api(request, '/v3/app-contracts/add', {
    token,
    allowed_origin: origin,
    permissions: { [service]: ['create', 'readAll'], profile: ['readAll'] },
  }, AUTH_BASE);
}

// Real social login through the authenticator popup — the profile document is
// written by web10-social itself, which is the whole point of the join.
async function socialLogin(page: Page, username: string) {
  await page.goto(`${SOCIAL_BASE}/`);
  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('sign-in-button-desktop').click();
  const authPopup = await popupPromise;
  await authPopup.waitForURL('http://auth.localhost/**');
  await authPopup.locator('#username').fill(username);
  await authPopup.locator('#password').fill(password);
  await authPopup.getByTestId('login-submit').click();
  await authPopup.getByTestId('consent-approve-all').click({ timeout: 15_000 }).catch(() => {});
  await authPopup.waitForEvent('close').catch(() => {});
}

test.describe('Interoperability demos — Snake + Marketplace on the marketing UI', () => {
  test('snake: save an earned score, leaderboard joins the social profile', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    const followers = await ensureSocialProfileGrant(request, token, username);
    await setTokenCookie(context, 'social.localhost', token);
    await socialLogin(page, username);
    const profile = await waitForProfile(request, token, username, followers);
    expect(profile[0].body.display_name).toBe(username);
    await shot(page, '01-social-profile-written');

    // The independent app: cookie + scoped contract for the snake origin.
    await setTokenCookie(context, 'marketing.localhost', token);
    await setTokenCookie(context, 'auth.localhost', token);
    const snakeOrigin = `${MARKETING_BASE}/docs/snake`;
    await grantAppContract(request, token, snakeOrigin, 'snake_scores');

    await page.goto(`${snakeOrigin}/`);
    await expect(page.getByTestId('auth-button')).toHaveText('Authorize access', { timeout: 15_000 });
    await page.getByTestId('auth-button').click();
    await expect(page.getByTestId('status')).toContainText(/leaderboard loaded|no readable scores/i, { timeout: 20_000 });
    await shot(page, '02-snake-logged-in');

    // Play one real run: start, steer into a wall, earn at least one dot.
    await page.getByTestId('snake-start').click();
    await page.getByTestId('snake-board').focus();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const state = (await page.getByTestId('snake-state').textContent()) ?? '';
      if (/game over/i.test(state)) break;
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
    }
    await expect(page.getByTestId('snake-state')).toContainText(/game over/i, { timeout: 10_000 });
    const earned = Number((await page.getByTestId('snake-score').textContent()) ?? '0');
    expect(earned).toBeGreaterThan(0);
    await shot(page, '03-snake-game-over');

    await page.getByTestId('snake-submit').click();
    await expect(page.getByTestId('status')).toContainText(/score saved/i, { timeout: 20_000 });
    await page.getByTestId('refresh').click();
    const row = page.getByTestId('snake-leaderboard-row').first();
    await expect(row).toContainText(String(earned), { timeout: 20_000 });
    await expect(row.getByTestId('identity-name')).toHaveText(username);
    await shot(page, '04-snake-leaderboard-joined');

    // The join is real: the same profile document social wrote is readable
    // through the app's contract, and the query layer enforces it.
    const groups = await api(request, '/v3/groups/list', { token }, AUTH_BASE);
    const snakeGroup = (groups as any[]).find(g => g.name === 'demo-snake-scores');
    expect(snakeGroup, 'snake demo group missing').toBeTruthy();
    const rows = await api(request, '/v3/query', {
      token,
      groups: [snakeGroup.group_id, followers],
      sql: `SELECT s.doc_id, s.author_key, s.body, p.body AS profile_body
        FROM snake_scores s LEFT JOIN profile p ON s.author_key = p.author_key
        ORDER BY JSONExtractInt(s.body, 'score') DESC LIMIT 50`,
    }, snakeOrigin);
    const joined = (rows as any).rows as any[];
    expect(joined.length).toBeGreaterThanOrEqual(1);
    expect(joined[0].author_key).toBe(username);
    expect(JSON.parse(joined[0].profile_body).display_name).toBe(username);
  });

  test('marketplace: publish a listing, seller identity joins the social profile', async ({ page, context, request }) => {
    const { username, token } = await signupFreshUser(request);
    const followers = await ensureSocialProfileGrant(request, token, username);
    await setTokenCookie(context, 'social.localhost', token);
    await socialLogin(page, username);
    const profile = await waitForProfile(request, token, username, followers);
    expect(profile[0].body.display_name).toBe(username);
    await shot(page, '05-marketplace-social-profile-written');

    await setTokenCookie(context, 'marketing.localhost', token);
    await setTokenCookie(context, 'auth.localhost', token);
    const marketOrigin = `${MARKETING_BASE}/docs/marketplace`;
    await grantAppContract(request, token, marketOrigin, 'marketplace_listings');

    await page.goto(`${marketOrigin}/`);
    await expect(page.getByTestId('auth-button')).toHaveText('Authorize access', { timeout: 15_000 });
    await page.getByTestId('auth-button').click();
    await expect(page.getByTestId('marketplace-title')).toBeEnabled({ timeout: 20_000 });
    await shot(page, '06-marketplace-logged-in');

    const title = `Interop test listing ${Date.now()}`;
    await page.getByTestId('marketplace-title').fill(title);
    await page.getByTestId('marketplace-price').fill('19.99');
    await page.getByTestId('marketplace-description').fill('Cross-app identity join: seller profile written by web10-social.');
    await page.getByTestId('marketplace-publish').click();
    await expect(page.getByTestId('status')).toContainText(/listing published/i, { timeout: 20_000 });
    await page.getByTestId('refresh').click();
    const card = page.getByTestId('marketplace-listing').filter({ hasText: title }).first();
    await expect(card).toContainText('$19.99', { timeout: 20_000 });
    await expect(card.getByTestId('identity-name')).toHaveText(username);
    await shot(page, '07-marketplace-listing-with-seller');

    // The join is real: the listing (app data) joined to the social-written
    // profile through the same permission-enforced query layer.
    const groups = await api(request, '/v3/groups/list', { token }, AUTH_BASE);
    const marketGroup = (groups as any[]).find(g => g.name === 'demo-marketplace-listings');
    expect(marketGroup, 'marketplace demo group missing').toBeTruthy();
    const rows = await api(request, '/v3/query', {
      token,
      groups: [marketGroup.group_id, followers],
      sql: `SELECT l.doc_id, l.author_key, l.body, p.body AS profile_body
        FROM marketplace_listings l LEFT JOIN profile p ON l.author_key = p.author_key
        ORDER BY l.created_at DESC LIMIT 50`,
    }, marketOrigin);
    const joined = (rows as any).rows as any[];
    expect(joined.length).toBeGreaterThanOrEqual(1);
    expect(joined[0].author_key).toBe(username);
    expect(JSON.parse(joined[0].profile_body).display_name).toBe(username);
  });
});
