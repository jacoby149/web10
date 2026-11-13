// Real People filter/card geometry with isolated data; boots and stops its own server.
// Drives each filter through the harness's ?personFilter= initial route (the
// pre-existing update-depth loop in the harness swallows click-driven router
// updates, so the gate uses fresh page loads — static measurements only).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw Error('Set SCREENSHOT_OUTPUT_DIR to a workspace .context directory');
await mkdir(output, { recursive: true });
const origin = 'http://localhost:4500';
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, stdio: 'inherit' });
const receipts = [];
let browser;
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(`${origin}/screenshots/harness/index.html`)).ok) break; } catch {}
    if (Date.now() > deadline) throw Error('People spacing harness startup timed out');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280]) {
    for (const filter of ['all', 'following', 'mutuals', 'followers']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
      const extra = filter === 'all' ? '' : `&personFilter=${filter}`;
      await page.goto(`${origin}/screenshots/harness/index.html?screen=people${extra}`, { waitUntil: 'networkidle' });
      const chip = page.getByTestId(`explore-people-filter-${filter}`);
      assert.equal(await chip.getAttribute('aria-selected'), 'true');
      await page.getByTestId('explore-people-list').waitFor();
      const geometry = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="explore-people-filter"]');
        const chip = row.querySelector('[aria-selected="true"]').getBoundingClientRect();
        const content = row.nextElementSibling.getBoundingClientRect();
        const style = getComputedStyle(row);
        return { gap: content.top - chip.bottom, top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) };
      });
      console.log('[people-spacing]', JSON.stringify({ theme, width, filter, ...geometry }));
      assert.equal(geometry.gap, 12, 'filter chips need 12px clearance before cards');
      assert.equal(geometry.top, geometry.bottom, 'filter row has balanced vertical padding');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      receipts.push({ theme, width, filter, ...geometry });
      if (filter === 'following' && [1440, 375].includes(width)) {
        await page.screenshot({ path: path.join(output, `following-${theme}-${width}.png`), animations: 'disabled' });
      }
      await page.close();
    }
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
