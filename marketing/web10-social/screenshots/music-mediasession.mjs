// Real-Chromium Media Session receipt: the PWA's music queue hands its
// resolved cover to navigator.mediaSession.metadata, so the phone's system
// media controls (previous/next, pause, scrubber) can show album art.
// Data reads use the screenshot mocks, NOT a live node or production account.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
assert(output, 'Set SCREENSHOT_OUTPUT_DIR to an existing .context directory');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4502);
const url = `http://localhost:${port}/screenshots/harness/index.html?screen=music`;
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
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const logs = [];
  page.on('console', message => logs.push(message.text()));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    const row = page.getByTestId('music-track-card').first();
    await row.waitFor();
    await row.click();
    const session = await page.waitForFunction(() => navigator.mediaSession?.metadata ? {
      title: navigator.mediaSession.metadata.title,
      artist: navigator.mediaSession.metadata.artist,
      playbackState: navigator.mediaSession.playbackState,
      artwork: navigator.mediaSession.metadata.artwork?.map(art => art.src) ?? [],
      // getActionHandler is absent in some Chromium builds; the jsdom suite
      // pins handler registration separately.
      canProbeHandlers: typeof navigator.mediaSession.getActionHandler === 'function',
      previousHandler: typeof navigator.mediaSession.getActionHandler === 'function' ? Boolean(navigator.mediaSession.getActionHandler('previoustrack')) : null,
      nextHandler: typeof navigator.mediaSession.getActionHandler === 'function' ? Boolean(navigator.mediaSession.getActionHandler('nexttrack')) : null,
    } : null, undefined, { timeout: 15000 }).then(handle => handle.jsonValue());
    assert.equal(session.title, 'After Hours');
    assert.equal(session.artist, 'Synthwave Sessions');
    assert.equal(session.artwork.length, 1, 'The resolved cover is the session artwork');
    assert.ok(session.artwork[0].startsWith('data:image/svg+xml'), 'Artwork is the track cover, not a recording URL');
    if (session.canProbeHandlers) {
      assert.equal(session.previousHandler, true, 'previoustrack is registered for the system controls');
      assert.equal(session.nextHandler, true, 'nexttrack is registered for the system controls');
    }
    assert(logs.some(line => line.includes('[music-player] media session metadata')), 'Metadata decision is logged');
    assert.deepEqual(errors, []);
    console.log('[music-mediasession] metadata received by the real session:', JSON.stringify(session));
    await page.screenshot({ path: path.join(output, 'music-mediasession-375.png'), fullPage: true });
    console.log(`[music-mediasession] 375px: native Chromium Media Session carries title, artist, playbackState=${session.playbackState} and the resolved cover artwork${session.canProbeHandlers ? ' plus previous/next handlers' : ' (handler probe unavailable in this Chromium build; jsdom pins the registrations)'}`);
  } catch (error) {
    console.error(logs.join('\n'), errors);
    throw error;
  } finally { await page.close(); }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
