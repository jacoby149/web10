import { getV3Client } from './v3';
import { getDiscoverGroupId, getMyGroups } from './groups';
import { fromV3DocToPost, fromV3DocToProfile, mediaRefId, type PostRecord, type DiscoverSort } from './types';

// ── Feed / Discover data layer (v3) ──────────────────────────────────────────
// v3 feed: read from groups, not inbox. Discover: read from discover group.

// ── Discover feed ────────────────────────────────────────────────────────────

/**
 * Read the discovery feed from the discover group.
 */
export async function readDiscoverFeed(
  sort: DiscoverSort = 'recent',
  limit = 50,
): Promise<PostRecord[]> {
  const w = getV3Client();
  try {
    const docs = await w.read('posts', {
      groups: [getDiscoverGroupId()],
      limit,
    });
    const posts = docs.map(fromV3DocToPost);
    // Sort: 'recent' = newest first, 'trending' = by engagement (client-side)
    if (sort === 'recent') {
      posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return posts;
  } catch {
    return [];
  }
}

// ── Suggested users ──────────────────────────────────────────────────────────

export interface SuggestedUser {
  username: string;
  provider: string;
  display_name?: string;
  bio?: string;
  avatar_ref?: string;
  followers_count?: number;
  posts_count?: number;
}

/**
 * Fetch suggested accounts — users in discover group who aren't followed yet.
 */
export async function fetchSuggestedUsers(limit = 20): Promise<SuggestedUser[]> {
  const w = getV3Client();
  try {
    const groups = await getMyGroups();
    const followedUsernames = new Set(
      groups
        .filter((g) => g.group_id.endsWith('/followers'))
        .map((g) => g.group_id.split('/').slice(-2, -1)[0]),
    );

    // Read posts from discover, collect unique authors
    const docs = await w.read('posts', {
      groups: [getDiscoverGroupId()],
      limit: limit * 3, // Oversample to find unique authors
    });

    const authorMap = new Map<string, { postIds: Set<string>; profile?: ReturnType<typeof fromV3DocToProfile> }>();
    for (const doc of docs) {
      const username = doc.author_key.split('/').pop() || '';
      if (followedUsernames.has(username) || authorMap.has(username)) continue;

      const entry = authorMap.get(username) || { postIds: new Set() };
      entry.postIds.add(doc.doc_id);
      authorMap.set(username, entry);
    }

    // Fetch profiles for suggested users
    const suggested: SuggestedUser[] = [];
    for (const [username, entry] of authorMap) {
      if (suggested.length >= limit) break;
      let profile = null;
      try {
        profile = await import('./profile').then((m) => m.readUserProfile(username));
      } catch {
        // Skip
      }

      suggested.push({
        username,
        provider: 'web10',
        display_name: profile?.display_name || username,
        bio: profile?.bio,
        avatar_ref: profile?.avatar_ref,
        followers_count: undefined,
        posts_count: entry.postIds.size,
      });
    }

    return suggested;
  } catch {
    return [];
  }
}

// ── Feed (group-based, not inbox) ────────────────────────────────────────────

import type { FeedSort } from './types';

/**
 * Read the feed — all groups except discover, sorted.
 */
export async function readFeed(sort: FeedSort = 'newest', limit = 50): Promise<PostRecord[]> {
  const w = getV3Client();
  const groups = await getMyGroups();
  const feedGroups = groups
    .filter((g) => g.group_id !== getDiscoverGroupId())
    .map((g) => g.group_id);
  console.log('[social-feed] readFeed — my groups:', JSON.stringify(groups.map((g) => g.group_id)));
  console.log('[social-feed] readFeed — feed groups (minus discover):', JSON.stringify(feedGroups));

  if (!feedGroups.length) {
    console.log('[social-feed] readFeed — no feed groups yet, returning []');
    return [];
  }

  const docs = await w.read('posts', {
    groups: feedGroups,
    limit,
  });
  console.log('[social-feed] readFeed — got', docs.length, 'docs from', feedGroups.length, 'groups');

  const posts = docs.map(fromV3DocToPost);
  const direction = sort === 'newest' ? -1 : 1;
  posts.sort((a, b) => (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction);
  console.log('[social-feed] readFeed — sorted', posts.length, 'posts by', sort);
  return posts;
}

// ── Backward compat for discovery types ──────────────────────────────────────

/** @deprecated use PostRecord for discover posts */
export interface DiscoveryPost {
  author: string;
  provider: string;
  post_id: string;
  text?: string;
  tags?: string[];
  media_refs?: string[];
  created_at: string;
  likes: number;
  comments: number;
  reposts: number;
  score?: number;
}

/** @deprecated map PostRecord to DiscoveryPost if needed */
export function postToDiscoveryPost(post: PostRecord): DiscoveryPost {
  return {
    author: '',
    provider: 'web10',
    post_id: post._id || '',
    text: post.text,
    tags: post.tags,
    media_refs: post.media_refs?.map(mediaRefId),
    created_at: post.created_at,
    likes: 0,
    comments: 0,
    reposts: 0,
  };
}

// ── Backward compat exports (v2 → v3 migration) ─────────────────────────────

/** @deprecated no-op, v3 doesn't use schema registry */
export async function registerDefaultSchemas(): Promise<unknown[]> {
  return [];
}

/** @deprecated no-op, v3 doesn't use schema cache */
export function clearSchemaCache(): void {}

/** @deprecated no-op, v3 doesn't use schema cache */
export function getCachedSchema(_name: string): unknown {
  return undefined;
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function createPublicEntry(_entry: unknown): Promise<unknown> {
  return {};
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function queryPublicEntries(_params: unknown): Promise<unknown[]> {
  return [];
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function deletePublicEntry(_entryId: string): Promise<void> {}

/** @deprecated no-op, v3 doesn't use inbox */
export async function markInboxRead(_id: string): Promise<void> {}

/** @deprecated no-op, v3 doesn't use inbox */
export async function countUnread(): Promise<number> {
  return 0;
}

/** @deprecated mapRawDiscoveryPost — v3 doesn't use raw discovery */
export function mapRawDiscoveryPost(_raw: unknown): DiscoveryPost {
  return {
    author: '',
    provider: 'web10',
    post_id: '',
    created_at: new Date().toISOString(),
    likes: 0,
    comments: 0,
    reposts: 0,
  };
}

/** @deprecated fetchDiscoveryPost — v3 uses readPostById */
export async function fetchDiscoveryPost(
  _username: string,
  _service: string,
  _postId: string,
): Promise<DiscoveryPost | null> {
  return null;
}