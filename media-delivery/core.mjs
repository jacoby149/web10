const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function encodeKey(value) {
  return btoa(String.fromCharCode(...encoder.encode(value)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function bytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('encoding');
  const result = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (btoa(String.fromCharCode(...result)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') !== value) throw Error('encoding');
  return result;
}

function object(part) {
  const value = JSON.parse(decoder.decode(bytes(part)));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('object');
  return value;
}

export async function createVerifier({ issuer, audience, bucket, jwks, crypto = globalThis.crypto }) {
  if (![issuer, audience, bucket].every(v => typeof v === 'string' && v.length > 0)) throw Error('configuration');
  if (!Array.isArray(jwks?.keys) || !jwks.keys.length) throw Error('JWKS');
  const keys = new Map();
  for (const jwk of jwks.keys) {
    if (typeof jwk.kid !== 'string' || !jwk.kid || keys.has(jwk.kid) || jwk.kty !== 'RSA' ||
        (jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig') ||
        ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(k => k in jwk)) throw Error('public JWKS');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (key.algorithm.modulusLength < 2048) throw Error('RSA strength');
    keys.set(jwk.kid, key);
  }
  return async (request, now = Math.floor(Date.now() / 1000)) => {
    if (request.method !== 'GET') throw Error('method');
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('URL');
    const match = /^\/media\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    // One literal cap parameter only: no aliases, duplicates or ignored query data.
    const query = /^\?cap=([A-Za-z0-9_.-]+)$/.exec(url.search);
    if (!match || !query || query[1].length > 16384) throw Error('URL');
    const key = decoder.decode(bytes(match[1]));
    if (!key || encodeKey(key) !== match[1]) throw Error('key');
    const parts = query[1].split('.');
    if (parts.length !== 3) throw Error('JWT');
    const header = object(parts[0]);
    if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string' ||
        !keys.has(header.kid) || Object.keys(header).some(k => !['alg', 'typ', 'kid'].includes(k))) throw Error('header');
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.get(header.kid), bytes(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw Error('signature');
    const claims = object(parts[1]);
    if (claims.iss !== issuer || claims.aud !== audience || claims.v !== 1 || claims.bucket !== bucket ||
        claims.key !== key || claims.method !== 'GET' || !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) || claims.iat < 0 || claims.iat > now ||
        claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > 600) throw Error('claims');
    return { bucket, key };
  };
}

const allowedHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': allowedHeaders.join(', '),
};
export function mediaResponse(response, cacheControl = 'private, no-store') {
  const headers = new Headers(corsHeaders);
  for (const name of allowedHeaders) if (response.headers.has(name)) headers.set(name, response.headers.get(name));
  headers.set('cache-control', cacheControl);
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}

export function failure(status) {
  return new Response(null, { status, headers: { ...corsHeaders, 'cache-control': 'private, no-store' } });
}

// Adapter contract: cache.get/put({bucket,key}, Response), origin({bucket,key,range}).
export function createDelivery({ verify, cache, origin, enabled = false, event = () => {} }) {
  return async (request, schedule) => {
    if (!enabled) return failure(503);
    let scope;
    try { scope = await verify(request); } catch { event('denied'); return failure(403); }
    const range = request.headers.get('range');
    if (range !== null && !/^bytes=\d*-\d*$/.test(range)) return failure(416);
    if (range === 'bytes=-') return failure(416);
    try {
      if (range === null) {
        const hit = await cache.get(scope);
        if (hit?.status === 200 && !hit.headers.has('content-range')) {
          event('cache-hit');
          return mediaResponse(hit);
        }
      }
      event('origin-start');
      const response = await origin({ ...scope, range });
      event('origin-complete');
      if (![200, 206, 404, 416].includes(response.status) || (range === null && response.status === 206)) {
        await response.body?.cancel();
        return failure(502);
      }
      if (response.status === 404 || response.status === 416) {
        await response.body?.cancel();
        return failure(response.status);
      }
      const length = response.headers.get('content-length');
      if (typeof schedule === 'function' && range === null && response.status === 200 &&
          !response.headers.has('content-range') && /^(0|[1-9]\d*)$/.test(length ?? '') &&
          Number(length) <= 32 * 1024 * 1024) {
        try {
          const cached = mediaResponse(response.clone(), 'public, max-age=300');
          // Never await cache consumption of the cloned stream on the response path.
          schedule(Promise.resolve().then(() => cache.put(scope, cached)).catch(() => { event('cache-write-failed'); }));
        } catch { event('cache-write-failed'); }
      }
      return mediaResponse(response);
    } catch { event('delivery-failed'); return failure(502); }
  };
}
