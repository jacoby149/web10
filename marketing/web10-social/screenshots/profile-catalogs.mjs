// Real UI, local catalog snapshots and Chromium's geolocation implementation.
// Profile/post storage in this harness is synthetic, not connected-node proof.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, '../../.context/profile-catalogs');
const port = process.env.SCREENSHOT_PORT || '4586';
const origin = `http://localhost:${port}`;
const harness = `${origin}/screenshots/harness/index.html`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root, stdio: 'inherit', detached: true, env: { ...process.env, SCREENSHOT_PORT: port },
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) break;
    if (await fetch(harness).then(response => response.ok, () => false)) return;
    await setTimeout(250);
  }
  throw new Error('Screenshot harness did not start');
}

let browser;
try {
  await fs.mkdir(output, { recursive: true });
  await waitForServer();
  browser = await chromium.launch();
  for (const [name, width, height] of [['desktop', 1440, 900], ['375', 375, 812]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', hasTouch: width === 375,
      geolocation: { latitude: 29.424, longitude: -98.494, accuracy: 10 } });
    await context.grantPermissions(['geolocation'], { origin });
    const page = await context.newPage();
    const requests = [];
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    page.on('request', request => { if (request.url().includes('/profile-catalogs/')) requests.push(request.url()); });

    await page.goto(`${harness}?screen=profile-me`);
    await page.getByTestId('edit-profile-button').click();
    assert.equal(requests.length, 0);
    const work = page.getByTestId('employers-catalog-input');
    await work.fill('aapl');
    await page.getByRole('option', { name: /apple inc/i }).waitFor();
    await work.press('ArrowDown');
    await work.press('Enter');
    const school = page.getByTestId('schools-catalog-input');
    await school.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await school.fill('nyu');
    const nyu = page.getByRole('option', { name: /^New York University US$/i });
    await nyu.waitFor();
    await page.screenshot({ path: path.join(output, `profile-edit-${name}.png`) });
    if (width === 375) await nyu.tap(); else await nyu.click();
    await page.getByTestId('save-profile-button').click();
    await page.getByTestId('profile-workplace').getByText(/works at apple inc/i).waitFor();
    await page.getByTestId('profile-school').getByText('Studied at New York University').waitFor();
    await page.screenshot({ path: path.join(output, `profile-saved-${name}.png`) });

    await page.goto(`${harness}?screen=feed`);
    await page.getByTestId('new-post-fab').click();
    await page.getByTestId('composer-textarea').fill('A good evening to be out in the city.');
    await page.getByTestId('add-post-location').click();
    const location = page.getByTestId('cities-catalog-input');
    await location.waitFor();
    assert.equal(requests.length, 2);
    await location.fill('San Antonio TX');
    await page.getByRole('option', { name: 'San Antonio Texas, US', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `post-suggestions-${name}.png`) });
    await location.press('Escape');
    await page.getByTestId('use-device-location').click();
    await page.getByText('Nearby city filled in. You can edit it before posting.').waitFor();
    assert.equal(await location.inputValue(), 'San Antonio, Texas, US');
    assert.deepEqual(requests.map(url => new URL(url).pathname), [
      '/profile-catalogs/employers-v1.json', '/profile-catalogs/schools-v1.json', '/profile-catalogs/cities-v1.json',
    ]);
    assert(requests.every(url => !new URL(url).search));
    await page.screenshot({ path: path.join(output, `post-location-${name}.png`) });
    await page.getByRole('button', { name: 'Clear location' }).click();
    assert.equal(await location.inputValue(), '');
    await context.close();
  }

  const denied = await browser.newPage();
  await denied.goto(`${harness}?screen=composer`);
  await denied.getByTestId('add-post-location').click();
  await denied.getByTestId('use-device-location').click();
  await denied.getByText('Location access wasn’t granted. You can still type a place.').waitFor();
  await denied.getByTestId('cities-catalog-input').fill('A custom venue');
  await denied.getByText('No matches. You can keep what you typed.').waitFor();
  console.log('Profile and composer checks passed at desktop and 375px; GPS denial leaves manual entry available.');
} finally {
  await browser?.close();
  if (server.pid && server.exitCode === null) process.kill(-server.pid, 'SIGTERM');
}
