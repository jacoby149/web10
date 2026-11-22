// One-off probe (operator 22.11.2026): the Music expanded player's Comments/Queue
// panels and the session video element. The question: does switching panels kill
// the video (element removed from the stage + playback paused)?
//
// Boots the harness Vite server itself, drives /music?track=music-7&panel=player
// (the seeded MUSIC VIDEO — a real one-second H.264 data URL), plays it, then
// clicks Comments and Queue and reports, at each step:
//   - is the session video element inside the stage?
//   - is it paused?
// Screenshots land in .context/music-panel-probe/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.SCREENSHOT_PORT || 4501);
const URL = `http://localhost:${PORT}/screenshots/harness/index.html?screen=music-video-player`;
const output = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || path.join(root, '../../.context/music-panel-probe'));

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Harness server did not come up');
}
await mkdir(output, { recursive: true });
const runner = process.env.VITE_RUNNER || 'bunx';
const server = spawn(runner, ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, stdio: 'inherit' });
const events = [];
let browser;
try {
  await waitForServer(URL);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[music-player]') || t.startsWith('[music]')) events.push(`console: ${t}`); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByTestId('music-video-stage').waitFor();

  const state = async (label) => {
    const info = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="music-video-stage"]');
      const video = stage ? stage.querySelector('video') : null;
      const anyVideo = [...document.querySelectorAll('video')].map(v => ({
        inStage: !!v.closest('[data-testid="music-video-stage"]'),
        inDocument: !!v.isConnected,
        paused: v.paused,
        currentTime: v.currentTime,
        src: (v.currentSrc || v.src || '').slice(0, 30),
      }));
      return { stageHasVideo: !!video, paused: video ? video.paused : null, time: video ? video.currentTime : null, anyVideo };
    });
    events.push(`${label}: stageHasVideo=${info.stageHasVideo} paused=${info.paused} time=${info.time} all=${JSON.stringify(info.anyVideo)}`);
    console.log(`[probe] ${label}: stageHasVideo=${info.stageHasVideo} paused=${info.paused} time=${info.time}`);
    console.log(`[probe]   videos: ${JSON.stringify(info.anyVideo)}`);
    return info;
  };

  await state('player-initial');
  // Play the music video (the panel's transport button).
  await page.getByRole('button', { name: 'Play track' }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="music-video-stage"] video');
    return v && !v.paused;
  });
  await state('player-playing');
  await page.screenshot({ path: path.join(output, 'player.png') });

  // Click Comments.
  await page.getByRole('button', { name: 'Comments' }).click();
  await page.getByTestId('music-comments').waitFor();
  await new Promise((r) => setTimeout(r, 800));
  await state('after-comments');
  await page.screenshot({ path: path.join(output, 'comments.png') });

  // Then Queue (the transport row's buttons are visible in every panel).
  await page.getByRole('button', { name: 'Queue' }).click();
  await page.getByText('Your queue').waitFor();
  await new Promise((r) => setTimeout(r, 800));
  await state('after-queue');
  await page.screenshot({ path: path.join(output, 'queue.png') });

  await writeFile(path.join(output, 'probe.log'), events.join('\n') + '\n');
  console.log('[probe] done — receipt at', path.join(output, 'probe.log'));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
