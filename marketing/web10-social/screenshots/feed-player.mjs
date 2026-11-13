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
async function frostChecks(page, player) {
  await page.evaluate(() => window.sessionHandlers.get('pause')({ action: 'pause' }));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused');
  assert.equal(await player.locator('.chrome-dock-rim, filter, feDisplacementMap').count(), 0, 'player has no refraction layers or lens');
  await page.getByTestId('dock-refraction').waitFor();
  assert.notEqual(await player.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).backdropFilter), 'none', 'player keeps its ordinary frost');
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  assert.equal(await player.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await player.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).clipPath), 'none');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await player.evaluate(el => getComputedStyle(el, '::after').display), 'none');
  await page.emulateMedia({ forcedColors: 'none' });
  return { playerRefraction: false, dockRefraction: true, contrast };
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
    let identityReads = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.text().includes('Maximum update depth')) errors.push(message.text()); });
    page.on('console', message => { if (message.text().includes('[social-identity] loading eligible identities')) identityReads++; });
    page.on('console', message => { if (message.text().startsWith('[music') || message.text().startsWith('[feed-media-session]')) console.log(message.text()); });
    await page.addInitScript(() => {
      window.sessionHandlers = new Map();
      const set = MediaSession.prototype.setActionHandler;
      MediaSession.prototype.setActionHandler = function (name, handler) { window.sessionHandlers.set(name, handler); return set.call(this, name, handler); };
      window.musicElements = [];
      window.Audio = new Proxy(window.Audio, { construct(target, args) { const element = Reflect.construct(target, args); window.musicElements.push(element); return element; } });
    });
    await page.goto(`${base}?screen=${board}&feed-player-repair=1&signin-prompts=1`, { waitUntil: 'networkidle' });
    const feed = page.getByTestId('music-feed-media').first();
    await feed.waitFor();
    const invitation = page.getByTestId('post-entry-prompt');
    await invitation.locator('img').waitFor();
    assert.equal(await invitation.locator('input,textarea,[contenteditable]').count(), 0, 'invitation is not an inline editor');
    await invitation.getByRole('button', { name: 'Create a post', exact: true }).click();
    await page.getByRole('dialog', { name: 'New post', exact: true }).waitFor();
    await page.getByTestId('new-post-sheet-close').click();
    const scroll = page.getByTestId('shell-content');
    await scroll.evaluate(el => { el.scrollTop = 700; });
    await page.waitForFunction(() => document.querySelector('[data-testid="post-entry-prompt"]').getBoundingClientRect().bottom < document.querySelector('[data-testid="shell-content"]').getBoundingClientRect().top);
    await scroll.evaluate(el => { el.scrollTop = 0; });
    if ([1440, 375].includes(width) && board === 'posts') {
      await page.screenshot({ path: path.join(output, `compose-idle-${theme}-${width}.png`) });
    }
    assert.equal(await feed.locator('audio,video').count(), 0, 'no second music transport');
    const feedNode = await feed.elementHandle();
    const play = feed.getByRole('button', { name: 'Play music', exact: true });
    await play.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    await play.click();
    await page.getByTestId('music-player').waitFor().catch(async error => {
      await page.screenshot({ path: path.join(output, 'failure.png') });
      console.error('[feed-player] failure', await page.locator('body').innerText(), errors);
      throw error;
    });
    assert.equal(await feed.count(), 1, 'playing music keeps the Posts feed mounted');
    assert.equal(await feedNode.evaluate(el => el.isConnected), true, 'original feed node is retained');
    assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'playing music retains scroll position');
    await page.locator(`[data-testid="posts-tab-${board === 'posts-following' ? 'following' : 'discover'}"][aria-selected="true"]`).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Now playing', exact: true }).count(), 0, 'expanded Music destination is explicit only');
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
    assert.equal(await player.locator('a').count(), 0, 'the mini-player cannot navigate away from Posts');
    await player.getByTestId('music-player-details').click();
    assert.equal(await feedNode.evaluate(el => el.isConnected), true);
    assert.equal(await player.getByRole('button', { name: 'Previous track' }).isVisible(), true);
    assert.equal(await player.getByRole('button', { name: 'Next track' }).isEnabled(), true, 'loaded feed music is a real queue');
    await player.getByRole('button', { name: 'Next track' }).click();
    await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'Slow Sunday');
    await page.evaluate(() => window.sessionHandlers.get('seekto')({ action: 'seekto', seekTime: 0 }));
    await player.getByRole('button', { name: 'Previous track' }).click();
    await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'After Hours');
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
    }
    // Only explicit app navigation enters Music; the bar has no Queue target.
    await page.getByTestId(mobile ? 'nav-music-mobile' : 'nav-music').click();
    await player.getByRole('link', { name: 'Open player: After Hours' }).click();
    await page.getByRole('region', { name: 'Now playing', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Queue', exact: true }).click();
    await page.getByRole('heading', { name: 'Your queue', exact: true }).waitFor();
    await page.getByTestId(mobile ? 'nav-feed-mobile' : 'nav-feed').click();
    await feed.waitFor();
    await page.waitForFunction(() => !window.musicElements.at(-1)?.paused);
    if (board === 'posts-following') {
      await page.getByTestId('posts-tab-following').click();
      await feed.waitFor();
      await page.locator('[data-testid="posts-tab-following"][aria-selected="true"]').waitFor();
    }
    const fab = page.getByTestId('new-post-fab');
    const fabBox = await fab.boundingBox();
    const playerBox = await player.boundingBox();
    assert.ok(fabBox.y + fabBox.height <= playerBox.y - 8, 'compose also clears the player on desktop and phone');
    assert.equal(fabBox.height, 48, 'compact 48px compose control, not the old 64px orb');
    assert.ok(mobile ? fabBox.width === 48 : fabBox.width > 48 && fabBox.width <= 160, 'icon on mobile, labelled desktop pill');
    assert.equal(await fab.evaluate(el => getComputedStyle(el).backgroundImage), 'none', 'no purple gradient fill');
    assert.equal(await fab.evaluate(el => getComputedStyle(el).boxShadow), 'none', 'no dark shadow halo or inset ring');
    assert.equal(await fab.locator('span').isVisible(), !mobile, 'desktop New post label');
    await page.keyboard.press('Tab');
    await fab.focus();
    assert.equal(await fab.evaluate(el => el.matches(':focus-visible')), true);
    assert.equal(await fab.evaluate(el => getComputedStyle(el).outlineStyle), 'solid', 'keyboard focus keeps a real outline without a shadow');
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'New post', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.musicElements.at(-1).paused), false, 'opening composer retains playback');
    await page.getByTestId('new-post-sheet-close').click();
    await fab.waitFor();
    if (mobile) {
      const clearance = await page.getByTestId('shell-content').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
      assert.ok(clearance >= 72 + 12 + playerBox.height + 24, 'content reserves dock and measured player height');
    }
    if ([1440, 375].includes(width) && board === 'posts') await page.screenshot({ path: path.join(output, `feed-${theme}-${width}.png`) });
    const optics = mobile && board === 'posts' ? await frostChecks(page, player) : undefined;
    const note = page.locator('[data-media-session-title="A studio voice note"]');
    await note.getByRole('button', { name: 'Play audio', exact: true }).click();
    await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'A studio voice note');
    assert.equal(await page.evaluate(() => window.musicElements.at(-1).paused), true);
    await page.evaluate(() => window.sessionHandlers.get('pause')({ action: 'pause' }));
    assert.equal(await note.locator('audio').evaluate(el => el.paused), true);
    await page.evaluate(() => window.sessionHandlers.get('play')({ action: 'play' }));
    await page.waitForFunction(() => !document.querySelector('[data-media-session-title="A studio voice note"] audio').paused);
    const musicVideo = page.getByTestId('music-feed-media').filter({ has: page.getByRole('button', { name: 'Open player: Studio Session' }) });
    await musicVideo.getByRole('button', { name: 'Play music', exact: true }).click();
    await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'Studio Session');
    assert.equal(await player.count(), 1, 'a music video keeps the music transport');
    const clip = page.locator('[data-media-session-title="A studio video"]');
    await clip.getByRole('button', { name: 'Play video', exact: true }).first().click();
    await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'A studio video');
    assert.equal(await player.count(), 0, 'ordinary video dismisses the music transport');
    await page.evaluate(() => window.sessionHandlers.get('pause')({ action: 'pause' }));
    assert.equal(await clip.locator('video').evaluate(el => el.paused), true);
    await clip.getByRole('button', { name: 'Play video', exact: true }).first().waitFor();
    await page.evaluate(() => window.sessionHandlers.get('play')({ action: 'play' }));
    await page.waitForFunction(() => !document.querySelector('[data-media-session-title="A studio video"] video').paused);
    await clip.getByRole('button', { name: 'Pause video', exact: true }).first().waitFor();
    if (mobile) {
      assert.equal(await page.getByRole('navigation', { name: 'Primary mobile', exact: true }).getByTestId('nav-messages-mobile').count(), 0);
      await page.getByTestId('nav-more-mobile').click();
      await page.getByTestId('nav-messages-badge-mobile').waitFor();
      const profileCard = page.getByTestId('nav-profile-mobile');
      assert.equal(await profileCard.locator('img').count(), 1, 'premier profile card uses the resolved personal photo');
      const beforeAppearance = await profileCard.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('[data-testid="nav-appearance-mobile"]')) & Node.DOCUMENT_POSITION_FOLLOWING));
      assert.equal(beforeAppearance, true, 'personal profile is first in More');
      if ([375].includes(width) && board === 'posts') await page.screenshot({ path: path.join(output, `more-${theme}-${width}.png`) });
      await profileCard.click();
      await page.getByTestId('profile-name').waitFor();
    }
    await page.locator('[data-testid="acting-identity-trigger"]:visible').click();
    await page.getByRole('dialog', { name: 'Profile', exact: true }).waitFor();
    assert.equal(identityReads, 0, 'ordinary profile menu never loads the power-user identity picker');
    if ([1440, 375].includes(width) && board === 'posts') await page.screenshot({ path: path.join(output, `profile-menu-${theme}-${width}.png`) });
    await page.getByRole('button', { name: 'View profile', exact: true }).click();
    await page.getByTestId('profile-name').waitFor();
    assert.equal(identityReads, 0);
    await page.locator('[data-testid="acting-identity-trigger"]:visible').click();
    await page.getByRole('button', { name: 'Change posting identity', exact: true }).click();
    await page.getByRole('dialog', { name: 'Choose acting identity', exact: true }).waitFor();
    assert.ok(identityReads > 0, 'the secondary action loads the unchanged confirmed picker');
    await page.getByRole('button', { name: 'Close identities', exact: true }).click();
    if (mobile) await page.getByTestId('nav-more-mobile').click();
    await page.getByTestId(mobile ? 'nav-messages-mobile' : 'nav-messages').click();
    if (mobile) await page.locator('[data-testid="nav-more-mobile"][aria-current="page"]').waitFor();
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
