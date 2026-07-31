import { getWapi, deriveObjectKey } from './wapi';
import { listFollowers } from './follows';
import { API_ORIGIN } from '../lib/origins';
import type { PostRecord, MediaRecord, MediaUploadRequest, PublicEntry, SchemaDefinition, DiscoverSort, DiscoveryPost, InboxRecord, Visibility } from './types';

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
 * Fan-out a public post to every follower's inbox + the author's own inbox.
 * Reads the follower list from the D34 public ledger (listFollowers), then
 * writes one inbox record per follower using the shape from
 * seed_personas.py:658 deliver_to_inbox. The inbox service whitelists
 * create for everyone, so this is permitted today.
 *
 * This is client-side O(followers) — the honest v0 at demo scale (D29).
 * Server-side fan-out is a later lane-A item.
 */
export async function fanOutToFollowers(postRecord: PostRecord): Promise<void> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token || !postRecord._id) return;

  const postBody: Record<string, unknown> = {
    text: postRecord.text,
    media_refs: postRecord.media_refs,
    created_at: postRecord.created_at,
    visibility: postRecord.visibility,
  };
  if (postRecord.tags?.length) postBody.tags = postRecord.tags;

  const inboxRecord = {
    author_username: token.username,
    author_provider: token.provider,
    post_id: postRecord._id,
    delivered_at: new Date().toISOString(),
    post_body: postBody,
    origin: 'web10',
  };

  // Write to own inbox first
  await wapi.create<InboxRecord>('inbox', inboxRecord);

  // Fan-out to every follower
  const followers = await listFollowers(token.username, token.provider);
  await Promise.allSettled(
    followers.map((follower) =>
      wapi.create<InboxRecord>('inbox', inboxRecord, follower.username, follower.provider),
    ),
  );
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
 * Read another user's public posts DIRECTLY from their `public_posts`
 * collection (anon-read is whitelisted by the canonical term).
 *
 * This is the profile-wall read path. It deliberately does NOT go through
 * the discovery index: admin board moderation (`/admin/discovery/remove`)
 * only hides a post from discover/trending/search — it must NOT rip the
 * post off the author's profile or out of friends' feeds (operator,
 * 31.07.2026: "if moderation takes something off the discover it still
 * stays on profile and feed of friends"). The friends feed was already
 * immune (inbox fan-out copies `post_body`); the wall was not — it read
 * via `readUserPostsFromDiscovery`, so a moderated post vanished from the
 * profile too.
 */
export async function readUserPublicPosts(username: string, provider: string): Promise<PostRecord[]> {
  const wapi = getWapi();
  return wapi.read<PostRecord>('public_posts', {}, username, provider);
}

/**
 * Read a specific user's posts from the discovery index via pagination.
 * The discovery API has no author filter, so we paginate through /discover/posts
 * with a large limit and filter client-side. Uses a higher limit (200, the
 * API max) to capture posts that fall outside a smaller window.
 */
export async function readUserPostsFromDiscovery(username: string, provider: string): Promise<PostRecord[]> {
  const posts: PostRecord[] = [];
  const limit = 200; // API max
  let skip = 0;

  while (true) {
    const resp = await fetch(
      `${API_ORIGIN}/discover/posts?sort=recent&limit=${limit}&skip=${skip}&services=public_posts`,
      { method: 'PATCH' },
    );
    if (!resp.ok) break;

    const allPosts: DiscoveryPost[] = await resp.json();
    if (!allPosts.length) break;

    const matched = allPosts.filter(
      (dp) => dp.author === username && dp.provider === provider,
    );
    for (const dp of matched) {
      const post: PostRecord = {
        _id: dp.post_id,
        text: dp.text,
        created_at: dp.created_at,
        tags: dp.tags,
      };
      if (dp.media_refs?.length) {
        post.media_refs = dp.media_refs;
      }
      posts.push(post);
    }

    // If we got fewer results than the limit, we've reached the end
    if (allPosts.length < limit) break;
    // If we found posts in this batch, continue paginating
    if (matched.length) {
      skip += limit;
    } else {
      // No matched posts in this batch - continue to next page
      skip += limit;
    }
  }

  return posts;
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
 * Delete a post by ID from its correct collection.
 *
 * D30: posts live in `public_posts` or `private_posts`, not the legacy
 * `posts` service. The caller must provide the post's visibility so we
 * delete from the right collection. The API's `_index_post_delete` hook
 * (crud.py:32) automatically removes the discovery-index doc for public
 * posts, so no separate un-index call is needed.
 */
export async function deletePost(id: string, visibility: Visibility): Promise<void> {
  const wapi = getWapi();
  const service = visibility === 'public' ? 'public_posts' : 'private_posts';
  await wapi.delete(service, { _id: id });
}

/**
 * Move a post between public_posts and private_posts (D30 collection move).
 * Creates the record in the target collection, deletes from the source.
 * Preserves the body; the _id changes (new record in target collection).
 *
 * This is the post-hoc visibility toggle — the published counterpart to
 * the staging moves in staging.ts.
 */
export async function movePostVisibility(post: PostRecord): Promise<PostRecord> {
  const wapi = getWapi();
  const sourceService = post.visibility === 'public' ? 'public_posts' : 'private_posts';
  const targetVisibility: Visibility = post.visibility === 'public' ? 'private' : 'public';
  const targetService = targetVisibility === 'public' ? 'public_posts' : 'private_posts';

  const { _id: _sourceId, ...body } = post;
  const targetRecord = { ...body, visibility: targetVisibility };
  // Must use the server-created record — it carries the new _id in the
  // target collection. Returning a local copy (without _id) caused the
  // caller's second toggle to delete the wrong _id, leaving a duplicate.
  const created = await wapi.create<PostRecord>(targetService, targetRecord);
  if (_sourceId) {
    await wapi.delete(sourceService, { _id: _sourceId });
  }
  return created;
}

// ── Media data layer ───────────────────────────────────────────────────────

/**
 * Upload a media file through the API's media router presigned URLs.
 * 1. Request presigned URL
 * 2. Upload file to object storage
 * 3. Confirm upload to create the media record
 * Returns the media record with the _id to reference in posts.
 *
 * D21: if width/height/durationSeconds/thumbnailFile/altText are provided,
 * they are sent to the confirm endpoint so the media record carries real
 * dimensions, a thumbnail URL (for video posters), and alt text.
 *
 * D35: the optional `service` on MediaUploadRequest targets the confirm
 * endpoint. Public-post attachments and avatar/banner use `public_media`
 * so non-owners can presign reads. DM/private-post media defaults to
 * `media` (owner-only, legacy fallback).
 */
export async function uploadMedia(request: MediaUploadRequest): Promise<MediaRecord> {
  const wapi = getWapi();

  // Upload the thumbnail/poster first (if provided) so we have its URL
  let thumbnailUrl: string | null = null;
  if (request.thumbnailFile) {
    const thumbRecord = await uploadMedia({ file: request.thumbnailFile, service: request.service });
    thumbnailUrl = thumbRecord.url;
  }

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
  return wapi.confirmUpload<MediaRecord>({
    url: `${uploadUrl}/${objectKey}`,
    filename: request.file.name,
    mimeType: contentType,
    sizeBytes: request.file.size,
    width: request.width ?? null,
    height: request.height ?? null,
    durationSeconds: request.durationSeconds ?? null,
    thumbnailUrl,
    altText: request.altText ?? null,
    service: request.service,
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
 *
 * D23: the stored `url` on a media record is the bare UNSIGNED object
 * URL — on a private bucket (the dev minio) every renderer that hands
 * `record.url` to an <img> 403s. So resolveMediaRefs now refreshes
 * each resolved record's `url` (and, when present, `thumbnail_url`) to
 * a fresh presigned GET via the api's `POST /media/{user}/read` (now
 * that it finally has callers). The wrapper's expiry-aware cache keeps
 * a feed's N-image re-render from becoming N round-trips. The owner
 * whose collection holds the `media` records defaults to the signed-in
 * user; pass an explicit `owner` to refresh media authored by someone
 * else (the feed's own posts resolve from the current user's media
 * collection — the cross-user avatar path is a separate concern).
 *
 * D35: the optional `service` parameter targets the correct collection.
 * For cross-user reads of public content, `public_media` must be used
 * so the presign endpoint checks the anon-readable terms instead of
 * the owner-only `media` terms. Defaults to `media` for backward
 * compatibility (owner reads, legacy records).
 */
export async function resolveMediaRefs(
  refs: string[],
  owner?: { username: string; provider: string },
  service?: 'media' | 'public_media',
): Promise<MediaRecord[]> {
  if (!refs.length) return [];
  const wapi = getWapi();
  const targetService = service || 'media';
  const records = await wapi.read<MediaRecord>(targetService, { _id: { $in: refs } });
  return refreshMediaUrls(records, owner, service);
}

/**
 * Replace each record's unsigned `url` (and `thumbnail_url`) with a
 * fresh presigned GET. Prefers `record.object_key` (the lane-A
 * confirm-upload touch) when present; legacy records derive the key
 * from the stored URL. Records whose URL can't be resolved to a key
 * (e.g. a non-S3 legacy url) are passed through unchanged so a bad
 * derivation never breaks a render worse than before.
 *
 * D35: the optional `service` parameter is passed through to
 * `getReadUrl` so presigns check the correct terms (`public_media`
 * for cross-user public content, `media` for owner reads).
 */
export async function refreshMediaUrls(
  records: MediaRecord[],
  owner?: { username: string; provider: string },
  service?: 'media' | 'public_media',
): Promise<MediaRecord[]> {
  if (!records.length) return records;
  const wapi = getWapi();
  const refreshed = await Promise.all(
    records.map(async (r) => {
      const objectKey = (r.object_key as string | undefined) || deriveObjectKey(r.url);
      if (!objectKey) return r;
      try {
        const { readUrl } = await wapi.getReadUrl(objectKey, owner?.username, owner?.provider, service);
        let thumbnail_url = r.thumbnail_url ? readUrl : r.thumbnail_url;
        if (r.thumbnail_url && r.thumbnail_url !== r.url) {
          const thumbKey = deriveObjectKey(r.thumbnail_url);
          if (thumbKey && thumbKey !== objectKey) {
            try {
              const { readUrl: thumbReadUrl } = await wapi.getReadUrl(thumbKey, owner?.username, owner?.provider, service);
              thumbnail_url = thumbReadUrl;
            } catch (thumbErr) {
              console.warn(
                `[refreshMediaUrls] thumbnail presign failed for key "${thumbKey}": ${thumbErr instanceof Error ? thumbErr.message : String(thumbErr)} — keeping stored thumbnail_url`,
              );
              thumbnail_url = r.thumbnail_url;
            }
          }
        }
        return { ...r, url: readUrl, thumbnail_url };
      } catch (err) {
        console.warn(
          `[refreshMediaUrls] presign failed for key "${objectKey}": ${err instanceof Error ? err.message : String(err)} — falling back to stored URL`,
        );
        return r;
      }
    }),
  );
  return refreshed;
}

/**
 * Convenience wrapper that refreshes a single media record's URLs.
 * Another agent will use this for post-upload paths.
 */
export async function refreshMediaUrl(
  record: MediaRecord,
  owner?: { username: string; provider: string },
  service?: 'media' | 'public_media',
): Promise<MediaRecord> {
  return (await refreshMediaUrls([record], owner, service))[0];
}
