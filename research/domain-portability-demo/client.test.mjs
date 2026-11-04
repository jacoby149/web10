import test from 'node:test';
import assert from 'node:assert/strict';
import { accountPointer, domainClient, domainName } from './client.mjs';

const domain = 'creator.example', home = 'https://reader.example';
const providers = { 'a.example': 'https://a.example', 'b.example': 'https://b.example' };
const txt = (provider = 'a.example', user = 'old') => ({ Status: 0, Answer: [{ name: `web10.${domain}.`, type: 16, data: JSON.stringify(`web10.v=1;provider=${provider};user=${user}`) }] });
function fixture() {
  let pointer = txt(), active = true, list = [], claims = true;
  const calls = [], logs = [];
  const client = domainClient({ home, resolver: 'https://dns.example/dns-query', providers,
    session: () => ({ token: 'private-reader-credential', group: 'private-reader-group', valid: () => active }),
    log: (...args) => logs.push(args),
    fetcher: async (url, options) => {
      calls.push({ url, options });
      const body = options.body ? JSON.parse(options.body) : undefined;
      let result;
      if (url.startsWith('https://dns.example/')) result = typeof pointer === 'function' ? await pointer() : pointer;
      else if (url.endsWith('/domain')) result = { domain, verified: claims };
      else if (url === `${home}/v3/read`) result = list;
      else if (url === `${home}/v3/create`) { list.push({ doc_id: 'follow-1', body: body.body }); result = { doc_id: 'follow-1' }; }
      else result = [{ doc_id: url.includes('a.example') ? 'post-a' : 'post-b', author_key: url.includes('a.example') ? 'old' : 'new', body: { text: 'public fixture' } }];
      return Response.json(result);
    },
  });
  return { client, calls, logs, move: () => { pointer = txt('b.example', 'new'); }, set: value => { pointer = value; }, logout: () => { active = false; }, unverify: () => { claims = false; } };
}

test('one persisted domain follow survives account retarget without refollow', async () => {
  const f = fixture(), saved = await f.client.follow(domain);
  assert.equal((await f.client.feed(domain)).posts[0].doc_id, 'post-a');
  f.move();
  assert.deepEqual(await f.client.follows(), [saved]);
  assert.equal((await f.client.feed(domain)).posts[0].doc_id, 'post-b');
  assert.deepEqual(await f.client.follow(domain), saved);
  const writes = f.calls.filter(x => x.url.endsWith('/v3/create'));
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0].options.body).body, { domain });
});

test('DNS and public target requests never receive reader credentials', async () => {
  const f = fixture(); await f.client.follow(domain); await f.client.feed(domain);
  for (const call of f.calls) {
    assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.redirect, 'error');
    if (!call.url.startsWith(home)) assert.ok(!JSON.stringify(call.options).includes('private-reader-credential'));
    assert.ok(!('Authorization' in call.options.headers));
  }
  assert.ok(!JSON.stringify(f.logs).includes('private-reader-credential'));
});

test('logout while DNS is pending prevents a follow write', async () => {
  const f = fixture(); let release;
  f.set(() => new Promise(resolve => { release = resolve; }));
  const pending = f.client.follow(domain);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.logout(); release(txt());
  await assert.rejects(pending, /Account changed/);
  assert.equal(f.calls.filter(x => x.url.endsWith('/v3/create')).length, 0);
});

test('existing follow cannot resolve across the follow-list continuation gap', async () => {
  let active = true, checks = 0;
  const client = domainClient({ home, resolver: 'https://dns.example/dns-query', providers, log() {},
    session: () => ({ token: 'old-credential', group: 'old-group', valid: () => {
      if (++checks === 2) queueMicrotask(() => { active = false; });
      return active;
    } }),
    fetcher: async () => Response.json([{ doc_id: 'old-follow', body: { domain } }]),
  });
  await assert.rejects(client.follow(domain), /Account changed/);
});

test('DNS error does not erase the stored follow or silently use old target', async () => {
  const f = fixture(), saved = await f.client.follow(domain);
  f.set({ Status: 3 });
  await assert.rejects(f.client.feed(domain), /DNS lookup failed/);
  assert.deepEqual(await f.client.follows(), [saved]);
});

test('unverified destination cannot complete Follow', async () => {
  const f = fixture(); f.unverify();
  await assert.rejects(f.client.follow(domain), /not verified/);
  assert.equal(f.calls.filter(x => x.url.endsWith('/v3/create')).length, 0);
});

for (const provider of ['https://a.example', '127.0.0.1', 'localhost', 'other.example', 'a.example/private']) {
  test(`rejects unconfigured DNS destination ${provider}`, () => {
    assert.throws(() => accountPointer(txt(provider), domain, providers), /Unknown or invalid/);
  });
}
test('ambiguous or malformed TXT claims fail closed', () => {
  const response = txt(); response.Answer.push(...txt('b.example', 'new').Answer);
  assert.throws(() => accountPointer(response, domain, providers), /exactly one/);
  assert.throws(() => accountPointer({ Status: 0, Answer: [{ name: `web10.${domain}.`, type: 16, data: 'not quoted' }] }, domain, providers), /encoding/);
  assert.throws(() => accountPointer(txt('a.example', 'anon'), domain, providers), /invalid/);
});
test('normalizes the domain but rejects URL/credential/path/IP inputs', () => {
  assert.equal(domainName(' Creator.Example. '), domain);
  for (const value of ['https://creator.example', 'a@creator.example', 'creator.example/path', '127.0.0.1', 'bad..example']) assert.throws(() => domainName(value));
});

test('logout at resolve continuation prevents the next public request', async () => {
  let epoch = 0, checks = 0, posts = 0;
  const client = domainClient({ home, resolver: 'https://dns.example/dns-query', providers, log() {},
    session: () => { const own = epoch; return { token: 'reader', group: 'private', valid: () => { if (++checks === 3) queueMicrotask(() => epoch++); return own === epoch; } }; },
    fetcher: async url => {
      if (url.startsWith('https://dns.example')) return Response.json(txt());
      if (url.endsWith('/domain')) return Response.json({ domain, verified: true });
      posts++; return Response.json([]);
    } });
  await assert.rejects(client.feed(domain), /Account changed/);
  assert.equal(posts, 0);
});

for (const boundary of ['list', 'alias', 'posts', 'create']) test(`old ticket stays invalid after another login at ${boundary}`, async () => {
  let epoch = 0, release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  let creates = 0;
  const client = domainClient({ home, resolver: 'https://dns.example/dns-query', providers, log() {},
    session: () => { const own = epoch; return { token: `reader-${own}`, group: `group-${own}`, valid: () => own === epoch }; },
    fetcher: async (url, options) => {
      const seam = url === `${home}/v3/read` ? 'list' : url.endsWith('/domain') ? 'alias' : url.endsWith('/v3/create') ? 'create' : 'posts';
      if (url.startsWith('https://dns.example')) return Response.json(txt());
      if (seam === boundary) { entered(); await wait; }
      if (seam === 'list') return Response.json([]);
      if (seam === 'alias') return Response.json({ domain, verified: true });
      if (seam === 'create') { creates++; assert.equal(JSON.parse(options.body).token, 'reader-0'); return Response.json({ doc_id: 'old-follow' }); }
      return Response.json([]);
    } });
  const pending = boundary === 'list' ? client.follows() : boundary === 'create' ? client.follow(domain) : client.feed(domain);
  await ready; epoch++; release();
  await assert.rejects(pending, /Account changed/);
  assert.equal(creates, boundary === 'create' ? 1 : 0); // An already-issued write cannot be recalled.
});

for (const response of [new Response('{broken'), new Response('denied', { status: 403 }), new Response(new Uint8Array(262145))]) test(`bad/denied/oversized transport rejects instead of returning empty state (${response.status})`, async () => {
  const client = domainClient({ home, resolver: 'https://dns.example', providers, log() {},
    session: () => ({ token: 'reader', group: 'group', valid: () => true }), fetcher: async () => response });
  await assert.rejects(client.follows());
});

test('invalid DNS target is denied before any target request or follow write', async () => {
  const f = fixture(); f.set(txt('unconfigured.example'));
  await assert.rejects(f.client.follow(domain), /Unknown or invalid/);
  assert.ok(f.calls.every(call => call.url === `${home}/v3/read` || call.url.startsWith('https://dns.example/')));
});
