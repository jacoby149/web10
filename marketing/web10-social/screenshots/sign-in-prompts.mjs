// Actual Layout/PostsScreen/CSS with seeded public data, not a live auth receipt.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../.context/sign-in-prompts');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4573);
const origin = `http://localhost:${port}`;
const base = `${origin}/screenshots/harness/index.html`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SCREENSHOT_PORT: String(port) },
});
let browser;
let activePage;
const receipts = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Sign-in prompt server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const mode of ['dark', 'light']) {
    for (const width of [1440, 375, 768, 1280]) {
      const context = await browser.newContext({ colorScheme: mode, viewport: { width, height: 900 } });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      activePage = page;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.text().startsWith('[posts]') || message.text().startsWith('[prompt-loop-stack]')) console.log('[prompt-page]', message.text());
        if (message.type() === 'error' && message.text().includes('Maximum update depth') && !errors.includes('React update-depth loop')) errors.push('React update-depth loop');
      });
      await page.addInitScript(() => {
        window.__signInClicks = 0;
        window.addEventListener('harness:login', () => { window.__signInClicks++; });
        const original = console.error;
        let reported = false;
        console.error = (...args) => {
          if (!reported && String(args[0]).includes('Maximum update depth')) {
            reported = true;
            console.log('[prompt-loop-stack]', new Error().stack);
          }
          original(...args);
        };
      });
      await page.goto(`${base}?screen=posts&anon=1&signin-prompts=1`);
      await page.getByTestId('discover-grid').waitFor();
      await page.getByTestId('sign-in-prompt-feed').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => window.__signInClicks), 0);
      const actions = [width < 768 ? 'sign-in-button-mobile' : 'sign-in-button-desktop', 'sign-in-button-feed'];
      if (width >= 768) actions.push('sign-in-button-sidebar');
      for (const id of actions) {
        const button = page.getByTestId(id);
        const bounds = await button.boundingBox();
        assert.ok(bounds.height >= 44 && bounds.width >= 44, `${id} touch target`);
        await button.focus();
        assert.equal(await button.evaluate(el => el.matches(':focus-visible')), true);
        await page.keyboard.press('Enter');
      }
      assert.equal(await page.evaluate(() => window.__signInClicks), actions.length);
      if (width === 1440 || width === 375) {
        await page.getByTestId('shell-content').evaluate(el => el.scrollTop = 0);
        await page.screenshot({ path: path.join(output, `discover-${mode}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
      await page.getByTestId('posts-tab-following').click();
      await page.getByTestId('sign-in-prompt-following').waitFor();
      assert.equal(await page.getByTestId('discover-grid').count(), 0);
      assert.equal(await page.getByTestId('sign-in-prompt-feed').count(), 0);
      assert.equal(await page.getByTestId('posts-tab-following').getAttribute('aria-selected'), 'true');
      await page.getByTestId('sign-in-button-following').click();
      assert.equal(await page.evaluate(() => window.__signInClicks), actions.length + 1);
      if (width === 1440 || width === 375) {
        await page.screenshot({ path: path.join(output, `following-${mode}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
      await page.getByTestId('posts-tab-discover').click();
      await page.getByTestId('discover-grid').waitFor();
      await page.getByTestId('sign-in-learn-feed').click();
      await page.getByTestId('join-screen').waitFor();
      // Signed-in parity: the same content surface without acquisition UI.
      await page.goto(`${base}?screen=posts&signin-prompts=1`);
      await page.getByTestId('discover-grid').waitFor();
      assert.equal(await page.locator('[data-testid^="sign-in-prompt-"]').count(), 0);
      assert.equal(await page.getByTestId('sign-in-button-desktop').count(), 0);
      assert.deepEqual(errors, []);
      receipts.push({ mode, width, visibleSignInActions: actions.length, callbacks: true,
        focusAndTargets: true, publicContentRemains: true, followingInvitation: true, joinLink: true, signedInUnchanged: true });
      await context.close();
    }
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
  console.log('[sign-in-prompts] eight theme/viewport cases passed; fixture data/callbacks, not live auth');
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.error('[sign-in-prompts] failed state:', await activePage.evaluate(() => ({
      following: document.querySelector('[data-testid="posts-tab-following"]')?.getAttribute('aria-selected'),
      invitations: [...document.querySelectorAll('[data-testid^="sign-in-prompt-"]')].map(el => el.getAttribute('data-testid')),
    })));
    await activePage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  }
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
