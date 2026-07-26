import { wapiInit } from 'web10-npm';
import { AUTH_ORIGIN, RTC_HOST } from '../lib/origins';

// Thin typed wrapper around the legacy wapi.js SDK.
// All CRUD operations return the raw record body (no axios envelope).

export interface WapiToken {
  provider: string;
  username: string;
  site?: string;
  target?: string;
  expires?: number;
}

export interface WapiWrapper {
  // Auth
  isSignedIn: () => boolean;
  signOut: () => void;
  setToken: (token: string) => void;
  readToken: () => WapiToken | null;
  openAuthPortal: () => void;
  authListen: (callback: () => void) => void;

  // Typed CRUD — returns raw record body
  read: <T = Record<string, unknown>>(
    service: string,
    query?: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<T[]>;

  create: <T = Record<string, unknown>>(
    service: string,
    body: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<T>;

  update: <T = Record<string, unknown>>(
    service: string,
    query: Record<string, unknown>,
    update: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<T>;

  delete: (
    service: string,
    query: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<void>;

  // Aggregate (5th verb)
  aggregate: <T = Record<string, unknown>>(
    service: string,
    pipeline: unknown[],
    username?: string,
    provider?: string,
  ) => Promise<T[]>;

  // Media presigned URL
  getUploadUrl: (
    mimeType: string,
    sizeBytes: number,
    filename: string,
  ) => Promise<{ uploadUrl: string; fields: Record<string, string>; objectKey: string; contentType: string }>;

  // Confirm an object-storage upload → creates the media record in the
  // user's collection. Lives here (not in the data layer) because the raw
  // JWT + API protocol are only reachable from inside the wrapper.
  // Optional fields (width, height, durationSeconds, thumbnailUrl, altText)
  // are accepted by the API's MetadataCreate but defaulted to null when
  // absent — pydantic requires the keys to exist, so we send null explicitly.
  confirmUpload: <T = Record<string, unknown>>(params: {
    url: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
    thumbnailUrl?: string | null;
    altText?: string | null;
    // D35: target service for the media record. Defaults to "media".
    service?: 'media' | 'public_media';
  }) => Promise<T>;

  // Media presigned READ url (POST /media/{user}/read). Returns an
  // expiring presigned GET for object storage. A private bucket (the dev
  // minio) 403s the bare unsigned object URL stored on the record, so
  // every renderer must use this instead of `record.url` raw. The cache
  // (module-level) reuses a still-fresh URL so a feed of N images is
  // not N round-trips per re-render; an in-flight dedupe collapses a
  // burst of requests for the same key into one network call.
  getReadUrl: (
    objectKey: string,
    username?: string,
    provider?: string,
    // D35: service to presign against. Defaults to "media".
    service?: 'media' | 'public_media',
  ) => Promise<{ readUrl: string; expiresIn: number }>;

  // P2P (legacy, kept for existing chat)
  initP2P: (onInbound: (conn: unknown, data: unknown) => void, label: string) => void;
  sendP2P: (provider: string, username: string, origin: string, label: string, data: unknown) => void;
}

// ── Presigned read-URL cache (expiry-aware, in-flight dedupe) ────────────
// Keyed by `${provider}/${username}/${objectKey}/${service}` so media
// owned by different users, on different nodes, or in different
// services never collide. Each entry caches
// the presigned GET URL and the absolute time it expires (`now +
// expiresIn*1000`); a request returns the cached URL if it is at least
// `EXPIRY_MARGIN_MS` from expiry, otherwise re-fetches. A concurrent
// burst of identical requests shares one in-flight promise (the cache
// stores the promise, not the resolved value, while the first request
// is mid-flight) — this is what keeps an N-image feed re-render from
// becoming N round-trips.

const EXPIRY_MARGIN_MS = 10_000;

interface CachedReadUrl {
  readUrl: string;
  expiresAt: number;
}

const readUrlCache = new Map<string, CachedReadUrl | Promise<CachedReadUrl>>();

function readUrlCacheKey(provider: string, username: string, objectKey: string, service: string = 'media'): string {
  return `${provider}/${username}/${objectKey}/${service}`;
}

/**
 * Derive the S3 object key from a stored media record URL. Media
 * records created today store the bare unsigned object URL
 * (`${uploadUrl}/${objectKey}` where uploadUrl is path-style
 * `https://host/bucket`), so the object key is every path segment
 * after the bucket. Lane A's open request persists `object_key` on
 * confirm-upload (coordinated separately); until every record carries
 * it, legacy records derive the key from the stored URL via this. If
 * `record.object_key` is present it is preferred (see refreshMediaUrls
 * in posts.ts) — this is only the fallback.
 */
export function deriveObjectKey(storedUrl: string): string {
  try {
    const u = new URL(storedUrl);
    // Strip query/hash (presigned POST base URLs have none, but be safe).
    const segs = u.pathname.split('/').filter(Boolean);
    // Path-style: /<bucket>/<objectKey>. Drop the bucket segment.
    if (segs.length > 1) return segs.slice(1).join('/');
    // Vhost-style or bare key.
    return segs.join('/') || storedUrl;
  } catch {
    // Not a parseable URL — assume it is already a raw object key.
    return storedUrl;
  }
}

/** Test hook: drop the cache so each test starts clean. */
export function clearReadUrlCache(): void {
  readUrlCache.clear();
}

let instance: WapiWrapper | null = null;

export function createWapiWrapper(authUrl?: string, rtcServer?: string): WapiWrapper {
  if (instance) return instance;

  const queryParameters = new URLSearchParams(window.location.search);
  const host = window.location.hostname;
  const local =
    queryParameters.get('local') != null ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost');
  const resolvedAuthUrl = authUrl ?? (local ? 'http://auth.localhost' : AUTH_ORIGIN);
  const resolvedRtcServer = rtcServer ?? (local ? 'rtc.localhost' : RTC_HOST);

  const wapi = wapiInit(resolvedAuthUrl, undefined, resolvedRtcServer);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = wapi as any;

  const getToken = () => raw.token;
  const getProtocol = () => raw.APIProtocol || 'https:';

  const wrapper: WapiWrapper = {
    isSignedIn: () => raw.isSignedIn(),
    signOut: () => raw.signOut(),
    setToken: (t: string) => raw.setToken(t),
    readToken: () => {
      const t = raw.readToken();
      return t || null;
    },
    openAuthPortal: () => raw.openAuthPortal(),
    authListen: (cb: () => void) => raw.authListen(() => { cb(); }),

    async read<T>(service, query, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      // wapi.read uses PATCH
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query: query || {} }),
      });
      if (!resp.ok) throw new Error(`read failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T[];
    },

    async create<T>(service, body, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query: body }),
      });
      if (!resp.ok) throw new Error(`create failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T;
    },

    async update<T>(service, query, update, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query, update }),
      });
      if (!resp.ok) throw new Error(`update failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T;
    },

    async delete(service, query, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query }),
      });
      if (!resp.ok) throw new Error(`delete failed: ${resp.status}`);
    },

    async aggregate<T>(service, pipeline, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}/aggregate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pipeline }),
      });
      if (!resp.ok) throw new Error(`aggregate failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T[];
    },

    async getUploadUrl(mimeType, sizeBytes, filename) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = raw.readToken().provider;
      const u = raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, filename, mime_type: mimeType, size_bytes: sizeBytes }),
      });
      if (!resp.ok) throw new Error(`getUploadUrl failed: ${resp.status}`);
      const json = await resp.json();
      return {
        uploadUrl: json.upload_url,
        fields: json.fields || {},
        objectKey: json.object_key,
        contentType: json.content_type,
      };
    },

    async confirmUpload<T>({ url, filename, mimeType, sizeBytes, width = null, height = null, durationSeconds = null, thumbnailUrl = null, altText = null, service = 'media' }) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = raw.readToken().provider;
      const u = raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/upload/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          url,
          filename,
          service,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          width,
          height,
          duration_seconds: durationSeconds,
          thumbnail_url: thumbnailUrl,
          alt_text: altText,
        }),
      });
      if (!resp.ok) throw new Error(`confirm upload failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T;
    },

    async getReadUrl(objectKey, username, provider, service = 'media') {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const cacheKey = readUrlCacheKey(p, u, objectKey, service);

      // Reuse a still-fresh cached URL...
      const cached = readUrlCache.get(cacheKey);
      const now = Date.now();
      if (cached && !(cached instanceof Promise) && cached.expiresAt - now > EXPIRY_MARGIN_MS) {
        return { readUrl: cached.readUrl, expiresIn: Math.max(0, Math.round((cached.expiresAt - now) / 1000)) };
      }
      // ...or share an already-running fetch for the same key (in-flight
      // dedupe — a burst of N callers collapses to one network call).
      if (cached && cached instanceof Promise) {
        const resolved = await cached;
        return { readUrl: resolved.readUrl, expiresIn: Math.max(0, Math.round((resolved.expiresAt - now) / 1000)) };
      }

      const inflight = (async (): Promise<CachedReadUrl> => {
        const resp = await fetch(`${proto}//${p}/${u}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, object_key: objectKey, service }),
        });
        if (!resp.ok) throw new Error(`getReadUrl failed: ${resp.status}`);
        const json = await resp.json();
        const expiresIn = Number(json.expires_in) || 0;
        return {
          readUrl: json.read_url as string,
          expiresAt: Date.now() + expiresIn * 1000,
        };
      })();
      // Register the in-flight promise so concurrent callers share it.
      // The settle handler swaps it for the resolved value (or evicts
      // on error so the next call retries fresh).
      readUrlCache.set(cacheKey, inflight);
      try {
        const settled = await inflight;
        // Keep the resolved entry in the cache so subsequent re-renders
        // skip the round-trip until it nears expiry.
        readUrlCache.set(cacheKey, settled);
        return { readUrl: settled.readUrl, expiresIn: Math.max(0, Math.round((settled.expiresAt - Date.now()) / 1000)) };
      } catch (err) {
        readUrlCache.delete(cacheKey);
        throw err;
      }
    },

    initP2P: (onInbound, label) => raw.initP2P(onInbound, label),
    sendP2P: (provider, username, origin, label, data) => raw.send(provider, username, origin, label, data),
  };

  instance = wrapper;
  return wrapper;
}

// Singleton accessor (reset in tests)
export function getWapi(): WapiWrapper {
  if (!instance) {
    return createWapiWrapper();
  }
  return instance;
}

export function resetWapi(): void {
  instance = null;
}