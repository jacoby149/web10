import { getV3Client } from './v3';
import { followersGroupId, closeFriendsGroupId } from './groups';
import { fromV3DocToPost, type PostRecord } from './types';

// ── Staging data layer (v3) ──────────────────────────────────────────────────
// Staging posts are in the `staging_posts` collection. Import pipeline writes
// here, user reviews and moves to posts with visibility set.

/**
 * Read all posts in staging.
 */
export async function readStagingPosts(): Promise<PostRecord[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return [];

  try {
    const docs = await w.read('staging_posts', {
      groups: [followersGroupId(token.username, token.provider)],
    });
    return docs.map(fromV3DocToPost);
  } catch {
    return [];
  }
}

/**
 * Count staged posts.
 */
export async function countStagingPosts(): Promise<number> {
  const posts = await readStagingPosts();
  return posts.length;
}

/**
 * Move a post from staging to public.
 */
export async function movePostToPublic(post: PostRecord): Promise<PostRecord> {
  const w = getV3Client();
  const body: Record<string, unknown> = {
    text: post.text,
    media_refs: post.media_refs,
    visibility: 'public',
    tags: post.tags,
    origin: post.origin,
    origin_id: post.origin_id,
  };

  // Create in posts with discover + followers groups
  const token = w.readToken();
  const groups = [
    'web10.app/groups/web10/discover',
    followersGroupId(token?.username, token?.provider),
  ];
  const doc = await w.create('posts', body, { groups });

  // Delete from staging
  if (post._id) {
    await w.delete(post._id);
  }

  return fromV3DocToPost(doc);
}

/**
 * Move a post from staging to private.
 */
export async function movePostToPrivate(post: PostRecord): Promise<PostRecord> {
  const w = getV3Client();
  const body: Record<string, unknown> = {
    text: post.text,
    media_refs: post.media_refs,
    visibility: 'private',
    tags: post.tags,
    origin: post.origin,
    origin_id: post.origin_id,
  };

  const token = w.readToken();
  const groups = [closeFriendsGroupId(token?.username, token?.provider)];
  const doc = await w.create('posts', body, { groups });

  if (post._id) {
    await w.delete(post._id);
  }

  return fromV3DocToPost(doc);
}

/**
 * Permanently delete a staging post.
 */
export async function deleteStagingPost(postId: string): Promise<void> {
  const w = getV3Client();
  await w.delete(postId);
}

/**
 * Bulk move staging posts to a target collection.
 */
export async function bulkMovePosts(
  posts: PostRecord[],
  target: 'public' | 'private',
): Promise<PostRecord[]> {
  const results: PostRecord[] = [];
  for (const post of posts) {
    results.push(target === 'public' ? await movePostToPublic(post) : await movePostToPrivate(post));
  }
  return results;
}

/**
 * Bulk delete staging posts.
 */
export async function bulkDeleteStagingPosts(postIds: string[]): Promise<void> {
  const w = getV3Client();
  for (const id of postIds) {
    await w.delete(id);
  }
}

/**
 * Group staging posts by origin for display.
 */
export function groupByOrigin(posts: PostRecord[]): Map<string, PostRecord[]> {
  const groups = new Map<string, PostRecord[]>();
  for (const post of posts) {
    const origin = post.origin || 'native';
    if (!groups.has(origin)) {
      groups.set(origin, []);
    }
    groups.get(origin)!.push(post);
  }
  return groups;
}