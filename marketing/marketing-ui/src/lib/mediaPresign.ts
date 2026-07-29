// Thin presign helper for marketing-ui.
//
// Mirrors the web10-social getReadUrl pattern (D22: copy, don't reach
// into web10-social's package). Two-step pipeline:
//   1. POST /media/{author}/list  → media records (anon, service='public_media')
//   2. POST /media/{author}/read  → presigned URL (anon, service='public_media')
//
// Expiry-aware caches for both steps.

import { API_ORIGIN } from '@/lib/origins';

// ── types ────────────────────────────────────────────────────────────────────

interface MediaRecord {
  _id: string;
  url: string;
  object_key?: string;
  mime_type?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
}

interface CachedReadUrl {
  readUrl: string;
  expiresAt: number; // epoch ms
}

interface CachedMediaList {
  records: MediaRecord[];
  fetchedAt: number; // epoch ms
}

// ── constants ────────────────────────────────────────────────────────────────

const EXPIRY_MARGIN_MS = 60_000; // don't reuse a URL within 60 s of expiry
const MEDIA_LIST_TTL_MS = 5 * 60_000; // media records rarely change

// ── caches ───────────────────────────────────────────────────────────────────

const mediaListCache = new Map<string, CachedMediaList>();
const readUrlCache = new Map<string, CachedReadUrl | Promise<CachedReadUrl>>();

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive an S3 object key from a stored URL.
 * Mirrors web10-social deriveObjectKey — path-style: drop the bucket segment;
 * vhost-style or bare key: pass through.
 */
export function deriveObjectKey(storedUrl: string): string {
  try {
    const u = new URL(storedUrl);
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length > 1) return segs.slice(1).join('/');
    return segs.join('/') || storedUrl;
  } catch {
    return storedUrl;
  }
}

function cacheKey(author: string, objectKey: string): string {
  return `${author}::${objectKey}`;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the author's public_media records (anon-first).
 * Cached for MEDIA_LIST_TTL_MS.
 */
export async function fetchMediaList(author: string): Promise<MediaRecord[]> {
  const cached = mediaListCache.get(author);
  if (cached && Date.now() - cached.fetchedAt < MEDIA_LIST_TTL_MS) {
    return cached.records;
  }

  const resp = await fetch(`${API_ORIGIN}/media/${encodeURIComponent(author)}/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'public_media' }),
  });
  if (!resp.ok) return [];

  const records = (await resp.json()) as MediaRecord[];
  mediaListCache.set(author, { records, fetchedAt: Date.now() });
  return records;
}

/**
 * Resolve a media ref (MongoDB _id) to its media record.
 * Fetches the author's media list if not cached, then finds the matching record.
 */
export async function resolveMediaRef(
  author: string,
  mediaRefId: string,
): Promise<MediaRecord | null> {
  const records = await fetchMediaList(author);
  return records.find(r => r._id === mediaRefId) ?? null;
}

/**
 * Get a presigned read URL for a public_media object.
 * Expiry-aware cache: reuses fresh URLs, dedupes in-flight fetches.
 */
export async function getPublicMediaReadUrl(
  author: string,
  objectKey: string,
): Promise<string> {
  const key = cacheKey(author, objectKey);
  const now = Date.now();

  // Reuse a still-fresh cached URL.
  const cached = readUrlCache.get(key);
  if (cached && !(cached instanceof Promise) && cached.expiresAt - now > EXPIRY_MARGIN_MS) {
    return cached.readUrl;
  }

  // Share an already-running fetch for the same key.
  if (cached && cached instanceof Promise) {
    const resolved = await cached;
    return resolved.readUrl;
  }

  const inflight = (async (): Promise<CachedReadUrl> => {
    const resp = await fetch(`${API_ORIGIN}/media/${encodeURIComponent(author)}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object_key: objectKey,
        service: 'public_media',
      }),
    });
    if (!resp.ok) throw new Error(`presign failed: ${resp.status}`);
    const json = await resp.json();
    const expiresIn = Number(json.expires_in) || 0;
    return {
      readUrl: json.read_url as string,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  })();

  readUrlCache.set(key, inflight);
  try {
    const settled = await inflight;
    readUrlCache.set(key, settled);
    return settled.readUrl;
  } catch (err) {
    readUrlCache.delete(key);
    throw err;
  }
}

/**
 * Full pipeline: media ref → presigned URL.
 * Returns null if the ref can't be resolved or presigned.
 */
export async function getPublicMediaUrl(
  author: string,
  mediaRefId: string,
): Promise<string | null> {
  try {
    const record = await resolveMediaRef(author, mediaRefId);
    if (!record) return null;
    const objectKey = record.object_key || deriveObjectKey(record.url);
    if (!objectKey) return null;
    return await getPublicMediaReadUrl(author, objectKey);
  } catch {
    return null;
  }
}

/**
 * Get the thumbnail presigned URL for a media record.
 * Falls back to the main URL if no separate thumbnail exists.
 */
export async function getPublicMediaThumbnailUrl(
  author: string,
  record: MediaRecord,
): Promise<string | null> {
  if (!record.thumbnail_url || record.thumbnail_url === record.url) {
    return getPublicMediaUrl(author, record._id);
  }
  try {
    const thumbKey = deriveObjectKey(record.thumbnail_url);
    return await getPublicMediaReadUrl(author, thumbKey);
  } catch {
    return getPublicMediaUrl(author, record._id);
  }
}

// ── test hooks ───────────────────────────────────────────────────────────────

export function clearMediaCache(): void {
  mediaListCache.clear();
  readUrlCache.clear();
}
