// Real components/CSS, synthetic accounts and callbacks. No live node/auth claim.
import { chromium } from '../../e2e/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../.context/auth-credential-style');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4583);
const origin = `http://localhost:${port}`;
const server = spawn('bun', ['run', 'dev', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let browser;
const receipts = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Credential screenshot server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280]) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width, height: 900 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/credential-preview') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="${theme}" class="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/credential-preview.tsx"></script></body></html>` });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const capture = name => page.screenshot({ path: path.join(output, `${name}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    const bounds = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal page overflow');
    await page.goto(`${origin}/credential-preview?consent=1&redirect=keep`, { waitUntil: 'networkidle' });
    await page.getByTestId('consent-continue-as').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByTestId('login-submit').isVisible(), false);
    for (const id of ['consent-continue-as', 'account-picker-other', 'login-contact-cta', 'login-create-account']) {
      const box = await page.getByTestId(id).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, `${id} touch target`);
    }
    assert.equal(await page.getByTestId('consent-credential-entry').evaluate(el => getComputedStyle(el).overflowY), 'visible');
    await bounds(); await capture('accounts');
    await page.getByTestId('account-picker-other').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByTestId('username-input').evaluate(el => document.activeElement === el), true);
    assert.equal(new URL(page.url()).searchParams.get('signin'), 'password');
    assert.equal(new URL(page.url()).searchParams.get('redirect'), 'keep');
    await capture('password');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('login-submit').waitFor();
    await page.goBack(); await page.getByTestId('account-picker').waitFor();
    await page.goForward(); await page.getByTestId('login-submit').waitFor();
    await page.getByTestId('username-input').fill('alex');
    await page.getByTestId('password-input').fill('synthetic-password');
    await page.getByTestId('password-input-toggle').click();
    assert.equal(await page.getByTestId('password-input').getAttribute('type'), 'text');
    await page.getByTestId('login-submit').click();
    await page.getByRole('alert').waitFor();
    await capture('error');
    await page.getByTestId('login-create-account').click();
    await page.getByTestId('signup-submit').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('credential'), 'signup');
    await bounds(); await capture('signup');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('signup-submit').waitFor();
    await page.getByTestId('signup-login-link').click();
    await page.getByTestId('login-contact-cta').click();
    await page.getByTestId('recovery-contact-input').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('credential'), 'forgot');
    await page.goto(`${origin}/credential-preview?consent=1&cold=1`, { waitUntil: 'networkidle' });
    await page.getByTestId('login-submit').waitFor();
    await bounds(); await capture('cold-login');
    assert.deepEqual(errors, []);
    receipts.push({ theme, width, accounts: true, password: true, signup: true, coldLogin: true, historyReload: true, keyboardFocus: true, touchTargets: true, error: true });
    await context.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify({ evidence: 'Synthetic presentation fixture with real React components/CSS in Chromium; not live auth/phone/deployment proof.', receipts }, null, 2));
  console.log('[auth-style] passed', receipts);
} finally { await browser?.close(); server.kill('SIGTERM'); }
