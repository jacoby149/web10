import { getWapi } from './wapi';
import type { PostRecord, MediaRecord, MediaUploadRequest } from './types';

// ── Post data layer ────────────────────────────────────────────────────────
// Operations on the `posts` service following conventions schemas.

/**
 * Create a new post record.
 * Media files should be uploaded first via uploadMedia(), then referenced
 * through media_refs.
 */
export async function createPost(post: Omit<PostRecord, '_id'>): Promise<PostRecord> {
  const wapi = getWapi();
  return wapi.create<PostRecord>('posts', post);
}

/**
 * Read all posts for the current user (wall).
 */
export async function readMyPosts(): Promise<PostRecord[]> {
  const wapi = getWapi();
  return wapi.read<PostRecord>('posts');
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
 * Returns the media record with the _id to reference in posts.
 */
export async function uploadMedia(request: MediaUploadRequest): Promise<MediaRecord> {
  const wapi = getWapi();

  // 1. Get presigned URL and media record metadata from the API
  const { uploadUrl, mediaRecord } = await wapi.getUploadUrl(
    request.file.type || 'application/octet-stream',
    request.file.size,
  );

  // 2. Upload the file directly to object storage
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': request.file.type || 'application/octet-stream' },
    body: request.file,
  });
  if (!uploadResp.ok) {
    throw new Error(`media upload failed: ${uploadResp.status}`);
  }

  // 3. Return the media record (already created by the API)
  return mediaRecord as unknown as MediaRecord;
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