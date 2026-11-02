import { test, expect, type APIRequestContext, type Page } from '../../e2e/playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = process.env.E2E_HTTP_PORT || '80';
const suffix = port === '80' ? '' : `:${port}`;
export const API_BASE = `http://api.localhost${suffix}`;
export const AUTH_BASE = `http://auth.localhost${suffix}`;
export const SOCIAL_BASE = `http://social.localhost${suffix}`;
export const MARKETING_BASE = `http://marketing.localhost${suffix}`;
export const password = 'SyntheticDemo123!';

export async function api(request: APIRequestContext, path: string, data: object, origin = AUTH_BASE, status = 200) {
  const response = await request.post(`${API_BASE}${path}`, { data, headers: { Origin: origin } });
  expect(response.status(), `${path}: expected HTTP ${status}`).toBe(status);
  return response.json();
}

export async function signup(request: APIRequestContext, prefix: string) {
  const username = `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const response = await request.post(`${API_BASE}/v3/signup`, { data: { username, password } });
  expect(response.ok(), 'synthetic account signup').toBe(true);
  const login = await request.post(`${API_BASE}/v3/login`, { data: { username, password } });
  expect(login.ok(), 'synthetic account verification login').toBe(true);
  const { token } = await login.json();
  expect(typeof token).toBe('string');
  return { username, token };
}

export async function shot(page: Page, name: string, selector?: string) {
  const directory = join(process.env.INTEROP_SHOT_DIR || join(dirname(fileURLToPath(import.meta.url)), '../../.context/interoperability-demo/screenshots'), test.info().project.name);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${name}.png`);
  if (selector) await page.locator(selector).screenshot({ path, animations: 'disabled' });
  else await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}

async function consent(popup: Page, username: string, screenshot?: string) {
  await popup.waitForURL(url => url.origin === AUTH_BASE);
  const continueAs = popup.getByTestId('consent-continue-as');
  const login = popup.getByTestId('login-submit');
  const row = popup.getByTestId('consent-req-0');
  await expect(login.or(continueAs).or(row).first()).toBeVisible({ timeout: 20_000 });
  if (await login.isVisible()) {
    await popup.locator('#username').fill(username);
    await popup.locator('#password').fill(password);
    await login.click();
  } else if (await continueAs.isVisible()) {
    await continueAs.click();
  }
  await expect(row).toBeVisible({ timeout: 20_000 });
  if (screenshot) await shot(popup, screenshot);
  const closed = popup.waitForEvent('close', { timeout: 20_000 });
  await popup.getByTestId('consent-approve-all').click();
  await closed;
}

export async function socialLogin(page: Page, user: { username: string }) {
  await page.goto(`${SOCIAL_BASE}/`);
  const opened = page.waitForEvent('popup', { timeout: 20_000 });
  await page.locator('[data-testid^="sign-in-button-"]:visible').click();
  await consent(await opened, user.username);
  await expect(page.locator('[data-testid^="sign-in-button-"]:visible')).toHaveCount(0);
}

export async function approveApp(page: Page, user: { username: string }, screenshot: string) {
  await expect(page.getByTestId('auth-button')).toHaveText('Log in');
  const opened = page.waitForEvent('popup', { timeout: 20_000 });
  await page.getByTestId('auth-button').click();
  await consent(await opened, user.username, screenshot);
}

test.beforeEach(async ({ context }) => {
  // Never let a synthetic research browser fall back to the production node.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
      ? route.continue() : route.abort('blockedbyclient');
  });
  await context.addInitScript(() => {
    const deny = function () { throw new Error('RTC is outside the interoperability demo'); };
    Object.defineProperty(window, 'RTCPeerConnection', { value: deny });
    Object.defineProperty(window, 'webkitRTCPeerConnection', { value: deny });
  });
});
