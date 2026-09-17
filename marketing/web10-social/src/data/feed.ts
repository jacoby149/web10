import { getV3Client } from './v3';
import type { PowerMeanSort } from './v3';
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

// ── Feed page (D73) — the feed as a query over the flexible-read engine ──────
//
// The feed is no longer a bespoke node endpoint: it is a query the app writes
// over the query engine (`w.query`), with the engine's prepare pass minting the
// result rows (media + HLS + ads + the author's face). The node hardcodes
// nothing — the app's query names the `profile` service (the app knows its own
// face). Same output as the retired `POST /v3/feed` (query-engine.md, D73).

export interface FeedPage {
  posts: PostRecord[];
  has_more: boolean;
  next_cursor: { created_at?: string; score?: number } | null;
}

type FeedRanking = { recency: number; likes: number; comments: number; half_life_ms: number; character: number };

/**
 * The power-mean score as a ClickHouse SQL expression — mirrors the node's
 * `_power_mean_score_sql` exactly (the same saturating normalizers, epsilon
 * floor, p=0 geometric mean, recency-only reverse-chron shortcut) so the query
 * ranks identically to the old `/v3/feed`. The values are inlined (the engine
 * runs raw SQL, no named params). `createdMs` / `reactions` / `comments` are
 * SQL expressions for the post's created_at, reaction count, comment count.
 */
function powerMeanScoreSql(createdMs: string, reactions: string, comments: string, sort: FeedRanking): string {
  const wr = sort.recency;
  const wl = sort.likes;
  const wc = sort.comments;
  const p = sort.character;
  const hl = sort.half_life_ms;
  const age = `greatest(0, toUnixTimestamp64Milli(now64(3)) - toUnixTimestamp64Milli(${createdMs}))`;
  // Recency-only shortcut: the "Newest" preset → pure reverse-chron.
  if (wr > 0 && wl <= 0 && wc <= 0) return `-(${age})`;
  // No weighted signal at all → score 0 (the caller falls back to chronological).
  if (wr <= 0 && wl <= 0 && wc <= 0) return '0';
  const eps = 1e-12;
  const r = `least(1, greatest(${eps}, if(${hl} <= 0, 1, exp(-(${age}) / ${hl}))))`;
  const likesN = `least(1, greatest(${eps}, ln(1 + (${reactions})) / (1 + ln(1 + (${reactions})))))`;
  const c = `least(1, greatest(${eps}, 0.5 * ln(1 + (${comments})) / (1 + 0.5 * ln(1 + (${comments})))))`;
  const tw = `(if(${wr} > 0, ${wr}, 0) + if(${wl} > 0, ${wl}, 0) + if(${wc} > 0, ${wc}, 0))`;
  if (Math.abs(p) < 1e-9) {
    const num = `(if(${wr} > 0, ${wr} * ln(${r}), 0) + if(${wl} > 0, ${wl} * ln(${likesN}), 0) + if(${wc} > 0, ${wc} * ln(${c}), 0))`;
    return `exp(${num} / ${tw})`;
  }
  const num = `(if(${wr} > 0, ${wr} * pow(${r}, ${p}), 0) + if(${wl} > 0, ${wl} * pow(${likesN}, ${p}), 0) + if(${wc} > 0, ${wc} * pow(${c}, ${p}), 0))`;
  return `pow(${num} / ${tw}, 1 / ${p})`;
}

/**
 * The feed query (D73): a page of posts, ranked in SQL, keyset-cursor paged,
 * with exact reaction + comment counts and the author's profile body. The
 * engine wraps `posts` / `reactions` / `comments` / `profile` in boundary CTEs
 * (the group filter + block/sharing/hidden) — the same visibility as the old
 * board base. `sort` is null for the Newest preset (chronological, cursor on
 * created_at); a tuned sort ranks in SQL (cursor on the score).
 */
function buildFeedQuery(sort: FeedRanking | null, cursor: { created_at?: string; score?: number } | null, limit: number): string {
  const s: FeedRanking = sort ?? { recency: 0, likes: 0, comments: 0, half_life_ms: 0, character: -1 };
  const score = powerMeanScoreSql('p.created_at', 'coalesce(eng.reaction_count, 0)', 'coalesce(cmt.comment_count, 0)', s);
  // Newest (all-zero, or recency-only) → the cursor rides on created_at; a
  // tuned sort → the cursor rides on the score.
  const newest = (s.recency <= 0 && s.likes <= 0 && s.comments <= 0) || (s.recency > 0 && s.likes <= 0 && s.comments <= 0);
  let cursorClause = '';
  if (newest) {
    if (cursor?.created_at) cursorClause = `WHERE toUnixTimestamp64Milli(p.created_at) < toUnixTimestamp64Milli('${cursor.created_at}') `;
  } else if (cursor?.score != null) {
    cursorClause = `WHERE (${score}) < ${cursor.score} `;
  }
  const orderBy = newest ? 'toUnixTimestamp64Milli(p.created_at) DESC' : `${score} DESC`;
  // Every selected column carries an explicit alias. ClickHouse names a
  // result column after the qualified expression (`p.body`) whenever another
  // joined table in scope exposes a same-named column (the `eng`/`cmt`
  // subqueries expose `ref_value`, the `pr` subquery exposes `author_key` +
  // `body`) — the row keys would arrive as `p.body` and the prepare pass +
  // the client (which duck-type on `body` / `author_key`) would silently see
  // nothing. An explicit `AS body` pins the name regardless of scope.
  return (
    'SELECT p.doc_id AS doc_id, p.author_key AS author_key, p.body AS body, p.tags AS tags, ' +
    'p.created_at AS created_at, p.ref_value AS ref_value, p.ad_mode AS ad_mode, p.ad_target AS ad_target, ' +
    'coalesce(eng.like_count, 0) AS likes, coalesce(eng.dislike_count, 0) AS dislikes, coalesce(cmt.comment_count, 0) AS comments, ' +
    `(${score}) AS score, pr.body AS profile_body ` +
    'FROM posts p ' +
    "LEFT JOIN (SELECT ref_value, countIf(JSONExtractString(body, 'type') = 'like') AS like_count, " +
    "countIf(JSONExtractString(body, 'type') = 'dislike') AS dislike_count FROM reactions WHERE ref_value != '' GROUP BY ref_value) eng ON eng.ref_value = p.doc_id " +
    "LEFT JOIN (SELECT ref_value, count() AS comment_count FROM comments WHERE ref_value != '' GROUP BY ref_value) cmt ON cmt.ref_value = p.doc_id " +
    'LEFT JOIN (SELECT author_key, body FROM profile QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY updated_at DESC) = 1) pr ON pr.author_key = p.author_key ' +
    cursorClause +
    'ORDER BY ' + orderBy + ' ' +
    `LIMIT ${limit + 1}`
  );
}

/**
 * Map a prepared feed-query row to a PostRecord. The row carries the post doc
 * (doc_id/author_key/body/tags/created_at/ref_value/ad_mode/ad_target — `body`
 * parsed, media resolved + ads attached by the prepare pass), the computed
 * `likes`/`comments`/`score`, the author's `profile_body` (a JSON string — an
 * aliased body column the row serializer doesn't parse), and `avatar_url`
 * (minted by the prepare pass). Reuses `fromV3FeedPost` by shaping the row into
 * a V3FeedPost.
 */
function fromFeedQueryRow(row: Record<string, unknown>): PostRecord {
  const profileBody =
    typeof row.profile_body === 'string' && row.profile_body
      ? (JSON.parse(row.profile_body) as Record<string, unknown>)
      : (row.profile_body as Record<string, unknown> | undefined);
  const feedPost = {
    doc_id: row.doc_id,
    author_key: row.author_key,
    body: row.body,
    tags: row.tags,
    created_at: row.created_at,
    ref_value: row.ref_value,
    ad_mode: row.ad_mode,
    ad_target: row.ad_target,
    ad: row.ad,
    node_ad: row.node_ad,
    likes: row.likes,
    dislikes: row.dislikes,
    comments: row.comments,
    score: row.score,
    profile: profileBody,
    avatar_url: row.avatar_url,
  };
  return fromV3FeedPost(feedPost as unknown as import('./v3').V3FeedPost);
}

/**
 * Read one page of the feed (D73) — one `w.query()` over the flexible-read
 * engine, with the prepare pass minting the rows. Same output as the retired
 * `POST /v3/feed`: ranked posts with resolved media + HLS, the pinned + node ad
 * joins, exact likes/comments, the author's profile + avatar_url, plus the
 * `has_more` / `next_cursor` pagination state.
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
  const limit = opts.limit ?? 20;
  const sql = buildFeedQuery(sort, opts.cursor ?? null, limit);
  // The prepare pass (D73): mint media + HLS + ads + the author's face so the
  // query returns render-ready rows in one round-trip.
  const result = await w.query(sql, {
    groups: feedGroups,
    prepare: {
      media: true,
      ads: true,
      face: { bodyField: 'profile_body', mediaField: 'avatar_ref', authorColumn: 'author_key', urlField: 'avatar_url' },
    },
  });
  const posts = result.rows.map(fromFeedQueryRow);
  const has_more = posts.length > limit;
  const page = posts.slice(0, limit);
  // The next cursor rides on the last row: created_at (Newest) or score (tuned).
  let next_cursor: { created_at?: string; score?: number } | null = null;
  if (has_more && page.length) {
    const last = page[page.length - 1];
    next_cursor = sort ? { score: last.score ?? undefined } : { created_at: last.created_at };
  }
  console.log('[social-feed] readFeedPage — got', page.length, 'posts, has_more:', has_more);
  return { posts: page, has_more, next_cursor };
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
  // The reactions live in the discover group (the default reaction group —
  // createReaction writes there), NOT in the followers groups the feed's posts
  // come from. The feed is followers-minus-discover, but a reaction on a feed
  // post is attached to the discover group (the board), so the "did I like
  // this?" read must look at the discover group — otherwise a like made in the
  // feed is invisible on refresh (the "refresh my like is gone" bug). The
  // reader is a member of the discover group (auto-joined on signup), so the
  // read sees their own reactions there.
  const groups = [...(await getFeedGroups()), getDiscoverGroupId()];
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