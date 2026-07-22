import { getWapi } from './wapi';
import { API_ORIGIN } from '../lib/origins';
import type { PostRecord, MediaRecord, MediaUploadRequest, PublicEntry, SchemaDefinition, DiscoverSort, DiscoveryPost } from './types';

// ── Post data layer ────────────────────────────────────────────────────────
// Operations on the `posts` service following conventions schemas.
// Phase 5.5: new posts route to `public_posts` or `private_posts` based
// on visibility. The legacy `posts` service still works via readMyPosts.

interface LegacyPost {
  _id?: string;
  html: string;
  media: Array<{ type: string; src: string }>;
  time: string;
  web10?: string;
}

/**
 * Check if a record looks like a legacy post (has `html` field).
 */
function isLegacyPost(record: Record<string, unknown>): record is LegacyPost {
  return 'html' in record && !('text' in record);
}

/**
 * Strip HTML tags to get plain text.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Create a new post record.
 * Media files should be uploaded first via uploadMedia(), then referenced
 * through media_refs.
 *
 * Phase 5.5: if visibility === 'public', writes to `public_posts` service;
 * otherwise writes to `private_posts`. The legacy `posts` service is kept
 * for backward compatibility.
 */
export async function createPost(post: Omit<PostRecord, '_id'>): Promise<PostRecord> {
  const wapi = getWapi();
  const service = post.visibility === 'public' ? 'public_posts' : 'private_posts';
  return wapi.create<PostRecord>(service, post);
}

/**
 * Read all posts for the current user (wall).
 * Adapts legacy post records (html/media/time → text/media_refs/created_at)
 * in-place on first read.
 */
export async function readMyPosts(): Promise<PostRecord[]> {
  const wapi = getWapi();
  let records = await wapi.read<Record<string, unknown>>('posts');

  const hasLegacy = records.some(isLegacyPost);
  if (hasLegacy) {
    // Migrate legacy records in-place
    for (const record of records) {
      if (isLegacyPost(record) && record._id) {
        await wapi.update<PostRecord>('posts', { _id: record._id }, {
          $set: {
            text: stripHtml(record.html),
            media_refs: record.media?.map((m) => m.src) || [],
            created_at: record.time,
            updated_at: new Date().toISOString(),
          },
        });
      }
    }
    records = await wapi.read<PostRecord>('posts');
  }

  return records as PostRecord[];
}

/**
 * Read posts for a specific user on a specific provider.
 */
export async function readUserPosts(username: string, provider: string): Promise<PostRecord[]> {
  const wapi = getWapi();
  return wapi.read<PostRecord>('posts', {}, username, provider);
}

/**
 * Read a single post by ID.
 */
export async function readPost(id: string): Promise<PostRecord | null> {
  const wapi = getWapi();
  const posts = await wapi.read<PostRecord>('posts', { _id: id });
  return posts[0] || null;
}

/**
 * Update a post by ID.
 */
export async function updatePost(id: string, updates: Partial<PostRecord>): Promise<PostRecord> {
  const wapi = getWapi();
  return wapi.update<PostRecord>('posts', { _id: id }, { $set: updates });
}

/**
 * Delete a post by ID.
 */
export async function deletePost(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('posts', { _id: id });
}

// ── Media data layer ───────────────────────────────────────────────────────

/**
 * Upload a media file through the API's media router presigned URLs.
 * 1. Request presigned URL
 * 2. Upload file to object storage
 * 3. Confirm upload to create the media record
 * Returns the media record with the _id to reference in posts.
 */
export async function uploadMedia(request: MediaUploadRequest): Promise<MediaRecord> {
  const wapi = getWapi();

  // 1. Get presigned URL from the API
  const { uploadUrl, fields, contentType } = await wapi.getUploadUrl(
    request.file.type || 'application/octet-stream',
    request.file.size,
    request.file.name,
  );

  // 2. Upload the file directly to object storage using presigned POST
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  formData.append('file', request.file);

  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  if (!uploadResp.ok) {
    throw new Error(`media upload failed: ${uploadResp.status}`);
  }

  // 3. Confirm upload to create the media record in the user's collection
  const token = wapi.readToken();
  if (!token) throw new Error('not authenticated');
  const proto = (wapi as any).APIProtocol || 'https:';
  const confirmResp = await fetch(`${proto}//${token.provider}/${token.username}/upload/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: (wapi as any).token,
      url: `${uploadUrl}/${request.file.name}`,
      filename: request.file.name,
      mime_type: contentType,
      size_bytes: request.file.size,
    }),
  });
  if (!confirmResp.ok) {
    throw new Error(`media confirm failed: ${confirmResp.status}`);
  }
  const record = await confirmResp.json();
  return record as MediaRecord;
}

/**
 * Read media records for the current user.
 */
export async function readMedia(query?: Record<string, unknown>): Promise<MediaRecord[]> {
  const wapi = getWapi();
  return wapi.read<MediaRecord>('media', query || {});
}

/**
 * Read a single media record by ID.
 */
export async function readMediaRecord(id: string): Promise<MediaRecord | null> {
  const wapi = getWapi();
  const records = await wapi.read<MediaRecord>('media', { _id: id });
  return records[0] || null;
}

/**
 * Delete a media record by ID.
 */
export async function deleteMedia(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('media', { _id: id });
}

/**
 * Resolve media_refs to full media records.
 */
export async function resolveMediaRefs(refs: string[]): Promise<MediaRecord[]> {
  if (!refs.length) return [];
  const wapi = getWapi();
  return wapi.read<MediaRecord>('media', { _id: { $in: refs } });
}