// Real post renderers/transports/Media Session; seeded data, not a phone OS receipt.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../.context/feed-player');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4583);
const base = `http://localhost:${port}/screenshots/harness/index.html`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, stdio: 'inherit', env: { ...process.env, SCREENSHOT_PORT: String(port) } });
const receipt = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function glassPixels(page, player, theme) {
  // Freeze real playback before pixel comparison: a moving seek thumb/time
  // label is not optical displacement and must not pollute the measurement.
  await page.evaluate(() => window.sessionHandlers.get('pause')({ action: 'pause' }));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused');
  await player.getByTestId('player-refraction').waitFor();
  const contrast = await player.evaluate(el => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const lum = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    ctx.fillStyle = getComputedStyle(el.querySelector('.text-muted-foreground')).color;
    ctx.fillRect(0, 0, 1, 1); const foreground = lum();
    const tint = getComputedStyle(el.querySelector('.chrome-dock-bed')).backgroundColor;
    return ['black', 'white'].map(base => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = base; ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = tint; ctx.fillRect(0, 0, 1, 1); const background = lum();
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
  });
  assert.ok(contrast.every(value => value >= 4.5), `player secondary text AA over extreme backdrops: ${contrast}`);
  const filter = player.locator('feDisplacementMap');
  const fixture = await page.addStyleTag({ content: 'body::after { content:""; position:fixed; inset:0; z-index:29; background:var(--color-background); pointer-events:none; }' });
  const diff = async (on, off) => page.evaluate(async ([a, b]) => {
    const pixels = async input => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${input}`)).blob());
      const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height);
    };
    const [first, second] = await Promise.all([pixels(a), pixels(b)]);
    let changed = 0, centerChanged = 0;
    for (let y = 0; y < first.height; y++) for (let x = 0; x < first.width; x++) {
      const i = (y * first.width + x) * 4;
      const delta = [0, 1, 2].reduce((n, c) => n + Math.abs(first.data[i + c] - second.data[i + c]), 0);
      if (delta > 15) { changed++; if (x > 24 && x < first.width - 24 && y > 12 && y < first.height - 12) centerChanged++; }
    }
    return { changed, centerChanged };
  }, [on.toString('base64'), off.toString('base64')]);
  const compare = async name => {
    await filter.evaluate(el => el.setAttribute('scale', '18')); await settle(page);
    const on = await player.screenshot({ path: path.join(output, `${name}-on-${theme}.png`) });
    await filter.evaluate(el => el.setAttribute('scale', '0')); await settle(page);
    const off = await player.screenshot({ path: path.join(output, `${name}-zero-${theme}.png`) });
    return diff(on, off);
  };
  const flat = await compare('glass-flat');
  assert.equal(flat.changed, 0, 'no self-refracted rings on a flat backdrop');
  const stripes = await page.addStyleTag({ content: 'body::after { background:repeating-linear-gradient(90deg,#f8fafc 0 6px,#23334e 6px 12px,#7c5cf0 12px 18px,#23c4a1 18px 24px); }' });
  const patterned = await compare('glass-rim');
  assert.ok(patterned.changed > 150, 'actual player refraction changes rim pixels');
  assert.equal(patterned.centerChanged, 0, 'player controls are never refracted');
  await filter.evaluate(el => el.setAttribute('scale', '18'));
  await stripes.evaluate(el => el.remove()); await fixture.evaluate(el => el.remove());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  assert.equal(await player.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await player.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).clipPath), 'none');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await player.evaluate(el => getComputedStyle(el, '::after').display), 'none');
  await page.emulateMedia({ forcedColors: 'none' });
  return { flat, patterned, contrast };
}
let browser;
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Feed player server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const width of [1440, 375, 768, 1280]) for (const theme of ['dark', 'light']) for (const board of ['posts', 'posts-following']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.text().includes('Maximum update depth')) errors.push(message.text()); });
    page.on('console', message => { if (message.text().startsWith('[music') || message.text().startsWith('[feed-media-session]')) console.log(message.text()); });
    await page.addInitScript(() => {
      window.sessionHandlers = new Map();
      const set = MediaSession.prototype.setActionHandler;
      MediaSession.prototype.setActionHandler = function (name, handler) { window.sessionHandlers.set(name, handler); return set.call(this, name, handler); };
      window.musicElements = [];
      window.Audio = new Proxy(window.Audio, { construct(target, args) { const element = Reflect.construct(target, args); window.musicElements.push(element); return element; } });
    });
    await page.goto(`${base}?screen=${board}&feed-player-repair=1&signin-prompts=1`, { waitUntil: 'networkidle' });
    const feed = page.getByTestId('music-feed-media');
    await feed.waitFor();
    assert.equal(await feed.locator('audio,video').count(), 0, 'no second music transport');
    await feed.getByRole('button', { name: 'Play music', exact: true }).click();
    await page.getByRole('region', { name: 'Now playing', exact: true }).waitFor().catch(async error => {
      await page.screenshot({ path: path.join(output, 'failure.png') });
      console.error('[feed-player] failure', await page.locator('body').innerText(), errors);
      throw error;
    });
    await page.waitForFunction(() => window.musicElements.at(-1)?.paused === false && navigator.mediaSession.playbackState === 'playing').catch(async error => {
      console.error('[feed-player] transport', await page.evaluate(() => ({ elements: window.musicElements.map(el => ({ paused: el.paused, time: el.currentTime, error: el.error?.code, ready: el.readyState, source: el.src.slice(0, 30) })), state: navigator.mediaSession.playbackState })), errors);
      throw error;
    });
    assert.equal(await page.evaluate(() => navigator.mediaSession.metadata?.title), 'After Hours');
    await page.evaluate(() => window.sessionHandlers.get('pause')({ action: 'pause' }));
    await page.waitForFunction(() => window.musicElements.at(-1)?.paused && navigator.mediaSession.playbackState === 'paused');
    await page.evaluate(() => window.sessionHandlers.get('play')({ action: 'play' }));
    await page.waitForFunction(() => !window.musicElements.at(-1)?.paused);
    const player = page.getByTestId('music-player');
    const mobile = width < 768;
    const geometry = await player.boundingBox();
    if (mobile) {
      const dock = page.getByRole('navigation', { name: 'Primary mobile', exact: true });
      const box = await dock.boundingBox();
      assert.ok(geometry.x >= 12 && geometry.x + geometry.width <= width - 12);
      assert.ok(box.y - (geometry.y + geometry.height) >= 12, 'separate player and dock');
      assert.ok(await player.evaluate(el => parseFloat(getComputedStyle(el).borderRadius)) >= 12);
      await page.addStyleTag({ content: ':root { --chrome-dock-bottom: 34px; }' });
      const safePlayer = await player.boundingBox(), safeDock = await dock.boundingBox();
      assert.ok(safeDock.y - (safePlayer.y + safePlayer.height) >= 12);
      await page.locator('style').last().evaluate(el => el.remove());
    }
    for (const control of await player.locator('button:visible,a:visible,input:visible').all()) {
      const box = await control.boundingBox();
      assert.ok(box.height >= 44, '44px player control height');
      assert.ok(box.x >= geometry.x && box.x + box.width <= geometry.x + geometry.width, 'control stays inside player');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if ([1440, 375].includes(width) && board === 'posts') {
      await page.screenshot({ path: path.join(output, `player-${theme}-${width}.png`) });
      await page.getByRole('button', { name: 'Back to browsing', exact: true }).click();
      await page.getByRole('heading', { name: 'Music', exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `browse-${theme}-${width}.png`) });
    }
    // Actual shell navigation returns to the feed without replacing the Audio.
    await page.getByTestId(mobile ? 'nav-feed-mobile' : 'nav-feed').click();
    await feed.waitFor();
    await page.waitForFunction(() => !window.musicElements.at(-1)?.paused);
    if (board === 'posts-following') {
      await page.getByTestId('posts-tab-following').click();
      await feed.waitFor();
      await page.locator('[data-testid="posts-tab-following"][aria-selected="true"]').waitFor();
    }
    if (mobile) {
      const fab = await page.getByTestId('new-post-fab').boundingBox();
      const playerBox = await player.boundingBox();
      assert.ok(fab.y + fab.height <= playerBox.y - 8, 'compose also clears the player');
      const clearance = await page.getByTestId('shell-content').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
      assert.ok(clearance >= 72 + 12 + playerBox.height + 24, 'content reserves dock and measured player height');
    }
    if ([1440, 375].includes(width) && board === 'posts') await page.screenshot({ path: path.join(output, `feed-${theme}-${width}.png`) });
    const optics = mobile && board === 'posts' ? await glassPixels(page, player, theme) : undefined;
    const note = page.locator('[data-media-session-title="A studio voice note"]');
    await note.getByRole('button', { name: 'Play audio', exact: true }).click();
    await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'A studio voice note');
    assert.equal(await page.evaluate(() => window.musicElements.at(-1).paused), true);
    await page.evaluate(() => window.sessionHandlers.get('pause')({ action: 'pause' }));
    assert.equal(await note.locator('audio').evaluate(el => el.paused), true);
    await page.evaluate(() => window.sessionHandlers.get('play')({ action: 'play' }));
    await page.waitForFunction(() => !document.querySelector('[data-media-session-title="A studio voice note"] audio').paused);
    const clip = page.locator('[data-media-session-title="A studio video"]');
    await clip.getByRole('button', { name: 'Play video', exact: true }).first().click();
    await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'A studio video');
    await page.evaluate(() => window.sessionHandlers.get('pause')({ action: 'pause' }));
    assert.equal(await clip.locator('video').evaluate(el => el.paused), true);
    await clip.getByRole('button', { name: 'Play video', exact: true }).first().waitFor();
    await page.evaluate(() => window.sessionHandlers.get('play')({ action: 'play' }));
    await page.waitForFunction(() => !document.querySelector('[data-media-session-title="A studio video"] video').paused);
    await clip.getByRole('button', { name: 'Pause video', exact: true }).first().waitFor();
    await page.getByTestId(mobile ? 'nav-messages-mobile' : 'nav-messages').click();
    await page.waitForFunction(() => navigator.mediaSession.playbackState === 'none');
    assert.deepEqual(errors, []);
    receipt.push({ width, theme, board, music: 'persistent', inlineAudio: 'system pause/play', video: 'system pause/play', unmount: 'cleared', geometry: 'pass', optics });
    await page.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log('[feed-player] PASS', receipt.length, 'browser cases');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
