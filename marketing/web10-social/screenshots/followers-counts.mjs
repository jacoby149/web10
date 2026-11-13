// Real Followers loader + count helper + People UI; synthetic membership transport.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../.context/followers-counts');
await mkdir(output, { recursive: true });
const origin = 'http://localhost:4500';
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], { cwd: root, stdio: 'inherit' });
let browser;
const receipt = [];
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(`${origin}/screenshots/harness/index.html`)).ok) break; } catch {}
    if (Date.now() > deadline) throw Error('Followers harness startup timed out');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    await page.goto(`${origin}/screenshots/harness/index.html?screen=people&personFilter=followers&realFollowers=1&realFollowing=1&graphCounts=1`, { waitUntil: 'networkidle' });
    await page.getByTestId('explore-people-list').waitFor();
    const cards = page.getByTestId('people-card');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 13);
    const text = await cards.allTextContents();
    assert.match(text.find(t => t.includes('@luna')), /2 followers/);
    assert.match(text.find(t => t.includes('@vera')), /7 followers/);
    assert.match(text.find(t => t.includes('@nova')), /0 followers/);
    assert.ok(text.every(t => !t.includes('13 followers')));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    receipt.push({ theme, width, filter: 'followers', cards: text });
    if ([1440, 375].includes(width)) await page.screenshot({ path: path.join(output, `followers-${theme}-${width}.png`), animations: 'disabled' });
    for (let round = 0; round < 3; round++) {
      for (const filter of ['following', 'followers', 'all', 'mutuals']) {
        await page.getByTestId(`explore-people-filter-${filter}`).click();
        await page.locator(`[data-testid="explore-people-filter-${filter}"][aria-selected="true"]`).waitFor();
        await page.getByTestId('explore-people-list').waitFor();
        assert.equal(await page.getByTestId(`explore-people-filter-${filter}`).getAttribute('aria-selected'), 'true');
        if (filter === 'all' && round === 0) {
          await page.getByTestId('explore-people-view-more').click();
          await page.getByTestId('explore-people-view-more').waitFor({ state: 'hidden' });
        }
        const texts = await cards.allTextContents();
        const handles = texts.map(text => text.match(/@[a-zA-Z0-9-]+/)?.[0]);
        // Card text is stable per person; repeated React keys must never leave extra nodes.
        assert.equal(new Set(texts).size, texts.length);
        assert.ok(handles.every(Boolean));
        assert.equal(new Set(handles).size, handles.length);
        if (filter === 'following') {
          assert.equal(texts.length, 3);
          assert.match(texts.find(t => t.includes('@luna')), /2 followers/);
          assert.match(texts.find(t => t.includes('@vera')), /7 followers/);
          assert.match(texts.find(t => t.includes('@nova')), /0 followers/);
          if (round === 0 && [1440, 375].includes(width)) await page.screenshot({ path: path.join(output, `following-${theme}-${width}.png`), animations: 'disabled' });
        }
        if (filter === 'all' || filter === 'mutuals') assert.equal(texts.length, 2);
        receipt.push({ theme, width, filter, round, cards: texts });
      }
    }
    await page.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
