import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { allowedTarget, blockPeerConnections, configuration, disableProxyEnvironment, feedNetworkReady, journal, networkStage, networkState, quantile, recoverJournal, safeError, summarize, validMarker, writeResult } from './metrics.mjs';

const env = { WEB10_DISPOSABLE: 'social-evaluation', WEB10_EVAL_RESULTS: realpathSync(tmpdir()) };
test('bounded numeric configuration, including zero warmups', () => {
  assert.equal(configuration(env).repetitions, 20);
  for (const value of ['3', '100']) assert.equal(configuration({ ...env, WEB10_EVAL_REPETITIONS: value }).repetitions, Number(value));
  assert.equal(configuration({ ...env, WEB10_EVAL_WARMUP: '0' }).warmups, 0);
  for (const value of ['', '-1', '1', '2', '1.2', 'NaN', 'Infinity', '1e1', '101', ' 2', '0'])
    assert.throws(() => configuration({ ...env, WEB10_EVAL_REPETITIONS: value }));
  for (const value of ['11', '-1', '', '2.5']) assert.throws(() => configuration({ ...env, WEB10_EVAL_WARMUP: value }));
});
test('exact origin, port, environment and marker gates', () => {
  for (const url of ['http://social.localhost', 'http://auth.localhost:80/a', 'http://api.localhost', 'http://rtc.localhost', 'http://localhost:9000/b', 'data:text/plain,a', 'blob:http://social.localhost/a'])
    assert.equal(allowedTarget(url), true);
  for (const url of ['https://social.web10.app', 'http://social.localhost.evil', 'http://evil.localhost', 'http://social.localhost:3000', 'http://localhost', 'http://127.0.0.1', 'http://user@api.localhost', 'https://api.localhost', 'file:///tmp/a'])
    assert.equal(allowedTarget(url), false);
  assert.equal(allowedTarget('ws://rtc.localhost', true), true);
  for (const url of ['wss://rtc.localhost', 'ws://rtc.localhost:443', 'ws://evil.localhost', 'data:text/plain,a']) assert.equal(allowedTarget(url, true), false);
  assert.equal(validMarker(200, { experiment: 'web10-social-isolated' }), true);
  for (const status of [301, 302, 403, 500]) assert.equal(validMarker(status, { experiment: 'web10-social-isolated' }), false);
  for (const body of [null, {}, { experiment: 'production' }]) assert.equal(validMarker(200, body), false);
  assert.throws(() => configuration({ ...env, WEB10_DISPOSABLE: '' }));
  assert.throws(() => configuration({ ...env, E2E_HTTP_PORT: '8080' }));
  assert.throws(() => configuration({ ...env, SOCIAL_BASE: 'http://social.localhost' }));
  assert.throws(() => configuration({ ...env, WEB10_EVAL_RESULTS: '/does/not/exist' }));
  assert.throws(() => configuration({ ...env, WEB10_EVAL_RESULTS: new URL(import.meta.url).pathname }));
  assert.throws(() => configuration({ ...env, WEB10_EVAL_RESULTS: './results' }));
  assert.throws(() => writeResult(env.WEB10_EVAL_RESULTS, '../../sensitive', {}));
});
test('linear quantiles and inadequate sample annotations', () => {
  assert.equal(quantile([], .5), null);
  assert.equal(quantile([9], .95), 9);
  assert.equal(quantile([4, 1, 3, 2], .5), 2.5);
  assert.equal(quantile([4, 1, 3, 2], .95), 3.8499999999999996);
  const rows = Array.from({ length: 20 }, (_, i) => ({ operation: 'reload', phase: 'measurement', finalized: true, warmup: false, success: true, duration_ms: i + 1 }));
  assert.equal(summarize(rows).operations.reload.p95_ms, 19.05);
  assert.equal(summarize(rows.slice(1)).operations.reload.p95_ms, null);
});
test('failed warmups retained, thrown operation recorded before rethrow, no passing failure summary', async () => {
  const j = journal();
  await assert.rejects(j.run('reload', 'measurement', async row => { row.polls++; throw Object.assign(new Error('password=secret token=secret'), { status: 403 }); }, { warmup: true, trial: 1 }));
  await j.run('reload', 'measurement', async () => {}, { trial: 1 });
  const summary = summarize(j.records);
  assert.equal(summary.success, false);
  assert.equal(summary.operations.reload.failures, 1);
  assert.equal(summary.operations.reload.n, 1);
  assert.equal(j.records[0].polls, 1);
  assert.ok(j.records[0].duration_ms >= 0);
  assert.ok(j.records[0].started_at > 0 && j.records[0].finished_at >= j.records[0].started_at);
  assert.equal(JSON.stringify(j.records).includes('secret'), false);
  assert.deepEqual(j.records[0].error, { name: 'Error', class: 'HTTP', status: 403 });
  assert.equal(summarize([]).success, false);
});
test('failure serialization allowlists names/classes/status, never messages or arbitrary properties', () => {
  const error = { name: 'token=secret', message: 'password=secret', stack: 'secret', token: 'secret', status: 401 };
  assert.deepEqual(safeError(error), { name: 'Error', class: 'HTTP', status: 401 });
  assert.equal(JSON.stringify(safeError(error)).includes('secret'), false);
  for (const status of ['401 token=secret', NaN, Infinity, 99, 600, { token: 'secret' }]) {
    const safe = safeError({ ...error, status });
    assert.equal('status' in safe, false);
    assert.equal(safe.class, 'Operation');
    assert.equal(JSON.stringify(safe).includes('secret'), false);
  }
});
test('proxy routing is disabled without serializing inherited proxy credentials', () => {
  const inherited = { HTTP_PROXY: 'http://secret@external', https_proxy: 'http://external', ALL_PROXY: 'socks://external',
    npm_config_proxy: 'http://external', NO_PROXY: 'prod', NODE_USE_ENV_PROXY: '1', KEEP: 'value' };
  disableProxyEnvironment(inherited);
  assert.deepEqual(inherited, { NO_PROXY: '*', no_proxy: '*', NODE_USE_ENV_PROXY: '0', KEEP: 'value' });
});
test('both feed distributions exclude successful warmups and setup from every quantile; incomplete runs fail', () => {
  const records = ['empty', 'nonempty'].flatMap(kind => {
    const operation = `following.reload-${kind}`;
    return [{ operation, phase: 'setup', finalized: true, warmup: false, success: true, duration_ms: 9999 },
      { operation, phase: 'measurement', finalized: true, warmup: true, success: true, duration_ms: 9999 },
      ...[1, 2, 3].map(duration_ms => ({ operation, phase: 'measurement', finalized: true, warmup: false, success: true, duration_ms }))];
  });
  assert.equal(summarize(records, 3).success, true);
  for (const stats of Object.values(summarize(records, 3).operations)) {
    assert.equal(stats.n, 3); assert.equal(stats.attempted, 3);
    assert.equal(stats.min_ms, 1); assert.equal(stats.median_ms, 2); assert.equal(stats.p95_ms, null);
  }
  assert.equal(summarize(records, 20).success, false);
  assert.equal(summarize(records.filter(r => r.operation.endsWith('empty') && !r.operation.endsWith('nonempty')), 3).success, false);
  assert.equal(summarize([{ operation: 'isolation', phase: 'correctness', success: true }], 3).success, false);
  const failedWarmup = { ...records[1], success: false };
  assert.equal(summarize([...records, failedWarmup], 3).success, false);
  for (const kind of ['empty', 'nonempty']) {
    const operation = `following.reload-${kind}`;
    const rows = [...records.filter(r => r.operation === operation && (r.warmup || r.phase === 'setup')),
      ...Array.from({ length: 20 }, (_, i) => ({ operation, phase: 'measurement', finalized: true, warmup: false, success: true, duration_ms: i + 1 }))];
    const stats = summarize(rows).operations[operation];
    assert.equal(stats.n, 20); assert.equal(stats.min_ms, 1);
    assert.equal(stats.median_ms, 10.5); assert.equal(stats.p95_ms, 19.05);
  }
});
test('feed API evidence rejects failed fallback empty states, pending calls and missing main query', () => {
  const state = networkState();
  assert.equal(feedNetworkReady(state, false), false);
  state.groups.success = 1;
  assert.equal(feedNetworkReady(state, false), true);
  assert.equal(feedNetworkReady(state, true), false);
  state.query.success = 1;
  assert.equal(feedNetworkReady(state, true), true);
  state.read.pending = 1;
  assert.equal(feedNetworkReady(state, true), false);
  state.read.pending = 0;
  for (const field of ['http_failure', 'network_failure']) {
    state.read[field] = 1;
    assert.throws(() => feedNetworkReady(state, false), /FeedNetworkFailure/);
    assert.throws(() => feedNetworkReady(state, true), /FeedNetworkFailure/);
    state.read[field] = 0;
  }
  state.read.expected_denial = 2;
  assert.equal(feedNetworkReady(state, true), true);
  assert.equal(networkStage('http://api.localhost/v3/groups/list?token=secret'), 'groups');
  assert.equal(networkStage('http://api.localhost/v3/query'), 'query');
  assert.equal(networkStage('http://api.localhost/v3/query', 'OPTIONS'), 'other');
  assert.equal(networkStage('http://api.localhost/v3/read'), 'read');
  assert.equal(networkStage('http://api.localhost/__experiment'), null);
  assert.equal(networkStage('http://social.localhost/'), null);
});
test('native peer guards deny both constructors and report only numeric attempts', () => {
  let native = 0, attempts = 0;
  const sandbox = { RTCPeerConnection: function () { native++; }, webkitRTCPeerConnection: function () { native++; },
    __web10EvalPeerAttempt: () => { attempts++; } };
  runInNewContext(`(${blockPeerConnections.toString()})()`, sandbox);
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection'])
    assert.throws(() => new sandbox[name]({ iceServers: [{ urls: 'stun:secret.invalid' }] }), /PeerConnectionExcluded/);
  assert.equal(native, 0); assert.equal(attempts, 2); assert.equal(sandbox.__web10EvalPeerAttempts, 2);
  assert.equal(Object.getOwnPropertyDescriptor(sandbox, 'RTCPeerConnection').writable, false);
});
test('fsynced journal survives real subprocess termination with an unmatched start', { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(`${realpathSync(tmpdir())}/social-journal-`);
  const module = new URL('./metrics.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import {journal} from ${JSON.stringify(module)};
    const j=journal(${JSON.stringify(dir)});
    await j.run('completed','measurement',async()=>{}, {trial:1});
    await j.run('unfinished','measurement',async()=>{process.stdout.write('ready'); await new Promise(()=>{setInterval(()=>{},1000)});});
  `], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await once(child.stdout, 'data');
    const exit = once(child, 'exit');
    child.kill('SIGTERM'); await exit;
    const rows = recoverJournal(dir);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].operation, 'completed'); assert.equal(rows[0].finalized, true); assert.equal(rows[0].success, true);
    assert.equal(rows[1].operation, 'unfinished'); assert.equal(rows[1].finalized, false); assert.equal(rows[1].success, false);
    assert.equal(summarize(rows).success, false);
    const events = readFileSync(`${dir}/operations.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.map(e => e.event), ['start', 'finish', 'start']);
    assert.equal(events[0].row.success, false);
    assert.equal(existsSync(`${dir}/operations.json`), false);
  } finally { child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); }
});
test('durable failure events omit thrown secrets and retain failed warmups', async () => {
  const dir = mkdtempSync(`${realpathSync(tmpdir())}/social-journal-`);
  const j = journal(dir);
  try {
    await assert.rejects(j.run('failed', 'measurement', async () => { throw Object.assign(new Error('token=secret'), { status: 503 }); }, { warmup: true }));
    const rows = recoverJournal(dir);
    assert.equal(rows[0].success, false); assert.equal(rows[0].finalized, true);
    assert.equal(rows[0].error.status, 503); assert.equal(rows[0].warmup, true);
    assert.equal(readFileSync(`${dir}/operations.jsonl`, 'utf8').includes('secret'), false);
    assert.equal(summarize(rows).success, false);
  } finally { j.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('peer guard is installed before scripts in isolated Chromium when available', async t => {
  const { chromium } = await import('../../../e2e/node_modules/@playwright/test/index.mjs');
  if (!existsSync(chromium.executablePath())) { t.skip('Chromium executable unavailable'); return; }
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  try {
    const context = await browser.newContext();
    await context.addInitScript(blockPeerConnections);
    const page = await context.newPage();
    await page.goto('data:text/html,<title>isolated</title>');
    const attempts = await page.evaluate(() => {
      for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
        try { new globalThis[name](); } catch {}
      }
      return globalThis.__web10EvalPeerAttempts;
    });
    assert.equal(attempts, 2);
  } finally { await browser.close(); }
});
test('offline source contracts pin UI selectors, credential ordering and API response/role seams', () => {
  const source = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const scenario = readFileSync(new URL('./scenario.spec.ts', import.meta.url), 'utf8');
  const components = [
    'marketing/web10-social/src/components/Social/Layout.tsx',
    'marketing/web10-social/src/components/Feed/NewPostFab.tsx',
    'marketing/web10-social/src/components/Feed/PostComposer.tsx',
    'marketing/web10-social/src/components/Feed/FeedScreen.tsx',
    'marketing/web10-social/src/components/Bio/UserProfileScreen.tsx',
    'marketing/shared/discover/src/PostActions.tsx', 'marketing/shared/discover/src/CommentThread.tsx',
    'ui/src/components/CredentialPage/LoginForm.tsx', 'ui/src/components/Consent/ConsentView.tsx',
  ].map(source).join('\n');
  for (const [, id] of scenario.matchAll(/getByTestId\('([^']+)'\)/g)) {
    if (id === 'post-card') {
      assert.ok(/testId = 'post-card'/.test(components) && /data-testid=\{testId\}/.test(components));
    } else if (id === 'consent-req-0') {
      assert.ok(components.includes('data-testid={`consent-req-${idx}`}'));
    } else assert.ok(new RegExp(`(?:data-testid=["']${id}["']|["']data-testid["']:\\s*["']${id}["'])`).test(components), id);
  }
  const signIn = scenario.slice(scenario.indexOf('async function signIn'), scenario.indexOf('async function feed'));
  assert.ok(signIn.indexOf("check(new URL(popup.url()).origin") < signIn.indexOf(".fill(user.username)"));
  assert.ok(signIn.indexOf("locator('#provider').inputValue()") < signIn.indexOf(".fill(user.password)"));
  const groups = source('api/app/v3/endpoints/groups.py');
  assert.match(groups, /@router.post\("\/members\/list"\)/);
  assert.match(groups, /return ch.get_group_members\(data.group_id, limit=data.limit, offset=data.offset\)/);
  assert.match(source('api/app/v3/services/clickhouse.py'), /return \[\{"member_key": row\[0\], "role": row\[1\]/);
  assert.match(groups, /_require_group_permission\(data.group_id, user, "revokeRoles"\)/);
  assert.match(groups, /ch.add_group_member\(data.group_id, user, "member"\)/);
  assert.match(source('marketing/web10-social/src/data/groups.ts'), /permissions: \{ '\*': \['readAll'/);
  assert.match(source('api/app/v3/endpoints/query.py'), /return \{"rows": out, "count": len\(out\)\}/);
  assert.match(source('marketing/shared/discover/src/CommentThread.tsx'), /data-testid="comment-input"/);
  assert.match(source('marketing/web10-social/src/data/comments.ts'), /post_id: args.postId/);
  assert.ok(scenario.includes("'engagement.persist'") && scenario.includes('await engagement(rp, postId)'));
  assert.ok(scenario.includes("context.on('requestfailed'") && scenario.includes("context.on('requestfinished'"));
  assert.ok(scenario.includes('feedNetworkReady(current.network, texts.length > 0)'));
  assert.ok(scenario.includes('await context.addInitScript(blockPeerConnections)'));
  assert.ok(scenario.indexOf('account.p2p-off-') < scenario.indexOf("op('creator.popup-login-consent'"));
  assert.ok(scenario.includes('body: { p2pEnabled: false, defaultVisibility: \'public\' }'));
});
