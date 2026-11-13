// Actual browser UI and navigation, isolated data only. Never a live-node receipt.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../.context/hashtags');
const port = Number(process.env.SCREENSHOT_PORT || 4517);
const base = `http://localhost:${port}`;
await fs.mkdir(output, { recursive: true });
const server = spawn('bunx', ['vite', '--config', 'screenshots/hashtags.vite.config.ts'], { cwd: root, env: { ...process.env, SCREENSHOT_PORT: String(port) }, stdio: 'pipe' });
let logs = '';
server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
let browser;
const receipt = [];
try {
  const deadline = Date.now() + 30_000;
  while (true) {
    try { if ((await fetch(`${base}/screenshots/hashtags.html`)).ok) break; } catch {}
    assert(Date.now() < deadline, `Server startup failed\n${logs}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  for (const theme of ['dark', 'light']) {
    for (const width of [1440, 375, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') logs += `\n${message.text()}`; });
      await page.goto(`${base}/hashtag-fixture`);
      await page.getByTestId('hashtag-source').waitFor();
      for (let index = 0; index < 4; index++) {
        await page.getByRole('link', { name: '#Walking', exact: true }).nth(index).click();
        await page.getByTestId('hashtag-card').first().waitFor();
        assert.equal(new URL(page.url()).pathname, '/tag/walking');
        if (index === 0) {
          await page.reload(); await page.getByTestId('hashtag-card').first().waitFor();
          await page.locator('[data-testid="hashtag-card"] img').first().waitFor();
          if ([1440, 375].includes(width)) await page.screenshot({ path: path.join(output, `board-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
        }
        await page.goBack(); await page.getByTestId('hashtag-source').waitFor();
      }
      await page.getByRole('link', { name: 'An empty topic' }).click();
      await page.getByTestId('hashtag-empty').waitFor();
      if ([1440, 375].includes(width)) await page.screenshot({ path: path.join(output, `empty-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: 'Post with #new_topic' }).click();
      await page.getByTestId('new-post-sheet').waitFor();
      assert.match(await page.locator('.tiptap').innerText(), /#new_topic/);
      if ([1440, 375].includes(width)) await page.screenshot({ path: path.join(output, `composer-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      await page.keyboard.press('Escape');
      for (const state of ['loading', 'error']) {
        await page.goto(`${base}/tag/walking?state=${state}`);
        await page.locator(state === 'loading' ? '[data-testid="hashtag-loading"]' : '[role="alert"]').waitFor();
        if ([1440, 375].includes(width)) await page.screenshot({ path: path.join(output, `${state}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
      const bounds = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      assert(bounds, `Horizontal overflow ${theme}/${width}`);
      assert.deepEqual(errors, [], `Browser errors ${theme}/${width}`);
      receipt.push({ theme, width, sourceLinks: 4, reload: true, history: true, emptyPrefill: true, states: ['loading', 'error'], noOverflow: bounds });
      await context.close();
    }
  }
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify({ kind: 'isolated-browser-ui', cases: receipt }, null, 2));
  console.log(`Hashtag browser gates passed: ${receipt.length} cases. ${output}`);
} catch (error) { console.error(logs); throw error; }
finally { await browser?.close(); server.kill('SIGTERM'); }
