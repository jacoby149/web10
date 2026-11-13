// Actual marketing routes/links; social's destination is an isolated receipt page.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw Error('Set SCREENSHOT_OUTPUT_DIR to the workspace .context directory');
await mkdir(output, { recursive: true });
const port = Number(process.env.HANDOFF_PORT || 4573);
const origin = `http://127.0.0.1:${port}`;
const social = 'https://social.example';
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, VITE_SOCIAL_URL: social },
});
const receipts = [];
let browser;
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw Error('Marketing handoff startup timed out');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    const feedReads = [], errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (/\/v3\/(query|read|users\/directory|groups\/(directory|detail))/.test(url.pathname)) feedReads.push(url.pathname);
      if (url.origin === origin) return route.continue();
      if (url.origin === social) return route.fulfill({ contentType: 'text/html', body: '<title>Social destination fixture</title><h1>Social destination fixture</h1>' });
      const body = url.pathname === '/v3/stats' ? { users: 0, app_count: 0, storage: 0, active_users: {} }
        : url.hostname === 'api.github.com' ? { stargazers_count: 0 } : { posthog_enabled: false };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const openNavigation = async () => {
      if (width < 1024) await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      return page.getByRole('link', { name: 'Trending', exact: true }).filter({ visible: true });
    };
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Your audience.', exact: true }).waitFor();
    const trending = await openNavigation();
    assert.equal(await trending.count(), 1);
    assert.equal(await trending.getAttribute('href'), `${social}/feed`);
    assert.equal(await trending.getAttribute('target'), null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const bounds = await trending.boundingBox();
    if (width < 1024) assert.ok(bounds.height >= 44, 'mobile Trending retains its touch target');
    await trending.focus();
    if (width === 1440 || width === 375) await page.screenshot({ path: path.join(output, `navigation-${theme}-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Enter');
    await page.waitForURL(`${social}/feed`);
    assert.equal(context.pages().length, 1, 'Trending never opens a new tab');
    await page.goBack({ waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).origin, origin);
    await page.getByRole('heading', { name: 'Your audience.', exact: true }).waitFor();
    // Click and keyboard use the same ordinary navigation, on desktop and phones.
    await (await openNavigation()).click();
    await page.waitForURL(`${social}/feed`);
    await page.goBack({ waitUntil: 'networkidle' });
    await page.goto(`${origin}/join`, { waitUntil: 'networkidle' });
    await page.locator('footer').getByRole('link', { name: 'Trending', exact: true }).click();
    await page.waitForURL(`${social}/feed`);
    await page.goBack({ waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/join');

    const retiredGroupPath = `/groups/${encodeURIComponent('api.example/groups/users/alice/jazz')}`;
    await page.goto(`${origin}${retiredGroupPath}`, { waitUntil: 'networkidle' });
    assert.equal(page.url(), `${origin}${retiredGroupPath}`, 'retired group-detail URLs do not redirect');
    assert.equal(await page.getByTestId('group-detail-posts').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Continue to web10 social', exact: true }).count(), 0);

    for (const [legacy, expected] of [
      ['/trending', '/feed'], ['/trending/', '/feed'], ['/trending/posts', '/feed'],
      ['/trending/hot-gossip', '/feed'], ['/trending/video?tag=music', '/video?tag=music'],
      ['/trending/shorts?q=hello', '/shorts?q=hello'], ['/trending/people?section=groups', '/people?section=groups'],
      ['/trending?tab=profiles', '/people'], ['/groups', '/people'],
      ['/trending?q=hello&token=SECRET&api=https://bad.example&servers=PRIVATE', '/feed?q=hello'],
    ]) {
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.goto(`${origin}${legacy}`);
      await page.waitForURL(`${social}${expected}`);
      await page.goBack({ waitUntil: 'networkidle' });
      assert.equal(page.url(), `${origin}/`, 'legacy replacement does not bounce Back into the redirect');
    }
    assert.deepEqual(feedReads, [], 'marketing never fetches a replica feed or directory');
    assert.deepEqual(errors, []);
    receipts.push({ theme, width, sameTab: true, keyboard: true, back: true, legacyRoutes: 10, retiredGroupRoute: true, feedReads, errors });
    await context.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
  console.info('[marketing-handoff] desktop/mobile links, keyboard, Back, legacy replacement and zero discovery reads pass in eight cases');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
