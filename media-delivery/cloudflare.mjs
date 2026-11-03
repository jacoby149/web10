import { createDelivery, createVerifier, encodeKey, failure } from './core.mjs';

const encoder = new TextEncoder();
const hex = value => Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join('');
const escape = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function createS3Origin({ endpoint, region, accessKeyId, secretAccessKey, sessionToken, crypto = globalThis.crypto, fetch = globalThis.fetch, now = () => new Date() }) {
  const base = new URL(endpoint);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
      !region || !accessKeyId || !secretAccessKey) throw Error('origin configuration');
  const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const hmac = async (key, value) => crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw',
    typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), encoder.encode(value));
  return async ({ bucket, key, range }) => {
    // Fetch URL normalization cannot preserve literal dot segments. Fail closed.
    if (key.split('/').some(part => part === '.' || part === '..')) throw Error('unsupported key');
    const path = `/${escape(bucket)}/${key.split('/').map(escape).join('/')}`;
    const url = new URL(base.origin + path);
    if (url.pathname !== path) throw Error('origin path');
    const date = now().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = date.slice(0, 8);
    const payload = await digest('');
    const headers = new Headers({ host: url.host, 'x-amz-date': date, 'x-amz-content-sha256': payload });
    if (sessionToken) headers.set('x-amz-security-token', sessionToken);
    if (range !== null && range !== undefined) headers.set('range', range);
    const names = [...headers.keys()].sort();
    const signed = names.join(';');
    const canonical = `GET\n${path}\n\n${names.map(name => `${name}:${headers.get(name).trim()}\n`).join('')}\n${signed}\n${payload}`;
    const scope = `${day}/${region}/s3/aws4_request`;
    let signingKey = await hmac(`AWS4${secretAccessKey}`, day);
    for (const value of [region, 's3', 'aws4_request']) signingKey = await hmac(signingKey, value);
    const signature = hex(await hmac(signingKey, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await digest(canonical)}`));
    headers.set('authorization', `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`);
    return fetch(url.href, { method: 'GET', headers, redirect: 'manual', cache: 'no-store' });
  };
}

export function createCloudflareCache(storage, deliveryOrigin) {
  const key = ({ bucket, key }) => new Request(`${deliveryOrigin}/__protected_media_cache/v1/${encodeKey(bucket)}/${encodeKey(key)}`);
  return {
    get: scope => storage.match(key(scope)),
    put: (scope, response) => storage.put(key(scope), response),
  };
}

export async function createWorker(env, storage, dependencies = {}) {
  if (env.MEDIA_DELIVERY_ENABLED !== 'true') return () => failure(503);
  const host = new URL(env.DELIVERY_ORIGIN);
  if (host.protocol !== 'https:' || host.href !== `${host.origin}/`) throw Error('delivery origin');
  const verify = await createVerifier({ issuer: env.CAP_ISSUER, audience: env.CAP_AUDIENCE,
    bucket: env.S3_BUCKET, jwks: JSON.parse(env.CAP_JWKS), crypto: dependencies.crypto });
  const delivery = createDelivery({ enabled: true, verify,
    event: name => { if (name === 'cache-write-failed') console.warn('[media-delivery] cache-write-failed'); },
    cache: createCloudflareCache(storage, host.origin),
    origin: createS3Origin({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      sessionToken: env.S3_SESSION_TOKEN, ...dependencies }),
  });
  return (request, ctx) => new URL(request.url).origin === host.origin
    ? delivery(request, ctx ? promise => ctx.waitUntil(promise) : undefined) : failure(403);
}

let worker;
let configuration;
export default {
  async fetch(request, env, ctx) {
    try {
      // Static deployment configuration: no per-request JWKS or node lookup.
      if (configuration !== env) {
        configuration = env;
        worker = createWorker(env, caches.default);
      }
      return await (await worker)(request, ctx);
    } catch { return failure(503); }
  },
};
