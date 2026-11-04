/* Connected browser scenario; no traces, token injection or mocked node/DNS requests. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { join } from 'node:path';
const require = createRequire(new URL('../../e2e/package.json', import.meta.url));
const { chromium, request: requests } = require('@playwright/test');
const app = process.env.DOMAIN_DEMO_ORIGIN, out = process.env.DOMAIN_DEMO_OUT;
assert.ok(new URL(app).hostname === '127.0.0.1');
const config = await (await fetch(`${app}/config.json`)).json();
const password = 'synthetic-demo-password', cases = [], events = [];
let phase = 'start', browser;
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { try { await browser?.close(); } finally { process.exit(143); } });

async function barrier(step) {
  const ack = join(process.env.DOMAIN_DEMO_BARRIER, `${step}-a.ack`);
  await unlink(ack).catch(() => {});
  await writeFile(join(process.env.DOMAIN_DEMO_BARRIER, `${step}-a.request`), 'request');
  for (let i = 0; i < 200; i++) {
    if (await readFile(ack, 'utf8').catch(() => '') === 'done') { await unlink(ack); return; }
    await pause(100);
  }
  throw Error(`Fixture barrier ${step} did not complete`);
}
async function control(domain, data) {
  const response = await fetch(`${app}/control`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.DOMAIN_DEMO_CONTROL}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, ...data }) });
  assert.equal(response.status, 200);
}
async function login(page, username, wait = true) {
  await page.locator('#username').fill(username); await page.locator('#password').fill(password);
  await page.locator('#signin').click();
  if (wait) { await page.locator('#signed-in:visible').waitFor(); await page.locator('#status[data-state="success"]').waitFor(); }
}
async function hold(page, predicate) {
  let ready, release; const started = new Promise(resolve => { ready = resolve; });
  const gate = new Promise(resolve => { release = resolve; }); let first = true;
  const handler = async route => {
    if (!first || route.request().method() === 'OPTIONS') return route.continue();
    first = false; const response = await route.fetch({ maxRedirects: 0 }); ready(); await gate; await route.fulfill({ response });
  };
  await page.route(predicate, handler);
  return { started, release: async () => { release(); await page.waitForFunction(() => document.body.dataset.pending === '0'); await page.unroute(predicate, handler); } };
}
async function loginRace(page, user, other, path) {
  const delayed = await hold(page, url => url.pathname === path);
  await login(page, user, false); await delayed.started;
  await page.locator('#signout').click(); await login(page, other);
  await delayed.release();
  assert.equal(await page.locator('#signed-in').textContent(), `Signed in as ${other}`);
  assert.equal(await page.locator('#feed article').count(), 0);
  await page.locator('#signout').click();
}
async function shot(page, name) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
}
async function jsonPost(api, origin, path, data, expected = 200) {
  const response = await api.post(origin + path, { data });
  assert.equal(response.status(), expected, `${path} status`);
  return response.json();
}

try {
  // Browser fixture alone trusts the ephemeral lab certificates. Not production TLS evidence.
  browser = await chromium.launch({ headless: true });
  for (const [index, viewport] of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }].entries()) {
    const fixture = config.cases[index], label = index ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app });
    const allowed = new Set([app, ...Object.values(config.providers)]);
    await context.route('**/*', route => allowed.has(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    await context.addCookies([{ name: 'ambient-fixture', value: 'must-not-forward', url: app }]);
    let followWrites = 0, credentialLeak = false; const publicRequests = [], observations = [];
    context.on('request', request => {
      if (request.method() === 'OPTIONS') return;
      const url = new URL(request.url()), body = request.method() === 'POST' ? request.postDataJSON() : undefined;
      if (url.pathname === '/v3/create' && body?.service === 'domain-demo-follows') followWrites++;
      const seam = url.pathname === '/dns-query' ? 'dns' : url.pathname.endsWith('/domain') ? 'alias' : url.pathname === '/v3/read' && body?.service === 'posts' ? 'public-posts' : '';
      if (seam) observations.push((async () => {
        const headers = await request.allHeaders();
        const leaked = !!body?.token || !!headers.authorization || !!headers.cookie || ['token', 'password', 'access_token'].some(key => url.searchParams.has(key));
        credentialLeak ||= leaked;
        publicRequests.push({ seam, target: url.origin, credentialFree: !leaked });
      })());
    });
    const creator = await context.newPage(), reader = await context.newPage();
    const url = view => `${app}/?view=${view}&domain=${encodeURIComponent(fixture.domain)}`;
    phase = `${label}:claim-old`;
    await creator.goto(url('creator')); await login(creator, fixture.a);
    await creator.locator('#copy').click();
    const originalRecord = await creator.evaluate(() => navigator.clipboard.readText());
    assert.equal(originalRecord, `web10.v=1;provider=node-a.federation.test;user=${fixture.a}`);
    await control(fixture.domain, { record: originalRecord });
    await creator.locator('#verify').click(); await creator.getByText('Domain verified for this account.', { exact: true }).waitFor();
    const delayedVerify = await hold(creator, url => url.pathname === '/v3/domains/verify');
    await creator.locator('#verify').click(); await delayedVerify.started;
    await creator.locator('#signout').click(); await login(creator, fixture.a);
    await delayedVerify.release(); assert.equal(await creator.locator('#verified').textContent(), '');
    await creator.locator('#verify').click(); await creator.getByText('Domain verified for this account.', { exact: true }).waitFor();
    await shot(creator, `${label}-claim-old`);

    phase = `${label}:follow`;
    await reader.goto(url('reader'));
    const otherReader = config.cases[index ? 0 : 1].reader;
    await loginRace(reader, fixture.reader, otherReader, '/v3/login');
    await loginRace(reader, fixture.reader, otherReader, '/v3/groups/create');
    await login(reader, fixture.reader);
    await reader.locator('#follow').click(); await reader.getByText('Before the move. Same website.', { exact: true }).waitFor();
    const followId = await reader.locator('#bookmark').getAttribute('data-doc-id');
    assert.ok(followId); assert.equal(followWrites, 1);
    await shot(reader, `${label}-before-move`);
    for (const path of [`/v3/users/${fixture.a}/domain`, '/v3/read']) {
      const delayed = await hold(reader, requestUrl => requestUrl.pathname === path && requestUrl.origin === config.providers['node-a.federation.test']);
      await reader.locator('#refresh').click(); await delayed.started;
      await reader.locator('#signout').click(); await login(reader, otherReader);
      await delayed.release();
      assert.equal(await reader.locator('#signed-in').textContent(), `Signed in as ${otherReader}`);
      assert.equal(await reader.locator('#feed article').count(), 0);
      assert.equal(await reader.locator('#bookmark').getAttribute('data-doc-id'), '');
      await reader.locator('#signout').click(); await login(reader, fixture.reader);
      await reader.getByText('Before the move. Same website.', { exact: true }).waitFor();
    }
    const api = await requests.newContext({ ignoreHTTPSErrors: true });
    const credential = (await jsonPost(api, config.home, '/v3/login', { username: fixture.reader, password })).token;
    const oldPrivate = await jsonPost(api, config.providers['node-a.federation.test'], '/v3/read', { token: credential, service: 'posts', groups: [`node-a.federation.test/groups/users/${fixture.a}/domain-demo-private`] });
    assert.equal(oldPrivate.length, 1, 'explicit old-source private grant is active');

    phase = `${label}:old-provider-unavailable`;
    await barrier('stop');
    await reader.locator('#refresh').click(); await reader.locator('#status[data-state="error"]').waitFor();
    assert.equal(await reader.locator('#feed article').count(), 0);
    assert.equal(await reader.locator('#bookmark').getAttribute('data-doc-id'), followId);
    await shot(reader, `${label}-old-provider-unavailable`);

    phase = `${label}:claim-new`;
    await creator.goto(url('creator') + '&account=b'); await login(creator, fixture.b);
    // Before DNS is changed, a new account cannot claim the old pointer.
    await creator.locator('#verify').click(); await creator.locator('#status[data-state="error"]').waitFor();
    assert.equal(await creator.locator('#verified').textContent(), '');
    await creator.locator('#copy').click();
    const newRecord = await creator.evaluate(() => navigator.clipboard.readText());
    assert.equal(newRecord, `web10.v=1;provider=node-b.federation.test;user=${fixture.b}`);
    await control(fixture.domain, { record: newRecord });
    await creator.locator('#verify').click(); await creator.getByText('Domain verified for this account.', { exact: true }).waitFor();
    await shot(creator, `${label}-claim-new`);

    phase = `${label}:reload-without-refollow`;
    await reader.reload(); await login(reader, fixture.reader);
    await reader.getByText('New account. Same audience.', { exact: true }).waitFor();
    assert.equal(await reader.locator('#bookmark').getAttribute('data-doc-id'), followId);
    assert.equal(followWrites, 1, 'reload/relocation must not create another follow');
    assert.equal(await reader.getByText('PRIVATE CONTROL: must never appear').count(), 0);
    await shot(reader, `${label}-after-move`);

    const group = `node-b.federation.test/groups/users/${fixture.reader}/domain-demo-follows`;
    const persisted = await jsonPost(api, config.home, '/v3/read', { token: credential, service: 'domain-demo-follows', groups: [group] });
    assert.equal(persisted.length, 1); assert.equal(persisted[0].doc_id, followId);
    assert.deepEqual(persisted[0].body, { domain: fixture.domain });
    await jsonPost(api, config.home, '/v3/read', { token: credential, service: 'posts', groups: [`node-b.federation.test/groups/users/${fixture.b}/domain-demo-private`] }, 403);
    await api.dispose();

    phase = `${label}:dns-error-recovery`;
    for (const mode of ['none', 'ambiguous']) {
      await control(fixture.domain, { mode }); await reader.locator('#refresh').click();
      await reader.locator('#status[data-state="error"]').waitFor();
      assert.equal(await reader.locator('#feed article').count(), 0);
      assert.equal(await reader.locator('#bookmark').getAttribute('data-doc-id'), followId);
    }
    await control(fixture.domain, { record: newRecord }); await reader.locator('#refresh').click();
    await reader.getByText('New account. Same audience.', { exact: true }).waitFor();
    assert.equal(followWrites, 1);
    await Promise.all(observations);
    assert.equal(credentialLeak, false, 'DNS-selected public requests must remain credential-free');
    for (const seam of ['dns', 'alias', 'public-posts']) assert.ok(publicRequests.some(row => row.seam === seam));
    cases.push({ viewport, domain: fixture.domain, followId, result: 'passed', followWrites, oldPrivateStatus: 200, privateTargetStatus: 403, lifecycleControls: ['login', 'group-create', 'alias', 'public-posts', 'verify'], publicRequests });
    events.push({ phase: label, oldClaim: true, newClaim: true, oldProviderStopped: true, sameStoredDomainFollow: true, dnsFailuresRetainFollow: true });
    await context.close();
    if (!index) { await barrier('restore'); Object.assign(config, await (await fetch(`${app}/config.json`)).json()); }
  }
  console.log(JSON.stringify({ result: 'passed', cases, events, appGrants: 'setup fixtures, not browser consent', dns: 'actual local TXT, TTL 0, JSON bridge', browserTLS: 'ephemeral test certificate errors ignored in lab only' }));
} catch (error) {
  console.log(JSON.stringify({ result: 'failed', phase, cases, events }));
  const safe = String(error.stack || error).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[credential]').replaceAll(password, '[fixture-password]').replaceAll(process.env.DOMAIN_DEMO_CONTROL, '[fixture-control]');
  console.error(safe); process.exitCode = 1;
} finally { await browser?.close(); }
