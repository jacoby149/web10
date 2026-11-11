// Real rack geometry; isolated harness data, no node.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw new Error('Set SCREENSHOT_OUTPUT_DIR to a workspace .context directory');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4583);
const base = `http://localhost:${port}/screenshots/harness/index.html`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SCREENSHOT_PORT: String(port) },
});
let browser;
const receipts = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Knob alignment server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const width of [1440, 375, 768, 1280]) {
    for (const mode of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: mode });
      await page.goto(`${base}?screen=discover&tune=1`, { waitUntil: 'networkidle' });
      const row = page.locator('.knob-row');
      await row.getByRole('slider', { name: 'Recency', exact: true }).waitFor();
      await page.waitForTimeout(350); // Existing disclosure transition.
      const geometry = await row.evaluate(el => {
        const box = el.getBoundingClientRect();
        const sliders = [...el.querySelectorAll('[role="slider"]')].map(slider => {
          const rect = slider.getBoundingClientRect();
          return { center: rect.x + rect.width / 2, top: rect.top, left: rect.left, right: rect.right };
        });
        return { left: box.left, right: box.right, center: box.x + box.width / 2,
          overflow: el.scrollWidth > el.clientWidth, sliders };
      });
      const [recency, likes, comments] = geometry.sliders;
      assert.equal(geometry.sliders.length, 3);
      assert.ok(Math.abs(likes.center - geometry.center) < 1, 'Likes dial centered in panel');
      assert.ok(Math.abs((recency.center + comments.center) / 2 - geometry.center) < 1, 'symmetric outer dials');
      assert.ok(Math.abs((likes.center - recency.center) - (comments.center - likes.center)) < 1, 'equal dial spacing');
      assert.equal(recency.top, likes.top);
      assert.equal(likes.top, comments.top);
      assert.ok(recency.left >= geometry.left && comments.right <= geometry.right, 'all dials inside panel');
      assert.equal(geometry.overflow, false, 'no sideways rack scroll');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.activeElement?.blur());
      if (width === 1440 || width === 375) {
        await page.screenshot({ path: path.join(output, `knobs-${mode}-${width}.png`), animations: 'disabled' });
        await page.getByTestId('knob-rack').screenshot({ path: path.join(output, `rack-${mode}-${width}.png`), animations: 'disabled' });
      }
      receipts.push({ width, mode, geometry });
      console.log(`[knob-alignment] ${mode} ${width}: centered, equal spacing, no overflow`);
      await page.close();
    }
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
