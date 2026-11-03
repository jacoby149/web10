import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHmac, createHash } from 'node:crypto';
import { createVerifier, createDelivery, encodeKey } from './core.mjs';
import { createS3Origin, createWorker } from './cloudflare.mjs';
import { createCacheEvidence, writeRunReceipt } from './acceptance.mjs';
import { mkdtemp, readFile, stat, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('MinIO atomic account updates pass the Python policy-preservation regressions', () => {
  execFileSync('python3', [fileURLToPath(new URL('./minio_account_test.py', import.meta.url))],
    { stdio: 'pipe', timeout: 10000 });
});

test('deployment example preserves CPU guardrail and keeps outer caching and request logs off', async () => {
  const input = await readFile(new URL('./wrangler.example.toml', import.meta.url), 'utf8');
  const config = JSON.parse(execFileSync('python3', ['-c',
    'import json,sys,tomllib; print(json.dumps(tomllib.loads(sys.stdin.read())))'],
    { input, encoding: 'utf8', timeout: 10000 }));
  assert.equal(config.cache.enabled, false);
  assert.equal(config.limits.cpu_ms, 50);
  assert.equal(config.logpush, false);
  assert.equal(config.observability.enabled, false);
  assert.equal(config.observability.logs.enabled, false);
  assert.equal(config.observability.logs.invocation_logs, false);
  assert.equal(config.vars.MEDIA_DELIVERY_ENABLED, 'false');
  assert.equal(config.workers_dev, false);
});

const sampleHash = 'a'.repeat(64);
const observation = (colo, status = 200, sha256 = sampleHash) => ({ colo, status, sha256 });
test('acceptance follows warmed locations instead of assuming routing affinity', () => {
  const evidence = createCacheEvidence(sampleHash);
  evidence.warm(observation('EWR'));
  evidence.warm(observation('IAD'));
  evidence.control('cold', observation('ATL', 502));
  evidence.control('range', observation('ATL', 502));
  evidence.disabled(observation('ATL', 502));
  assert.equal(evidence.result().outcome, 'inconclusive');
  evidence.disabled(observation('IAD'));
  evidence.expired(observation('EWR', 403));
  assert.equal(evidence.result().outcome, 'inconclusive');
  evidence.expired(observation('IAD', 403));
  assert.equal(evidence.result().outcome, 'pass');
  assert.deepEqual(evidence.result().proven, ['IAD']);
  assert.deepEqual(evidence.result().unmatched, ['ATL']);
});

test('acceptance never calls a matched miss or an unmatched hit a proof', () => {
  const evidence = createCacheEvidence(sampleHash);
  evidence.warm(observation('EWR'));
  evidence.disabled(observation('EWR', 502));
  evidence.disabled(observation('ATL'));
  evidence.expired(observation('ATL', 403));
  assert.equal(evidence.result().outcome, 'inconclusive');
  assert.deepEqual(evidence.result().matchedMisses, ['EWR']);
});

test('acceptance requires independent cold and range origin-denial controls', () => {
  const evidence = createCacheEvidence(sampleHash);
  evidence.warm(observation('EWR'));
  evidence.disabled(observation('EWR'));
  evidence.expired(observation('EWR', 403));
  assert.equal(evidence.result().outcome, 'inconclusive');
  evidence.control('cold', observation('ATL', 502));
  assert.equal(evidence.result().outcome, 'inconclusive');
  evidence.control('range', observation('ATL', 502));
  assert.equal(evidence.result().outcome, 'pass');
});

test('acceptance rejects invalid statuses, corrupted bytes and missing location evidence', () => {
  const evidence = createCacheEvidence(sampleHash);
  assert.throws(() => evidence.warm(observation(null)), /location/);
  assert.throws(() => evidence.warm(observation('EWR', 502)), /warming/);
  assert.throws(() => evidence.disabled(observation('EWR', 200, 'b'.repeat(64))), /body/);
  assert.throws(() => evidence.disabled(observation('EWR', 503)), /unexpected/);
  assert.throws(() => evidence.expired(observation('EWR')), /expired/);
  assert.throws(() => evidence.control('cold', observation('EWR')), /origin control/);
});

test('acceptance receipts retain failures and successes in distinct private files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'media-receipts-'));
  try {
    const files = await Promise.all([false, true].map(ok => writeRunReceipt(directory, 'verify', { ok })));
    assert.notEqual(files[0], files[1]);
    assert.deepEqual(await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8')))),
      [{ ok: false }, { ok: true }]);
    for (const file of files) assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(writeRunReceipt(directory, '../invalid', {}), /stage/);
  } finally {
    for (const name of await readdir(directory)) await unlink(path.join(directory, name));
    await rmdir(directory);
  }
});

test('origin fetch does not combine no-store with a conflicting Cloudflare cache TTL', async () => {
  const origin = createS3Origin({ endpoint: 'https://storage.example', region: 'us-east-1',
    accessKeyId: 'synthetic', secretAccessKey: 'synthetic', crypto: webcrypto,
    fetch: async (_url, init) => {
      assert.equal(init.cache, 'no-store');
      assert.equal(init.cf?.cacheTtl, undefined);
      return new Response('synthetic');
    } });
  assert.equal((await origin({ bucket: 'private', key: 'probe.txt', range: null })).status, 200);
});

const crypto = webcrypto;
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'first' };
const config = { issuer: 'node', audience: 'media', bucket: 'private', jwks: { keys: [jwk] }, crypto };
const key = 'alice/雪 +%?#/movie.ts';
const now = Math.floor(Date.now() / 1000);
const claims = { iss: 'node', aud: 'media', bucket: 'private', key, v: 1, method: 'GET', iat: now - 10, exp: now + 100 };
const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(changes = {}, header = {}) {
  const message = `${base64({ alg: 'RS256', typ: 'JWT', kid: 'first', ...header })}.${base64({ ...claims, ...changes })}`;
  return `${message}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(message))).toString('base64url')}`;
}
function request(cap, options = {}) {
  return new Request(`https://media.example/media/${encodeKey(key)}${cap === null ? '' : `?cap=${cap}`}`, options);
}
async function fixture() {
  const calls = { get: 0, put: 0, origin: 0 };
  const values = new Map();
  const verify = await createVerifier(config);
  const cache = {
    async get(scope) { calls.get++; return values.get(JSON.stringify(scope))?.clone(); },
    async put(scope, response) { calls.put++; values.set(JSON.stringify(scope), response); },
  };
  let status = 200;
  const origin = async ({ range }) => { calls.origin++; return new Response('object', {
    status, headers: { 'content-length': '6', 'content-type': 'video/mp2t', 'set-cookie': 'not-forwarded', ...(range ? { 'content-range': 'bytes 0-5/6' } : {}) },
  }); };
  const pending = [];
  const delivery = createDelivery({ verify, cache, origin, enabled: true });
  return { calls, cache, origin, verify, deliver: req => delivery(req, promise => pending.push(promise)),
    pending, setStatus: v => { status = v; } };
}

test('real RSA public-only verification, opaque UTF-8 key and shared miss/hit across tokens', async () => {
  const f = await fixture();
  for (const cap of [await token(), await token({ exp: now + 200 })]) {
    const result = await f.deliver(request(cap));
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'object');
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.equal(result.headers.get('set-cookie'), null);
  }
  assert.deepEqual(f.calls, { get: 2, put: 1, origin: 1 });
});

test('warmed-cache invalid capability matrix never touches cache or origin', async t => {
  const f = await fixture();
  const valid = await token();
  await f.deliver(request(valid));
  const cases = [
    ['missing', null], ['expired', await token({ iat: now - 100, exp: now })],
    ['tampered', `${valid.slice(0, -8)}AAAAAAAA`],
    ...await Promise.all(Object.entries({ iss: 'other', aud: ['media'], bucket: 'other', key: 'other', method: 'HEAD',
      v: '1', iat: String(now), exp: String(now + 10) }).map(async ([name, value]) => [name, await token({ [name]: value })])),
    ['future', await token({ iat: now + 50 })], ['ttl', await token({ exp: now + 1000 })],
    ['inverted', await token({ iat: now - 1, exp: now - 2 })],
    ['fractional', await token({ iat: now - 0.5 })],
    ['unknown kid', await token({}, { kid: 'other' })], ['algorithm', await token({}, { alg: 'HS256' })],
    ['key URL', await token({}, { jku: 'https://attacker.invalid' })], ['type', await token({}, { typ: 'other' })],
  ];
  for (const [name, cap] of cases) await t.test(name, async () => {
    assert.equal((await f.deliver(request(cap))).status, 403);
    assert.deepEqual(f.calls, { get: 1, put: 1, origin: 1 });
  });
});

test('strict URL and method deny before I/O', async () => {
  const f = await fixture();
  const cap = await token();
  const url = request(cap).url;
  for (const bad of [url + '&cap=' + cap, url + '&x=1', url.replace('?cap=', '?%63ap='),
    url.replace('/media/', '/media/%'), url.replace('https:', 'http:'), url + '#fragment',
    url.replace(encodeKey(key), '_w'), url.replace(encodeKey(key), encodeKey(key) + '=')]) {
    assert.equal((await f.deliver(new Request(bad))).status, 403);
  }
  assert.equal((await f.deliver(request(cap, { method: 'HEAD' }))).status, 403);
  assert.deepEqual(f.calls, { get: 0, put: 0, origin: 0 });
});

test('ranges authorize first, bypass warm cache and never populate it', async () => {
  const f = await fixture();
  const cap = await token();
  await f.deliver(request(cap));
  f.setStatus(206);
  assert.equal((await f.deliver(request(cap, { headers: { range: 'bytes=0-5' } }))).status, 206);
  assert.equal((await f.deliver(request(null, { headers: { range: 'bytes=0-5' } }))).status, 403);
  assert.equal((await f.deliver(request(cap, { headers: { range: 'bytes=0-1,3-4' } }))).status, 416);
  assert.deepEqual(f.calls, { get: 1, put: 1, origin: 2 });
});

test('origin errors, partials, redirects and exceptions do not cache', async () => {
  const cap = await token();
  for (const status of [301, 302, 403, 404, 416, 500, 206]) {
    const f = await fixture();
    f.setStatus(status);
    assert.equal((await f.deliver(request(cap))).status, [404, 416].includes(status) ? status : 502);
    assert.equal(f.calls.put, 0);
  }
  const f = await fixture();
  const deliver = createDelivery({ ...f, enabled: true, origin: async () => { throw Error('secret'); } });
  assert.equal((await deliver(request(cap))).status, 502);
  assert.equal(f.calls.put, 0);
});

test('configuration rejects weak, private and duplicate public keys', async () => {
  const weak = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  for (const keys of [[{ ...await crypto.subtle.exportKey('jwk', weak.publicKey), kid: 'weak' }],
    [{ ...await crypto.subtle.exportKey('jwk', pair.privateKey), kid: 'private' }], [jwk, jwk], []]) {
    await assert.rejects(createVerifier({ ...config, jwks: { keys } }));
  }
});

test('a different RSA signer cannot read an already warmed object', async () => {
  const f = await fixture();
  await f.deliver(request(await token()));
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['sign', 'verify']);
  const message = `${base64({ alg: 'RS256', typ: 'JWT', kid: 'first' })}.${base64(claims)}`;
  const signature = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', other.privateKey,
    new TextEncoder().encode(message))).toString('base64url');
  assert.equal((await f.deliver(request(`${message}.${signature}`))).status, 403);
  assert.deepEqual(f.calls, { get: 1, put: 1, origin: 1 });
});

test('adapter redirect never follows or populates shared cache', async () => {
  const f = await fixture();
  let fetches = 0;
  const origin = createS3Origin({ endpoint: 'https://storage.example', region: 'auto', accessKeyId: 'synthetic',
    secretAccessKey: 'synthetic', sessionToken: 'synthetic-session', crypto,
    fetch: async (_url, init) => {
      fetches++;
      assert.equal(init.redirect, 'manual');
      assert.equal(init.headers.get('x-amz-security-token'), 'synthetic-session');
      assert.ok(init.headers.get('authorization').includes('x-amz-security-token'));
      return new Response(null, { status: 302, headers: { location: 'https://untrusted.example' } });
    } });
  const deliver = createDelivery({ ...f, origin, enabled: true });
  assert.equal((await deliver(request(await token()))).status, 502);
  assert.equal(fetches, 1);
  assert.equal(f.calls.put, 0);
});

test('Cloudflare adapter path, read-only SigV4 independently recomputed, no redirects or client credential forwarding', async () => {
  let captured;
  const origin = createS3Origin({ endpoint: 'https://storage.example', region: 'us-east-1', accessKeyId: 'synthetic-id',
    secretAccessKey: 'synthetic-secret', crypto, now: () => new Date('2026-11-02T12:00:00Z'),
    fetch: async (url, init) => { captured = { url, ...init }; return new Response('ok'); } });
  await origin({ bucket: 'private', key, range: 'bytes=0-5' });
  assert.equal(captured.url, 'https://storage.example/private/alice/%E9%9B%AA%20%2B%25%3F%23/movie.ts');
  assert.equal(captured.method, 'GET');
  assert.equal(captured.redirect, 'manual');
  assert.equal(captured.cache, 'no-store');
  const h = captured.headers;
  const auth = h.get('authorization');
  const signed = auth.match(/SignedHeaders=([^,]+)/)[1];
  const hash = value => createHash('sha256').update(value).digest('hex');
  const canonical = `GET\n${new URL(captured.url).pathname}\n\n${signed.split(';').map(n => `${n}:${h.get(n)}\n`).join('')}\n${signed}\n${hash('')}`;
  let secret = Buffer.from('AWS4synthetic-secret');
  for (const value of ['20261102', 'us-east-1', 's3', 'aws4_request']) secret = createHmac('sha256', secret).update(value).digest();
  const signature = createHmac('sha256', secret).update(`AWS4-HMAC-SHA256\n20261102T120000Z\n20261102/us-east-1/s3/aws4_request\n${hash(canonical)}`).digest('hex');
  assert.ok(auth.endsWith(`Signature=${signature}`));
  await assert.rejects(origin({ bucket: 'private', key: 'a/../b' }));
});

test('Cloudflare worker disabled by default; enabled path uses token-free shared cache and configured host', async () => {
  const disabled = await createWorker({}, null);
  assert.equal((await disabled(request(await token()))).status, 503);
  const stored = new Map();
  const cacheURLs = [];
  const storage = { async match(req) { cacheURLs.push(req.url); return stored.get(req.url)?.clone(); },
    async put(req, response) { assert.equal(response.headers.get('cache-control'), 'public, max-age=300'); stored.set(req.url, response); } };
  let fetches = 0;
  const worker = await createWorker({ MEDIA_DELIVERY_ENABLED: 'true', DELIVERY_ORIGIN: 'https://media.example',
    CAP_ISSUER: 'node', CAP_AUDIENCE: 'media', CAP_JWKS: JSON.stringify(config.jwks), S3_BUCKET: 'private',
    S3_ENDPOINT: 'https://storage.example', S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'synthetic', S3_SECRET_ACCESS_KEY: 'synthetic',
  }, storage, { crypto, fetch: async () => { fetches++; return new Response('object', { headers: { 'content-length': '6' } }); } });
  for (let i = 0; i < 2; i++) {
    const pending = [];
    assert.equal((await worker(request(await token()), { waitUntil: promise => pending.push(promise) })).status, 200);
    await Promise.all(pending);
  }
  assert.equal(fetches, 1);
  assert.equal(cacheURLs.length, 2);
  assert.equal(cacheURLs[0], cacheURLs[1]);
  assert.ok(!cacheURLs[0].includes('?'));
  assert.equal((await worker(new Request(request(await token()).url.replace('media.example', 'other.example')))).status, 403);
});

test('credentialless CORS on miss, hit, range and errors; OPTIONS denied without I/O', async () => {
  const f = await fixture();
  const cap = await token();
  const responses = [await f.deliver(request(cap)), await f.deliver(request(cap)),
    await f.deliver(request(null)), await f.deliver(request(cap, { headers: { range: 'bad' } }))];
  f.setStatus(206);
  responses.push(await f.deliver(request(cap, { headers: { range: 'bytes=0-5' } })));
  const before = { ...f.calls };
  responses.push(await f.deliver(request(cap, { method: 'OPTIONS', headers: {
    origin: 'https://app.example', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization',
  } })));
  assert.deepEqual(f.calls, before);
  assert.equal(responses.at(-1).status, 403);
  const failed = createDelivery({ ...f, enabled: true, origin: async () => { throw Error('private'); } });
  responses.push(await failed(request(cap, { headers: { range: 'bytes=0-5' } })));
  responses.push(await (await createWorker({}, null))(request(cap)));
  for (const response of responses) {
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    for (const header of ['content-length', 'content-type', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      assert.ok(response.headers.get('access-control-expose-headers').split(', ').includes(header));
    }
  }
});

test('bounded cache write uses request lifetime and returns stream before EOF', { timeout: 3000 }, async () => {
  let controller;
  let cached = false;
  const pending = [];
  const body = new ReadableStream({ start(value) { controller = value; controller.enqueue(new Uint8Array([65])); } });
  const deliver = createDelivery({ enabled: true, verify: async () => ({ bucket: 'private', key: 'stream' }),
    cache: { get: async () => null, put: async (_scope, response) => { assert.equal(await response.text(), 'AB'); cached = true; } },
    origin: async () => new Response(body, { headers: { 'content-length': '2' } }),
  });
  try {
    const response = await deliver(request('unused'), promise => pending.push(promise));
    assert.equal(pending.length, 1);
    assert.equal(cached, false);
    const reader = response.body.getReader();
    assert.deepEqual((await reader.read()).value, new Uint8Array([65]));
    controller.enqueue(new Uint8Array([66]));
    controller.close();
    assert.deepEqual((await reader.read()).value, new Uint8Array([66]));
    assert.equal((await reader.read()).done, true);
    await Promise.all(pending);
    assert.equal(cached, true);
  } finally { try { controller.close(); } catch {} }
});

test('cache write failures are tolerated and emit only a fixed event', async () => {
  for (const synchronous of [false, true]) {
    const events = [];
    const pending = [];
    const deliver = createDelivery({ enabled: true, verify: async () => ({ bucket: 'private', key: 'private' }),
      event: event => events.push(event),
      cache: { get: async () => null, put: () => {
        if (synchronous) throw Error('private details');
        return Promise.reject(Error('secret credentials'));
      } },
      origin: async () => new Response('ok', { headers: { 'content-length': '2' } }),
    });
    const response = await deliver(request('unused'), promise => pending.push(promise));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
    await Promise.all(pending);
    assert.deepEqual(events, ['origin-start', 'origin-complete', 'cache-write-failed']);
  }
});

test('unknown, malformed and oversized lengths or missing scheduler skip cloning/cache writes', async () => {
  for (const length of [null, '33554433', '99999999999999999999', '-1', '1.5', '01', '1e2', 'invalid']) {
    let writes = 0;
    let schedules = 0;
    const deliver = createDelivery({ enabled: true, verify: async () => ({}),
      cache: { get: async () => null, put: () => { writes++; } },
      origin: async () => {
        const response = new Response('ok', { headers: length === null ? {} : { 'content-length': length } });
        response.clone = () => { assert.fail('ineligible response cloned'); };
        return response;
      },
    });
    assert.equal(await (await deliver(request('unused'), () => { schedules++; })).text(), 'ok');
    assert.equal(writes, 0);
    assert.equal(schedules, 0);
  }
  const f = await fixture();
  assert.equal((await createDelivery({ ...f, enabled: true })(request(await token()))).status, 200);
  assert.equal(f.calls.put, 0);
});

test('reused Cloudflare worker schedules each miss on its own request context', async () => {
  const worker = await createWorker({ MEDIA_DELIVERY_ENABLED: 'true', DELIVERY_ORIGIN: 'https://media.example',
    CAP_ISSUER: 'node', CAP_AUDIENCE: 'media', CAP_JWKS: JSON.stringify(config.jwks), S3_BUCKET: 'private',
    S3_ENDPOINT: 'https://storage.example', S3_REGION: 'auto', S3_ACCESS_KEY_ID: 'synthetic', S3_SECRET_ACCESS_KEY: 'synthetic',
  }, { match: async () => null, put: async () => {} },
  { crypto, fetch: async () => new Response('ok', { headers: { 'content-length': '2' } }) });
  const first = [];
  const second = [];
  const ctxA = { waitUntil(promise) { assert.equal(this, ctxA); first.push(promise); } };
  const ctxB = { waitUntil(promise) { assert.equal(this, ctxB); second.push(promise); } };
  await worker(request(await token()), ctxA);
  await worker(request(await token()), ctxB);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  await Promise.all([...first, ...second]);
});
