// Self-booting, real-UI people-picker matrix. Data is isolated screenshot fixtures.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || path.join(root, '../../.context/mentions'));
const port = Number(process.env.SCREENSHOT_PORT || 4504);
const origin = `http://localhost:${port}`;
await mkdir(out, { recursive: true });
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, env: { ...process.env, SCREENSHOT_PORT: String(port) }, stdio: 'inherit' });
let browser;
const receipts = [];
const check = (condition, message) => { if (!condition) throw new Error(message); };
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
  ];
  for (const [label, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 375, height: 812 } })) {
    const context = await browser.newContext({ viewport, hasTouch: label === 'mobile' });
    for (const [name, screen, opener] of surfaces.filter(([name]) => !process.env.MENTIONS_SURFACE || process.env.MENTIONS_SURFACE === name)) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/screenshots/harness/index.html?screen=${screen}&people-tags=1`, { waitUntil: 'networkidle' });
      check(!errors.length, `${name}: ${errors.join('\n')}`);
      if (name === 'shorts') await page.locator('[data-testid^="short-wall-tile-"]').first().click();
      await page.locator(opener).first().click();
      const input = page.getByTestId('comment-input').first();
      await input.fill('Come listen @no');
      const nova = page.getByRole('option', { name: /Nova Lane/ });
      await nova.waitFor();
      const menu = await page.getByTestId('mention-suggestions').boundingBox();
      check(menu && menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= viewport.width + 1 && menu.y + menu.height <= viewport.height + 1, `${name}: menu outside viewport`);
      await page.screenshot({ path: path.join(out, `${name}-picker-${label}.png`) });
      if (name === 'shorts' || name === 'permalink') {
        await input.press('Escape');
        check(await page.getByTestId('mention-suggestions').count() === 0, `${name}: Escape did not dismiss suggestions`);
        check(await input.isVisible(), `${name}: Escape closed the conversation instead of just suggestions`);
        await input.press('v');
        await nova.waitFor();
      }
      if (label === 'mobile') await nova.tap(); else await nova.click();
      check(await input.inputValue() === 'Come listen @nova ', `${name}: wrong inserted handle`);
      check(await input.evaluate(el => document.activeElement === el && el.selectionStart === el.value.length), `${name}: caret/focus was lost`);
      check(await input.evaluate(el => { const box = el.getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === el; }), `${name}: fixed chrome covers the comment input`);
      await input.press('Enter');
      await page.waitForFunction(() => window.__mentionWrites?.some(write => write.kind === 'comment' && write.text === 'Come listen @nova'));
      const write = await page.evaluate(() => window.__mentionWrites.find(write => write.kind === 'comment'));
      check(!!write.postId, `${name}: comment lost post target`);
      // Reply and edit use the same picker, and must retain their original target.
      if (name === 'video') {
        await page.locator('[data-testid="comment-reply-tc-1"]').click();
        await input.fill('@ka');
        await page.getByRole('option', { name: /Kai Moreno/ }).waitFor();
        await input.press('Tab');
        await input.press('Enter');
        await page.waitForFunction(() => window.__mentionWrites?.some(write => write.parentId === 'tc-1' && write.text === '@kai'));
        const own = page.locator('[data-testid^="comment-edit-written-"]').first();
        await own.click();
        await input.fill('Changed @no');
        await page.getByRole('option', { name: /Noah Reed/ }).waitFor();
        await input.press('ArrowDown'); await input.press('Enter');
        check(await input.inputValue() === 'Changed @noah ', 'Edit selection published prematurely');
        await page.getByTestId('comment-save').click();
        await page.waitForFunction(() => window.__mentionWrites?.some(write => write.kind === 'edit' && write.text === 'Changed @noah'));
      }
      receipts.push({ viewport: label, surface: name, sourcePost: write.postId, picked: 'nova', published: true, errors });
      await writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipts, null, 2));
      console.log('[mentions-smoke] PASS', label, name, write.postId);
      await page.close();
    }
    const page = await context.newPage();
    await page.goto(`${origin}/screenshots/harness/index.html?screen=composer&people-tags=1`, { waitUntil: 'networkidle' });
    const editor = page.getByTestId('composer-textarea');
    await editor.fill('A track for @no');
    await page.getByRole('option', { name: /Nova Lane/ }).waitFor();
    await page.screenshot({ path: path.join(out, `caption-picker-${label}.png`) });
    await editor.press('ArrowDown'); await editor.press('Enter');
    check((await editor.innerText()).trim() === 'A track for @noah', 'Caption picker failed');
    await editor.press('ArrowLeft');
    for (let i = 0; i < 5; i++) await editor.press('Shift+ArrowLeft');
    await page.keyboard.insertText('@ka');
    await page.getByRole('option', { name: /Kai Moreno/ }).waitFor();
    await editor.press('Tab');
    check((await editor.innerText()).trim() === 'A track for @kai', 'Editing a selected tag kept its old recipient');
    console.log('[mentions-smoke] caption after tag edit', await editor.innerHTML());
    await page.getByTestId('post-submit').click();
    await page.waitForFunction(() => window.__mentionWrites?.some(write => write.kind === 'post'));
    const caption = await page.evaluate(() => window.__mentionWrites.find(write => write.kind === 'post').text);
    console.log('[mentions-smoke] saved caption', caption);
    check(caption === 'A track for [@kai](web10:kai)', `Caption stored the wrong recipient: ${caption}`);
    receipts.push({ viewport: label, surface: 'caption', picked: 'noah', editedTag: 'kai', published: true });
    console.log('[mentions-smoke] PASS', label, 'caption');
    await page.close(); await context.close();
  }
  await writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipts, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
