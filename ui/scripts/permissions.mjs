// Real app/CSS, synthetic request state and callback spies only. No token,
// grant or API authorization claim. The runner owns and stops its Vite server.
import { chromium } from '../../e2e/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, '..', '.context', 'permissions');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4593);
const origin = `http://localhost:${port}`;
const server = spawn('bun', ['run', 'dev', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
const request = { kind: 'app', app_origin: 'https://notes.example:8443', permissions: { posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'], contacts: ['readAll'] } };
const services = ['posts', 'media', 'public_media', 'profile', 'settings', 'comments', 'reactions', 'contacts', 'web10-social-group-identity', 'notifications', 'saved', 'web10-social-playlist-bookmarks'];
const social = { kind: 'app', app_origin: 'https://social.web10.app', permissions: Object.fromEntries(services.map(s => [s, ['create', 'readAll', 'updateOwn', 'deleteOwn']])) };
const group = { kind: 'group', app_origin: request.app_origin, action: 'create_group', name: 'Close friends', join_policy: 'invite_only', roles: [{ name: 'reader', permissions: { posts: ['readAll'] } }] };
const capture = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
let browser;
const receipts = [];
async function seed(page, requests) {
  await page.goto(`${origin}/?consent=1`, { waitUntil: 'networkidle' });
  await page.evaluate(requests => { window.I.setPendingContracts(requests); window.I.setAuth(true); }, requests);
  await page.getByTestId('consent-req-0').waitFor();
}
async function bounds(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no page overflow');
  for (const id of ['consent-approve-all', 'consent-skip']) {
    const box = await page.getByTestId(id).boundingBox();
    assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= (await page.viewportSize()).height, `${id} remains visible and touch sized`);
  }
}
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Permissions server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const width of [1440, 375, 768, 1280]) for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width, height: width === 375 ? 812 : 900 } });
    // App recreates I on every render. Bind display-only identity and spies
    // at assignment, rather than patching an already-retained older render.
    await context.addInitScript(() => {
      let current;
      window.permissionCalls = [];
      Object.defineProperty(window, 'I', {
        configurable: true,
        get: () => current,
        set: value => {
          current = value;
          value.v3.readToken = () => ({ username: 'alex', provider: 'api.localhost' });
          for (const method of ['approveContract', 'denyContract', 'approveAll', 'skipConsent']) {
            value[method] = argument => window.permissionCalls.push({ method, value: argument });
          }
        },
      });
    });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.fulfill({ json: { configured: true, telemetry: { enabled: false }, users: [], domains: [], status: 'ok' } }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await seed(page, [request]);
    assert.equal(await page.getByText('Read posts you can access', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Create contacts', { exact: true }).count(), 0);
    assert.equal(await page.getByText('readAll', { exact: true }).count(), 0);
    await bounds(page);
    await capture(page, `request-${theme}-${width}`);
    await page.getByTestId('consent-details-0').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByTestId('consent-details-0').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByText(request.app_origin, { exact: true }).count(), 1);
    assert.equal(await page.getByText('readAll', { exact: true }).count(), 2);
    await bounds(page);
    await capture(page, `details-${theme}-${width}`);
    await page.getByTestId('consent-details-0').click();
    // These spies verify UI dispatch, not a real auth round-trip.
    await page.evaluate(() => { window.permissionCalls = []; });
    for (const id of ['consent-approve-0', 'consent-deny-0', 'consent-approve-all', 'consent-skip']) await page.getByTestId(id).click();
    assert.deepEqual(await page.evaluate(() => window.permissionCalls), [
      { method: 'approveContract', value: request }, { method: 'denyContract', value: request },
      { method: 'approveAll', value: undefined }, { method: 'skipConsent', value: undefined },
    ]);
    await seed(page, [social]);
    assert.equal(await page.locator('[data-testid="permission-summary"] section').count(), 1, 'same-set social scopes share one section');
    assert.equal(await page.getByTestId('permission-summary').locator('code').count(), 0, 'primary review has no code badges');
    assert.equal(await page.getByText(/web10-social-group-identity/).count(), 0, 'known namespace stays in details');
    await bounds(page); await capture(page, `social-${theme}-${width}`);
    await seed(page, [request, group]);
    assert.equal(await page.getByText('Create the group “Close friends”', { exact: true }).count(), 1);
    await page.getByTestId('consent-details-1').click();
    assert.equal(await page.getByText(/"reader"/).count(), 1);
    await bounds(page); await capture(page, `group-${theme}-${width}`);
    await seed(page, [{ ...request, permissions: { '*': ['deleteAll'], ['unknown-'.repeat(20)]: ['exportEverything'] } }]);
    assert.equal(await page.getByText('Delete any data you can access', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Use the permission “exportEverything”', { exact: true }).count(), 1);
    await bounds(page);
    // Real console screens, injected display rows; never write a grant.
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(request => {
      window.I.setV3Contracts([{ allowed_origin: request.app_origin, permissions: request.permissions }]);
      window.I.setAuth(true); window.I.setMode('contracts');
    }, request);
    await page.getByTestId('contract-page').getByRole('heading', { name: 'App permissions', exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder('Search app permissions…', { exact: true }).count(), 1);
    await page.getByTestId('app-contract-toggle').click();
    assert.equal(await page.getByText('Read posts you can access', { exact: true }).isVisible(), true);
    await capture(page, `apps-${theme}-${width}`);
    await page.evaluate(() => window.I.setMode('groups'));
    await page.getByTestId('groups-page').getByRole('heading', { name: 'Group permissions', exact: true }).waitFor();
    await page.evaluate(() => window.I.setV3ManagedGroups([{
      group_id: 'api.localhost/groups/users/alex/friends', join_policy: 'invite_only', my_role: 'owner', member_count: 3,
      roles: [
        { name: 'owner', permissions: { posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'], group: ['manageRoles'] } },
        { name: 'reader', permissions: { posts: ['readAll'] } },
      ],
    }]));
    await page.getByTestId('group-card-header').click();
    assert.equal(await page.getByText('Create and change group roles and their permissions', { exact: true }).count(), 1);
    assert.equal(await page.getByText('App Contracts', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Group Contracts', { exact: true }).count(), 0);
    await capture(page, `groups-${theme}-${width}`);
    await page.getByRole('button', { name: 'Edit roles', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit data they created', exact: true }).count(), 3, 'one control for each of the three service rows');
    await capture(page, `roles-${theme}-${width}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(request => {
      window.I.setPendingACRs([{ allowed_origin: request.app_origin, permissions: request.permissions }]);
      window.I.setMode('requests');
    }, request);
    await page.getByTestId('request-page').waitFor();
    assert.equal(await page.getByText('Read posts you can access', { exact: true }).isVisible(), true);
    await capture(page, `pending-${theme}-${width}`);
    assert.deepEqual(errors, []);
    receipts.push({ width, theme, scopes: true, exactDetails: true, callbacksOnly: true, denseSocial: true, groups: true, wildcardUnknown: true, consoleLabels: true });
    await context.close();
  }
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify({ evidence: 'Actual app/CSS, synthetic display state and callback spies. Not connected-node authorization, live consent or phone acceptance.', receipts }, null, 2));
  console.log('[permissions] passed', receipts);
} finally { await browser?.close(); server.kill('SIGTERM'); }
