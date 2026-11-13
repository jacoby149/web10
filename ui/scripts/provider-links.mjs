// Real app/CSS, isolated node responses and provider landing pages; no live saves.
import { chromium } from '../../e2e/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../.context/provider-key-links');
await mkdir(output, { recursive: true });
const port = 4584;
const origin = `http://localhost:${port}`;
const server = spawn('bun', ['run', 'dev', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
const status = { available: true, gmail_available: false, gmail_connected: false, gmail_sender: '', sendgrid_configured: false, sendgrid_sender: '', twilio_configured: false, email_provider: 'legacy' };
const receipts = [];
let browser;
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Provider links server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280]) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width, height: 900 } });
    const writes = [], external = [];
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (['us.posthog.com', 'eu.posthog.com', 'app.sendgrid.com', 'console.twilio.com'].includes(url.hostname)) {
        external.push({ url: url.href, referer: request.headers().referer });
        return route.fulfill({ contentType: 'text/html', body: '<title>Provider fixture</title>Provider sign-in would open here.' });
      }
      if (/\/configure$|\/config\/update$|\/contact\/test$|\/gmail\/start$/.test(url.pathname)) writes.push(url.pathname);
      const data = url.pathname === '/admin/contact/status' ? status
        : url.pathname === '/config' ? { admins: ['creator'], posthog_host: 'https://us.i.posthog.com' }
        : url.pathname.includes('/apps/admin') ? { apps: [] }
        : { configured: true, telemetry: { enabled: false }, users: [], domains: [], status: 'ok' };
      return route.fulfill({ json: data });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?mock=1&mock_mode=config`, { waitUntil: 'networkidle' });
    await page.getByTestId('delivery-sendgrid-panel').waitFor();
    const telemetry = page.getByTestId('config-telemetry-card');
    const delivery = page.getByTestId('contact-delivery-card');
    const posthog = page.getByTestId('config-posthog-key-link');
    assert.equal(await posthog.getAttribute('href'), 'https://us.posthog.com/project/settings');
    await page.getByTestId('config-posthog-host').selectOption('https://eu.i.posthog.com');
    assert.equal(await posthog.getAttribute('href'), 'https://eu.posthog.com/project/settings');
    await delivery.getByText('Optional SMS · Twilio Verify').click();
    await page.evaluate(() => document.fonts.ready);
    for (const link of await page.locator('a[data-provider-setup-link]').all()) {
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await link.getAttribute('referrerpolicy'), 'no-referrer');
      if (await link.isVisible()) {
        const box = await link.boundingBox();
        assert.ok(box && box.height >= 44, `44px help link: ${await link.textContent()} ${JSON.stringify(box)}`);
      }
    }
    // The console owns an internal scroll container. A tall capture viewport
    // exposes the complete expanded card instead of clipping it to that scroller.
    // Interaction and bounds checks still run at the original 900px height.
    await page.setViewportSize({ width, height: 2200 });
    await telemetry.scrollIntoViewIfNeeded();
    await telemetry.screenshot({ path: path.join(output, `posthog-${theme}-${width}.png`) });
    await delivery.scrollIntoViewIfNeeded();
    await delivery.screenshot({ path: path.join(output, `delivery-${theme}-${width}.png`) });
    await page.setViewportSize({ width, height: 900 });
    for (const link of [posthog, delivery.getByRole('link', { name: /Create a SendGrid API key/ }), delivery.getByRole('link', { name: /Get Twilio Account SID/ }), delivery.getByRole('link', { name: /Get Twilio Verify Service SID/ })]) {
      const expected = await link.getAttribute('href');
      const opened = page.waitForEvent('popup');
      await link.focus(); await page.keyboard.press('Enter');
      const popup = await opened; await popup.waitForLoadState();
      assert.equal(popup.url(), expected);
      assert.equal(await popup.evaluate(() => window.opener), null);
      await popup.close();
    }
    assert.ok(external.every(request => !request.referer), 'no portal referrer reaches providers');
    assert.deepEqual(writes, [], 'help/navigation does not save, activate or send');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    receipts.push({ theme, width, safeProviderLinks: true, regionSwitch: true, keyboard: true, noWrites: true });
    await context.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify({ evidence: 'Real app/browser with synthetic node/provider transport; no live provider account or saved-credential claim.', receipts }, null, 2));
  console.log('[provider-key-links] passed', receipts);
} finally { await browser?.close(); server.kill('SIGTERM'); }
