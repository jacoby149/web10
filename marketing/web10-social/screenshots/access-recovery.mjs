// Social recovery + username help: real components/CSS, isolated data and stub auth transport. This is NOT a
// real-node consent round-trip or evidence that the reported login skip is fixed.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '../..');
const output = path.join(repo, '.context/access-recovery');
const social = 'http://localhost:4591';
const auth = 'http://localhost:4592';
const servers = [
  spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, env: { ...process.env, SCREENSHOT_PORT: '4591' }, stdio: 'inherit' }),
  spawn('bun', ['run', 'dev', '--port', '4592', '--strictPort'], { cwd: path.join(repo, 'ui'), stdio: 'inherit' }),
];
async function ready(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Server not ready: ${url}`);
}
let browser;
const receipts = [];
try {
  await fs.mkdir(output, { recursive: true });
  await Promise.all([ready(`${social}/screenshots/harness/index.html`), ready(auth)]);
  browser = await chromium.launch();
  for (const width of [1440, 375]) for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
    await context.route('**/*', route => {
      const url = route.request().url();
      return url.startsWith(social) || url.startsWith(auth) || url.startsWith('blob:') || url.startsWith('data:')
        ? route.continue() : route.fulfill({ json: { configured: true, telemetry: { enabled: false } } });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__popupBlocked = false;
      window.web10 = {
        createV3Client: () => ({ contractRequest: () => {} }),
        openAuthPortal: () => window.__popupBlocked ? null : window.open('about:blank', 'approval-fixture'),
      };
    });
    await page.goto(`${social}/screenshots/harness/index.html?screen=composer&approval=required`, { waitUntil: 'networkidle' });
    await page.getByTestId('composer-title').fill('A song worth sharing');
    await page.getByTestId('composer-textarea').fill('Recorded this one for the people who kept asking.');
    // An audio file drives the real attach/upload/post path without a decoder
    // fixture. Only duration probing is supplied, never the state under test.
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true,
        get() { return descriptor.get.call(this); },
        set(value) {
          descriptor.set.call(this, value);
          if (value && !this.dataset.fixtureProbed) {
            this.dataset.fixtureProbed = 'yes';
            Object.defineProperty(this, 'duration', { value: 12, configurable: true });
            queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
          }
        },
      });
    });
    await page.locator('input[type="file"][multiple]').setInputFiles({ name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('synthetic-audio-fixture') });
    await page.getByTestId('media-tray').waitFor();
    await page.getByTestId('post-submit').click();
    const recovery = page.getByTestId('composer-access-recovery');
    await recovery.waitFor();
    assert.match(await recovery.innerText(), /This app needs your approval to create posts/);
    assert.equal(await recovery.locator('code').innerText(), 'posts');
    await recovery.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, `composer-${theme}-${width}.png`), fullPage: true });
    await recovery.screenshot({ path: path.join(output, `recovery-card-${theme}-${width}.png`) });
    const popupPromise = page.waitForEvent('popup');
    await recovery.getByRole('button', { name: 'Allow access' }).click();
    const popup = await popupPromise;
    await popup.close(); // cancellation must not clear or auto-publish the draft
    await recovery.getByRole('button', { name: 'Try again' }).click();
    await recovery.waitFor();
    assert.equal(await page.getByTestId('composer-title').inputValue(), 'A song worth sharing');
    assert.equal(await page.getByTestId('composer-textarea').innerText(), 'Recorded this one for the people who kept asking.');
    assert.equal(await page.getByTestId('media-tray').count(), 1);
    assert.equal(await page.evaluate(() => (window.__mentionWrites || []).length), 0);
    await page.evaluate(() => { window.__popupBlocked = true; });
    await recovery.getByRole('button', { name: 'Allow access' }).click();
    await recovery.getByText(/Allow pop-ups/).waitFor();
    // Explicitly simulate the grant in the DATA fixture, not a real consent.
    await page.evaluate(() => sessionStorage.setItem('fixture:approved', 'yes'));
    await recovery.getByRole('button', { name: 'Try again' }).click();
    await recovery.waitFor({ state: 'detached' });
    assert.equal(await page.getByTestId('composer-title').inputValue(), '');
    assert.equal(await page.evaluate(() => window.__mentionWrites[0].text), 'Recorded this one for the people who kept asking.');

    await page.goto(auth, { waitUntil: 'networkidle' });
    await page.getByTestId('login-submit').waitFor();
    assert.match(await page.locator('#username-help').innerText(), /No spaces or underscores/);
    await page.screenshot({ path: path.join(output, `login-${theme}-${width}.png`), fullPage: true });
    await page.getByTestId('login-create-account').click();
    await page.getByTestId('signup-submit').waitFor();
    await page.screenshot({ path: path.join(output, `signup-${theme}-${width}.png`), fullPage: true });

    assert.deepEqual(errors, []);
    receipts.push({ width, theme, draftRetainedOnCancellation: true, popupBlockedGuidance: true, explicitRetry: true, usernameHelp: true, realNodeConsent: false });
    await context.close();
  }
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
  console.log(JSON.stringify(receipts, null, 2));
} finally {
  await browser?.close();
  for (const server of servers) server.kill('SIGTERM');
}
