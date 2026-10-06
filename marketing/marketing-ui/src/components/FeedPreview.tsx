import { useState, useEffect, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Flame, Heart, MessageCircle, Repeat2, Share2, Image as ImageIcon, Film, Music2, Send, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SOCIAL_ORIGIN, API_ORIGIN, API_HOST } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';
import { getPublicMediaUrl, getPublicMediaThumbnailUrl, resolveMediaRef, clearMediaCache } from '@/lib/mediaPresign';
// D74: the shared discover card + video player (one source, both apps). The
// marketing /trending card is now the SAME card the social app's Discover uses
// — in `remote` mode (anon, click-through to web10 social).
import {
  DiscoverCard,
  type DiscoverPost,
  type MediaItem,
  type ReadComments,
  type TranscodingSettings,
} from '@web10/discover';

// Map a marketing FeedPost's resolved media refs to the shared package's
// MediaItem[] (the player's input). A transcoded video carries
// transcoding_settings.manifest_url → the card plays the H.264/AAC HLS instead
// of the raw source file (the greyed-out-tile fix).
function feedPostToMediaItems(mediaRefs?: (string | ResolvedMediaRef)[]): MediaItem[] {
  if (!mediaRefs) return [];
  return mediaRefs
    .filter((r): r is ResolvedMediaRef => typeof r === 'object' && !!r.read_url)
    .map((r) => ({
      _id: r.doc_id,
      url: r.read_url as string,
      object_key: r.object_key || undefined,
      mime_type: r.mime_type || undefined,
      size_bytes: r.size_bytes || undefined,
      thumbnail_url: r.thumbnail_url || undefined,
      // The source dims — the player reserves the natural ratio (a 9:16 clip is
      // a tall box, not a squashed 16:9) and the card caps a portrait frame.
      width: r.width || undefined,
      height: r.height || undefined,
      // The clip's length — the HomeCard's duration badge (parity with the
      // social app, which carries it through its own mapper).
      duration_seconds: r.duration_seconds || undefined,
      transcoding_settings: r.transcoding_settings || undefined,
    }));
}

function feedPostToDiscover(post: FeedPost): DiscoverPost {  const author = post.author || post.handle.replace(/^@/, '');
  return {
    id: post.id,
    author,
    author_username: author,
    display_name: post.name,
    title: post.title,
    text: post.content,
    tags: post.tags,
    created_at: post.createdAt,
    likes: post.likesCount,
    comments: post.commentsCount,
    reposts: post.repostsCount,
    score: post.engagementScore,
    media: feedPostToMediaItems(post.mediaRefs),
    repost_of: post.repostOf,
  };
}

// The marketing comment reader (the public board) — injected into the shared
// card's comment thread. Reads the `comments` service over the discover group
// as ANON (no token) through the v3 query engine — the same path the social
// app's comment read rides, minus the session. The query keys on
// `body.post_id` (not `ref_value`) so it returns the WHOLE flat conversation
// (top-level + replies — a reply's `ref_value` is its parent comment, but every
// comment carries `body.post_id`), so this is a single page (nextCursor null,
// no replyCounts) and the thread builds the tree by grouping on `parent_id`
// (the marketing mode, comments.md).
//
// The old reader hit `PATCH /public/entries` — the v2 public ledger, which the
// v3 node no longer exposes (no such route). The fetch 404'd, `resp.ok` was
// false, it returned `[]`, and every post's comment panel showed "No comments
// yet." regardless of the post's real comment count.
const marketingReadComments: ReadComments = async (postId) => {
  const safeId = postId.replace(/'/g, "''");
  const resp = await fetch(`${API_ORIGIN}/v3/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No token — anon reads the public board (the discover group), the same
    // rule as the board's posts read above.
    body: JSON.stringify({
      sql: `SELECT doc_id, author_key, body, created_at FROM comments WHERE JSONExtractString(body, 'post_id') = '${safeId}' ORDER BY created_at ASC LIMIT 200`,
      groups: [DISCOVER_GROUP],
    }),
  });
  if (!resp.ok) return { comments: [], nextCursor: null };
  const data: { rows?: V3CommentRow[] } = await resp.json();
  const rows = data.rows || [];
  return {
    comments: rows.map((r) => ({
      _id: r.doc_id,
      text: r.body?.text || '',
      author_username: r.body?.author_username || r.author_key.split('/').pop() || undefined,
      created_at: r.created_at,
      parent_id: r.body?.parent_id || undefined,
    })),
    nextCursor: null,
  };
};

// One comment row as the v3 query engine returns it (body parsed to an object).
interface V3CommentRow {
  doc_id: string;
  author_key: string;
  body: Record<string, any> | null;
  created_at: string;
}

// The repost-embed original reader (reposts.md) — injected into the shared
// card's `RepostEmbed`. Reads the original post by `repost_of` doc_id as ANON
// (no token) through the v3 read-by-id path (the node's read-by-id is
// `user_or_anon` and resolves media server-side — the same rule the post
// permalink's anon read relies on). Returns the original's author / text /
// media for the embed; `null` when the reader can't read it (I3 — the embed
// degrades to "unavailable"). A repost never grants access to the original
// beyond what the reader can already read.
const marketingReadRepostOriginal: import('@web10/discover').ReadRepostOriginal = async (repostOf) => {
  const safeId = repostOf.replace(/'/g, "''");
  const resp = await fetch(`${API_ORIGIN}/v3/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No token — anon reads the public post (the discover board's read-by-id).
    body: JSON.stringify({ doc_id: safeId, service: 'posts' }),
  });
  if (!resp.ok) return null;
  const doc: V3Doc | null = await resp.json();
  if (!doc || !doc.doc_id) return null;
  const mediaRefs: (string | ResolvedMediaRef)[] = doc.body?.media_refs || [];
  return {
    author_username: doc.author_key,
    display_name: (doc.body?.display_name as string) || undefined,
    text: doc.body?.text || undefined,
    created_at: doc.created_at,
    media: feedPostToMediaItems(mediaRefs),
  };
};

// A media ref as the v3 read path serves it: resolve_media_urls rewrites a
// post's media_refs from bare doc_id strings to resolved objects carrying a
// fresh presigned read_url + the metadata's mime_type (the ONLY cross-user
// media path — listMedia is owner-scoped).
// The node's transcoding state for a media doc (D44). The v3 read carries it
// into each resolved media ref (resolve_media_urls) and mints a fresh
// `manifest_url` bound to the reader (_mint_hls_manifest_urls). A transcoded
// video (status 'done' + manifest_url) plays through the node's H.264/AAC HLS
// — universally decodable. The raw source file (read_url) is the user's
// original camera upload, often HEVC/AV1, which mobile Chrome cannot decode
// (the greyed-out-tile bug). `TranscodingSettings` is the shared package's type
// (imported above) so the resolved ref maps cleanly onto MediaItem.

interface ResolvedMediaRef {
  doc_id?: string;
  object_key?: string | null;
  mime_type?: string | null;
  filename?: string | null;
  size_bytes?: number | null;
  read_url?: string | null;
  // The source dims (the v3 read carries width/height/duration_seconds) — the
  // player reserves the natural ratio + the card caps a portrait frame.
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  // The node mints a fresh presigned thumbnail URL alongside read_url on the
  // v3 read (resolve_media_urls: presigned[thumbnail_object_key]). Carried so
  // the card can render a real poster / reduced-motion image instead of
  // pointing an <img> at the MP4.
  thumbnail_url?: string | null;
  // The media doc's transcoding settings + the read-minted manifest_url.
  // Present (status 'done' + manifest_url) only for transcoded video.
  transcoding_settings?: TranscodingSettings | null;
}

interface DiscoveryPost {
  author: string;
  service: string;
  post_id: string;
  body_text: string;
  body_title?: string;
  tags: string[];
  created_at: string;
  engagement: {
    likes: number;
    comments: number;
    reposts: number;
  };
  engagement_score: number;
  // A17 media projection fields. media_refs arrive pre-resolved from the v3
  // read (objects with read_url + mime_type); bare strings are the legacy shape.
  media_refs?: (string | ResolvedMediaRef)[];
  has_media?: boolean;
  first_attachment_mime?: string;
  /** A repost (reposts.md): the doc_id of the post this one reposts. Absent on
      a normal post. The card renders the "reposted" badge + the embedded
      original (fetched via `readRepostOriginal`). */
  repost_of?: string;
}

interface FeedPost {
  id: string;
  name: string;
  handle: string;
  initial: string;
  avatarColor: string;
  time: string;
  content: string;
  title?: string;
  media?: 'image' | 'video' | 'music';
  mediaRefs?: (string | ResolvedMediaRef)[];
  firstAttachmentMime?: string;
  author?: string;
  likes: string;
  comments: string;
  reposts: string;
  engagementScore?: number;
  tags?: string[];
  // Raw numeric counts for client-side ranking (knobs)
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  createdAt: string;
  /** A repost (reposts.md): the doc_id of the post this one reposts. */
  repostOf?: string;
}

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500', 'bg-red-500',
];

function hashToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// The v3 read serializes datetimes as naive 'YYYY-MM-DD HH:MM:SS[.ffffff]'
// (str(datetime) of a UTC wall-clock). Browsers parse the space-separated
// form as LOCAL time, which shifts recent posts into the future for
// west-of-UTC clocks and renders a negative "time ago". Normalize the naive
// form to explicit UTC before parsing; ISO strings (T / Z / offset) parse as-is.
function parseCreatedAt(dateStr: string): number {
  if (!dateStr) return Date.now();
  const t = dateStr.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(t)) {
    return new Date(`${t}Z`).getTime();
  }
  const ms = new Date(dateStr).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = parseCreatedAt(dateStr);
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function parseCount(s: string): number {
  const num = parseFloat(s);
  if (isNaN(num)) return -1;
  if (s.includes('k')) return Math.round(num * 1000);
  return num;
}

function mapDiscoveryToFeedPost(d: DiscoveryPost): FeedPost {
  const name = d.author.replace(/[-_]/g, ' ');
  const tags = d.tags || [];
  // Prefer A17 media projection over tag-based detection.
  const mime = d.first_attachment_mime;
  const mediaType = mime
    ? mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'music' : undefined
    : tags.includes('video') ? 'video' : tags.includes('image') ? 'image' : tags.includes('music') ? 'music' : undefined;
  return {
    id: d.post_id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    handle: `@${d.author}`,
    initial: d.author.charAt(0).toUpperCase(),
    avatarColor: hashToColor(d.author),
    time: timeAgo(d.created_at),
    content: d.body_text || '',
    title: d.body_title || undefined,
    media: mediaType,
    mediaRefs: d.media_refs,
    firstAttachmentMime: mime,
    author: d.author,
    likes: formatCount(d.engagement.likes),
    comments: formatCount(d.engagement.comments),
    reposts: formatCount(d.engagement.reposts),
    engagementScore: d.engagement_score,
    tags,
    likesCount: d.engagement.likes ?? 0,
    commentsCount: d.engagement.comments ?? 0,
    repostsCount: d.engagement.reposts ?? 0,
    createdAt: d.created_at,
    repostOf: d.repost_of,
  };
}

interface TrendingCardProps {
  post: FeedPost;
  rank: number;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onRepost: (postId: string) => void;
  onShare?: (postId: string) => void;
  maxScore: number;
  featured?: boolean;
  readOnly?: boolean;
  className?: string;
  cardRef?: (el: HTMLElement | null) => void;
  /** The post's link-out target (the 1:1 destination mapping, the Discover
      split — e.g. Hot Gossip's `?post=` board link). Defaults to the post
      permalink on web10 social. */
  postHref?: string;
  /** The author's link-out target. Defaults to the profile on web10 social. */
  authorHref?: string;
}

// ── Inline comment panel (anon read, auth-gated compose) ────────────────────
// The comment read is `marketingReadComments` above (the v3 query engine over
// the discover group, anon). The old v2 public-ledger reader
// (`fetchComments` → `PATCH /public/entries`) is gone — the v3 node has no
// such route, so it 404'd and every panel showed "No comments yet."

function TrendingCard({
  post,
  rank,
  onLike: _onLike,
  onComment: _onComment,
  onRepost: _onRepost,
  onShare: _onShare,
  maxScore,
  featured: _featured = false,
  readOnly: _readOnly = false,
  className,
  cardRef,
  postHref,
  authorHref,
}: TrendingCardProps) {
  // D74: the marketing /trending card is now the SHARED discover card (the same
  // one the social app's Discover uses), in `remote` mode — anon, so the like
  // is display-only and the comment compose is a link-out to web10 social.
  const author = post.author || post.handle.replace(/^@/, '');
  const resolvedPostHref = postHref
    || (author
      ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(author)}/p/${encodeURIComponent(post.id)}`
      : SOCIAL_ORIGIN);
  const resolvedAuthorHref = authorHref
    || (author
      ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(author)}`
      : SOCIAL_ORIGIN);
  return (
    <DiscoverCard
      post={feedPostToDiscover(post)}
      rank={rank}
      maxScore={maxScore}
      remote
      postHref={resolvedPostHref}
      authorHref={resolvedAuthorHref}
      readComments={marketingReadComments}
      readRepostOriginal={marketingReadRepostOriginal}
      id={`trending-card-${post.id}`}
      className={className}
      testId="trending-card"
      // The trending board is a card wall — a full-width 9:16 box (~1.78× the
      // card tall) dwarfs the card and buries the video's control rack at its
      // bottom. Cap the portrait frame's height (the feed's 60vh cap) so the
      // clip + the rack stay in view, centered in a black letterbox. The social
      // app's single-column Discover leaves this unset (full-bleed, unchanged).
      mediaMaxHeight="60vh"
    />
  );
}

function TrendingSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <Card
      data-testid="trending-skeleton"
      className={['bg-surface', ''].join(' ')}
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="px-4 pt-3 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="flex items-center px-4 py-1.5">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="ml-2 h-4 w-12" />
        <Skeleton className="ml-2 h-4 w-12" />
      </div>
    </Card>
  );
}

// The node-default universal public board (matches the API's DISCOVER_GROUP_ID
// and the social app's getDiscoverGroupId()). Provider-derived — the marketing
// site reads it as anon (no token), so the provider is the node's API host.
// In v3 discovery IS a group read — the board is just this group, read anon
// through the normal /v3/read path.
const DISCOVER_GROUP = `${API_HOST}/groups/web10/discover`;

interface V3Doc {
  doc_id: string;
  author_key: string;
  body: Record<string, any>;
  tags: string[];
  created_at: string;
  ref_value: string;
  service: string;
}

async function readGroup(service: string, limit: number): Promise<V3Doc[]> {
  const resp = await fetch(`${API_ORIGIN}/v3/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No token — anon reads the public board (the discover group).
    body: JSON.stringify({ service, groups: [DISCOVER_GROUP], limit }),
  });
  if (!resp.ok) return [];
  return resp.json();
}

/**
 * Ad docs (tagged `ad` — creator or `node_ad`) live ON the discover group
 * (that's where `get_active_node_ads` finds node ads), but they are ad
 * INVENTORY, not board content: they show only when ATTACHED to a post via
 * the read-time join (`doc.ad` / `doc.node_ad`), never as standalone ranked
 * posts. The social app's discover read drops them the same way
 * (`dropAdPosts`, web10-social `data/feed.ts`) — the marketing board read
 * must too, or node ads leak in as plain ranked posts (the 25.09.2026
 * operator screenshot: `#ad #node_ad` docs ranked #1/#2 on /trending).
 */
function dropAdDocs(docs: V3Doc[]): V3Doc[] {
  return docs.filter((d) => !(d.tags || []).includes('ad'));
}

// The engagement-count shape: {ref_value: count} for these posts. The server
// runs GROUP BY ref_value through the safe-query engine (exact, no cap) —
// replaces "read a capped sample, count client-side" (which undercounted past
// the cap). Anon (no token) — the public board's engagement.
async function readGroupRefCounts(service: string, ref: string[]): Promise<Record<string, number>> {
  if (!ref.length) return {};
  const resp = await fetch(`${API_ORIGIN}/v3/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, groups: [DISCOVER_GROUP], ref, count: true }),
  });
  if (!resp.ok) return {};
  return resp.json();
}

// The repost count (reposts.md: a repost is a POST, not a reaction). A repost
// is a `posts` doc whose `body.repost_of` points at the original, so the count
// is the number of such posts the reader can read (I3: scoped to the discover
// group, anon-capable — the public board's repost tally). `count(DISTINCT
// doc_id)` — a post attached to N readable groups surfaces N rows in the
// boundary CTE; one reposter is one repost, not N. Anon (no token).
async function readGroupRepostCounts(postIds: string[]): Promise<Record<string, number>> {
  if (!postIds.length) return {};
  const quoted = postIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  const resp = await fetch(`${API_ORIGIN}/v3/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `SELECT JSONExtractString(body, 'repost_of') AS repost_of, count(DISTINCT doc_id) AS n FROM posts WHERE JSONExtractString(body, 'repost_of') IN (${quoted}) GROUP BY JSONExtractString(body, 'repost_of')`,
      groups: [DISCOVER_GROUP],
    }),
  });
  if (!resp.ok) return {};
  const data: { rows?: { repost_of: string; n: number }[] } = await resp.json();
  const counts: Record<string, number> = {};
  for (const row of data.rows || []) {
    if (row.repost_of) counts[row.repost_of] = Number(row.n) || 0;
  }
  return counts;
}

// One board doc → the DiscoveryPost shape. `likesByPost` / `commentsByPost`
// are the server-side engagement counts ({} for a search — the page's knob
// pipeline re-scores on the raw post signals, not the board's tally).
function mapV3DocToDiscovery(
  p: V3Doc,
  likesByPost: Record<string, number>,
  commentsByPost: Record<string, number>,
  repostsByPost: Record<string, number> = {},
): DiscoveryPost {
  // The v3 read serves media_refs pre-resolved (objects with mime_type +
  // read_url). Derive the first attachment's mime from the first resolved
  // ref so media detection (video/image/music) works without relying on tags.
  const mediaRefs: (string | ResolvedMediaRef)[] = p.body?.media_refs || [];
  const first = mediaRefs[0];
  const firstAttachmentMime =
    first && typeof first === 'object' ? first.mime_type || undefined : undefined;
  return {
    author: p.author_key,
    service: p.service,
    post_id: p.doc_id,
    body_text: p.body?.text || '',
    body_title: p.body?.title || undefined,
    tags: p.tags || [],
    created_at: p.created_at,
    engagement: {
      likes: likesByPost[p.doc_id] || 0,
      comments: commentsByPost[p.doc_id] || 0,
      reposts: repostsByPost[p.doc_id] || 0,
    },
    engagement_score:
      (likesByPost[p.doc_id] || 0) + (commentsByPost[p.doc_id] || 0) + (repostsByPost[p.doc_id] || 0),
    media_refs: mediaRefs,
    has_media: mediaRefs.length > 0,
    first_attachment_mime: firstAttachmentMime,
    // A repost (reposts.md): the doc_id of the post this one reposts. The
    // board read carries it in the body; the card renders the "reposted" badge
    // + the embedded original (fetched via readRepostOriginal).
    repost_of: (p.body?.repost_of as string) || undefined,
  };
}

async function fetchDiscoverFeed(sort: 'recent' | 'trending', limit = 6): Promise<DiscoveryPost[]> {
  // v3: the public board is the node-default discover group. Read it through
  // the normal group-read path as anon (no token). Engagement is the
  // server-side count shape (GROUP BY ref_value through the engine) for the
  // board's posts — exact, no cap.
  const posts = dropAdDocs(await readGroup('posts', 200));
  const postIds = posts.map((p) => p.doc_id);
  const [likesByPost, commentsByPost, repostsByPost] = await Promise.all([
    readGroupRefCounts('reactions', postIds),
    readGroupRefCounts('comments', postIds),
    readGroupRepostCounts(postIds),
  ]);

  const mapped: DiscoveryPost[] = posts.map((p) => mapV3DocToDiscovery(p, likesByPost, commentsByPost, repostsByPost));
  console.log(
    '[trending] discover feed —', posts.length, 'posts;',
    mapped.filter(p => p.has_media).length, 'with media;',
    mapped.filter(p => p.first_attachment_mime).length, 'with resolved mime',
  );

  if (sort === 'trending') {
    mapped.sort((a, b) => b.engagement_score - a.engagement_score || b.created_at.localeCompare(a.created_at));
  } else {
    mapped.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return mapped.slice(0, limit);
}

// The marketing search (the social app's `searchPosts` shape, mirrored): read
// the discover board's pool and filter client-side. The node has no
// multi-entity search endpoint (the documented v1 floor — global-search.md);
// the old `PATCH /discover/search` call was a phantom (the route never
// existed — every search 404'd into "Search unavailable"). The pool is the
// same 200-post board read the feed uses; the filter matches text, author,
// or tag (a `#tag` query matches tags only — the topic-chip hand-off).
async function searchDiscoverPosts(query: string, limit = 50): Promise<FeedPost[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const posts = dropAdDocs(await readGroup('posts', 200));
  const tagOnly = q.startsWith('#');
  const needle = tagOnly ? q.slice(1) : q;
  const filtered = posts.filter((p) => {
    const text = (p.body?.text || '').toLowerCase();
    const author = (p.author_key || '').toLowerCase();
    const tags = (p.tags || []).map((t) => t.toLowerCase());
    if (tagOnly) return tags.some((t) => t.includes(needle));
    return (
      text.includes(needle) ||
      author.includes(needle) ||
      tags.some((t) => t.includes(needle))
    );
  });
  // Newest first (the board read is unordered for our purposes; the ranked
  // re-sort happens in the page's knob pipeline).
  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return filtered.slice(0, limit).map((p) => mapDiscoveryToFeedPost(mapV3DocToDiscovery(p, {}, {})));
}

// ── YouTubeSkeleton (the Home view's loading state) ─────────────────────────
//
// The Home view (the YouTube-style video wall) shows these skeletons while the
// next page loads. The card itself is the shared `HomeCard` (@web10/discover).

function YouTubeSkeleton({ portrait = false }: { portrait?: boolean }) {
  return (
    <div data-testid="youtube-skeleton">
      <div className={`overflow-hidden rounded-xl bg-elevated ${portrait ? 'aspect-[9/16]' : 'aspect-video'}`}>
        <Skeleton className="h-full w-full" />
      </div>
      <div className="mt-2.5 flex gap-2.5">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

export { TrendingCard, TrendingSkeleton, YouTubeSkeleton, fetchDiscoverFeed, searchDiscoverPosts, mapDiscoveryToFeedPost, feedPostToDiscover, formatCount, parseCount, parseCreatedAt, type FeedPost, type DiscoveryPost, type ResolvedMediaRef };