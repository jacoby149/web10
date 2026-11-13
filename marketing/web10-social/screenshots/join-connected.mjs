// Join -> real auth app/signup/consent -> real SDK token -> usable feed.
// Self-booting local stack, disposable ClickHouse, no seeded browser session/grant.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SOCIAL_SERVICES, SOCIAL_OPERATIONS } from '../src/lib/socialContract.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const output = path.join(root, '.context/social-join-connected');
await mkdir(output, { recursive: true });
const container = `web10-join-${Date.now()}`;
const processes = [];
const logs = [];
const receipts = [];
let browser;
// Three genuine browser origins; only transport is forwarded to unprivileged
// loopback ports. The response bytes come from the real apps/node, not fixtures.
const ports = { 'api.localhost': 4592, 'auth.localhost': 4594, 'social.localhost': 4593 };
function start(command, args, cwd, env, label) {
  const log = createWriteStream(path.join(output, `${label}.log`));
  logs.push(log);
  const child = spawn(command, args, { cwd, detached: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  processes.push(child);
  return child;
}
async function waitFor(url, predicate = r => r.ok) {
  const deadline = Date.now() + 90000;
  for (;;) {
    try { if (await predicate(await fetch(url))) return; } catch {}
    if (Date.now() > deadline) throw new Error(`Startup timeout: ${url}`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function openJoin(page) {
  await page.goto('http://social.localhost/join');
  await page.getByTestId('join-button').waitFor();
  const opened = page.waitForEvent('popup');
  await page.getByTestId('join-button').click();
  const popup = await opened;
  await popup.setViewportSize({ width: Math.min(page.viewportSize().width, 480), height: 900 });
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(new URL(popup.url()).origin, 'http://auth.localhost');
  return popup;
}
async function assertEntered(page, popup, username, label, following = false) {
  await page.waitForURL(url => url.pathname === '/feed' && url.search === (following ? '?tab=following' : ''), { timeout: 30000 });
  await page.waitForFunction(() => window.web10.readTokenCookie() !== null);
  await page.getByTestId('posts-tab-row').waitFor();
  await popup.waitForEvent('close', { timeout: 10000 }).catch(error => { if (!popup.isClosed()) throw error; });
  // Session + live node authorization, not just a redirected address bar.
  const truth = await page.evaluate(async () => {
    const token = window.web10.readTokenCookie();
    const who = window.web10.decodeJwt(token);
    const response = await fetch('http://api.localhost/v3/app-contracts/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    });
    const contracts = await response.json();
    return { username: who?.username, status: response.status, contracts };
  });
  assert.equal(truth.username, username);
  assert.equal(truth.status, 200);
  const grant = truth.contracts.find(row => row.allowed_origin === 'http://social.localhost');
  assert.ok(grant, 'social contract persisted');
  assert.deepEqual(Object.keys(grant.permissions).sort(), [...SOCIAL_SERVICES].sort());
  for (const service of SOCIAL_SERVICES) {
    assert.deepEqual([...grant.permissions[service]].sort(), [...SOCIAL_OPERATIONS].sort(), `${service} permissions persisted`);
  }
  await page.reload();
  await page.getByTestId('posts-tab-row').waitFor();
  await page.getByTestId(following ? 'feed-empty' : 'discover-empty').waitFor({ timeout: 30000 });
  assert.equal(await page.getByTestId('posts-tab-following').isEnabled(), true);
  assert.equal(await page.getByTestId('new-post-fab').isEnabled(), true);
  assert.equal(new URL(page.url()).pathname, '/feed');
  await shot(page, `${label}-feed`);
  receipts.push({ label, username, fullContractPersisted: true, realTokenHandoff: true, feedAndReload: true, popupClosedAutomatically: true });
  console.log(`[join-connected] ${label}: real contract/token, automatic close, feed and reload passed`);
}
try {
  start('uv', ['run', '--frozen', 'python', '../marketing/web10-social/screenshots/join-api.py'], path.join(root, 'api'),
    { PYTHONPATH: '.', JOIN_TEST_CONTAINER: container }, 'node');
  start('bunx', ['vite', '--host', '127.0.0.1', '--port', '4594', '--strictPort'], path.join(root, 'ui'),
    { REACT_APP_DEFAULT_API: 'api.localhost', REACT_APP_API_ORIGIN: 'http://api.localhost', REACT_APP_VERIFY_REQUIRED: 'false' }, 'auth');
  start('bunx', ['vite', '--host', '127.0.0.1', '--port', '4593', '--strictPort'], path.join(root, 'marketing/web10-social'),
    { VITE_API_ORIGIN: 'http://api.localhost', VITE_AUTH_ORIGIN: 'http://auth.localhost' }, 'social');
  await Promise.all([waitFor('http://127.0.0.1:4592/ready'), waitFor('http://127.0.0.1:4594'), waitFor('http://127.0.0.1:4593')]);
  browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1'] });
  for (const width of [1440, 375]) {
    console.log(`[join-connected] starting ${width}px signup/return/password journeys`);
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    context.setDefaultTimeout(20000);
    const forwardingErrors = [];
    // No production nodes, vendor sends, media or third-party requests.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (Object.hasOwn(ports, url.hostname)) {
        const upstream = `http://127.0.0.1:${ports[url.hostname]}${url.pathname}${url.search}`;
        try {
          const response = await route.fetch({ url: upstream, maxRedirects: 0 });
          return await route.fulfill({ response });
        } catch (error) {
          if (/disposed|has been closed|already handled/.test(error.message)) return;
          forwardingErrors.push(`${url.pathname}: ${error.message.split('\n')[0]}`);
          await route.abort().catch(() => {});
          return;
        }
      }
      return route.abort();
    });
    const page = await context.newPage();
    const username = `join${width}-${Date.now()}`;
    const password = 'IsolatedJoinTest123!';
    let popup = await openJoin(page);
    await popup.getByTestId('login-submit').waitFor();
    await popup.close();
    assert.equal(new URL(page.url()).pathname, '/join');
    assert.equal(await page.evaluate(() => window.web10.readTokenCookie()), null);
    popup = await openJoin(page);
    await popup.getByTestId('login-create-account').click();
    await popup.getByTestId('username-input').fill(username);
    await popup.getByTestId('password-input').fill(password);
    await popup.locator('#retypepass').fill(password);
    await popup.locator('#contact').fill('join-test@example.invalid');
    await popup.getByTestId('signup-submit').click();
    await popup.getByTestId('consent-approve-all').waitFor({ timeout: 30000 });
    await popup.getByTestId('consent-details-0').click();
    await popup.getByText('web10-social-playlist-bookmarks', { exact: false }).first().waitFor();
    await shot(popup, `signup-${width}-consent`);
    await popup.getByTestId('consent-approve-all').click();
    await assertEntered(page, popup, username, `signup-${width}`);

    // Return run, with only the genuine auth-origin session retained. No cookie
    // injection: clear the social session, return through the same Join button.
    await context.clearCookies({ domain: 'social.localhost' });
    popup = await openJoin(page);
    await popup.getByTestId('consent-continue-as').click();
    await assertEntered(page, popup, username, `return-${width}`);

    // Password login from a signed-out browser state, retaining only the
    // account/grant created through the preceding real UI journey.
    await context.clearCookies();
    popup = await openJoin(page);
    await popup.getByTestId('account-picker-other').click();
    await popup.getByTestId('username-input').fill(username);
    await popup.getByTestId('password-input').fill(password);
    await popup.getByTestId('login-submit').click();
    await assertEntered(page, popup, username, `login-${width}`);

    // The new contextual invitation must return to the requested Following
    // tab, not discard it or load personal data while still signed out.
    await context.clearCookies({ domain: 'social.localhost' });
    await page.goto('http://social.localhost/feed?tab=following');
    await page.getByTestId('sign-in-prompt-following').waitFor();
    const followingPopup = page.waitForEvent('popup');
    await page.getByTestId('sign-in-button-following').click();
    popup = await followingPopup;
    await popup.setViewportSize({ width: Math.min(width, 480), height: 900 });
    await popup.getByTestId('consent-continue-as').click();
    await assertEntered(page, popup, username, `following-${width}`, true);
    assert.deepEqual(forwardingErrors, []);
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify({ receipts,
    scope: 'real local browser, authenticator, SDK, FastAPI and disposable ClickHouse; no phone/email vendor or production claim' }, null, 2));
  console.log('[join-connected] signup + return + contextual Following through real contracts/token/feed passed at desktop and 375px');
} finally {
  await browser?.close();
  const exits = processes.map(child => child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve)));
  for (const child of processes) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
  await Promise.all(exits);
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  assert.notEqual(spawnSync('docker', ['inspect', container], { stdio: 'ignore' }).status, 0, 'disposable node removed');
  for (const log of logs) log.end();
}
