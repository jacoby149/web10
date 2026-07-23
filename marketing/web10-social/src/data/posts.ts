import { getWapi } from './wapi';
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
function isLegacyPost(record: unknown): record is LegacyPost {
  if (typeof record !== 'object' || record === null) return false;
  const r = record as Record<string, unknown>;
  return 'html' in r && !('text' in r);
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
 *
 * Posts written by the composer route to `public_posts`/`private_posts`
 * (see createPost), while imported/legacy posts live in `posts`. The wall
 * is the union of all three — reading only `posts` (as this used to) meant
 * every newly composed post silently vanished from the profile and feed.
 *
 * Adapts legacy post records (html/media/time → text/media_refs/created_at)
 * in the `posts` service in-place on first read.
 */
export async function readMyPosts(): Promise<PostRecord[]> {
  const wapi = getWapi();
  let legacy: unknown[] = await wapi.read<Record<string, unknown>>('posts');

  const hasLegacy = legacy.some(isLegacyPost);
  if (hasLegacy) {
    // Migrate legacy records in-place
    for (const record of legacy) {
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
    legacy = await wapi.read<unknown[]>('posts');
  }

  const [publicPosts, privatePosts] = await Promise.all([
    wapi.read<PostRecord>('public_posts'),
    wapi.read<PostRecord>('private_posts'),
  ]);

  return [...(legacy as PostRecord[]), ...publicPosts, ...privatePosts];
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
  const { uploadUrl, fields, contentType, objectKey } = await wapi.getUploadUrl(
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

  // 3. Confirm upload to create the media record in the user's collection.
  //    Delegated to the wrapper: the raw JWT and API protocol live on the
  //    underlying SDK, not on the wrapper object — reaching for `wapi.token`
  //    here would send `token: undefined` and fail auth. The object URL is
  //    built from the server-assigned objectKey, not the raw filename.
  return wapi.confirmUpload<MediaRecord>({
    url: `${uploadUrl}/${objectKey}`,
    filename: request.file.name,
    mimeType: contentType,
    sizeBytes: request.file.size,
  });
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