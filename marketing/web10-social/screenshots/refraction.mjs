// Rendered-pixel gate: URL parsing isn't evidence that a browser refracts.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw new Error('Set SCREENSHOT_OUTPUT_DIR to a .context directory');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4579);
const base = `http://localhost:${port}/screenshots/harness/index.html?screen=appearance`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: path.resolve(import.meta.dirname, '..'), stdio: 'inherit',
  env: { ...process.env, SCREENSHOT_PORT: String(port) },
});
const receipts = [];
let browser;
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const compare = (page, on, off) => page.evaluate(async ([on, off]) => {
  const pixels = async base64 => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
  };
  const [a, b] = await Promise.all([pixels(on), pixels(off)]);
  let changed = 0;
  let centerChanged = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    const delta = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (delta > 15) {
      changed++;
      if (x > a.height && x < a.width - a.height && y > 12 && y < a.height - 12) centerChanged++;
    }
  }
  return { changed, centerChanged };
}, [on.toString('base64'), off.toString('base64')]);
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Refraction server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const mode of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: mode });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const rim = page.getByTestId('dock-refraction');
    await rim.waitFor();
    const dock = page.getByRole('navigation', { name: 'Primary mobile', exact: true });
    // A uniform backdrop has nothing to bend. Any on/zero difference is
    // self-refraction of chrome, not content behind the glass (the gray rings).
    const flatStyle = await page.addStyleTag({ content: 'body::after { content:""; position:fixed; inset:0; z-index:19; background:var(--color-background); pointer-events:none; }' });
    const flatBox = await dock.boundingBox();
    const lensScale = await page.locator('feDisplacementMap').getAttribute('scale');
    await settle(page);
    const flatOn = await page.screenshot({ path: path.join(output, `flat-on-${mode}.png`), clip: flatBox });
    await page.locator('feDisplacementMap').evaluate(el => el.setAttribute('scale', '0'));
    await settle(page);
    const flatZero = await page.screenshot({ path: path.join(output, `flat-zero-${mode}.png`), clip: flatBox });
    const flatDifference = await compare(page, flatOn, flatZero);
    console.log('[refraction] flat backdrop self-refraction', { mode, ...flatDifference });
    assert.equal(flatDifference.changed, 0, 'a flat backdrop must not produce refracted chrome rings');
    await page.locator('feDisplacementMap').evaluate((el, scale) => el.setAttribute('scale', scale), lensScale);
    await flatStyle.evaluate(el => el.remove());
    // Deliberately synthetic bright lines behind the actual app dock make
    // bending measurable. No cloned page, fake glass texture or painted bend.
    await page.evaluate(() => {
      const pattern = document.createElement('div');
      pattern.id = 'optics-fixture';
      pattern.style.cssText = 'position:fixed;z-index:19;bottom:0;left:0;right:0;height:160px;background:repeating-linear-gradient(90deg,#f8fafc 0 6px,#23334e 6px 12px,#7c5cf0 12px 18px,#23c4a1 18px 24px);pointer-events:none';
      document.body.append(pattern);
    });
    await settle(page);
    const box = await dock.boundingBox();
    const on = await page.screenshot({ path: path.join(output, `rim-on-${mode}.png`), clip: box });
    await page.screenshot({ path: path.join(output, `optics-${mode}-375.png`) });
    if (mode === 'dark' && process.env.REFRACTION_FRAMES === '1') {
      const frames = path.join(output, 'frames');
      await mkdir(frames, { recursive: true });
      const y = Math.floor(box.y - 24);
      for (let frame = 0; frame < 24; frame++) {
        await page.locator('#optics-fixture').evaluate((el, x) => { el.style.backgroundPositionX = `${x}px`; }, frame * 2);
        await settle(page);
        await page.screenshot({ path: path.join(frames, `${String(frame).padStart(2, '0')}.png`), clip: { x: 0, y, width: 375, height: 812 - y } });
      }
      await page.locator('#optics-fixture').evaluate(el => { el.style.backgroundPositionX = '0px'; });
      await settle(page);
    }
    await page.locator('feDisplacementMap').evaluate(el => el.setAttribute('scale', '0'));
    await settle(page);
    const off = await page.screenshot({ path: path.join(output, `rim-zero-${mode}.png`), clip: box });
    const difference = await compare(page, on, off);
    assert.ok(difference.changed > 150, `real displacement must change rim pixels: ${JSON.stringify(difference)}`);
    assert.equal(difference.centerChanged, 0, 'controls and inner reading surface must not be displaced');
    await page.locator('feDisplacementMap').evaluate((el, scale) => el.setAttribute('scale', scale), lensScale);
    await page.locator('#optics-fixture').evaluate(el => el.remove());
    await page.goto(base.replace('screen=appearance', 'screen=profile'), { waitUntil: 'networkidle' });
    await page.getByTestId('dock-refraction').waitFor();
    assert.equal(await page.getByTestId('nav-profile').getAttribute('aria-current'), 'page');
    await settle(page);
    await page.screenshot({ path: path.join(output, `profile-${mode}-375.png`) });
    const originalMap = await page.locator('feImage').getAttribute('href');
    await page.setViewportSize({ width: 430, height: 812 });
    await page.waitForFunction(original => document.querySelector('feImage')?.getAttribute('href') !== original, originalMap);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.getByTestId('dock-refraction').isVisible(), true, 'static refraction needs no animation');
    assert.deepEqual(errors, []);
    receipts.push({ mode, flatDifference, ...difference, errors });
    console.log('[refraction] actual pixels', receipts.at(-1));
    await page.close();
  }
  // Actual Chromium renders the same code under an unverified engine hint:
  // it must NOT mount the experimental URL effect.
  const fallback = await browser.newPage({ viewport: { width: 375, height: 812 }, userAgent: 'Mozilla/5.0 Version/19.0 Safari/605.1.15' });
  await fallback.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await fallback.getByTestId('dock-refraction').count(), 0);
  assert.equal(await fallback.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).backdropFilter.includes('blur')), true);
  await fallback.close();
  await writeFile(path.join(output, 'refraction-receipt.json'), JSON.stringify({
    evidence: 'Chromium screenshot pixel comparison on synthetic stripes under real dock; not Safari/phone/performance proof', receipts, unverifiedEngineFallback: true,
  }, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
