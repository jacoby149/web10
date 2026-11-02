// Offline orchestration mocks, NOT connected API/ClickHouse evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInteroperability } from './interop.mjs';
import { allowedApiOrigin, allowedTarget, journal, queryBudget } from './metrics.mjs';

function harness({ corrupt, failAt } = {}) {
  const accounts = Object.fromEntries(['creator', 'reader', 'outsider'].map(username => [username, { username, token: `secret-${username}` }]));
  const followers = 'api.localhost/groups/users/creator/followers';
  const calls = [], operations = [], contracts = new Map(), members = new Map(), docs = [];
  for (const username of ['creator', 'outsider']) docs.push({ service: 'profile', doc_id: `social-${username}`, author_key: username,
    body: { display_name: username }, groups: [`api.localhost/groups/users/${username}/followers`] });
  const log = journal();
  let sequence = 0, requestCount = 0;
  async function api(path, data, expected = 200, origin) {
    assert.equal(allowedApiOrigin(origin), true, 'every call must carry an exact Origin');
    calls.push({ path, data, expected, origin });
    if (++requestCount === failAt) throw new Error('secret-content');
    const user = data.token.replace('secret-', '');
    if (path.startsWith('/v3/app-contracts/')) {
      assert.equal(origin, 'http://auth.localhost');
      assert.equal(data.allowed_origin, 'http://snake.localhost');
      if (path.endsWith('/add')) contracts.set(user, data.permissions);
      else contracts.delete(user);
      return {};
    }
    if (path === '/v3/groups/create') {
      const group_id = `group-${++sequence}`;
      members.set(group_id, new Set(data.members.map(m => m.member_key)));
      return { group_id };
    }
    if (path.startsWith('/v3/groups/members/')) {
      assert.equal(origin, 'http://social.localhost');
      const set = members.get(data.group_id);
      if (path.endsWith('/add')) set.add(data.member_key); else set.delete(data.member_key);
      return {};
    }
    const readable = doc => doc.groups.some(g => data.groups.includes(g) && (g.includes('/followers') || members.get(g)?.has(user)));
    if (path === '/v3/create') {
      if (data.service !== 'profile') {
        assert.equal(origin, 'http://snake.localhost');
        assert.ok(contracts.get(user)?.[data.service]?.includes('create'));
      } else assert.equal(data.body.display_name, 'Synthetic private profile fixture');
      const doc = { ...data, doc_id: `doc-${++sequence}`, author_key: user };
      docs.push(doc); return { doc_id: doc.doc_id };
    }
    if (path === '/v3/read') {
      const rows = docs.filter(d => d.service === data.service && readable(d));
      assert.equal(expected, rows.length ? 200 : 403);
      return rows.map(({ doc_id, author_key, body }) => ({ doc_id, author_key, body }));
    }
    assert.equal(path, '/v3/query');
    assert.equal(origin, 'http://snake.localhost');
    assert.ok(data.groups.length > 0);
    const joined = data.sql.includes('INNER JOIN profile');
    const service = data.sql.includes('marketplace_listings') ? 'marketplace_listings' : 'snake_scores';
    const granted = contracts.get(user)?.[service]?.includes('readAll') && (!joined || contracts.get(user)?.profile?.includes('readAll'));
    assert.equal(expected, granted ? 200 : 403);
    if (!granted) return {};
    let rows = docs.filter(d => d.service === service && readable(d)).flatMap(d => {
      const row = { doc_id: d.doc_id, author_key: d.author_key, body: d.body };
      if (!joined) return [row];
      return docs.filter(p => p.service === 'profile' && readable(p) && p.author_key === d.author_key && data.sql.includes(`'${p.doc_id}'`))
        .map(p => ({ ...row, profile_id: p.doc_id, profile_author: p.author_key, profile_body: JSON.stringify(p.body) }));
    });
    rows.sort((a, b) => (b.body.score ?? b.body.price) - (a.body.score ?? a.body.price));
    let result = { rows, count: rows.length };
    if (corrupt) result = corrupt(result, { joined });
    return result;
  }
  const options = { accounts, followers, api,
    poll: async predicate => { if (!await predicate()) throw new Error('Readiness'); },
    op: (name, phase, action) => { operations.push(name); return log.run(name, phase, action); } };
  return { run: () => runInteroperability(options), calls, operations, contracts, docs, log };
}

test('offline mock: CRUD origins, social reuse, both exact joins and independent membership cycle', async () => {
  const h = harness(); await h.run();
  assert.equal(h.contracts.size, 0);
  assert.deepEqual(h.operations, ['social-written-profiles', 'app-b-crud', 'missing-profile-app-grant', 'grant-cross-author-joins',
    'app-revoke-denial', 'independent-private-profile-gate', 'cleanup-0', 'cleanup-1', 'cleanup-2'].map(n => `interop.${n}`));
  assert.equal(h.calls.filter(c => c.path === '/v3/create' && c.origin === 'http://snake.localhost').length, 4);
  assert.equal(h.calls.filter(c => c.path === '/v3/query' && c.expected === 403).length, 4);
  assert.equal(h.calls.filter(c => c.path === '/v3/read' && c.expected === 403).length, 2);
  assert.equal(h.calls.filter(c => c.path === '/v3/query' && !c.data.sql.includes('JOIN')).length, 2);
  assert.equal(h.calls.filter(c => c.path === '/v3/create' && c.data.service === 'profile').length, 1);
  assert.ok(h.log.records.every(row => row.phase === 'correctness' && row.success));
  const serialized = JSON.stringify(h.log.records);
  for (const secret of ['secret-', 'display_name', 'Synthetic', 'social-creator']) assert.equal(serialized.includes(secret), false);
});

test('offline mock: every API failure rejects and still attempts all three final contract revokes', async () => {
  const baseline = harness(); await baseline.run();
  for (let failAt = 1; failAt <= baseline.calls.length; failAt++) {
    const h = harness({ failAt });
    await assert.rejects(h.run());
    assert.deepEqual(h.operations.slice(-3), ['interop.cleanup-0', 'interop.cleanup-1', 'interop.cleanup-2']);
    assert.equal(h.calls.slice(-3).every(c => c.path === '/v3/app-contracts/revoke'), true);
    assert.equal(JSON.stringify(h.log.records).includes('secret'), false);
    assert.ok(h.log.records.some(row => !row.success));
  }
});

test('offline mock: exact join rows reject wrong count, duplicates, order, IDs, authors, bodies and keys', async () => {
  const mutations = [
    r => ({ ...r, count: r.count + 1 }),
    r => ({ ...r, rows: r.rows.slice(1) }),
    r => ({ rows: [...r.rows, r.rows[0]], count: r.count + 1 }),
    r => ({ ...r, rows: [...r.rows].reverse() }),
    ...['doc_id', 'author_key', 'profile_id', 'profile_author', 'profile_body', 'body', 'unexpected'].map(key => r => ({ ...r,
      rows: r.rows.map((row, i) => i ? row : { ...row, [key]: key.endsWith('body') ? {} : 'wrong' }) })),
  ];
  for (const mutate of mutations) {
    const h = harness({ corrupt: (result, { joined }) => joined && result.count > 1 ? mutate(result) : result });
    await assert.rejects(h.run());
    assert.equal(h.contracts.size, 0);
  }
});

test('HTTP Origin guard forbids missing/no-Origin bypass and never permits a Snake browser fixture', () => {
  assert.equal(allowedApiOrigin('http://snake.localhost'), true);
  for (const origin of [undefined, null, '', 'null', 'https://snake.localhost', 'http://snake.localhost:80',
    'http://snake.localhost/', 'http://snake.localhost.evil', 'http://user@snake.localhost']) assert.equal(allowedApiOrigin(origin), false);
  assert.equal(allowedTarget('http://snake.localhost'), false);
  const source = readFileSync(new URL('./scenario.spec.ts', import.meta.url), 'utf8');
  assert.match(source, /check\(allowedApiOrigin\(origin\)\)/);
  assert.ok(source.indexOf('await runInteroperability(') > source.indexOf('await samples(rp, expectedTexts)'));
  assert.ok(source.includes('accounts: { creator, reader, outsider }, followers'));
});

test('offline mock: private exclusion cannot hide a leaked profile or unreadable scores', async () => {
  for (const corrupt of [
    (r, { joined }) => joined && r.count === 0 ? { rows: [{ profile_body: 'leaked' }], count: 1 } : r,
    (r, { joined }) => !joined ? { rows: [], count: 0 } : r,
  ]) {
    const h = harness({ corrupt });
    await assert.rejects(h.run());
    assert.equal(h.contracts.size, 0);
    assert.equal(h.log.records.find(r => r.operation === 'interop.independent-private-profile-gate').success, false);
  }
});

test('offline pacing: drain at 45 queries, retain background arrivals and reset only after 61 quiet seconds', async () => {
  const waits = [];
  const budget = queryBudget(async ms => {
    waits.push(ms);
    if (waits.length === 1) budget.record();
  });
  for (let i = 0; i < 44; i++) budget.record();
  await budget.drain(); assert.deepEqual(waits, []);
  budget.record(); await budget.drain();
  assert.deepEqual(waits, [61_000, 61_000]);
  await budget.drain(); assert.equal(waits.length, 2);
  for (let i = 0; i < 45; i++) budget.record();
  await budget.drain(); assert.equal(waits.length, 3);
});

test('offline source ordering: profile persists before context close; quota drains before operation timing', () => {
  const source = readFileSync(new URL('./scenario.spec.ts', import.meta.url), 'utf8');
  const outsider = source.slice(source.indexOf("await op('outsider.popup-login-consent'"), source.indexOf("await op('following.empty'"));
  assert.ok(outsider.indexOf('await signIn(page, outsider)') < outsider.indexOf('await poll('));
  assert.match(outsider, /read\(outsider.token, 'profile'/);
  assert.ok(outsider.indexOf('typeof docs[0].doc_id') < outsider.indexOf('await page.context().close()'));
  const op = source.slice(source.indexOf('async function op('), source.indexOf('async function guardedPage('));
  assert.ok(op.indexOf('await readerQueries.drain()') < op.indexOf('return log.run('));
  assert.match(source, /user === reader && req.method\(\) === 'POST' && networkStage\(req.url\(\)\) === 'query'\) readerQueries.record\(\)/);
  const api = source.slice(source.indexOf('async function api('), source.indexOf('async function poll('));
  assert.match(api, /path === '\/v3\/query' && .*\.token === reader.token/);
  assert.ok(api.indexOf('await readerQueries.drain()') < api.indexOf('readerQueries.record()'));
  assert.match(api, /check\(current\?\.phase !== 'measurement'\)/);
});
