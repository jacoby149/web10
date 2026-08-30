import { getV3Client } from './v3';
import {
  getDiscoverGroupId,
  followersGroupId,
  closeFriendsGroupId,
  getMyGroups,
  getFeedGroups,
  ensureFollowers,
} from './groups';
import type { PostRecord, MediaRecord, MediaUploadRequest, Visibility, ResolvedMediaRef } from './types';
import { fromV3DocToPost, fromV3DocToMedia, fromResolvedMediaRef } from './types';

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
 *
 * `adPreference` (the v3 ad preference, ads-dissemination.md): when set, the
 * post is created with its `ad_preference` column (`pinned` + the ad's doc_id,
 * or `none`). The read then serves the post with the pinned ad inline.
 */
export async function createPost(
  post: Omit<PostRecord, '_id'>,
  groups?: string[],
  adPreference?: { mode: 'none' | 'pinned'; target?: string },
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

  console.log('[social-feed] createPost — visibility:', visibility, 'target groups:', JSON.stringify(targetGroups), 'ad_preference:', JSON.stringify(adPreference ?? null));

  const doc = await w.create('posts', body, {
    groups: targetGroups,
    ...(adPreference ? { ad_preference: adPreference } : {}),
  });
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
 * 1. Request presigned POST form (via the v3 API)
 * 2. Upload the file to object storage (MinIO) via the presigned form
 * 3. Confirm the upload — the media document's body carries the object_key
 *    (never a URL — the node presigns fresh read URLs on demand)
 */
export async function uploadMedia(request: MediaUploadRequest): Promise<MediaRecord> {
  const w = getV3Client();
  console.log('[social-media] uploadMedia — start, file:', request.file.name, request.file.type, request.file.size, 'service:', request.service);

  // Upload thumbnail/poster first if provided
  let thumbnailObjectKey: string | null = null;
  if (request.thumbnailFile) {
    const thumbRecord = await uploadMedia({ file: request.thumbnailFile, service: request.service });
    thumbnailObjectKey = thumbRecord.object_key || null;
  }

  // 1. Presigned POST form
  const presigned = await w.requestMediaUploadUrl({
    filename: request.file.name,
    mimeType: request.file.type || 'application/octet-stream',
    sizeBytes: request.file.size,
  });
  console.log('[social-media] uploadMedia — presigned form ok, object_key:', presigned.object_key);

  // 2. Upload the file to object storage
  const formData = new FormData();
  for (const [key, value] of Object.entries(presigned.fields || {})) {
    formData.append(key, value);
  }
  formData.append('file', request.file, request.file.name);
  const putRes = await fetch(presigned.upload_url, { method: 'POST', body: formData });
  console.log('[social-media] uploadMedia — object storage response status:', putRes.status);
  if (!putRes.ok) {
    throw new Error(`Media upload failed: ${putRes.status}`);
  }

  // 3. Confirm — store the reference, not a URL
  const metadata: Record<string, unknown> = {
    object_key: presigned.object_key,
    filename: request.file.name,
    mime_type: request.file.type || 'application/octet-stream',
    size_bytes: request.file.size,
    width: request.width ?? null,
    height: request.height ?? null,
    duration_seconds: request.durationSeconds ?? null,
    thumbnail_object_key: thumbnailObjectKey,
    alt_text: request.altText ?? null,
    service: request.service || 'media',
  };
  const doc = await w.confirmMediaUpload(metadata);
  console.log('[social-media] uploadMedia — confirmed, doc_id:', doc.doc_id);
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
 *
 * Refs arrive in two shapes:
 * - resolved objects — the API read path (resolve_media_urls) rewrites a
 *   post's media_refs to {doc_id, object_key, mime_type, filename,
 *   size_bytes, read_url} with a fresh presigned read_url. These map
 *   straight to MediaRecord (this is the ONLY cross-user media path —
 *   listMedia is owner-scoped).
 * - bare doc_id strings — avatar_ref/banner_ref and write-path reads.
 *   Resolved against the user's own media documents (doc_ids filter),
 *   then presigned fresh.
 */
export async function resolveMediaRefs(
  refs: (string | ResolvedMediaRef)[],
  _owner?: { username: string; provider: string },
  _service?: 'media' | 'public_media',
): Promise<MediaRecord[]> {
  if (!refs.length) return [];
  const w = getV3Client();

  const direct = refs
    .filter((r): r is ResolvedMediaRef => typeof r !== 'string')
    .map(fromResolvedMediaRef);

  const docIds = refs.filter((r): r is string => typeof r === 'string');
  let fromDocs: MediaRecord[] = [];
  if (docIds.length) {
    console.log('[social-media] resolveMediaRefs — resolving', docIds.length, 'doc_id ref(s):', JSON.stringify(docIds));
    const media = await w.listMedia({ limit: docIds.length, doc_ids: docIds });
    const refSet = new Set(docIds);
    fromDocs = media
      .filter((m) => m.doc_id && refSet.has(m.doc_id))
      .map(fromV3DocToMedia);
    // Fresh presigned URLs for the records that carry an object_key
    fromDocs = await refreshMediaUrls(fromDocs);
  }
  console.log('[social-media] resolveMediaRefs — resolved', direct.length, 'direct +', fromDocs.length, 'from docs');
  return [...direct, ...fromDocs];
}

/**
 * Refresh a single media record's URLs. A record that carries an
 * object_key gets a fresh presigned read URL (the document never stores
 * a live URL — stored URLs go stale); records without one (legacy) are
 * returned unchanged.
 */
export async function refreshMediaUrl(
  record: MediaRecord,
  _owner?: { username: string; provider: string },
  _service?: 'media' | 'public_media',
): Promise<MediaRecord> {
  if (!record.object_key) return record;
  const w = getV3Client();
  try {
    const { read_url } = await w.getMediaReadUrl(record.object_key);
    const refreshed: MediaRecord = { ...record, url: read_url };
    if (record.thumbnail_object_key) {
      const { read_url: thumbUrl } = await w.getMediaReadUrl(record.thumbnail_object_key);
      refreshed.thumbnail_url = thumbUrl;
    }
    return refreshed;
  } catch (e) {
    console.error('[social-media] refreshMediaUrl — presign failed for', record.object_key, e);
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
  return Promise.all(records.map((r) => refreshMediaUrl(r)));
}

// ── Backward compat aliases ──────────────────────────────────────────────────

/** @deprecated use readPostById */
export const readPost = readPostById;

/** @deprecated use readUserPosts */
export const readUserPublicPosts = readUserPosts;