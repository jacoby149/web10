import { getWapi } from './wapi';
import type { PostRecord, MediaRecord, MediaUploadRequest, PublicEntry, SchemaDefinition, DiscoverSort, DiscoveryPost } from './types';

// ── Post data layer ────────────────────────────────────────────────────────
// Post visibility is a COLLECTION, not a status field (decisions.md D30):
//   staging_posts  — owner-only, imported/drafted content awaiting triage
//                   (marketing-api parsers write here; imports no longer
//                   auto-publish to the legacy anon-readable `posts`)
//   private_posts  — owner-only, deliberately private
//   public_posts   — anon-read, discovery-indexed
// The composer (createPost) routes to public_posts or private_posts; the
// wall reads both. Pubished posts come from public_posts + private_posts;
// staged imports live in staging_posts and are NOT wall-visible until the
// user publishes them (Phase C, a collection move). The legacy
// anon-readable `posts` service is intentionally NOT read here — surfacing
// it on the wall would re-publish whatever the old auto-publish bug wrote.

interface LegacyPost {
  _id?: string;
  html: string;
  media: Array<{ type: string; src: string }>;
  time: string;
  web10?: string;
}

/**
 * Create a new post record.
 * Media files should be uploaded first via uploadMedia(), then referenced
 * through media_refs.
 *
 * Phase 5.5 / D30: visibility === 'public' writes to `public_posts`;
 * otherwise `private_posts`. Imports do NOT use this — they go through
 * the marketing-api and land in `staging_posts` for triage.
 */
export async function createPost(post: Omit<PostRecord, '_id'>): Promise<PostRecord> {
  const wapi = getWapi();
  const service = post.visibility === 'public' ? 'public_posts' : 'private_posts';
  return wapi.create<PostRecord>(service, post);
}

/**
 * Read the owner's wall = `public_posts` + `private_posts`.
 *
 * D19 Phase A: the legacy anon-readable `posts` service is intentionally
 * NOT read here. Until this fix, the wall unioned `posts` +
 * `public_posts` + `private_posts` and ran an in-place migration on legacy
 * `posts` records — but Phase A redirects imports to owner-only
 * `staging_posts` (decisions.md D30), so the wall is just the two real
 * tiers. Reading `posts` (anon-readable by its sir) here would surface
 * any old auto-published imports to the user, and once we stop writing
 * new imports there the collection has no role on the wall. Staged
 * imports surface in Phase C's staging/review screen instead.
 *
 * Regression context: this used to also read `posts`. The bug it caused
 * (already-fixed) was the inverse — readMyPosts read ONLY `posts` and
 * dropped every newly composed post. The composer now writes to
 * public_posts / private_posts, so reading those two is complete.
 */
export async function readMyPosts(): Promise<PostRecord[]> {
  const wapi = getWapi();
  const [publicPosts, privatePosts] = await Promise.all([
    wapi.read<PostRecord>('public_posts'),
    wapi.read<PostRecord>('private_posts'),
  ]);
  return [...publicPosts, ...privatePosts];
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