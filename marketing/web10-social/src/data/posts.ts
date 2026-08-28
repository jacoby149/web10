import { getV3Client } from './v3';
import {
  getDiscoverGroupId,
  followersGroupId,
  closeFriendsGroupId,
  getMyGroups,
  getFeedGroups,
  ensureFollowers,
} from './groups';
import type { PostRecord, MediaRecord, MediaUploadRequest, Visibility } from './types';
import { fromV3DocToPost, fromV3DocToMedia } from './types';

// ── Post data layer (v3) ─────────────────────────────────────────────────────
// Posts live in the `posts` collection. Visibility is controlled by GROUPS:
//   - public posts: attached to discover group + followers group
//   - followers-only: attached to followers group only
//   - private: attached to close-friends group only
// No collection split — one `posts` collection, groups define access.

/**
 * Create a new post record.
 * Media files should be uploaded first via uploadMedia(), then referenced
 * through media_refs.
 */
export async function createPost(
  post: Omit<PostRecord, '_id'>,
  groups?: string[],
): Promise<PostRecord> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const body: Record<string, unknown> = {
    text: post.text,
    media_refs: post.media_refs,
    origin: post.origin,
    origin_id: post.origin_id,
    visibility: post.visibility,
    location: post.location,
    mentions: post.mentions,
    encrypted: post.encrypted,
  };

  // Default groups based on visibility
  const visibility = post.visibility || 'public';
  let targetGroups = groups || determinePostGroups(visibility, token.username);

  // Public/friends posts attach to the user's OWN followers group — ensure it
  // exists (user as owner) so the post surfaces in the user's own feed (the
  // feed reads the user's groups minus discover). Best-effort: a failure here
  // must not block the post (it still lands on discover for public).
  if (!groups && visibility !== 'private') {
    try {
      await ensureFollowers(token.username);
    } catch (e) {
      console.warn('[social-feed] createPost — ensureFollowers failed (non-fatal):', e);
    }
  }

  console.log('[social-feed] createPost — visibility:', visibility, 'target groups:', JSON.stringify(targetGroups));

  const doc = await w.create('posts', body, { groups: targetGroups });
  console.log('[social-feed] createPost — success, doc_id:', doc.doc_id);
  return fromV3DocToPost(doc);
}

/**
 * Determine which groups a post should be attached to based on visibility.
 */
function determinePostGroups(visibility: Visibility, username: string): string[] {
  switch (visibility) {
    case 'public':
      return [getDiscoverGroupId(), followersGroupId(username)];
    case 'friends':
      return [followersGroupId(username)];
    case 'private':
      return [closeFriendsGroupId(username)];
    default:
      return [getDiscoverGroupId(), followersGroupId(username)];
  }
}

/**
 * Read posts from specific groups.
 */
export async function readPosts(
  groups: string[],
  opts?: { limit?: number; offset?: number },
): Promise<PostRecord[]> {
  const w = getV3Client();
  const docs = await w.read('posts', {
    groups,
    limit: opts?.limit,
    offset: opts?.offset,
  });
  return docs.map(fromV3DocToPost);
}

/**
 * Read the owner's posts (from all groups they belong to).
 */
export async function readMyPosts(opts?: { limit?: number }): Promise<PostRecord[]> {
  const feedGroups = await getFeedGroups();
  if (!feedGroups.length) return [];
  return readPosts(feedGroups, opts);
}

/**
 * Read posts for a specific user's followers group.
 * @param username - the user's username
 * @param optsOrProvider - optional limit opts, or a provider string (v2 compat, ignored in v3)
 */
export async function readUserPosts(username: string, optsOrProvider?: { limit?: number } | string): Promise<PostRecord[]> {
  const opts = typeof optsOrProvider === 'string' ? undefined : optsOrProvider;
  return readPosts([followersGroupId(username)], opts);
}

/**
 * Read a single post by ID.
 */
export async function readPostById(docId: string): Promise<PostRecord | null> {
  const w = getV3Client();
  try {
    const doc = await w.readById(docId, 'posts');
    return fromV3DocToPost(doc);
  } catch {
    return null;
  }
}

/**
 * Update a post by ID.
 */
export async function updatePost(docId: string, updates: Partial<PostRecord>): Promise<PostRecord> {
  const w = getV3Client();
  const body: Record<string, unknown> = {};
  if (updates.text !== undefined) body.text = updates.text;
  if (updates.media_refs !== undefined) body.media_refs = updates.media_refs;
  if (updates.visibility !== undefined) body.visibility = updates.visibility;
  if (updates.tags !== undefined) body.tags = updates.tags;
  if (updates.location !== undefined) body.location = updates.location;
  if (updates.mentions !== undefined) body.mentions = updates.mentions;

  const doc = await w.update(docId, body);
  return fromV3DocToPost(doc);
}

/**
 * Delete a post by ID (tombstone).
 */
export async function deletePost(docId: string): Promise<void> {
  const w = getV3Client();
  await w.delete(docId);
}

/**
 * Move a post between visibility levels by updating groups.
 * In v3, this means updating the post body visibility field.
 * The group membership is managed by the API's hooks.
 */
export async function movePostVisibility(post: PostRecord): Promise<PostRecord> {
  if (!post._id) throw new Error('post has no ID');
  const newVisibility: Visibility = post.visibility === 'public' ? 'private' : 'public';
  return updatePost(post._id, { visibility: newVisibility });
}

// ── Media data layer (v3) ────────────────────────────────────────────────────

/**
 * Upload a media file through the v3 media pipeline.
 * 1. Request presigned URL (via the v3 API)
 * 2. Upload file to object storage
 * 3. Confirm upload to create the media record
 */
export async function uploadMedia(request: MediaUploadRequest): Promise<MediaRecord> {
  const w = getV3Client();

  // Upload thumbnail/poster first if provided
  let thumbnailUrl: string | null = null;
  if (request.thumbnailFile) {
    const thumbRecord = await uploadMedia({ file: request.thumbnailFile, service: request.service });
    thumbnailUrl = thumbRecord.url;
  }

  // For v3, we use the confirm endpoint directly with file metadata
  // The presigned URL flow is handled by the API
  const metadata: Record<string, unknown> = {
    filename: request.file.name,
    mime_type: request.file.type || 'application/octet-stream',
    size_bytes: request.file.size,
    width: request.width ?? null,
    height: request.height ?? null,
    duration_seconds: request.durationSeconds ?? null,
    thumbnail_url: thumbnailUrl,
    alt_text: request.altText ?? null,
    service: request.service || 'media',
  };

  // For now, store the file URL directly — the presigned upload flow
  // will be wired when the v3 media endpoints are fully available
  const doc = await w.confirmMediaUpload(metadata);
  return fromV3DocToMedia(doc);
}

/**
 * Read media records for the current user.
 */
export async function readMedia(opts?: { limit?: number; offset?: number }): Promise<MediaRecord[]> {
  const w = getV3Client();
  const docs = await w.listMedia(opts);
  return docs.map(fromV3DocToMedia);
}

/**
 * Read a single media record by ID.
 */
export async function readMediaRecord(docId: string): Promise<MediaRecord | null> {
  const w = getV3Client();
  try {
    const doc = await w.readById(docId, 'media');
    return fromV3DocToMedia(doc);
  } catch {
    return null;
  }
}

/**
 * Delete a media record by ID.
 */
export async function deleteMedia(docId: string): Promise<void> {
  const w = getV3Client();
  await w.deleteMedia(docId);
}

/**
 * Resolve media_refs to full media records.
 */
export async function resolveMediaRefs(
  refs: string[],
  _owner?: { username: string; provider: string },
  _service?: 'media' | 'public_media',
): Promise<MediaRecord[]> {
  if (!refs.length) return [];
  const w = getV3Client();
  const media = await w.listMedia({ limit: refs.length });
  const refSet = new Set(refs);
  // The API returns doc_id (the hand-rolled client's phantom `_id?` field
  // made this filter a silent no-op — media refs never resolved).
  return media
    .filter((m) => m.doc_id && refSet.has(m.doc_id))
    .map(fromV3DocToMedia);
}

/**
 * Refresh a single media record's URLs (alias for resolveMediaRefs).
 */
export async function refreshMediaUrl(
  record: MediaRecord,
  _owner?: { username: string; provider: string },
  _service?: 'media' | 'public_media',
): Promise<MediaRecord> {
  if (!record._id) return record;
  const w = getV3Client();
  try {
    const doc = await w.readById(record._id, 'media');
    return fromV3DocToMedia(doc);
  } catch {
    return record;
  }
}

/**
 * Refresh media URLs for a batch of records.
 */
export async function refreshMediaUrls(
  records: MediaRecord[],
  _owner?: { username: string; provider: string },
  _service?: 'media' | 'public_media',
): Promise<MediaRecord[]> {
  if (!records.length) return records;
  const w = getV3Client();
  const refreshed = await Promise.all(
    records.map(async (r) => {
      if (!r._id) return r;
      try {
        const doc = await w.readById(r._id, 'media');
        return fromV3DocToMedia(doc);
      } catch {
        return r;
      }
    }),
  );
  return refreshed;
}

// ── Backward compat aliases ──────────────────────────────────────────────────

/** @deprecated use readPostById */
export const readPost = readPostById;

/** @deprecated use readUserPosts */
export const readUserPublicPosts = readUserPosts;