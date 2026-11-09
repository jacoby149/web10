// Real marketing routes + shared cards; isolated feed data with a held profile
// response proves content paints BEFORE identity. No login or production writes.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw new Error('Set SCREENSHOT_OUTPUT_DIR to a workspace .context directory');
await mkdir(output, { recursive: true });
const avatar = await readFile(process.env.PROFILE_AVATAR_FIXTURE || path.join(output, 'avatar.jpg'));
const port = Number(process.env.PROFILE_PAINT_PORT || 4573);
const origin = `http://127.0.0.1:${port}`;
const server = spawn('bunx', ['--no-install', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let browser;
const receipts = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Marketing server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const [label, width] of [['desktop', 1440], ['375', 375]]) {
    for (const [view, card, pending] of [['posts', 'trending-card', 'discover-author-name-loading'], ['video', 'home-card', 'home-author-name-loading'], ['shorts', 'shorts-card', 'home-author-name-loading']]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let release;
      const held = new Promise(resolve => { release = resolve; });
      let profileReads = 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'profile-fixture.example') return route.fulfill({ contentType: 'image/jpeg', body: avatar });
        let body = {};
        if (url.pathname === '/v3/query') {
          const query = route.request().postDataJSON();
          assert.equal(query.token, undefined);
          if (query.prepare?.face?.bodyField === 'body') {
            profileReads++;
            assert.deepEqual(query.groups, ['api.web10.app/groups/users/adam/followers']);
            await held;
            body = { rows: [{ author_key: 'adam', body: { display_name: 'Adam Malev' }, avatar_url: 'https://profile-fixture.example/avatar.jpg' }] };
          } else {
            body = { rows: [{ doc_id: 'paint-fixture', author_key: 'adam', score: 1, likes: 2, comments: 1, reposts: 0,
              created_at: new Date(Date.now() - 3600000).toISOString(), tags: ['comedy'], body: {
                title: 'Comedians and strangers in NYC', text: 'Profile paint-first verification fixture.',
                media_refs: [{ doc_id: 'fixture-media', mime_type: 'video/mp4', width: view === 'video' ? 1280 : 720, height: view === 'video' ? 720 : 1280,
                  read_url: 'https://profile-fixture.example/video.mp4', thumbnail_url: 'https://profile-fixture.example/poster.jpg' }],
              } }] };
          }
        } else if (url.pathname === '/v3/stats') body = { users: 1, app_count: 0, storage: 0, active_users: {} };
        else if (url.pathname === '/telemetry') body = { posthog_enabled: false };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
      });
      await page.goto(`${origin}/trending${view === 'posts' ? '' : `/${view}`}`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId(card).first().waitFor();
      await page.getByTestId(pending).first().waitFor();
      assert.equal(await page.getByRole('img', { name: 'Adam Malev', exact: true }).count(), 0);
      await page.screenshot({ path: path.join(output, `${view}-pending-${label}.png`), animations: 'disabled' });
      release();
      const image = page.getByTestId(card).first().locator('img[src="https://profile-fixture.example/avatar.jpg"]');
      await image.waitFor();
      await image.evaluate(image => image.decode());
      assert.equal(await page.getByTestId(pending).count(), 0);
      assert.equal(profileReads, 1);
      assert.ok((await page.getByTestId(card).first().locator('a[href$="/u/adam"]').first().getAttribute('href')).endsWith('/u/adam'));
      assert.ok((await page.getByTestId(card).first().textContent()).includes('Adam Malev'));
      await page.screenshot({ path: path.join(output, `${view}-settled-${label}.png`), animations: 'disabled' });
      assert.deepEqual(errors, []);
      receipts.push({ view, width, profileReads, contentBeforeProfile: true, decodedAvatar: true, noPageErrors: true });
      await context.close();
    }
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
  console.log('[profile-paint] all six route/viewport controls pass');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
