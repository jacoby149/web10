// Actual app/CSS with isolated node responses. No account creation or live auth.
import { chromium } from '../../e2e/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '..', '.context', 'auth-appearance');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4582);
const origin = `http://localhost:${port}`;
const key = 'web10-auth:theme';
const server = spawn('bun', ['run', 'dev', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let browser;
const receipts = [];
const capture = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
async function isolated(context) {
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() :
    route.fulfill({ json: { configured: true, telemetry: { enabled: false }, users: [], domains: [], status: 'ok' } }));
}
async function theme(page, expected) {
  await page.waitForFunction(value => document.documentElement.dataset.theme === value, expected);
  const state = await page.evaluate(() => ({
    scheme: document.documentElement.style.colorScheme,
    meta: document.querySelector('meta[name="theme-color"]').content,
    background: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(),
  }));
  assert.equal(state.scheme, expected);
  assert.equal(state.meta, expected === 'dark' ? '#09090b' : '#fafafa');
  assert.equal(state.background, state.meta);
}
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Appearance server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const width of [1440, 375]) for (const mode of ['dark', 'light']) {
    const context = await browser.newContext({ colorScheme: mode, viewport: { width, height: 900 } });
    await isolated(context);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?mock=1&mock_mode=settings`, { waitUntil: 'networkidle' });
    await page.getByTestId('appearance-settings').waitFor();
    await theme(page, mode);
    assert.equal(await page.getByRole('radio', { name: 'System', exact: true }).isChecked(), true);
    const logo = page.getByTestId('brand-logo').filter({ visible: true });
    assert.equal(await logo.getAttribute('src'), mode === 'dark' ? '/keys-mark.png' : '/keys-mark-dark.png');
    assert.ok(await logo.evaluate(el => el.complete && el.naturalWidth > 0), 'configured artwork decoded');
    const artwork = await page.evaluate(async () => {
      const read = async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
      };
      const [white, dark] = await Promise.all([read('/keys-mark.png'), read('/keys-mark-dark.png')]);
      let alphaDifferences = 0, badOpaquePixels = 0;
      for (let i = 0; i < white.data.length; i += 4) {
        if (white.data[i + 3] !== dark.data[i + 3]) alphaDifferences++;
        if (dark.data[i + 3] === 255 && (dark.data[i] !== 24 || dark.data[i + 1] !== 24 || dark.data[i + 2] !== 27)) badOpaquePixels++;
      }
      return { alphaDifferences, badOpaquePixels, dimensionsMatch: white.width === dark.width && white.height === dark.height };
    });
    assert.deepEqual(artwork, { alphaDifferences: 0, badOpaquePixels: 0, dimensionsMatch: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await capture(page, `settings-${mode}-${width}`);
    // Native radios support keyboard selection; this exercises the actual UI.
    await page.getByRole('radio', { name: 'System', exact: true }).focus();
    await page.keyboard.press('ArrowRight'); await theme(page, 'light');
    await page.keyboard.press('ArrowRight'); await theme(page, 'dark');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), 'dark');
    await page.emulateMedia({ colorScheme: 'light' }); await theme(page, 'dark');
    await page.reload({ waitUntil: 'networkidle' }); await theme(page, 'dark');
    await page.getByRole('radio', { name: 'System', exact: true }).check(); await theme(page, 'light');
    await page.emulateMedia({ colorScheme: 'dark' }); await theme(page, 'dark');
    // Same-origin tabs get real browser storage events, not synthetic events.
    const other = await context.newPage();
    await other.goto(`${origin}/?mode=appearance`, { waitUntil: 'networkidle' });
    await other.getByRole('radio', { name: 'Light', exact: true }).check(); await theme(page, 'light');
    await other.evaluate(key => localStorage.removeItem(key), key); await theme(page, 'dark');
    await other.evaluate(key => localStorage.setItem(key, 'invalid'), key); await theme(page, 'dark');
    await other.close();
    await page.emulateMedia({ colorScheme: mode });
    await page.goto(`${origin}/?mode=appearance`, { waitUntil: 'networkidle' });
    await theme(page, mode);
    await capture(page, `appearance-${mode}-${width}`);
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await page.getByTestId('credential-page').waitFor(); await theme(page, mode);
    await capture(page, `login-${mode}-${width}`);
    await page.getByRole('link', { name: 'Appearance', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'appearance');
    await page.getByTestId('appearance-page').waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('appearance-page').waitFor();
    await page.goBack(); await page.getByTestId('credential-page').waitFor();
    await page.goForward(); await page.getByTestId('appearance-page').waitFor();
    // Visual-only real consent component fixture. No token, credential, grant
    // or consent write: never claim this as an auth round-trip test.
    await page.goto(`${origin}/?consent=1`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.I.setPendingContracts([{ kind: 'app', app_origin: 'https://studio.example', permissions: { notes: ['readAll', 'create'] } }]);
      window.I.setAuth(true);
    });
    await page.getByText('studio.example', { exact: false }).first().waitFor();
    await theme(page, mode);
    await capture(page, `consent-${mode}-${width}`);
    await page.goto(`${origin}/?consent=1&mode=appearance`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByTestId('appearance-page').count(), 0, 'appearance cannot replace a pending consent surface');
    await page.goto(`${origin}/?oauth=1&mode=appearance`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByTestId('appearance-page').count(), 0, 'OAuth consent also takes precedence');
    assert.deepEqual(errors, []);
    receipts.push({ width, mode, settings: true, publicLinkHistory: true, keyboard: true, osChanges: true, overrideReload: true, crossTab: true, logo: true, login: true, consentVisualOnly: true });
    await context.close();
  }
  // Check pre-app state while deliberately preventing the app module from
  // running: initialization cannot rely on React to correct the first paint.
  for (const saved of [null, 'light', 'dark', 'invalid']) {
    const context = await browser.newContext({ colorScheme: 'dark' });
    await isolated(context);
    await context.addInitScript(({ key, saved }) => { if (saved !== null) localStorage.setItem(key, saved); }, { key, saved });
    const page = await context.newPage();
    await page.route('**/src/main.tsx', route => route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const expected = saved === 'light' ? 'light' : 'dark';
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), expected);
    assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), expected);
    assert.equal(await page.locator('#root').innerHTML(), '');
    await context.close();
  }
  const denied = await browser.newContext({ colorScheme: 'light', viewport: { width: 375, height: 812 } });
  await isolated(denied);
  await denied.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage denied'); };
    Storage.prototype.setItem = () => { throw new Error('Storage denied'); };
  });
  const page = await denied.newPage();
  await page.goto(`${origin}/?mode=appearance`, { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: 'Dark', exact: true }).check(); await theme(page, 'dark');
  assert.ok(await page.getByRole('alert').isVisible());
  await capture(page, 'storage-denied-mobile');
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify({
    evidence: 'Real Chromium app/CSS, isolated network fixtures; consent is view-only with synthetic state, not live auth or phone/Safari proof.',
    receipts, blockingStartup: true, storageDenied: true,
  }, null, 2));
  console.log('[auth-appearance] passed', receipts);
} finally { await browser?.close(); server.kill('SIGTERM'); }
