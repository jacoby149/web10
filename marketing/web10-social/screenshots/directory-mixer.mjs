// Self-booting actual-app gate. API data is synthetic and every external request intercepted.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw Error('Set SCREENSHOT_OUTPUT_DIR to the workspace .context directory');
await mkdir(output, { recursive: true });
const servers = [], receipts = [];
let browser;
const home = 'https://home.example';
const datasets = Array.from({ length: 48 }, (_, i) => ({ username: `creator-${i}`, follower_count: 500 - i * 10,
  created_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), profile: { display_name: i === 0 ? 'Avery Stone' : i === 47 ? 'Jordan Vale' : `Creator ${i}` } }));
try {
  browser = await chromium.launch();
  // D111 retires marketing's directory replica; this gate now owns social only.
  for (const app of ['social']) {
    const port = Number(process.env.DIRECTORY_PORT || 4591), origin = `http://127.0.0.1:${port}`;
    const cwd = root;
    const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd, stdio: 'inherit', env: { ...process.env, VITE_API_ORIGIN: home, VITE_API_URL: home,
        VITE_AUTH_ORIGIN: 'https://auth.example', VITE_AUTH_URL: 'https://auth.example' },
    });
    servers.push(server);
    const deadline = Date.now() + 30000;
    for (;;) {
      try { if ((await fetch(origin)).ok) break; } catch {}
      if (Date.now() > deadline) throw Error('Directory browser startup timed out');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    for (const theme of ['dark', 'light']) for (const width of [1440, 375, 768, 1280].filter(width => !process.env.DIRECTORY_WIDTH || Number(process.env.DIRECTORY_WIDTH) === width)) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 375, colorScheme: theme, reducedMotion: 'reduce' });
      const reads = [], errors = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        let data = {};
        let payload = {};
        try { payload = request.postDataJSON() ?? {}; } catch {}
        if (url.pathname === '/v3/users/directory') {
          const { limit = 20, offset = 0, sort = 'popular' } = payload;
          const ordered = sort === 'newest' ? [...datasets].reverse() : datasets;
          data = { users: ordered.slice(offset, offset + limit), sort, limit, offset };
          reads.push({ kind: 'profiles', origin: url.origin, limit, offset, sort, token: payload.token });
        } else if (url.pathname === '/v3/groups/directory') {
          const limit = Number(url.searchParams.get('limit') ?? 20), offset = Number(url.searchParams.get('offset') ?? 0), sort = url.searchParams.get('sort') ?? 'popular';
          const groups = datasets.map((person, i) => ({ group_id: `${url.host}/groups/users/curator/club-${i}`, name: i === 0 ? 'Film Club' : i === 47 ? 'New Music Collective' : `Club ${i}`, owner: 'curator', member_count: person.follower_count,
            created_at: person.created_at, join_policy: 'open', permission_summary: 'Read' }));
          data = { groups: (sort === 'newest' ? groups.reverse() : groups).slice(offset, offset + limit), sort, limit, offset };
          reads.push({ kind: 'groups', origin: url.origin, limit, offset, sort });
        } else if (url.pathname === '/v3/query') data = { rows: [], count: 0 };
        else if (url.pathname === '/telemetry') data = { posthog_enabled: false };
        else if (url.pathname === '/v3/stats') data = { users: 48, app_count: 0, storage: 0, active_users: {} };
        else if (url.hostname === 'api.github.com') data = { stargazers_count: 0 };
        else if (url.pathname === '/v3/groups/list') data = [];
        else data = { documents: [], docs: [], rows: [], groups: [], members: [] };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
      });
      const page = await context.newPage();
      page.on('pageerror', error => { errors.push(error.message); console.error('[directory-browser]', error.message); });
      const route = '/people';
      await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
      await page.getByLabel('Sort profiles', { exact: true }).waitFor();
      await page.getByText('Avery Stone', { exact: true }).waitFor();
      await page.getByRole('radio', { name: 'Most followers', exact: true }).focus();
      assert.equal(await page.getByRole('radio', { name: 'Most followers', exact: true }).evaluate(node => {
        const style = getComputedStyle(node.nextElementSibling);
        return style.boxShadow !== 'none';
      }), true, 'radio label has a visible keyboard focus ring');
      await page.keyboard.press('ArrowRight');
      await page.getByText('Jordan Vale', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('peopleSort'), 'newest');
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('radio', { name: 'Newest', exact: true }).isChecked(), true);
      await page.getByText('Most followers', { exact: true }).click();
      await page.getByText('Avery Stone', { exact: true }).waitFor();
      await page.goBack({ waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('radio', { name: 'Newest', exact: true }).isChecked(), true);
      await page.getByText('Jordan Vale', { exact: true }).waitFor();
      const selector = page.getByTestId('directory-sort-selector');
      for (const target of await selector.locator('label > span, button').all()) {
        const bounds = await target.boundingBox();
        assert.ok(bounds.width >= 44 && bounds.height >= 44, 'all selector targets are touch-sized');
      }
      assert.equal(await page.getByTestId('directory-advanced-panel').getAttribute('aria-hidden'), 'true');
      if (width === 1440 || width === 375) {
        await page.screenshot({ path: path.join(output, `${app}-profiles-collapsed-${theme}-${width}.png`), animations: 'disabled' });
        await selector.screenshot({ path: path.join(output, `${app}-selector-${theme}-${width}.png`), animations: 'disabled' });
      }
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Hide controls', exact: true }).getAttribute('aria-expanded'), 'true');
      await page.getByTestId('server-mixer').waitFor();
      assert.ok((await page.getByTestId('server-mixer').innerText()).includes('profiles / page'));
      assert.equal(await page.getByTestId('knob-rack').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 1440 || width === 375) await page.screenshot({ path: path.join(output, `${app}-profiles-${theme}-${width}.png`), animations: 'disabled' });
      await page.getByRole('tab', { name: 'Groups', exact: true }).click();
      await page.getByRole('tab', { name: 'Discover', exact: true }).click();
      await page.getByLabel('Sort groups', { exact: true }).waitFor();
      assert.equal(await page.getByRole('radio', { name: 'Most members', exact: true }).isChecked(), true);
      if (width === 375) await page.getByText('Newest', { exact: true }).tap();
      else await page.getByText('Newest', { exact: true }).click();
      await page.getByText('New Music Collective', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('peopleSort'), 'newest');
      assert.equal(new URL(page.url()).searchParams.get('groupSort'), 'newest');
      assert.ok((await page.getByTestId('server-mixer').innerText()).includes('groups / page'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 1440 || width === 375) await page.screenshot({ path: path.join(output, `${app}-groups-${theme}-${width}.png`), animations: 'disabled' });
      await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
      await page.getByRole('button', { name: 'Advanced', exact: true }).waitFor();
      assert.equal(await page.getByTestId('directory-advanced-panel').getAttribute('aria-hidden'), 'true');
      assert.equal(await page.getByRole('radio', { name: 'Newest', exact: true }).isChecked(), true);
      assert.equal(new URL(page.url()).searchParams.has('tune'), false);
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
      assert.equal(errors.length, 0, errors.join('\n'));
      assert.ok(reads.filter(row => row.kind === 'profiles').some(row => row.sort === 'newest'));
      assert.ok(reads.every(row => !row.token), 'public browser never supplies a token');
      receipts.push({ app, theme, width, reads, errors });
      await context.close();
    }
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipts, null, 2));
  console.log('[directory-browser] social, both sorts, both themes and all widths pass');
} finally {
  await browser?.close();
  for (const server of servers) server.kill('SIGTERM');
}
