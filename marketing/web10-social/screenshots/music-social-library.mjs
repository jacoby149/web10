// Real UI and Chromium; isolated in-memory data, not connected persistence proof.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw new Error('Set SCREENSHOT_OUTPUT_DIR to the workspace .context directory');
await mkdir(output, { recursive: true });
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, stdio: 'inherit' });
const url = 'http://localhost:4500/screenshots/harness/index.html?screen=music-playlists';
let browser;
const receipts = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Screenshot server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const [label, width] of [['desktop', 1440], ['375', 375]]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Browse playlists', exact: true }).click();
    await page.getByRole('button', { name: 'Synthwave Sessions', exact: true }).click();
    await page.getByRole('button', { name: /Best Of/ }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `music-curators-${label}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: /Best Of/ }).click();
    await page.getByRole('button', { name: 'Play Last Train Home', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
    await page.getByRole('button', { name: 'Remove saved playlist', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Saved playlists', exact: true }).click();
    await page.getByRole('button', { name: /Best Of/ }).waitFor();
    await page.screenshot({ path: path.join(output, `music-bookmarks-${label}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: /Best Of/ }).click();
    await page.getByRole('button', { name: 'More actions: Last Train Home', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Last Train Home', exact: true });
    await sheet.getByRole('button', { name: /^Like,/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="music-track-menu"] button[aria-label^="Like,"]')?.getAttribute('aria-pressed') === 'true');
    await sheet.getByRole('button', { name: /^Dislike,/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="music-track-menu"] button[aria-label^="Dislike,"]')?.getAttribute('aria-pressed') === 'true');
    await page.screenshot({ path: path.join(output, `music-social-menu-${label}.png`), fullPage: true, animations: 'disabled' });
    await sheet.getByRole('button', { name: 'Save to Saved Music', exact: true }).click();
    await sheet.getByRole('button', { name: 'Remove from Saved Music', exact: true }).waitFor();
    await sheet.getByRole('button', { name: 'Close track menu' }).click();
    await page.getByRole('button', { name: 'Play all', exact: true }).click();
    await page.getByRole('heading', { name: 'Last Train Home', exact: true }).waitFor();
    assert.deepEqual(await page.locator('section[aria-label="Now playing"] ol li').evaluateAll(rows => rows.map(row => row.querySelector('button')?.textContent)), ['Last Train HomeSynthwave Sessions', 'After HoursSynthwave Sessions', 'Blue HourLo-fi Study Room']);
    assert.equal(await page.getByRole('button', { name: /^Dislike,/ }).getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: path.join(output, `music-social-player-${label}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Comments', exact: true }).click();
    await page.getByTestId('music-comments').waitFor();
    assert.deepEqual(errors, []);
    receipts.push({ width, publicGroupBrowse: true, liveBookmarkSaveReturn: true, sourceOrderPlayAll: true, originalPostReactions: true, saveSongFromOtherPlaylist: true, nativeComments: true, errors });
    await page.close();
  }
  await writeFile(path.join(output, 'music-social-library-receipt.json'), JSON.stringify({ evidence: 'Chromium with isolated in-memory data; not real-node persistence/auth/phone', receipts }, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
