import { getV3Client } from './v3';
import type { V3FeedResult, PowerMeanSort } from './v3';
import { getDiscoverGroupId, getMyGroups, getFeedGroups } from './groups';
import { fromV3DocToPost, fromV3DocToProfile, fromV3FeedPost, extractUsername, mediaRefId, type PostRecord, type ResolvedMediaRef } from './types';
import { resolveMediaRefs } from './posts';
import type { MediaRecord } from './types';
import { knobStateToSort } from '@/lib/powerMean';

// ── Feed / Discover data layer (v3) ──────────────────────────────────────────
// v3 feed: read from groups, not inbox. Discover: read from discover group.

// ── Discover feed ────────────────────────────────────────────────────────────

/**
 * Read the discovery feed from the discover group.
 *
 * `sort` (the D36 power-mean config, server-side): when present, the node
 * scores every readable post and returns pre-sorted results — a knob twist
 * is a re-read, not a client-side shuffle of the same 50.
 *
 * `tags` (the generic server-side tag filter, `has(tags, …)`): when present,
 * the node returns only docs carrying every given tag. A platform primitive —
 * the Shorts feed passes `["short"]` so the read pulls only shorts (shorts.md
 * v1.5). The render-time 9:16 gate stays the backstop that drops fakes.
 */
export async function readDiscoverFeed(
  sort: PowerMeanSort | null = null,
  limit = 50,
  tags?: string[],
): Promise<PostRecord[]> {
  const w = getV3Client();
  try {
    const docs = await w.read('posts', {
      groups: [getDiscoverGroupId()],
      limit,
      ...(sort ? { sort } : {}),
      ...(tags ? { tags } : {}),
    });
    const posts = docs.map(fromV3DocToPost);
    // Without a server sort, keep the chronological default (newest first).
    // With a server sort the node already returned pre-sorted results —
    // re-sorting client-side would clobber the ranking.
    if (!sort) {
      posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return posts;
  } catch {
    return [];
  }
}

// ── Shorts feed (shorts.md) ──────────────────────────────────────────────────

/** A short: a discover post whose single media is a real 9:16 video. */
export interface ShortPost {
  post: PostRecord;
  /** The one resolved media record (the vertical video). */
  media: MediaRecord;
}

/**
 * Read the Shorts feed: the discover board filtered to genuine shorts.
 *
 * A short is a post with exactly one media that is a **real 9:16 video** —
 * `mime_type` starts with `video/` AND `width < height`. This is the
 * render-time gate (shorts.md): the `short` tag is client-asserted and can be
 * faked by a direct API caller, so the feed re-derives 9:16 from the resolved
 * media rather than trusting the tag. A post tagged `short` whose media is an
 * image, or a lying ratio, simply does not render as a short.
 *
 * The read is two-layered (shorts.md, defense in depth):
 *   1. **Server-side** — `readDiscoverFeed(…, ["short"])` sends the generic
 *      tag filter (`has(tags, 'short')`), so the node pulls only tagged shorts
 *      instead of the whole board (the v1.5 follow-up — cheap + indexable).
 *   2. **Render-time** — the 9:16 re-derive below (the backstop that drops
 *      fakes: a doc tagged `short` whose media isn't a real vertical video).
 */
export async function readShortsFeed(limit = 50): Promise<ShortPost[]> {
  const posts = await readDiscoverFeed(null, limit, ['short']);
  const withMedia = posts.filter((p) => p.media_refs?.length);
  if (!withMedia.length) return [];

  const token = getV3Client().readToken();
  const byAuthor = new Map<string, { posts: PostRecord[]; refs: (string | ResolvedMediaRef)[] }>();
  for (const p of withMedia) {
    const key = `${p.author_username}@${p.author_provider}`;
    const entry = byAuthor.get(key);
    if (entry) {
      entry.posts.push(p);
      entry.refs.push(...(p.media_refs || []));
    } else {
      byAuthor.set(key, { posts: [p], refs: [...(p.media_refs || [])] });
    }
  }

  const mediaByPost: Record<string, MediaRecord[]> = {};
  for (const [key, entry] of byAuthor) {
    const [username, provider] = key.split('@');
    const isOwn = token && username === token.username && provider === token.provider;
    const seen = new Set<string>();
    const uniqueRefs = entry.refs.filter((r) => {
      const id = mediaRefId(r);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (!uniqueRefs.length) continue;
    try {
      const media = await resolveMediaRefs(uniqueRefs, { username, provider }, isOwn ? 'media' : 'public_media');
      for (const p of entry.posts) {
        const refIds = new Set((p.media_refs || []).map(mediaRefId));
        mediaByPost[p._id || ''] = media.filter((m) => m._id && refIds.has(m._id));
      }
    } catch {
      // Media resolution failed for this author — degrade (no shorts from them).
    }
  }

  const shorts: ShortPost[] = [];
  for (const p of withMedia) {
    // The render-time gate (shorts.md): a real 9:16 video, re-derived from the
    // resolved media — not trusted from the client-asserted `short` tag.
    const vertical = (mediaByPost[p._id || ''] || []).filter(
      (m) => m.mime_type?.startsWith('video/') && m.width && m.height && m.width < m.height,
    );
    if (vertical.length === 1 && (p.media_refs?.length ?? 0) === 1) {
      shorts.push({ post: p, media: vertical[0] });
    }
  }
  return shorts;
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
  // Suggested users are authors of posts on THIS node's discover group, so they
  // share the current user's provider (the node identity, e.g. api.web10.app).
  // The profile route uses this to derive the followers group_id for follow —
  // a wrong provider here 404s the follow (the group is looked up by
  // {provider}/groups/users/{username}/followers).
  const provider = w.readToken()?.provider || '';
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
        provider,
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
  const feedGroups = await getFeedGroups();
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

// ── Feed page (D69) — the single-round-trip, cursor-paged read ──────────────

export interface FeedPage {
  posts: PostRecord[];
  has_more: boolean;
  next_cursor: { created_at?: string; score?: number } | null;
}

/**
 * Read one page of the feed (D69) — the single round-trip that replaces the
 * N+1 fan-out. One `w.feed(...)` call returns posts with resolved media + HLS,
 * the pinned + node ad joins, exact likes/comments, and the author's profile +
 * avatar_url, plus the `has_more` / `next_cursor` pagination state.
 *
 * `knobState` is the feed's ranking knobs (the D36 rack). The Newest preset
 * (no likes/comments weight) → chronological (the cursor rides on created_at);
 * a tuned preset → ranked in SQL (the cursor rides on the score).
 * `cursor` is the previous page's `next_cursor` (omit for page one).
 */
export async function readFeedPage(opts: {
  limit?: number;
  cursor?: { created_at?: string; score?: number } | null;
  knobState?: import('@/lib/powerMean').KnobState;
}): Promise<FeedPage> {
  const w = getV3Client();
  const feedGroups = await getFeedGroups();
  console.log('[social-feed] readFeedPage — feed groups:', feedGroups.length, 'cursor:', JSON.stringify(opts.cursor ?? null));

  if (!feedGroups.length) {
    console.log('[social-feed] readFeedPage — no feed groups yet, returning empty page');
    return { posts: [], has_more: false, next_cursor: null };
  }

  const sort = opts.knobState ? knobStateToSort(opts.knobState) : null;
  const result: V3FeedResult = await w.feed({
    groups: feedGroups,
    limit: opts.limit ?? 20,
    cursor: opts.cursor ?? null,
    sort: sort ?? undefined,
  });
  const posts = result.posts.map(fromV3FeedPost);
  console.log('[social-feed] readFeedPage — got', posts.length, 'posts, has_more:', result.has_more);
  return { posts, has_more: result.has_more, next_cursor: result.next_cursor };
}

/**
 * Engagement counts for the feed's posts (the ref pattern — the same one
 * DiscoverScreen runs). The server-side count shape: `readRefCounts` runs
 * `GROUP BY ref_value` through the safe-query engine for the feed's groups —
 * exact, no cap. Replaces the old "read a capped sample, count client-side"
 * (which undercounted past the cap). Returns per-doc_id counts; a missing post
 * is simply absent (the caller treats absent as 0).
 */
export async function readFeedEngagement(
  feedGroups: string[],
  postIds: string[],
): Promise<{ likes: Record<string, number>; comments: Record<string, number> }> {
  const w = getV3Client();
  console.log('[social-feed] readFeedEngagement — server-side count for', postIds.length, 'posts over', feedGroups.length, 'groups');
  if (!postIds.length) return { likes: {}, comments: {} };
  const [likes, comments] = await Promise.all([
    w.readRefCounts('reactions', { groups: feedGroups, ref: postIds }),
    w.readRefCounts('comments', { groups: feedGroups, ref: postIds }),
  ]);
  console.log(
    '[social-feed] readFeedEngagement — counted',
    Object.values(likes).reduce((a, b) => a + b, 0), 'reactions +',
    Object.values(comments).reduce((a, b) => a + b, 0), 'comments',
  );
  return { likes, comments };
}

/**
 * Read the READER'S OWN reactions on a set of feed posts — the initial-state
 * load the feed's like/dislike maps need. The feed payload (D69) carries the
 * like COUNT (`likes`) but not whether the *reader* liked the post, so on a
 * cold load every heart rendered empty even on a post the reader had already
 * liked — and the next tap created a second doc (the "liked it, it shows 2,
 * refresh shows 0" bug). This closes that gap: one batched ref read over the
 * feed's groups (the same groups the feed's posts come from), filtered to the
 * reader's own docs.
 *
 * v3 ownership is by username alone: a reaction's author_key is the bare
 * username (the node's provider is implicit), so `author_provider` is the v2
 * fallback ('web10') and never equals the token's real provider — matching it
 * made "mine" unfindable (the 28-likes bug, 3.87.2). We match username only.
 *
 * A failure degrades to empty maps (the feed's 3.25.x pattern: one bad read
 * degrades to zero, never the whole view) — the hearts just stay unfilled
 * rather than the feed failing to load.
 */
export async function readFeedReactions(
  postIds: string[],
): Promise<{ liked: Record<string, boolean>; disliked: Record<string, boolean> }> {
  const empty = { liked: {}, disliked: {} };
  if (!postIds.length) return empty;
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return empty;
  // The reactions live in the same followers groups the feed's posts come
  // from (the feed is followers-minus-discover) — read over those groups.
  const groups = await getFeedGroups();
  if (!groups.length) return empty;
  try {
    // The batched ref read (the engagement-count shape): one request returns
    // every reaction whose ref_value is one of the feed's posts. The reader is
    // a member of every feed group (followers groups), so the read sees their
    // own reactions on each post.
    const docs = await w.read('reactions', { groups, ref: postIds });
    const liked: Record<string, boolean> = {};
    const disliked: Record<string, boolean> = {};
    for (const doc of docs) {
      // v3 ownership — username alone (see above).
      if (extractUsername(doc.author_key) !== token.username) continue;
      const type = ((doc.body as Record<string, unknown>).type as string) || 'like';
      const ref = doc.ref_value;
      if (!ref) continue;
      if (type === 'like') liked[ref] = true;
      else if (type === 'dislike') disliked[ref] = true;
    }
    console.log(
      '[social-feed] readFeedReactions —',
      Object.keys(liked).length, 'liked +',
      Object.keys(disliked).length, 'disliked of', postIds.length, 'posts',
    );
    return { liked, disliked };
  } catch (e) {
    console.error('[social-feed] readFeedReactions — failed, degrading to empty:', e);
    return empty;
  }
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