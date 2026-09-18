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
      transcoding_settings: r.transcoding_settings || undefined,
    }));
}

function feedPostToDiscover(post: FeedPost): DiscoverPost {
  const author = post.author || post.handle.replace(/^@/, '');
  return {
    id: post.id,
    author,
    author_username: author,
    display_name: post.name,
    text: post.content,
    tags: post.tags,
    created_at: post.createdAt,
    likes: post.likesCount,
    comments: post.commentsCount,
    reposts: post.repostsCount,
    score: post.engagementScore,
    media: feedPostToMediaItems(post.mediaRefs),
  };
}

// The marketing comment reader (the public ledger) — injected into the shared
// card's comment thread. Maps the ledger entries to the package's CommentItem.
const marketingReadComments: ReadComments = async (postId) => {
  const entries = await fetchComments(postId, undefined, 'public_posts');
  return entries.map((e) => ({
    _id: e._id,
    text: e.payload.text,
    author_username: e.payload.author_username || e.author,
    created_at: e.created_at,
  }));
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
}

interface FeedPost {
  id: string;
  name: string;
  handle: string;
  initial: string;
  avatarColor: string;
  time: string;
  content: string;
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
}

// ── Inline comment panel (anon read, auth-gated compose) ────────────────────

const COMMENT_API = import.meta.env.VITE_API_URL || 'https://api.web10.app';

interface LedgerComment {
  _id: string;
  payload: {
    action: string;
    text: string;
    author_username?: string;
    author_provider?: string;
    target?: string;
  };
  author: string;
  created_at: string;
}

async function fetchComments(postId: string, postAuthor?: string, postService?: string): Promise<LedgerComment[]> {
  const target = postAuthor && postService
    ? `${postAuthor}/${postService}/${postId}`
    : `posts:${postId}`;
  // PATCH /public/entries reads its filters from QUERY PARAMS (FastAPI
  // Query(...)), not the request body — a body-carried target is ignored and
  // returns the unfiltered ledger (every post's comments mixed together).
  const params = new URLSearchParams({ target, limit: '50' });
  const resp = await fetch(`${COMMENT_API}/public/entries?${params.toString()}`, {
    method: 'PATCH',
  });
  if (!resp.ok) return [];
  const entries: LedgerComment[] = await resp.json();
  return entries.filter(e => e.payload?.action === 'comment');
}

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
}: TrendingCardProps) {
  // D74: the marketing /trending card is now the SHARED discover card (the same
  // one the social app's Discover uses), in `remote` mode — anon, so the like
  // is display-only and the comment compose is a link-out to web10 social.
  const author = post.author || post.handle.replace(/^@/, '');
  const postHref = author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(author)}/p/${encodeURIComponent(post.id)}`
    : SOCIAL_ORIGIN;
  const authorHref = author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(author)}`
    : SOCIAL_ORIGIN;
  return (
    <DiscoverCard
      post={feedPostToDiscover(post)}
      rank={rank}
      maxScore={maxScore}
      remote
      postHref={postHref}
      authorHref={authorHref}
      readComments={marketingReadComments}
      id={`trending-card-${post.id}`}
      className={className}
      testId="trending-card"
      // The trending grid is a card wall — a full-width 9:16 box (~1.78× the
      // card tall) dwarfs the card and buries the video's control rack at its
      // bottom. Cap the portrait frame to a square-ish box (centered in a black
      // letterbox) so the whole clip + the rack stay in view. The social app's
      // single-column Discover leaves this unset (full-bleed, unchanged).
      videoMaxWidth="min(50vh, 100%)"
    />
  );
}

function TrendingSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <Card
      data-testid="trending-skeleton"
      className={['bg-surface', ''].join(' ')}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-5/6" />
            <Skeleton className="mt-1.5 h-4 w-3/4" />
          </div>
        </div>
        <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="mt-3 flex gap-6 border-t border-border pt-3">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
        </div>
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

async function fetchDiscoverFeed(sort: 'recent' | 'trending', limit = 6): Promise<DiscoveryPost[]> {
  // v3: the public board is the node-default discover group. Read it through
  // the normal group-read path as anon (no token). Engagement is the
  // server-side count shape (GROUP BY ref_value through the engine) for the
  // board's posts — exact, no cap.
  const posts = await readGroup('posts', 200);
  const postIds = posts.map((p) => p.doc_id);
  const [likesByPost, commentsByPost] = await Promise.all([
    readGroupRefCounts('reactions', postIds),
    readGroupRefCounts('comments', postIds),
  ]);

  let mapped: DiscoveryPost[] = posts.map((p) => {
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
      tags: p.tags || [],
      created_at: p.created_at,
      engagement: {
        likes: likesByPost[p.doc_id] || 0,
        comments: commentsByPost[p.doc_id] || 0,
        reposts: 0,
      },
      engagement_score: (likesByPost[p.doc_id] || 0) + (commentsByPost[p.doc_id] || 0),
      media_refs: mediaRefs,
      has_media: mediaRefs.length > 0,
      first_attachment_mime: firstAttachmentMime,
    };
  });
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

// ── YouTubeCard (D-trending-views) ──────────────────────────────────────────
//
// YouTube-style card: 16:9 thumbnail, title + author + meta row below.
// Used in the YouTube view of /trending — media posts only.

interface YouTubeCardProps {
  post: FeedPost;
  rank?: number;
}

function YouTubeCard({ post, rank }: YouTubeCardProps) {
  // D74: the YouTube view's card is now the SHARED discover card (the same one
  // the social app's Discover uses), in `remote` mode. The youtubey 16:9 media
  // + author + meta is the shared card's layout — one card, both apps.
  const author = post.author || post.handle.replace(/^@/, '');
  const postHref = author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(author)}/p/${encodeURIComponent(post.id)}`
    : SOCIAL_ORIGIN;
  const authorHref = author
    ? `${SOCIAL_ORIGIN}/u/${encodeURIComponent(author)}`
    : SOCIAL_ORIGIN;
  return (
    <DiscoverCard
      post={feedPostToDiscover(post)}
      rank={rank ?? 0}
      maxScore={1}
      remote
      postHref={postHref}
      authorHref={authorHref}
      readComments={marketingReadComments}
      testId="youtube-card"
    />
  );
}

function YouTubeSkeleton() {
  return (
    <div data-testid="youtube-skeleton">
      <div className="overflow-hidden rounded-xl bg-elevated">
        <Skeleton className="aspect-video w-full" />
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

export { TrendingCard, TrendingSkeleton, YouTubeCard, YouTubeSkeleton, fetchDiscoverFeed, mapDiscoveryToFeedPost, formatCount, parseCount, parseCreatedAt, type FeedPost, type DiscoveryPost, type ResolvedMediaRef };