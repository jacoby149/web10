// Real Discover/TopicFilter UI, 1,000 synthetic topics; no network-index claim.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '../../.context/topic-rail');
const port = Number(process.env.SCREENSHOT_PORT || 4518);
const base = `http://localhost:${port}`;
await fs.mkdir(output, { recursive: true });
const server = spawn('bunx', ['vite', '--config', 'screenshots/hashtags.vite.config.ts'], { cwd: root, env: { ...process.env, SCREENSHOT_PORT: String(port) }, stdio: 'pipe' });
let logs = ''; server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
let browser;
let activePage;
const receipt = [];
try {
  const deadline = Date.now() + 30_000;
  while (true) {
    try { if ((await fetch(`${base}/screenshots/hashtags.html`)).ok) break; } catch {}
    assert(Date.now() < deadline, `Server startup failed\n${logs}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    const page = await context.newPage(); const errors = [];
    activePage = page;
    page.on('pageerror', error => { errors.push(error.message); logs += `\n[pageerror] ${error.stack || error.message}`; });
    page.on('console', message => { logs = `${logs}\n[${message.type()}] ${message.text()}`.slice(-60000); });
    const shot = async name => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow in ${name}/${theme}/${width}`);
      if ([1440, 375].includes(width)) await page.screenshot({ path: path.join(output, `${name}-${theme}-${width}.png`), animations: 'disabled' });
    };
    await page.goto(`${base}/hashtag-fixture/topics?discover-prepared-faces=1`);
    await page.getByTestId('browse-topics').waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByTestId('discover-topic').count(), 7);
    assert.equal(await page.getByTestId('topic-result').count(), 0);
    await shot('rail');
    const trigger = page.getByTestId('browse-topics');
    await trigger.focus(); await page.keyboard.press('Enter');
    const input = page.getByRole('searchbox', { name: 'Find a topic' });
    await input.waitFor(); assert(await input.evaluate(element => element === document.activeElement));
    assert.equal(await page.getByTestId('topic-result').count(), 40);
    assert.match(await page.getByTestId('topic-picker').innerText(), /1,000/);
    assert(await page.getByTestId('topic-results').evaluate(element => element.scrollHeight > element.clientHeight && element.clientHeight <= 288));
    await shot('picker');
    await page.getByRole('button', { name: 'Next topics' }).click();
    await page.getByTestId('topic-picker').getByText('41–80 of 1,000', { exact: true }).waitFor();
    assert.match(await page.getByTestId('topic-picker').innerText(), /41–80/);
    await input.fill('#TOPIC_0999');
    await page.getByRole('button', { name: '#topic_0999', exact: true }).waitFor();
    assert.equal(await page.getByTestId('topic-result').count(), 1);
    await page.getByRole('button', { name: '#topic_0999', exact: true }).click();
    await page.getByTestId('topic-picker').waitFor({ state: 'detached' });
    const selected = page.getByRole('tab', { name: '#topic_0999', exact: true });
    assert.equal(await selected.getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByTestId('discover-topic').count(), 8);
    assert.equal(new URL(page.url()).searchParams.get('tag'), 'topic_0999');
    assert(await trigger.evaluate(element => element === document.activeElement));
    assert.equal(await page.getByTestId('discover-card').count(), 1);
    await selected.scrollIntoViewIfNeeded(); await shot('selected');
    await page.goBack(); await page.getByTestId('topic-picker').waitFor();
    assert.equal(await page.getByRole('searchbox', { name: 'Find a topic' }).inputValue(), '#TOPIC_0999');
    await page.goForward(); await page.getByRole('tab', { name: '#topic_0999', exact: true }).waitFor();
    await page.reload(); await page.getByRole('tab', { name: '#topic_0999', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: '#topic_0999', exact: true }).getAttribute('aria-selected'), 'true');
    // Reopen/clear query to test both URL-owned empty/search and Escape.
    await page.getByTestId('browse-topics').click();
    await page.getByRole('searchbox', { name: 'Find a topic' }).fill('missing-topic');
    await page.getByText('No matching topics', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByTestId('topic-picker').waitFor({ state: 'detached' });
    assert.equal(await page.getByTestId('topic-picker').count(), 0);
    assert(await page.getByTestId('browse-topics').evaluate(element => element === document.activeElement));
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(noOverflow, `Overflow ${width}/${theme}`); assert.deepEqual(errors, []);
    receipt.push({ theme, width, topics: 1000, quickChips: 7, maxRows: 40, farSelection: 'topic_0999', paging: true, keyboardFocus: true, history: true, reload: true, empty: true, noOverflow });
    await context.close();
  }
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify({ kind: 'isolated-1000-topic-browser-ui', cases: receipt }, null, 2));
  console.log(`Topic rail browser gates passed: ${receipt.length} cases. ${output}`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
    await fs.writeFile(path.join(output, 'failure.html'), await activePage.content());
    logs += `\nFailure URL: ${activePage.url()}`;
  }
  console.error(logs); throw error;
}
finally { await browser?.close(); server.kill('SIGTERM'); }
