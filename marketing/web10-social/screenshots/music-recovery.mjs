// Real Chromium media decoding with synthetic HTTP 403 -> fresh MP3 recovery.
// Data reads use the screenshot mocks, NOT a live node or production account.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
assert(output, 'Set SCREENSHOT_OUTPUT_DIR to an existing .context directory');
await mkdir(output, { recursive: true });
const mp3Path = path.join(output, 'music-synthetic.mp3');
const generated = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'libmp3lame', mp3Path], { stdio: 'pipe' });
assert.equal(generated.status, 0, generated.stderr?.toString());
const mp3 = await readFile(mp3Path);
const port = Number(process.env.SCREENSHOT_PORT || 4501);
const url = `http://localhost:${port}/screenshots/harness/index.html?screen=music&music-regression=1`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, env: { ...process.env, SCREENSHOT_PORT: String(port) }, stdio: 'inherit' });
let browser;
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try { if ((await fetch(url)).ok) break; } catch { /* Booting. */ }
    assert(Date.now() < deadline, 'Screenshot server startup timed out');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['375', { width: 375, height: 812 }]]) {
    const page = await browser.newPage({ viewport });
    const logs = [];
    const errors = [];
    let freshFails = false;
    let freshRequests = 0;
    page.on('console', message => logs.push(message.text()));
    page.on('pageerror', error => errors.push(error.message));
    // Keep a reference to the native Audio instance; no fake play/events.
    await page.addInitScript(() => {
      const NativeAudio = window.Audio;
      window.Audio = function (...args) { const element = new NativeAudio(...args); window.__musicAudio = element; return element; };
    });
    await page.route('**/music-regression/**', route => {
      if (route.request().url().endsWith('fresh.mp3')) {
        freshRequests++;
        return route.fulfill(freshFails ? { status: 403, body: 'Expired' } : { status: 200, contentType: 'audio/mpeg', body: mp3 });
      }
      return route.fulfill({ status: 403, body: 'Expired' });
    });
    try {
      await page.goto(url);
      const row = page.getByTestId('music-track-card').first();
      await row.waitFor();
      await row.getByTestId('music-artwork-fallback').waitFor();
      await row.click();
      await page.waitForFunction(() => window.__musicAudio?.currentTime > 0.25);
      assert.equal(freshRequests, 1, 'One fresh media request after expired source');
      assert.equal(logs.filter(line => line.includes('[music-player] refresh accepted')).length, 1);
      const player = page.getByTestId('music-player');
      assert.match(await player.innerText(), /After Hours\. An independent late-night session/);
      assert(!await player.getByText('Untitled track').count());
      assert.equal(await player.getByRole('alert').count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await page.screenshot({ path: path.join(output, `music-recovery-${name}.png`), fullPage: true });
      // A genuinely unavailable fresh object stays retryable, without a loop.
      await page.getByRole('button', { name: 'Close music player' }).click();
      freshFails = true;
      await row.click();
      await player.getByRole('alert').waitFor();
      const accepted = logs.filter(line => line.includes('[music-player] refresh accepted')).length;
      await page.waitForTimeout(400);
      assert.equal(logs.filter(line => line.includes('[music-player] refresh accepted')).length, accepted);
      assert.equal(accepted, 2, 'One recovery attempt per explicit selection');
      await page.screenshot({ path: path.join(output, `music-unavailable-${name}.png`), fullPage: true });
      freshFails = false;
      await page.getByRole('button', { name: 'Retry playback' }).click();
      await page.waitForFunction(() => window.__musicAudio?.currentTime > 0.25);
      assert.equal(await player.getByRole('alert').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`[music-recovery] ${name}: native MP3 decode, 403 recovery, caption title, fallback, bounded failure and manual retry pass`);
    } catch (error) {
      console.error(logs.join('\n'), errors);
      throw error;
    } finally { await page.close(); }
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
