// Native decoding + real app navigation; synthetic media, no account writes.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../.context/video-sound');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4588);
const base = `http://localhost:${port}/screenshots/harness/index.html`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, stdio: 'inherit', env: { ...process.env, SCREENSHOT_PORT: String(port) } });
const receipts = [];
let browser;
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Video sound harness startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const width of [1440, 375, 768, 1280]) for (const theme of ['dark', 'light']) {
    const mobile = width < 768;
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme, hasTouch: mobile, isMobile: mobile });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.musicElements = [];
      window.Audio = new Proxy(window.Audio, { construct(target, args) { const element = Reflect.construct(target, args); window.musicElements.push(element); return element; } });
    });
    const nav = name => page.getByTestId(`nav-${name}${mobile ? '-mobile' : ''}`);
    await page.goto(`${base}?screen=posts&signin-prompts=1&feed-player-repair=1&video-sound=1`, { waitUntil: 'networkidle' });
    const clip = page.locator('[data-media-session-title="A studio video"]');
    await clip.locator('video').waitFor({ state: 'attached' });
    assert.equal(await clip.locator('video').evaluate(el => el.muted), false, 'fresh visit starts sound-on');
    await clip.getByRole('button', { name: 'Play video', exact: true }).first().click();
    await page.waitForFunction(() => !document.querySelector('[data-media-session-title="A studio video"] video').paused);
    await clip.hover();
    await clip.getByTestId('volume-toggle').click();
    await page.waitForFunction(() => document.querySelector('[data-media-session-title="A studio video"] video').muted);
    await nav('music').click();
    await page.getByRole('button', { name: 'Play all', exact: true }).click().catch(async error => {
      await page.screenshot({ path: path.join(output, 'music-entry-failure.png') });
      console.error('[video-sound] music entry', await page.locator('main').innerText(), errors);
      throw error;
    });
    await page.waitForFunction(() => window.musicElements.at(-1)?.paused === false);
    assert.equal(await page.evaluate(() => window.musicElements.at(-1).muted), false, 'Music ignores the video mute choice');
    await nav('video').click();
    await page.locator('[data-preview-active]').first().waitFor();
    assert.equal(await page.locator('video').evaluateAll(elements => elements.every(el => el.muted)), true, 'Video wall inherits the Posts mute choice');
    assert.equal(await page.evaluate(() => window.musicElements.at(-1).paused), false, 'muted wall previews do not interrupt music');
    await page.getByTestId('music-player').getByRole('button', { name: 'Pause music', exact: true }).click();
    // Re-enter after releasing music so the preview gets a fresh lease check.
    await nav('feed').click();
    await nav('video').click();
    const preview = page.locator('[data-preview-active]').first();
    await preview.scrollIntoViewIfNeeded();
    if (!mobile) await preview.hover();
    const activePreview = page.locator('[data-preview-active="true"]').first();
    await activePreview.locator('[data-testid$="-mute"]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-preview-active] video')].every(el => !el.muted));
    assert.equal(await page.evaluate(() => window.musicElements.at(-1).paused), true, 'changing video sound never resumes Music');
    await nav('shorts').click();
    const tile = page.getByTestId('short-wall-tile-dp-2');
    await tile.waitFor();
    if (!mobile) await tile.hover();
    const shortPreview = page.locator('[data-preview-active="true"]').first();
    await shortPreview.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-preview-active="true"] video')].some(el => !el.paused && el.readyState >= 2));
    const previewId = (await shortPreview.getAttribute('data-testid')).replace('short-wall-hover-', '');
    await page.waitForFunction(id => getComputedStyle(document.querySelector(`[data-testid="short-wall-play-${id}"]`)).opacity === '0', previewId);
    assert.equal(await shortPreview.locator('video').evaluate(el => el.muted), false);
    await page.screenshot({ path: path.join(output, `shorts-preview-${theme}-${width}.png`) });
    await shortPreview.locator('[data-testid$="-mute"]').click();
    await tile.click();
    await page.getByTestId('short-mute-0').waitFor();
    assert.equal(await page.getByTestId('short-video-0').locator('video').evaluate(el => el.muted), true, 'Shorts lens inherits preview mute');
    await page.getByTestId('short-mute-0').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="short-video-"] video')].every(el => !el.muted));
    await page.getByTestId('short-mute-0').click();
    await page.reload({ waitUntil: 'networkidle' });
    await clip.locator('video').waitFor({ state: 'attached' });
    assert.equal(await clip.locator('video').evaluate(el => el.muted), false, 'reload resets to sound-on, not a saved preference');
    assert.deepEqual(errors, []);
    receipts.push({ width, theme, default: 'sound-on', carry: 'Posts → Video → Shorts', music: 'independent', reload: 'sound-on', duplicatePreviewMarker: 'hidden' });
    await page.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
  console.log('[video-sound] PASS', receipts.length, 'native browser journeys');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
