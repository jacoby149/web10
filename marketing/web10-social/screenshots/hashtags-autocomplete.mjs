// Real composers and picker, isolated query/write transport; not live-node counts.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, '../../.context/hashtag-autocomplete');
const port = Number(process.env.SCREENSHOT_PORT || 4516);
const origin = `http://localhost:${port}`;
await mkdir(out, { recursive: true });
const server = spawn('bunx', ['--no-install', 'vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, env: { ...process.env, SCREENSHOT_PORT: String(port) }, stdio: 'inherit' });
const check = (ok, message) => { if (!ok) throw new Error(message); };
let browser;
const receipt = [];
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (i > 100) throw new Error('Screenshot server did not start');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  const surfaces = [
    ['posts', 'posts-following', '[data-testid="comment-button"]'],
    ['discover', 'hot-gossip', '[data-testid="comment-button"]'],
    ['video', 'watch', '[data-testid="comment-button"]'],
    ['shorts', 'shorts', 'button[aria-label="View comments"]'],
    ['music', 'music-player', 'button:has-text("Comments")'],
    ['profile', 'profile-feed', '[data-testid="comment-button"]'],
    ['group', 'groups-detail', '[data-testid="comment-button"]'],
    ['permalink', 'post-detail', 'button:has-text("Comment")'],
    ['caption', 'composer', null], ['caption-edit', 'composer', null], ['caption-repost', 'composer', null],
  ];
  for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 }, hasTouch: width === 375 });
    await context.addInitScript(theme => localStorage.setItem('web10-social:theme', theme), theme);
    // Full cross-surface coverage at desktop/phone; intermediate widths exercise captions.
    for (const [name, screen, opener] of surfaces.filter(([name]) => (!process.env.HASHTAG_SURFACE || name.startsWith(process.env.HASHTAG_SURFACE)) && ([1440, 375].includes(width) || name === 'caption'))) {
      console.log('[hashtag-autocomplete] START', theme, width, name);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' || message.text().startsWith('[hashtags]')) console.log('[browser]', message.text()); });
      await page.goto(`${origin}/screenshots/harness/index.html?screen=${screen}&people-tags=1${name === 'caption-edit' ? '&edit=1' : name === 'caption-repost' ? '&repost=1' : ''}`, { waitUntil: 'networkidle' });
      if (name === 'shorts') await page.locator('[data-testid^="short-wall-tile-"]').first().click();
      if (opener) await page.locator(opener).first().click();
      const input = page.getByTestId(opener ? 'comment-input' : 'composer-textarea').filter({ visible: true }).first();
      await page.screenshot({ path: path.join(out, 'last-before-input.png') });
      await input.fill('Listen #music');
      const option = page.getByRole('option', { name: '#music 100,000 public posts', exact: true });
      await option.waitFor();
      check(await page.getByRole('listbox', { name: 'Matching hashtags' }).getByRole('option').first().getAttribute('id') === await option.getAttribute('id'), `${name}: exact match lost to popularity`);
      const menu = await page.getByTestId('hashtag-suggestions').boundingBox();
      const viewport = page.viewportSize();
      check(menu && menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= width + 1 && menu.y + menu.height <= viewport.height + 1, `${name}: menu outside viewport`);
      check(await page.getByTestId('hashtag-suggestions').evaluate(el => [...el.querySelectorAll('[role=option]')].every(row => row.getBoundingClientRect().height >= 44)), `${name}: undersized targets`);
      if (['caption', 'caption-edit', 'posts'].includes(name) && [1440, 375].includes(width)) await page.screenshot({ path: path.join(out, `${name}-${theme}-${width}.png`) });
      await input.press('Escape'); check(await page.getByTestId('hashtag-suggestions').count() === 0, `${name}: Escape failed`);
      check(await input.isVisible(), `${name}: Escape closed the composer`);
      await input.fill('Listen #mus'); await option.waitFor();
      if (width === 375) await option.tap(); else { await input.press('ArrowDown'); await input.press('Tab'); }
      const text = opener ? await input.inputValue() : await input.innerText();
      check(text.replace(/\u00a0/g, ' ').trim() === 'Listen #music', `${name}: completion changed surrounding text: ${text}`);
      check(await input.evaluate(el => document.activeElement === el), `${name}: focus lost`);
      if (!opener) {
        check(await input.locator('a').count() === 0, `${name}: hashtag became a mention link`);
        await page.getByTestId('post-submit').click();
        const kind = name === 'caption-edit' ? 'post-edit' : name === 'caption-repost' ? 'repost' : 'post';
        await page.waitForFunction(kind => window.__mentionWrites?.some(write => write.kind === kind && write.text === 'Listen #music'), kind);
      } else {
        await input.press('Enter');
        await page.waitForFunction(() => window.__mentionWrites?.some(write => write.kind === 'comment' && write.text === 'Listen #music'));
        if (name === 'video') {
          await page.getByTestId('comment-reply-tc-1').click();
          await input.fill('Reply #music'); await option.waitFor(); await input.press('Enter');
          check(await input.inputValue() === 'Reply #music ', 'Reply completion submitted early');
          await input.press('Enter');
          await page.waitForFunction(() => window.__mentionWrites?.some(write => write.parentId === 'tc-1' && write.text === 'Reply #music'));
          await page.locator('[data-testid^="comment-edit-written-"]').first().click();
          await input.fill('Edited #music'); await option.waitFor(); await input.press('Tab');
          await page.getByTestId('comment-save').click();
          await page.waitForFunction(() => window.__mentionWrites?.some(write => write.kind === 'edit' && write.text === 'Edited #music'));
        }
      }
      check(errors.length === 0, `${name}: ${errors.join('\n')}`);
      receipt.push({ theme, width, surface: name, exactMatchFirst: true, compactCount: true, completed: true });
      console.log('[hashtag-autocomplete] PASS', theme, width, name);
      await page.close();
    }
    await context.close();
  }
  // Designed async states and recovery; the browser transport is explicitly synthetic.
  for (const state of ['loading', 'empty', 'error']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(`${origin}/screenshots/harness/index.html?screen=composer&hashtagState=${state}`, { waitUntil: 'networkidle' });
    const input = page.getByTestId('composer-textarea'); await input.fill('Listen #music');
    const message = state === 'loading' ? 'Finding hashtags' : state === 'empty' ? 'No matching hashtags yet. Keep typing to start a new one.' : "Couldn't find hashtags. Your draft is safe.";
    await page.getByText(message, { exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, `caption-${state}-375.png`) });
    if (state === 'error') {
      await page.evaluate(() => history.replaceState(null, '', location.href.replace('hashtagState=error', 'hashtagState=ready')));
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.getByRole('option', { name: '#music 100,000 public posts', exact: true }).waitFor();
      check((await input.innerText()).trim() === 'Listen #music', 'Retry lost draft');
    }
    receipt.push({ state, draftRetained: true }); await page.close();
  }
  await writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
