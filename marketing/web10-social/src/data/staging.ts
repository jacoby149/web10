import { getWapi } from './wapi';
import type { PostRecord, Origin } from './types';

// ── Staging data layer ──────────────────────────────────────────────────────
// D19 Phase C: imports land in `staging_posts` (owner-only, awaiting triage).
// This module provides the operations for the Staging/Review screen:
//   - readStagingPosts: fetch all staged posts
//   - countStagingPosts: fetch count (for the Profile entry point)
//   - movePostToPublic: collection move (D30) — create in public_posts, delete from staging_posts
//   - movePostToPrivate: collection move (D30) — create in private_posts, delete from staging_posts
//   - deleteStagingPost: permanently remove from staging
//
// Collection moves are the ONLY way to change visibility (decisions.md D30).
// The body is preserved; the _id changes (new record in target collection).

const STAGING_SERVICE = 'staging_posts';
const PUBLIC_SERVICE = 'public_posts';
const PRIVATE_SERVICE = 'private_posts';

/**
 * Read all posts in staging (owner-only).
 */
export async function readStagingPosts(): Promise<PostRecord[]> {
  const wapi = getWapi();
  return wapi.read<PostRecord>(STAGING_SERVICE, {}, undefined, undefined);
}

/**
 * Count staged posts (for the Profile "Review imports (N)" entry point).
 */
export async function countStagingPosts(): Promise<number> {
  const posts = await readStagingPosts();
  return posts.length;
}

/**
 * Move a post from staging to public_posts (D30 collection move).
 * Creates the record in the target, then deletes from source.
 * Preserves the body; _id changes.
 */
export async function movePostToPublic(post: PostRecord): Promise<PostRecord> {
  const wapi = getWapi();
  const { _id: _sourceId, ...body } = post;
  const targetRecord = { ...body, visibility: 'public' as const };
  await wapi.create<PostRecord>(PUBLIC_SERVICE, targetRecord);
  if (_sourceId) {
    await wapi.delete(STAGING_SERVICE, { _id: _sourceId });
  }
  return targetRecord;
}

/**
 * Move a post from staging to private_posts (D30 collection move).
 */
export async function movePostToPrivate(post: PostRecord): Promise<PostRecord> {
  const wapi = getWapi();
  const { _id: _sourceId, ...body } = post;
  const targetRecord = { ...body, visibility: 'private' as const };
  await wapi.create<PostRecord>(PRIVATE_SERVICE, targetRecord);
  if (_sourceId) {
    await wapi.delete(STAGING_SERVICE, { _id: _sourceId });
  }
  return targetRecord;
}

/**
 * Permanently delete a staging post.
 */
export async function deleteStagingPost(postId: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete(STAGING_SERVICE, { _id: postId });
}

/**
 * Bulk move: triage multiple staging posts to a target collection.
 */
export async function bulkMovePosts(
  posts: PostRecord[],
  target: 'public' | 'private',
): Promise<PostRecord[]> {
  const wapi = getWapi();
  const targetService = target === 'public' ? PUBLIC_SERVICE : PRIVATE_SERVICE;
  const results: PostRecord[] = [];

  for (const post of posts) {
    const { _id: _sourceId, ...body } = post;
    const targetRecord = { ...body, visibility: target };
    await wapi.create<PostRecord>(targetService, targetRecord);
    if (_sourceId) {
      await wapi.delete(STAGING_SERVICE, { _id: _sourceId });
    }
    results.push(targetRecord);
  }

  return results;
}

/**
 * Bulk delete multiple staging posts.
 */
export async function bulkDeleteStagingPosts(postIds: string[]): Promise<void> {
  const wapi = getWapi();
  for (const id of postIds) {
    await wapi.delete(STAGING_SERVICE, { _id: id });
  }
}

/**
 * Group staging posts by origin for display.
 */
export function groupByOrigin(posts: PostRecord[]): Map<Origin | 'native', PostRecord[]> {
  const groups = new Map<Origin | 'native', PostRecord[]>();
  for (const post of posts) {
    const origin = post.origin || 'native';
    if (!groups.has(origin)) {
      groups.set(origin, []);
    }
    groups.get(origin)!.push(post);
  }
  return groups;
}