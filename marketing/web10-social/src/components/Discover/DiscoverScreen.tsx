import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readDiscoverFeed,
  readProfile,
  readUserProfile,
  resolveMediaRefs,
  getV3Client,
  getDiscoverGroupId,
  toggleReactionKind,
  readRepostCounts,
  readMyRepostedIds,
  readViewCounts,
  extractUsername,
  type ReactionKind,
} from '@/data';
import { getWapi } from '@/data/wapi';
import { toast, errorMessage } from '@/components/shared/Toast';
import type {
  PostRecord,
  MediaRecord,
  ProfileRecord,
  ResolvedMediaRef,
  AdRecord,
} from '@/data';
import { mediaRefId, fromResolvedMediaRef } from '@/data';
import { AttachedAd } from '@/components/Feed/AttachedAd';
import {
  Compass,
  Flame,
  Users,
  Video,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKETING_ORIGIN } from '@/lib/origins';
import { PRESETS, getPreset, knobStateToSort, scorePost, FIXED_CHARACTER_DETEENT, type PresetId, type KnobState, type PowerMeanSortConfig, defaultKnobState } from '@/lib/powerMean';
import { KnobRack } from './KnobRack';
import { HotGossipSidebar } from './HotGossipSidebar';
import DiscoverExploreTab from './DiscoverExploreTab';
// The feed's PostCard is the reference post renderer (the X-style card —
// full-width, touching vertically, compact muted engagement row). The
// Discover board renders the SAME card as the Following tab, so the two
// tabs look exactly the same (the operator, 30.09.2026).
import { PostCard } from '@/components/Feed/FeedScreen';
import { useRepost } from '@/context/RepostContext';
import { useComposer } from '@/context/ComposerContext';
// The Video wall (the YouTube shape) keeps the shared HomeCard — one source,
// both apps (the same card the marketing /trending uses).
import { HomeCard, type DiscoverPost } from '@web10/discover';

const LOG = (...args: unknown[]) => console.log('[social:discover]', ...args);

// ── Knob state ↔ URL (the deep-linkable ranking, D36) ───────────────────────
// The knob state is screen state, so the URL holds it (the deep-link rule:
// refresh restores the ranking, a shared link carries it) — same rule as
// ?tag= / ?q= / ?view=. The URL is the single source of truth; the state
// derives from it. ?knobs= is the five detent indices, comma-joined
// (recency,likes,comments,halfLife,character), omitted when at default.

const KNOB_KEYS: (keyof KnobState)[] = ['recency', 'likes', 'comments', 'halfLife', 'character'];

function encodeKnobState(state: KnobState): string {
  return KNOB_KEYS.map((k) => String(state[k])).join(',');
}

function parseKnobParam(raw: string | null): KnobState | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== KNOB_KEYS.length) return null;
  const state = {} as KnobState;
  for (let i = 0; i < KNOB_KEYS.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 5) return null;
    state[KNOB_KEYS[i]] = n;
  }
  return state;
}

/** The preset whose state matches exactly, or null (a custom tuning). */
function presetIdForState(state: KnobState): PresetId | null {
  const match = PRESETS.find((p) => KNOB_KEYS.every((k) => p.state[k] === state[k]));
  return match ? match.id : null;
}

const DEFAULT_KNOB_ENCODING = encodeKnobState(defaultKnobState());

// ── Helpers ────────────────────────────────────────────────────────────────

// ── Navigate to a user's profile (App listens for this) ──────────────────────

function navigateToUserProfile(username: string, provider: string) {
  window.dispatchEvent(
    new CustomEvent('navigate-user-profile', {
      detail: { username, provider },
    }),
  );
}

// ── Topic chips ────────────────────────────────────────────────────────────

function buildTopics(tags: string[]): string[] {
  const unique = Array.from(new Set(tags)).sort();
  return unique.slice(0, 12);
}

// ── Discover board card ──────────────────────────────────────────────────────
// The hot-gossip board renders the feed's PostCard (the reference renderer —
// the two Posts tabs look exactly the same). The Video wall (the YouTube
// shape) keeps the shared HomeCard; this maps a social PostRecord to the
// shared DiscoverPost for that card.

// Map a social PostRecord + its resolved media to the shared DiscoverPost.
function postRecordToDiscoverPost(post: PostRecord, mediaItems: MediaRecord[], displayName?: string): DiscoverPost {
  return {
    id: post._id || '',
    author: post.author_username || '',
    author_username: post.author_username || '',
    display_name: displayName,
    title: post.title,
    text: post.text,
    tags: post.tags,
    created_at: post.created_at,
    likes: post.likes,
    dislikes: post.dislikes,
    comments: post.comments,
    reposts: post.reposts,
    impressions: post.impressions,
    reach: post.reach,
    score: post.score,
    media: mediaItems,
    // The attached ads (ad-improvements.md) — the creator's pinned ad + the
    // node's ad, rendered per format via the card's renderAd seam.
    ad: post.ad,
    node_ad: post.node_ad,
  };
}

// The board's loading skeleton — the feed's FeedSkeleton shape (the X-style
// card: full-width, border-b hairline, no rounded floating card), so the
// loading state looks like the settled board.
function DiscoverSkeleton() {
  return (
    <div
      data-testid="discover-skeleton"
      className="bg-card border-b border-border overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="w-full aspect-[4/3] rounded-none" />
      <div className="px-4 py-3 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function DiscoverEmptyState() {
  return (
    <div
      data-testid="discover-empty"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50 mb-4">
        <Compass className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">
        Nothing trending yet
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        The network is quiet. Follow some people or import your existing
        posts to get things moving.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
        <Button
          variant="brand"
          size="sm"
          data-testid="discover-empty-follow-cta"
          onClick={() => window.open(`${MARKETING_ORIGIN}/import`, '_blank', 'noopener,noreferrer')}
          className="gap-2"
        >
          <Users className="h-4 w-4" strokeWidth={1.75} />
          Import your posts
        </Button>
        <span className="text-xs text-muted-foreground">
          or follow personas to fill your feed
        </span>
      </div>
    </div>
  );
}

// ── Signals helper for powerMean ranking ────────────────────────────────────

function postToSignals(post: PostRecord) {
  return {
    ageMs: Date.now() - new Date(post.created_at).getTime(),
    likes: post.likes || 0,
    comments: post.comments || 0,
    reposts: post.reposts || 0,
  };
}

// ── The four destinations (the Discover split, watch-page.md) ────────────────
// The old Discover salad (a `Trending | People` tab row PLUS a `Home | Hot
// Gossip` view toggle — three levels of "which list am I looking at" in one
// screen) is retired. Each destination is now a top-level route the sidebar
// owns: **Video** (the video wall, the old Home view) · **Hot Gossip** (the
// ranked post board, the old grid view) · **People** (the people + groups
// browser, the old explore tab) · **Shorts** (already its own route). The
// screen is mode-driven: the same board read powers Video + Hot Gossip; the
// `?view=` toggle + the `?tab=` row are gone. `?knobs=` / `?q=` / `?tag=`
// survive on the relevant destinations.
export type DiscoverMode = 'video' | 'hot-gossip' | 'people';

function postHasVideo(post: PostRecord): boolean {
  // The video view is videos-only (competing with YouTube — photos don't
  // belong here). A post is a video if it's tagged video OR its first resolved
  // media is a video (the render-time gate, not the client-asserted tag).
  const refs = post.media_refs || [];
  const hasVideoRef = refs.some(
    (r) => typeof r === 'object' && r !== null && (r as { mime_type?: string }).mime_type?.startsWith('video/'),
  );
  return !!(post.tags?.includes('video') || hasVideoRef);
}

// A post is a SHORT (portrait video) if its first video media is 9:16
// (width < height) — the same render-time gate the Shorts feed uses (shorts.md),
// re-derived from the resolved media rather than the client-asserted `short` tag.
// The Video wall is landscape-only (YouTube-shaped); portrait videos live in
// the Shorts destination (TikTok-shaped). This is the aspect-ratio split that
// keeps the two from bleeding into each other.
function postIsPortraitVideo(post: PostRecord): boolean {
  const refs = post.media_refs || [];
  return refs.some((r) => {
    if (typeof r !== 'object' || r === null) return false;
    const m = r as { mime_type?: string; width?: number | null; height?: number | null };
    return (
      m.mime_type?.startsWith('video/') &&
      !!m.width && !!m.height && m.width < m.height
    );
  });
}

// ── HomeCard (the Home view — the YouTube-style video wall) ─────────────────
// The operator: "the youtube view is preferable, less brainrot — the videos
// all have a good title, a thumbnail, and the attribution of who put them up."
// The Home view is the default view of the Explorer (competing with YouTube).
// The card is the SHARED HomeCard (one source, both apps) — a 16:9 thumbnail,
// a truncated title, and the author's attribution.

interface DiscoverHomeCardProps {
  post: PostRecord;
  authorName: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  liked: boolean;
  disliked: boolean;
  reposted: boolean;
  onAuthorClick: () => void;
  onToggleReaction: (kind: ReactionKind) => void;
  onToggleRepost: () => void;
  /** Prioritize the thumbnail (above-the-fold tiles). */
  priority?: boolean;
}

function DiscoverHomeCard({
  post,
  authorName,
  authorAvatar,
  mediaItems,
  liked,
  disliked,
  reposted,
  onAuthorClick,
  onToggleReaction,
  onToggleRepost,
  priority,
}: DiscoverHomeCardProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The aspect-ratio branch (watch-page.md): a portrait (9:16) video goes to
  // the Shorts lens; a landscape video goes to the watch page (the YouTube
  // view) carrying the current ?knobs= ranking. The gate is the resolved
  // media's ratio (width < height), not the client-asserted tag — the same
  // signal Shorts' render-time backstop uses.
  const openPost = () => {
    const id = post._id || '';
    if (!id) return;
    // The aspect-ratio split (shorts.md): the Video wall is landscape-only, so
    // a card here is a landscape video → the watch page (carrying the current
    // ?knobs= ranking). A portrait video is a short and lives in the Shorts
    // destination (the lens) — the wall filters those out, but the gate stays
    // as the backstop (a portrait card can only reach here via a stale read).
    if (postIsPortraitVideo(post)) {
      navigate(`/shorts/${id}`);
      return;
    }
    const params = new URLSearchParams();
    const knobs = searchParams.get('knobs');
    if (knobs) params.set('knobs', knobs);
    navigate(`/watch/${id}?${params.toString()}`);
  };
  return (
    <HomeCard
      post={postRecordToDiscoverPost(post, mediaItems, authorName)}
      authorAvatar={authorAvatar}
      onPostClick={openPost}
      onAuthorClick={onAuthorClick}
      onCommentClick={openPost}
      liked={liked}
      disliked={disliked}
      reposted={reposted}
      onToggleReaction={onToggleReaction}
      onToggleRepost={onToggleRepost}
      priority={priority}
      testId="discover-home-card"
    />
  );
}

function DiscoverHomeSkeleton() {
  return (
    <div data-testid="discover-home-skeleton">
      <div className="overflow-hidden rounded-lg bg-elevated">
        <Skeleton className="aspect-video w-full" />
      </div>
      <div className="mt-2.5 flex gap-2.5">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

// ── Home empty state ────────────────────────────────────────────────────────

function DiscoverHomeEmptyState({ onSwitchToGrid }: { onSwitchToGrid: () => void }) {
  return (
    <div
      data-testid="discover-home-empty"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50 mb-4">
        <Video className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">
        No videos yet
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        The Video wall shows trending video posts.
        Switch to Hot Gossip to see all trending posts.
      </p>
      <Button
        variant="outline"
        size="sm"
        data-testid="discover-home-empty-cta"
        onClick={onSwitchToGrid}
        className="mt-6 gap-2"
      >
        <Flame className="h-4 w-4" strokeWidth={1.75} />
        Switch to Hot Gossip
      </Button>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

// The mode is derived from the route path (the path IS the mode — the route
// owns it). `/video` → `video`, `/hot-gossip` → `hot-gossip`, `/people` →
// `people`. A direct render with no matching path (tests) defaults to `video`.
// The old `?view=` toggle + `?tab=` row are retired — the sidebar owns the
// nav. `?knobs=` / `?q=` / `?tag=` survive as URL state on the relevant
// destinations.
function modeFromPath(pathname: string): DiscoverMode {
  if (pathname.startsWith('/hot-gossip')) return 'hot-gossip';
  if (pathname.startsWith('/people')) return 'people';
  return 'video';
}

export default function DiscoverScreen({ mode: modeOverride }: { mode?: DiscoverMode }) {
  const { pathname } = useLocation();
  // The mode is normally derived from the route path (the path IS the mode).
  // An explicit `mode` override wins — the What's New screen embeds this board
  // at /feed (the Following/Hot Gossip tabs) where the path is /feed, not
  // /hot-gossip, so it passes mode="hot-gossip" directly.
  const mode = modeOverride ?? modeFromPath(pathname);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileRecord>>({});
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord[]>>({});
  // The reader's own reaction per post (post-actions.md): which posts they've
  // liked / disliked, so the heart/thumb render filled on load. Seeded from
  // the discover-group reaction read in loadDiscover; flipped optimistically
  // on a tap (handleToggleReaction).
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [dislikedMap, setDislikedMap] = useState<Record<string, boolean>>({});
  const [repostedMap, setRepostedMap] = useState<Record<string, boolean>>({});
  // True after the first successful board load — knob re-reads keep the
  // previous grid on screen (no skeleton flash); only the cold start shows
  // the skeleton. A ref (not state) so the stable `loadDiscover` callback
  // can read it without a stale closure.
  const hasLoadedRef = useRef(false);
  // Infinite scroll (the Shorts wall's pattern): the board pages until it's
  // exhausted. `hasMore` keys off the BOARD page size (a full page means there
  // may be another — the video wall filters to video posts, so it keys off the
  // board, not the video subset); `nextOffsetRef` is the next offset to fetch
  // (a ref so the stable `loadMore` reads the latest without a stale closure);
  // `loadingMore` guards against double-fires from the sentinel; `sortRef` is
  // the current ranking (a knob re-read resets to page one, so `loadMore`
  // always reads the latest).
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextOffsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<PowerMeanSortConfig | null>(null);

  // Deep-link: active tag from ?tag= (refresh-safe, shareable)
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTag = searchParams.get('tag') || '';
  const [activeTag, setActiveTag] = useState<string>(urlTag || 'All');

  // Deep-link: search query from ?q= (refresh-safe, shareable)
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState<string>(urlQuery);

  // Sync activeTag with ?tag= search param
  useEffect(() => {
    const current = searchParams.get('tag') || 'All';
    if (activeTag !== current) {
      setActiveTag(current);
    }
  }, [searchParams]);

  // Sync searchQuery with ?q= search param
  useEffect(() => {
    const current = searchParams.get('q') || '';
    if (searchQuery !== current) {
      setSearchQuery(current);
    }
  }, [searchParams]);

  // Knob state — deep-linkable: the URL holds the ranking (?knobs=), so a
  // refresh restores it and a shared link carries it. The URL is the single
  // source of truth (the deep-link rule); the state derives from it. Starts
  // at the Balanced preset (the default) when the URL carries no knobs.
  const knobState = useMemo<KnobState>(() => {
    return parseKnobParam(searchParams.get('knobs')) ?? defaultKnobState();
  }, [searchParams]);
  const activePreset = useMemo<PresetId | null>(() => presetIdForState(knobState), [knobState]);

  // Log the deep-link restore once on mount (the URL held the ranking).
  useEffect(() => {
    const raw = searchParams.get('knobs');
    if (raw) {
      LOG('deep-link — knob state restored from URL:', raw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear the active ?q= (the search chip's X) — on either tab. The query is
  // screen state the URL holds; removing the param re-renders both tabs
  // unfiltered (the Trending board's client filter + the Explore tab's
  // people/groups filters both key off ?q=).
  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
    LOG('query cleared');
  }, [searchParams, setSearchParams]);

  // Hot Gossip deep link: ?post=<id> scrolls the board to that post and
  // highlights it (the Threads-equivalent link-out — the marketing site's Hot
  // Gossip click lands here, in the middle of the board, at that post). The id
  // is screen state the URL holds (refresh-safe, shareable). The card carries
  // the id as its DOM id (the highlight ring is its own className), so the
  // scroll targets it directly once the board has rendered.
  const highlightPostId = searchParams.get('post') || '';
  useEffect(() => {
    if (!highlightPostId) return;
    const el = document.getElementById('hot-gossip-highlight');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightPostId, posts]);

  // The Top 10 rail's jump: set ?post=<id> (the deep-link the highlight effect
  // above reacts to). The URL holds the target (refresh-safe, shareable) — the
  // same seam the marketing link-out uses. A re-tap of the same entry is a no-op
  // (the param is already set); a different entry replaces it.
  const jumpToPost = useCallback((postId: string) => {
    if (!postId) return;
    const params = new URLSearchParams(searchParams);
    params.set('post', postId);
    setSearchParams(params);
    LOG('sidebar — jump to post:', postId);
  }, [searchParams, setSearchParams]);

  // ── Enrich a board page (the background pass, extracted so `loadMore` can
  //    enrich a page and MERGE the maps) ─────────────────────────────────────
  // Everything the grid needs beyond the one read — engagement tallies, the
  // authors' faces, and the string-ref media fallback — lands here, in
  // PARALLEL, and patches the grid in. The card re-renders from the same maps,
  // so the wall fills in: counts, avatars, display names. It NEVER blocks the
  // first paint (the inline media map is built synchronously in loadDiscover /
  // loadMore before this fires).
  const enrichBoard = useCallback((results: PostRecord[]) => {
    const token = getWapi().readToken();
    void (async () => {
      // (1) Engagement counts (the ref pattern): one read of the reactions +
      // comments collections over the discover group, counted client-side by
      // ref_value (the target post's doc_id) — the same pattern the marketing
      // trending page runs. Without this the knobs only ever see recency.
      const engagement = (async () => {
        if (!token) return;
        try {
          const w = getV3Client();
          const discoverId = getDiscoverGroupId();
          const [reactionDocs, commentDocs, repostCounts, myReposts, viewCounts] = await Promise.all([
            w.read('reactions', { groups: [discoverId], limit: 500 }),
            w.read('comments', { groups: [discoverId], limit: 500 }),
            // Repost (reposts.md: a repost is a POST, not a reaction). The
            // count is the number of `repost_of` posts (readRepostCounts, the
            // feed query's I3-scoped join lifted to a surface read) and the
            // "I reposted this" fill is the reader's own repost post
            // (readMyRepostedIds, the readFeedReactions own-post read lifted to
            // a surface read). The legacy `type:'repost'` reaction still fills
            // for old data (a read-only fallback).
            readRepostCounts(results.map((p) => p._id || '').filter(Boolean), [discoverId]),
            readMyRepostedIds(),
            // Views / impressions (D86): impressions + reach per post — the
            // engine's delivery metrics (the same object the dashboard reads).
            readViewCounts(results.map((p) => p._id || '').filter(Boolean), [discoverId]),
          ]);
          const likesByPost: Record<string, number> = {};
          const dislikesByPost: Record<string, number> = {};
          const commentsByPost: Record<string, number> = {};
          // The reader's own reaction per post (v3 ownership is by username
          // alone — the reaction's author_key is the bare username, the
          // provider implicit, so match on username, not provider).
          const likedByPost: Record<string, boolean> = {};
          const dislikedByPost: Record<string, boolean> = {};
          const legacyRepostedByPost: Record<string, boolean> = {};
          for (const d of reactionDocs) {
            if (d.ref_value) {
              // Each reaction type is counted separately (the heart and the
              // thumb each show their own tally — post-actions.md). The repost
              // is NOT counted from reactions anymore (reposts.md — it is a
              // post); the legacy `type:'repost'` reaction only feeds the
              // read-only fill fallback for old data.
              const type = (d.body as Record<string, unknown>)?.type as string | undefined;
              if (type === 'like') likesByPost[d.ref_value] = (likesByPost[d.ref_value] || 0) + 1;
              else if (type === 'dislike') dislikesByPost[d.ref_value] = (dislikesByPost[d.ref_value] || 0) + 1;
              else if (type === 'repost') legacyRepostedByPost[d.ref_value] = true;
              if (extractUsername(d.author_key) === token.username) {
                if (type === 'like') likedByPost[d.ref_value] = true;
                else if (type === 'dislike') dislikedByPost[d.ref_value] = true;
                else if (type === 'repost') legacyRepostedByPost[d.ref_value] = true;
              }
            }
          }
          for (const d of commentDocs) {
            // The TOTAL count (top-level + replies): a reply's `ref_value` is
            // its parent comment (comments.md), so key on `body.post_id`,
            // which every comment carries.
            const pid = (d.body as Record<string, unknown>)?.post_id as string | undefined;
            if (pid) commentsByPost[pid] = (commentsByPost[pid] || 0) + 1;
          }
          for (const p of results) {
            p.likes = likesByPost[p._id || ''] || 0;
            p.dislikes = dislikesByPost[p._id || ''] || 0;
            p.reposts = repostCounts[p._id || ''] || 0;
            p.comments = commentsByPost[p._id || ''] || 0;
            p.impressions = viewCounts[p._id || '']?.impressions || 0;
            p.reach = viewCounts[p._id || '']?.reach || 0;
          }
          // MERGE the reaction maps (a page's own-reactions are a subset of the
          // board's; a knob re-read re-derives the whole board's).
          setLikedMap((prev) => ({ ...prev, ...likedByPost }));
          setDislikedMap((prev) => ({ ...prev, ...dislikedByPost }));
          // The repost fill: the reader's own repost post, OR a legacy
          // `type:'repost'` reaction (old data, read-only fallback).
          const repostedByPost: Record<string, boolean> = {};
          for (const p of results) {
            const id = p._id || '';
            if (myReposts.has(id) || legacyRepostedByPost[id]) repostedByPost[id] = true;
          }
          setRepostedMap((prev) => ({ ...prev, ...repostedByPost }));
          // The tallies above mutated the post objects in place — bump the
          // array so the `scoredPosts` memo (which spreads each post for the
          // Top 10 rail's tally) recomputes with the real counts.
          setPosts((prev) => prev.map((p) => ({ ...p })));
          LOG(
            'engagement — counted',
            Object.values(likesByPost).reduce((a, b) => a + b, 0), 'reactions +',
            Object.values(commentsByPost).reduce((a, b) => a + b, 0), 'comments +',
            Object.values(repostCounts).reduce((a, b) => a + b, 0), 'reposts',
          );
        } catch (e) {
          LOG('engagement — failed (degrading to zero counts):', e);
        }
      })();

      // (2) Profiles: one PARALLEL fan-out (was a serial per-author await —
      // N distinct authors = N sequential round-trips holding the paint).
      // Anon-capable: a public profile face is `anyone`-readable (profiles
      // are public by default, 3.149.0), so an anon visitor sees the author's
      // face too. The own-profile read (readProfile) is token-gated.
      const authors = new Map<string, { username: string; own: boolean }>();
      for (const post of results) {
        const key = `${post.author_username}@${post.author_provider}`;
        if (authors.has(key)) continue;
        authors.set(key, {
          username: post.author_username || '',
          own: !!(token && post.author_username === token.username),
        });
      }
      const profiles = (async () => {
        const profileEntries = await Promise.all(
          [...authors.values()].map(async ({ username, own }) => {
            try {
              const profile = own ? await readProfile() : await readUserProfile(username);
              return profile ? ([username, profile] as const) : null;
            } catch {
              // Profile not available — the card falls back to the derived name
              return null;
            }
          }),
        );
        // Key by the same author@provider key the grid reads.
        const map: Record<string, ProfileRecord> = {};
        for (const post of results) {
          const profile = profileEntries.find((e) => e && e[0] === post.author_username)?.[1];
          if (profile) map[`${post.author_username}@${post.author_provider}`] = profile;
        }
        // MERGE (a page's authors are a subset of the board's).
        if (Object.keys(map).length) setProfileMap((prev) => ({ ...prev, ...map }));
      })();

      // (3) Fallback media: only for posts whose refs are bare doc_id strings
      // (write-path reads) — the API read path's refs are already inline
      // objects and never need it. Merges over the inline map.
      const fallbackMedia = (async () => {
        const postsWithStrings = results.filter((p) =>
          (p.media_refs || []).some((r) => typeof r === 'string'),
        );
        if (!postsWithStrings.length || !token) return;
        try {
          const byAuthor = new Map<string, { posts: typeof postsWithStrings; refs: (string | ResolvedMediaRef)[] }>();
          for (const p of postsWithStrings) {
            const key = `${p.author_username}@${p.author_provider}`;
            const entry = byAuthor.get(key);
            if (entry) {
              entry.posts.push(p);
              entry.refs.push(...(p.media_refs || []));
            } else {
              byAuthor.set(key, {
                posts: [p],
                refs: [...(p.media_refs || [])],
              });
            }
          }
          const mMap: Record<string, MediaRecord[]> = {};
          for (const [key, entry] of byAuthor) {
            const [username, provider] = key.split('@');
            const isOwn = username === token.username && provider === token.provider;
            const seen = new Set<string>();
            const uniqueRefs: (string | ResolvedMediaRef)[] = [];
            for (const r of entry.refs) {
              const id = mediaRefId(r);
              if (id && !seen.has(id)) {
                seen.add(id);
                uniqueRefs.push(r);
              }
            }
            if (!uniqueRefs.length) continue;
            const media = await resolveMediaRefs(
              uniqueRefs,
              { username, provider },
              isOwn ? 'media' : 'public_media',
            );
            for (const p of entry.posts) {
              if (p.media_refs?.length) {
                const postRefIds = new Set((p.media_refs || []).map(mediaRefId));
                mMap[p._id || ''] = media.filter((m) => postRefIds.has(m._id || ''));
              }
            }
          }
          if (Object.keys(mMap).length) {
            setMediaMap((prev) => ({ ...prev, ...mMap }));
          }
        } catch (e) {
          LOG('background media resolve — failed (degrading to inline):', e);
        }
      })();

      await Promise.all([engagement, profiles, fallbackMedia]);
    })();
  }, []);

  // Build the synchronous inline-media map for a page (the node's read path
  // resolves every post's media inline — presigned thumbnail_url + read_url +
  // dimensions + HLS settings on each media_ref). The wall's first paint
  // carries the thumbnails after ONE round-trip; the avatar + string-ref
  // fallback land in the background (enrichBoard) and patch the grid in.
  const inlineMediaMap = useCallback((results: PostRecord[]): Record<string, MediaRecord[]> => {
    const inlineMap: Record<string, MediaRecord[]> = {};
    for (const p of results) {
      const inline = (p.media_refs || []).filter((r): r is ResolvedMediaRef => typeof r !== 'string');
      if (!inline.length) continue;
      const seen = new Set<string>();
      const records: MediaRecord[] = [];
      for (const r of inline) {
        const id = r.doc_id || '';
        if (id && !seen.has(id)) {
          seen.add(id);
          records.push(fromResolvedMediaRef(r));
        }
      }
      if (records.length) inlineMap[p._id || ''] = records;
    }
    return inlineMap;
  }, []);

  const loadDiscover = useCallback(async (sort: PowerMeanSortConfig | null = null) => {
    // `loading` is the INITIAL skeleton only — a knob-triggered re-read keeps
    // the previous grid on screen (no skeleton flash per twist).
    if (!hasLoadedRef.current) setLoading(true);
    LOG('loadDiscover — start, sort:', sort ? JSON.stringify(sort) : '(chronological)');
    try {
      // The node ranks the board (the D36 power-mean sort, server-side) — a
      // knob twist is a re-read, not a client-side shuffle of the same 50.
      // PAGE ONE (offset 0) — a knob re-read resets to page one (the ranking
      // changed, so the board's order changed with it). The D86 surface label:
      // the node logs a delivery impression per post (the read path's delivery
      // capture — the on-surface "N views" is the reach over these). 'video'
      // for the video wall, 'discover' for the board (the /feed default +
      // hot-gossip).
      const results = await readDiscoverFeed(sort, 50, undefined, 0, mode === 'video' ? 'video' : 'discover');
      LOG('loadDiscover — got', results.length, 'posts');
      // The board page size (before the video-wall filter) — the paging
      // signal. A full page (>= PAGE_SIZE) means there may be another.
      const more = results.length >= 50;
      nextOffsetRef.current = 50;
      sortRef.current = sort;
      setHasMore(more);
      // Paint the grid NOW — the one read is render-ready (the inline media
      // map is synchronous; the wall's first paint carries the thumbnails).
      const inlineMap = inlineMediaMap(results);
      if (Object.keys(inlineMap).length) setMediaMap(inlineMap);
      setPosts(results);
      hasLoadedRef.current = true;
      setLoading(false);
      // Enrich in the background (never blocks the first paint).
      enrichBoard(results);
    } catch (e) {
      LOG('loadDiscover — failed:', e);
      // A failed re-read (a knob twist) keeps the previous grid on screen —
      // only a cold-start failure shows the empty state.
      if (!hasLoadedRef.current) setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [inlineMediaMap, enrichBoard]);

  // Infinite scroll: append the next board page (the sentinel's
  // IntersectionObserver fires this). A full page means there may be another;
  // a short page is the last one. The page's posts are APPENDED (deduped by
  // id — offset paging can surface a post twice if the board shifts between
  // page reads, a new post posted mid-scroll) and enriched in the background
  // (the same pass as page one, merging the maps).
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const results = await readDiscoverFeed(sortRef.current, 50, undefined, nextOffsetRef.current);
      LOG('loadMore — got', results.length, 'more posts');
      // Advance by the BOARD page size (not the filtered count) — the video
      // wall filters to video posts, so advancing by page.length would re-read
      // posts. A full board page (hasMore true) is exactly PAGE_SIZE.
      nextOffsetRef.current += 50;
      setHasMore(results.length >= 50);
      const inlineMap = inlineMediaMap(results);
      if (Object.keys(inlineMap).length) setMediaMap((prev) => ({ ...prev, ...inlineMap }));
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p._id).filter(Boolean));
        return [...prev, ...results.filter((p) => !p._id || !seen.has(p._id))];
      });
      enrichBoard(results);
    } catch (e) {
      console.error('[social:discover] loadMore failed:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, inlineMediaMap, enrichBoard]);

  // Infinite scroll: a sentinel at the bottom of the board triggers loadMore
  // when it scrolls into view (rootMargin prefetches a page early). Only
  // active when there's no active ?q= — with a query the board is a filtered
  // view over the loaded posts, and a filtered grid would rapidly page the
  // whole board (loading non-matching pages that get filtered out).
  const queryActive = searchQuery.trim() !== '';
  useEffect(() => {
    if (queryActive || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [queryActive, hasMore, loadMore, posts.length]);

  // The server-side ranking config for the current knob state. The Newest
  // preset is pure chronological — the board's default read (no sort param).
  const sortConfig = useMemo<PowerMeanSortConfig | null>(() => {
    if (activePreset === 'most-recent') return null;
    return knobStateToSort(knobState);
  }, [knobState, activePreset]);

  // The node ranks the board (the D36 power-mean sort, server-side) — a knob
  // twist is a DEBOUNCED RE-READ, not a client-side shuffle of the same 50.
  // First load (mount) fires immediately; knob bursts (a rotary drag is a
  // run of detent steps) settle into one fetch 400ms after the last twist.
  // The previous grid stays on screen while the re-read is in flight.
  const firstLoad = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      LOG('load — initial, sort:', sortConfig ? JSON.stringify(sortConfig) : '(chronological)');
      loadDiscover(sortConfig);
      return;
    }
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    LOG('knob change — re-reading board in 400ms, sort:', sortConfig ? JSON.stringify(sortConfig) : '(chronological)');
    refreshTimer.current = setTimeout(() => loadDiscover(sortConfig), 400);
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [sortConfig, loadDiscover]);

  // The app-level New Post sheet fires `post-created` (NewPostSheet) when a
  // post lands — re-read the board so the fresh post shows up (the seam that
  // replaces the old inline composer's onPostCreated callback).
  useEffect(() => {
    const onPostCreated = () => loadDiscover(sortConfig);
    window.addEventListener('post-created', onPostCreated);
    return () => window.removeEventListener('post-created', onPostCreated);
  }, [loadDiscover, sortConfig]);

  // The reaction pair (post-actions.md): like XOR dislike, one reaction per
  // user. Optimistic update of the own-reaction maps + the post's like/dislike
  // counts, rollback on error. The data layer (toggleReactionKind) enforces
  // the mutual exclusion server-side. A plain function (not useCallback) so it
  // always reads the latest maps — the feed's handleToggleReaction pattern.
  //
  // The delta is computed per-tally from the CURRENT flags (a like↔dislike
  // swap moves the reaction: like -1, dislike +1) — the old single `delta`
  // was wrong on a swap (the "0 1 0 1" flicker).
  async function handleToggleReaction(postId: string, kind: ReactionKind) {
    const token = getWapi().readToken();
    if (!token) return;
    const wasLiked = !!likedMap[postId];
    const wasDisliked = !!dislikedMap[postId];
    const nextLiked = kind === 'like' ? !wasLiked : false;
    const nextDisliked = kind === 'dislike' ? !wasDisliked : false;
    const likeDelta = (nextLiked ? 1 : 0) - (wasLiked ? 1 : 0);
    const dislikeDelta = (nextDisliked ? 1 : 0) - (wasDisliked ? 1 : 0);
    setLikedMap((prev) => ({ ...prev, [postId]: nextLiked }));
    setDislikedMap((prev) => ({ ...prev, [postId]: nextDisliked }));
    setPosts((prev) =>
      prev.map((p) =>
        p._id === postId
          ? { ...p, likes: Math.max(0, (p.likes || 0) + likeDelta), dislikes: Math.max(0, (p.dislikes || 0) + dislikeDelta) }
          : p,
      ),
    );
    try {
      await toggleReactionKind(postId, kind);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      toast.error(errorMessage(e, 'Could not update your reaction.'));
      setLikedMap((prev) => ({ ...prev, [postId]: wasLiked }));
      setDislikedMap((prev) => ({ ...prev, [postId]: wasDisliked }));
      setPosts((prev) =>
        prev.map((p) =>
          p._id === postId
            ? { ...p, likes: Math.max(0, (p.likes || 0) - likeDelta), dislikes: Math.max(0, (p.dislikes || 0) - dislikeDelta) }
            : p,
        ),
      );
    }
  }

  // Repost (reposts.md): a repost is a POST, not a reaction toggle. Tapping
  // the repeat icon opens the app-level composer in repost mode (the shared
  // RepostContext seam) with this post as the context — the New Post sheet
  // pops up in place (no navigation; the user stays on the wall). The
  // composer's createRepost is the single write; the count + fill
  // re-derive from the post-based read on the next load.
  const { setRepostingTo } = useRepost();
  const { openComposer } = useComposer();
  const navigate = useNavigate();
  function handleRepost(post: PostRecord) {
    setRepostingTo(post);
    openComposer();
  }

  // Write a knob state to the URL (the deep-linkable ranking). The param is
  // omitted when the state is the default, so the default URL stays clean.
  const setKnobUrl = useCallback((next: KnobState) => {
    const params = new URLSearchParams(searchParams);
    const encoded = encodeKnobState(next);
    if (encoded === DEFAULT_KNOB_ENCODING) {
      params.delete('knobs');
    } else {
      params.set('knobs', encoded);
    }
    setSearchParams(params);
    const preset = presetIdForState(next);
    LOG('knob state —', encoded, preset ? `(preset: ${preset})` : '(custom)');
  }, [searchParams, setSearchParams]);

  // Knob change handler — writes the new state to the URL (the preset
  // highlight clears itself when the state stops matching a preset)
  const handleKnobChange = useCallback((key: keyof KnobState, value: number) => {
    setKnobUrl({ ...knobState, [key]: value });
  }, [knobState, setKnobUrl]);

  // Preset handler — updates the knob state to preset defaults
  const handlePreset = useCallback((id: PresetId) => {
    const presetDef = getPreset(id);
    if (presetDef) {
      setKnobUrl(presetDef.state);
    }
  }, [setKnobUrl]);

  // The node returns the board pre-ranked (the D36 power-mean sort,
  // server-side) — `posts` is already in display order, no client re-rank.
  // The per-post power-mean score is computed for the watch queue's relatedness
  // boost only; the Top 10 rail's tally is the raw engagement count
  // (likes + comments + reposts), not the normalized score.
  const scoredPosts = useMemo(() => {
    return posts.map(p => ({
      ...p,
      score: scorePost(postToSignals(p), { ...knobState, character: FIXED_CHARACTER_DETEENT }),
    }));
  }, [posts, knobState]);

  const topics = useMemo(
    () => ['All', ...buildTopics(scoredPosts.flatMap(p => p.tags ?? []))],
    [scoredPosts],
  );

  const visiblePosts = useMemo(() => {
    let filtered = scoredPosts;
    if (activeTag && activeTag !== 'All') {
      filtered = filtered.filter(p => p.tags?.includes(activeTag) ?? false);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        (p.text ?? '').toLowerCase().includes(q) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
        (p.author ?? '').toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [scoredPosts, activeTag, searchQuery]);

  // Video wall: landscape videos only (the YouTube shape). Portrait videos are
  // shorts — they live in the Shorts destination (the TikTok shape), not here.
  // The aspect-ratio split keeps the two from bleeding into each other: a user
  // clicks a landscape video in the wall (→ the watch page) or a short in the
  // Shorts wall (→ the lens), never the other way around.
  const mediaPosts = useMemo(
    () => visiblePosts.filter(p => postHasVideo(p) && !postIsPortraitVideo(p)),
    [visiblePosts],
  );

  const isInitialLoad = loading && posts.length === 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="w-full">
      {mode === 'people' ? (
        /* People — the people + groups browser (the old `?tab=explore`). The
           sidebar owns the nav; the screen is the browser. */
        <DiscoverExploreTab query={urlQuery} />
      ) : (
        <>
          {/* The active ?q= filter (from the top bar's search) — the same
              chip the People tab shows, so the search can be X'd from either
              destination. Clearing it re-filters the board (the client-side
              ?q= filter) and the URL. */}
          {urlQuery.trim() !== '' && (
            <div className="px-4 pt-3 md:px-4 lg:px-6">
              <span
                data-testid="discover-trending-tab-query"
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-muted/40 px-3 py-1 text-xs text-brand-300"
              >
                <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
                {urlQuery.trim()}
                <button
                  type="button"
                  onClick={clearQuery}
                  data-testid="discover-trending-tab-query-clear"
                  aria-label="Clear search"
                  className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-muted transition-colors duration-150"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </span>
            </div>
          )}

          {/* The composer is NOT inline (the operator: "it should be
              invisible") — the app-level New Post sheet (the Layout's
              floating "+" button) is the single compose surface. The video
              wall is the hero, not a composer box (design.md §10). */}

          {/* Controls: presets + knobs */}
          <div className="px-4 py-3 md:px-4 lg:px-6">
            <KnobRack
              state={knobState}
              activePreset={activePreset}
              onChange={handleKnobChange}
              onPreset={handlePreset}
            />
          </div>

          {/* Topic filter chips */}
          {topics.length > 1 && (
            <div className="px-4 py-3 md:px-4 lg:px-6">
              <div
                className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Filter by topic"
              >
                {topics.map(t => {
                  const active = t === activeTag;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid="discover-topic"
                      onClick={() => {
                        setActiveTag(t);
                        const params = new URLSearchParams(searchParams);
                        if (t === 'All') {
                          params.delete('tag');
                        } else {
                          params.set('tag', t);
                        }
                        setSearchParams(params);
                      }}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        active
                          ? 'border-brand bg-brand-muted text-brand-300'
                          : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t === 'All' ? 'All' : `#${t}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Content — the Video wall (the YouTube-style grid) fills the
                screen; Hot Gossip keeps the single-column board. The desktop
                gutter (md:px-4 lg:px-6) lets the wall breathe (the operator's
                "no padding at all on the sides" — a gutter, not full-bleed);
                mobile stays full-bleed. */}
          <div className="flex-1 py-4 md:px-4 lg:px-6">
            {isInitialLoad ? (
              <div className="mx-auto w-full max-w-2xl" data-testid="discover-grid-skeleton">
                {Array.from({ length: 4 }).map((_, i) => (
                  <DiscoverSkeleton key={i} />
                ))}
              </div>
            ) : mode === 'video' ? (
              /* Home view — videos only, the YouTube-style wall (16:9 thumbs) */
              mediaPosts.length > 0 ? (
                <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="discover-home-grid">
                  {mediaPosts.map((post, index) => {
                    const authorKey = `${post.author_username}@${post.author_provider}`;
                    const profile = profileMap[authorKey];
                    const mediaItems = mediaMap[post._id || ''] || [];
                    const authorName = profile?.display_name || (post.author_username || '').replace(/[-_]/g, ' ');

                    return (
                      <DiscoverHomeCard
                        key={post._id || post.created_at}
                        post={post}
                        authorName={authorName}
                        authorAvatar={
                          profile?.avatar_ref
                            ? mediaItems.find(m => m._id === profile.avatar_ref)?.url
                            : undefined
                        }
                        mediaItems={mediaItems}
                        liked={!!likedMap[post._id || '']}
                        disliked={!!dislikedMap[post._id || '']}
                        reposted={!!repostedMap[post._id || '']}
                        onAuthorClick={() => navigateToUserProfile(post.author_username || '', post.author_provider || '')}
                        onToggleReaction={(kind) => handleToggleReaction(post._id || '', kind)}
                        onToggleRepost={() => handleRepost(post)}
                        priority={index < 6}
                      />
                    );
                  })}
                </div>
              ) : (
                <DiscoverHomeEmptyState onSwitchToGrid={() => navigate('/hot-gossip')} />
              )
            ) : visiblePosts.length > 0 ? (
              /* Hot Gossip — the ranked post board. It renders the FEED'S
                 PostCard (the reference renderer — the X-style card:
                 full-width, posts touching vertically, compact muted
                 engagement row) so the Discover tab looks EXACTLY like the
                 Following tab (the operator, 30.09.2026: "they should look
                 exactly the same with the posts touching each other
                 vertically"). The board keeps its Discover chrome around the
                 same cards: the reading column + the Top 10 rail beside it
                 (the ranking lives in the rail, not on the card), the ?post=
                 highlight, and the knob rack + topic chips above. Mobile:
                 the rail hides (lg:block), the board stays full-width. */
              <div className="mx-auto flex w-full max-w-5xl gap-8">
                <div className="min-w-0 flex-1">
                  <div className="mx-auto w-full max-w-2xl" data-testid="discover-grid">
                    {visiblePosts.flatMap((post) => {
                      const authorKey = `${post.author_username}@${post.author_provider}`;
                      const profile = profileMap[authorKey];
                      const mediaItems = mediaMap[post._id || ''] || [];
                      const authorName = profile?.display_name || (post.author_username || '').replace(/[-_]/g, ' ');

                      // Post-format ads (ad-improvements.md): a `post`-format ad
                      // rides the post it's attached to but renders as its OWN
                      // card, next in line after that post on the board — "just
                      // another post" with the Ad/Sponsored badge + disclosure,
                      // nothing indicating the pin. (Inline ads stay in the card's
                      // own ad slot; the shared card skips the post format.)
                      const attached: AdRecord[] = [
                        ...(post.ad && post.ad.format === 'post' ? [post.ad] : []),
                        ...(post.node_ad && post.node_ad.format === 'post' ? [post.node_ad] : []),
                      ];

                      const isHighlighted = !!highlightPostId && (post._id || '') === highlightPostId;
                      // The reader's own post → the owner kebab (edit via the
                      // app-level composer — the PostCard's ONE edit path).
                      const isOwnPost =
                        !!getWapi()?.readToken()?.username &&
                        post.author_username === getWapi()!.readToken()!.username;
                      const card = (
                        <PostCard
                          key={post._id || post.created_at}
                          post={post}
                          authorName={authorName}
                          authorUsername={post.author_username}
                          authorProvider={post.author_provider}
                          authorAvatar={
                            profile?.avatar_ref
                              ? mediaItems.find(m => m._id === profile.avatar_ref)?.url
                              : undefined
                          }
                          mediaItems={mediaItems}
                           reactionCount={post.likes || 0}
                           dislikeCount={post.dislikes || 0}
                           commentCount={post.comments || 0}
                           repostCount={post.reposts || 0}
                           impressions={post.impressions || 0}
                           reach={post.reach || 0}
                           liked={!!likedMap[post._id || '']}
                           disliked={!!dislikedMap[post._id || '']}
                          reposted={!!repostedMap[post._id || '']}
                          timestamp={post.created_at}
                          onToggleReaction={(kind) => handleToggleReaction(post._id || '', kind)}
                          onToggleRepost={() => handleRepost(post)}
                          onCommentCountChange={() => {}}
                          onAuthorClick={(username, provider) => navigateToUserProfile(username, provider)}
                           isOwnPost={isOwnPost}
                           onPostUpdated={() => loadDiscover(sortConfig)}
                           testId="discover-card"
                           id={isHighlighted ? 'hot-gossip-highlight' : undefined}
                           className={isHighlighted ? 'ring-2 ring-brand border-brand shadow-[0_0_24px_-4px_var(--color-glow-intense)]' : undefined}
                           surface="discover"
                         />
                      );

                      if (!attached.length) return [card];
                      return [
                        card,
                        ...attached.map((ad) => (
                          <AttachedAd
                            key={`${post._id || post.created_at}-ad-${ad._id || 'x'}`}
                            ad={ad}
                            standalone
                          />
                        )),
                      ];
                    })}
                  </div>
                </div>

                {/* The Top 10 rail — Hot Gossip only, desktop only (the board's
                    shortcut, not a nav rail). Hidden while searching (the
                    filtered board is the focus, the unfiltered top-10 would
                    mislead) — the marketing rail has the same rule. */}
                {urlQuery.trim() === '' && (
                  <HotGossipSidebar
                    entries={scoredPosts
                      .filter(p => activeTag === 'All' || (p.tags?.includes(activeTag) ?? false))
                      .slice(0, 10)
                      .map((p, i) => ({ post: p, rank: i + 1, score: (p.likes || 0) + (p.comments || 0) + (p.reposts || 0) }))}
                    onSelect={jumpToPost}
                  />
                )}
              </div>
            ) : (
              <DiscoverEmptyState />
            )}
          </div>

          {/* Infinite scroll sentinel — triggers loadMore when it scrolls into
              view (the Shorts wall's pattern). Only present when the board is
              unfiltered (no active ?q=) and there's another page to load. */}
          {!queryActive && hasMore && (
            <div
              ref={sentinelRef}
              data-testid="discover-board-sentinel"
              className="flex items-center justify-center py-6"
            >
              {loadingMore && (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading more…</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}