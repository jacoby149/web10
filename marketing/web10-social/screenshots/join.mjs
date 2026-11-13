// Real app routes/CSS/SDK, no backend or credentials. External traffic denied.
// Popup opening is real; authenticator response is a fixture, NOT an auth receipt.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../.context/social-join');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4591);
const origin = `http://localhost:${port}`;
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: 'inherit',
});
let browser;
const receipts = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Join server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const mode of ['dark', 'light']) {
    for (const width of [1440, 375, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.origin === 'http://auth.localhost') return route.fulfill({
          contentType: 'text/html', body: '<title>Isolated auth destination</title><p>Popup opening fixture. No account or consent.</p>',
        });
        return route.abort();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/`);
      await page.waitForURL('**/feed');
      await page.getByTestId('posts-tab-row').waitFor();
      await page.getByTestId('join-screen').waitFor({ state: 'detached' });
      await page.reload();
      await page.getByTestId('posts-tab-row').waitFor();
      assert.equal(new URL(page.url()).pathname, '/feed');
      await page.goto(`${origin}/join`);
      await page.getByTestId('join-screen').waitFor();
      assert.equal(new URL(page.url()).pathname, '/join');
      await page.reload();
      await page.getByTestId('join-screen').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('html').getAttribute('data-theme'), mode);
      const mark = page.getByTestId('theme-key-mark').first().locator(`[data-brand-variant="${mode === 'dark' ? 'white' : 'dark'}"]`);
      assert.equal(await mark.evaluate(el => el.complete && el.naturalWidth > 0), true);
      for (const id of ['join-button', 'join-sign-in', 'join-explore']) {
        const bounds = await page.getByTestId(id).boundingBox();
        assert.ok(bounds.height >= 44 && bounds.width >= 44, `${id} touch target`);
      }
      await page.getByTestId('join-button').focus();
      assert.equal(await page.getByTestId('join-button').evaluate(el => el.matches(':focus-visible')), true);
      if (width === 1440 || width === 375) {
        await page.screenshot({ path: path.join(output, `join-${mode}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
      await page.getByRole('link', { name: 'Appearance', exact: true }).click();
      await page.waitForURL('**/appearance');
      await page.goBack();
      await page.getByTestId('join-screen').waitFor();
      // Browser-blocked popup and keyboard retry, on the actual App handler.
      await page.evaluate(() => { window.__joinOpen = window.open; window.open = () => null; });
      await page.getByTestId('join-button').click();
      await page.getByText(/Allow pop-ups for this site/).waitFor();
      assert.equal(new URL(page.url()).pathname, '/join');
      await page.evaluate(() => { window.open = window.__joinOpen; });
      const popupPromise = page.waitForEvent('popup');
      await page.getByTestId('join-button').focus();
      await page.keyboard.press('Enter');
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      assert.equal(new URL(popup.url()).origin, 'http://auth.localhost');
      assert.equal(new URL(page.url()).pathname, '/join');
      await popup.close();
      // Closing an uncompleted popup must not manufacture a signed-in session.
      await page.getByTestId('join-screen').waitFor();
      await page.getByTestId('join-explore').click();
      await page.waitForURL('**/feed');
      await page.getByTestId('join-screen').waitFor({ state: 'detached' });
      await page.goBack();
      await page.getByTestId('join-screen').waitFor();
      assert.deepEqual(errors, []);
      receipts.push({ mode, width, rootAndReload: true, noOverflow: true, artwork: true,
        targetsAndFocus: true, appearanceAndBack: true, blockedPopupAndKeyboardRetry: true,
        realPopupOpeningOnly: true, cancelledPopupNoSession: true, exploreAndBack: true });
      await context.close();
    }
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
  console.log('[join-browser] all eight theme/viewport cases passed; actual auth handoff not exercised');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
