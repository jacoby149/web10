import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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
  toggleRepost,
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
import { mediaRefId } from '@/data';
import { AttachedAd } from '@/components/Feed/AttachedAd';
import {
  Compass,
  Flame,
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  Image as ImageIcon,
  Film,
  Music2,
  Users,
  Layers,
  Search,
  X,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKETING_ORIGIN } from '@/lib/origins';
import { PRESETS, getPreset, knobStateToSort, scorePost, FIXED_CHARACTER_DETEENT, type PresetId, type KnobState, type PowerMeanSortConfig, defaultKnobState } from '@/lib/powerMean';
import { KnobRack } from './KnobRack';
import DiscoverPeopleTab from './DiscoverPeopleTab';
import DiscoverGroupsTab from './DiscoverGroupsTab';
import { VideoPlayer, sourceFromMedia } from '@/components/Feed/VideoPlayer';
import { MediaCarousel } from '@/components/Feed/MediaCarousel';
import { PostActions } from '@/components/Feed/PostActions';
// D74: the shared discover card (one source, both apps). The social app's grid
// + youtube cards now wrap it — the same card the marketing /trending uses.
import { DiscoverCard as SharedDiscoverCard, type DiscoverPost, type CreateComment } from '@web10/discover';
import { readThreadComments, readThreadReplies, createComment as wapiCreateComment } from '@/data';

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

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Heat glow tiers ────────────────────────────────────────────────────────
function heatTier(score: number, maxScore: number): 0 | 1 | 2 | 3 {
  if (!maxScore || score <= 0) return 0;
  const ratio = score / maxScore;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
}

const HEAT_SHADOW: Record<number, string> = {
  0: '',
  1: 'shadow-[0_0_24px_-8px_var(--color-glow)]',
  2: 'shadow-[0_0_36px_-8px_var(--color-glow-intense)]',
  3: 'shadow-[0_0_52px_-6px_var(--color-glow-intense)]',
};

// ── Navigate to a user's profile (App listens for this) ──────────────────────

function navigateToUserProfile(username: string, provider: string) {
  window.dispatchEvent(
    new CustomEvent('navigate-user-profile', {
      detail: { username, provider },
    }),
  );
}

// ── Rank badge ─────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge
        variant="warning"
        data-testid="discover-rank-badge"
        className="border border-warning/40 bg-warning/15 text-warning normal-case tracking-normal"
        aria-label={`Rank ${rank}, number one`}
      >
        <Flame className="mr-1 h-3 w-3" strokeWidth={2} />
        #{rank}
      </Badge>
    );
  }
  if (rank <= 3) {
    return (
      <Badge
        variant="default"
        data-testid="discover-rank-badge"
        className="border border-border bg-elevated text-foreground normal-case tracking-normal"
        aria-label={`Rank ${rank}, top three`}
      >
        #{rank}
      </Badge>
    );
  }
  return (
    <Badge
      variant="brand"
      data-testid="discover-rank-badge"
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </Badge>
  );
}

// ── Media placeholder ──────────────────────────────────────────────────────

function MediaPlaceholder({ type }: { type: 'image' | 'video' | 'music' }) {
  if (type === 'video') {
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-elevated">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm">
            <Film className="h-5 w-5 text-foreground/60" />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
      </div>
    );
  }
  if (type === 'music') {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-elevated p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand-muted">
          <Music2 className="h-5 w-5 text-brand-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-2 w-24 rounded-full bg-muted-foreground/30" />
          <div className="mt-2 h-1 w-full rounded-full bg-muted-foreground/20">
            <div className="h-full w-2/5 rounded-full bg-brand" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="aspect-[4/3] w-full overflow-hidden bg-elevated">
      <div className="flex h-full w-full items-center justify-center">
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      </div>
    </div>
  );
}

// Video posts render through the shared <VideoPlayer> (video-player.md) — the
// discover grid is the inline modality: a uniform 16:9 tile (object-cover),
// tap-to-play in place, comments expand inline in the card. There is no
// lightbox here; that is the profile's modal modality.

// ── Topic chips ────────────────────────────────────────────────────────────

function buildTopics(tags: string[]): string[] {
  const unique = Array.from(new Set(tags)).sort();
  return unique.slice(0, 12);
}

// ── DiscoverCard (trending post) ─────────────────────────────────────────────

// D74: adapt the wapi createComment to the shared card's injected CreateComment.
// `parentId` present = a reply (refs the parent, comments.md); absent = top-level.
const discoverCreateComment: CreateComment = async ({ postId, text, parentId, groups, postAuthor, postService }) => {
  const created = await wapiCreateComment(
    { post_id: postId, text, parent_id: parentId, created_at: new Date().toISOString() },
    groups ?? postAuthor,
    postService,
  );
  return created;
};

// Map a social PostRecord + its resolved media to the shared DiscoverPost.
function postRecordToDiscoverPost(post: PostRecord, mediaItems: MediaRecord[], displayName?: string): DiscoverPost {
  return {
    id: post._id || '',
    author: post.author_username || '',
    author_username: post.author_username || '',
    display_name: displayName,
    text: post.text,
    tags: post.tags,
    created_at: post.created_at,
    likes: post.likes,
    dislikes: post.dislikes,
    comments: post.comments,
    reposts: post.reposts,
    score: post.score,
    media: mediaItems,
    // The attached ads (ad-improvements.md) — the creator's pinned ad + the
    // node's ad, rendered per format via the card's renderAd seam.
    ad: post.ad,
    node_ad: post.node_ad,
  };
}

interface DiscoverCardProps {
  post: PostRecord;
  rank: number;
  maxScore: number;
  authorName: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  onAuthorClick: () => void;
  /** A comment's author is a tappable profile link (in-app navigation). */
  onCommentAuthorClick?: (username: string, provider?: string) => void;
  /** Whether the reader has liked this post (the heart fills). */
  liked: boolean;
  /** Whether the reader has disliked this post (the thumb fills). */
  disliked: boolean;
  /** Whether the reader has reposted this post (the repeat icon fills). */
  reposted: boolean;
  /** The reader's tap on the like/dislike pair (post-actions.md). */
  onToggleReaction: (kind: ReactionKind) => void;
  /** The reader's tap on the repost (reposts.md — independent of like). */
  onToggleRepost: () => void;
}

function DiscoverCard({
  post,
  rank,
  maxScore,
  authorName,
  authorAvatar,
  mediaItems,
  onAuthorClick,
  onCommentAuthorClick,
  liked,
  disliked,
  reposted,
  onToggleReaction,
  onToggleRepost,
}: DiscoverCardProps) {
  // D74: the social discover card is now the SHARED discover card (the same one
  // the marketing /trending uses) — one source, both apps. The data seam (wapi
  // readComments / createComment) is injected; onAuthorClick navigates in-app.
  // The board takes live reactions (the interactive like/dislike pair) — the
  // same way of reacting as the feed (post-actions.md) — and the repost
  // (reposts.md, independent of like).
  return (
    <SharedDiscoverCard
      post={postRecordToDiscoverPost(post, mediaItems, authorName)}
      rank={rank}
      maxScore={maxScore}
      authorAvatar={authorAvatar}
      onAuthorClick={onAuthorClick}
      onCommentAuthorClick={onCommentAuthorClick}
      liked={liked}
      disliked={disliked}
      reposted={reposted}
      onToggleReaction={onToggleReaction}
      onToggleRepost={onToggleRepost}
      readComments={readThreadComments}
      readReplies={readThreadReplies}
      createComment={discoverCreateComment}
      // The attached-ad renderer (ad-improvements.md): each attached ad renders
      // per its format (inline AdBlock / full PostAdCard). The shared card is
      // presentational, so the app injects its ad components here.
      renderAd={(ad) => <AttachedAd ad={ad as unknown as AdRecord} />}
      testId="discover-card"
      // A full-width 9:16 box is ~1.78× the card tall — too big on desktop,
      // and it buries the control rack at its bottom. Cap the portrait frame
      // (centered in a black letterbox), consistent with the marketing
      // /trending card. Landscape is unaffected (only portrait is capped).
      videoMaxWidth="min(50vh, 100%)"
    />

  );
}

function DiscoverSkeleton() {
  return (
    <div
      data-testid="discover-skeleton"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-5/6" />
          </div>
        </div>
        <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-md">
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

// ── View toggle (D-trending-views bite b: Discover parity) ──────────────────

type DiscoverView = 'grid' | 'youtube';

// ── Subtabs (discover-reorg.md D1) ──────────────────────────────────────────
// Discover is the discovery surface: Posts | People | Groups. The active
// subtab is URL state (?tab=; posts is the bare URL) so it is refresh-safe and
// shareable. The shell owns ?q= and passes it to the active subtab — the
// subtabs have no search field of their own (search is the top bar, S1/S2).
// People/Groups are designed placeholders until D2/D3 land the real browsers.

type DiscoverTab = 'posts' | 'people' | 'groups';

const DISCOVER_TABS: { id: DiscoverTab; label: string; icon: typeof Flame }[] = [
  { id: 'posts', label: 'Posts', icon: Flame },
  { id: 'people', label: 'People', icon: Users },
  { id: 'groups', label: 'Groups', icon: Layers },
];

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

// ── YouTubeCard (Discover parity with marketing-ui YouTubeCard) ─────────────

interface DiscoverYouTubeCardProps {
  post: PostRecord;
  rank: number;
  authorName: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  onAuthorClick: () => void;
  /** A comment's author is a tappable profile link (in-app navigation). */
  onCommentAuthorClick?: (username: string, provider?: string) => void;
}

function DiscoverYouTubeCard({
  post,
  rank,
  authorName,
  authorAvatar,
  mediaItems,
  onAuthorClick,
  onCommentAuthorClick,
}: DiscoverYouTubeCardProps) {
  // D74: the social video-view card is now the SHARED discover card (the same
  // one the marketing /trending youtube view uses) — one source, both apps.
  // The video view is videos-only (competing with YouTube).
  return (
    <SharedDiscoverCard
      post={postRecordToDiscoverPost(post, mediaItems, authorName)}
      rank={rank}
      maxScore={1}
      authorAvatar={authorAvatar}
      onAuthorClick={onAuthorClick}
      onCommentAuthorClick={onCommentAuthorClick}
      readComments={readThreadComments}
      readReplies={readThreadReplies}
      createComment={discoverCreateComment}
      testId="discover-youtube-card"
      // Same portrait cap as the board card (a 9:16 clip in the video view is
      // too big on desktop + buries the rack). Landscape is unaffected.
      videoMaxWidth="min(50vh, 100%)"
    />
  );
}

function DiscoverYouTubeSkeleton() {
  return (
    <div data-testid="discover-youtube-skeleton">
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

// ── YouTube empty state ────────────────────────────────────────────────────

function DiscoverYouTubeEmptyState({ onSwitchToGrid }: { onSwitchToGrid: () => void }) {
  return (
    <div
      data-testid="discover-youtube-empty"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50 mb-4">
        <Video className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">
        No videos yet
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        The video view shows trending video posts.
        Switch to Hot Gossip to see all trending posts.
      </p>
      <Button
        variant="outline"
        size="sm"
        data-testid="discover-youtube-empty-cta"
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

export default function DiscoverScreen() {
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

  // Deep-link: active tag from ?tag= (refresh-safe, shareable)
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTag = searchParams.get('tag') || '';
  const [activeTag, setActiveTag] = useState<string>(urlTag || 'All');

  // Deep-link: search query from ?q= (refresh-safe, shareable)
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState<string>(urlQuery);

  // Deep-link: view toggle from ?view= (refresh-safe, shareable)
  const [view, setView] = useState<DiscoverView>(() => {
    return (searchParams.get('view') as DiscoverView) || 'grid';
  });

  const setViewUrl = useCallback((v: DiscoverView) => {
    setView(v);
    const params = new URLSearchParams(searchParams);
    if (v === 'youtube') {
      params.set('view', 'youtube');
    } else {
      params.delete('view');
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

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

  // Sync view with ?view= search param
  useEffect(() => {
    const current = (searchParams.get('view') as DiscoverView) || 'grid';
    if (view !== current) {
      setView(current);
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

  // Deep-link: active subtab from ?tab= (discover-reorg.md D1). posts is the
  // bare URL — the param is only written for people/groups, so an unknown or
  // missing value falls back to posts.
  const urlTab = searchParams.get('tab');
  const tab: DiscoverTab = urlTab === 'people' || urlTab === 'groups' ? urlTab : 'posts';

  const setTabUrl = useCallback((next: DiscoverTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'posts') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params);
    LOG('subtab —', next);
  }, [searchParams, setSearchParams]);

  const loadDiscover = useCallback(async (sort: PowerMeanSortConfig | null = null) => {
    // `loading` is the INITIAL skeleton only — a knob-triggered re-read keeps
    // the previous grid on screen (no skeleton flash per twist).
    if (!hasLoadedRef.current) setLoading(true);
    LOG('loadDiscover — start, sort:', sort ? JSON.stringify(sort) : '(chronological)');
    try {
      // The node ranks the board (the D36 power-mean sort, server-side) — a
      // knob twist is a re-read, not a client-side shuffle of the same 50.
      const results = await readDiscoverFeed(sort, 50);
      LOG('loadDiscover — got', results.length, 'posts');

      const token = getWapi().readToken();

      // Engagement counts (the ref pattern): one read of the reactions +
      // comments collections over the discover group, counted client-side by
      // ref_value (the target post's doc_id) — the same pattern the marketing
      // trending page runs. Without this the knobs only ever see recency.
      if (token) {
        try {
          const w = getV3Client();
          const discoverId = getDiscoverGroupId();
          const [reactionDocs, commentDocs] = await Promise.all([
            w.read('reactions', { groups: [discoverId], limit: 500 }),
            w.read('comments', { groups: [discoverId], limit: 500 }),
          ]);
          const likesByPost: Record<string, number> = {};
          const dislikesByPost: Record<string, number> = {};
          const repostsByPost: Record<string, number> = {};
          const commentsByPost: Record<string, number> = {};
          // The reader's own reaction per post (v3 ownership is by username
          // alone — the reaction's author_key is the bare username, the
          // provider implicit, so match on username, not provider).
          const likedByPost: Record<string, boolean> = {};
          const dislikedByPost: Record<string, boolean> = {};
          const repostedByPost: Record<string, boolean> = {};
          for (const d of reactionDocs) {
            if (d.ref_value) {
              // Each reaction type is counted separately (the heart, the thumb,
              // and the repeat icon each show their own tally — post-actions.md /
              // reposts.md). The old `else likesByPost` branch counted reposts
              // as likes; now each type has its own tally.
              const type = (d.body as Record<string, unknown>)?.type as string | undefined;
              if (type === 'like') likesByPost[d.ref_value] = (likesByPost[d.ref_value] || 0) + 1;
              else if (type === 'dislike') dislikesByPost[d.ref_value] = (dislikesByPost[d.ref_value] || 0) + 1;
              else if (type === 'repost') repostsByPost[d.ref_value] = (repostsByPost[d.ref_value] || 0) + 1;
              if (extractUsername(d.author_key) === token.username) {
                if (type === 'like') likedByPost[d.ref_value] = true;
                else if (type === 'dislike') dislikedByPost[d.ref_value] = true;
                else if (type === 'repost') repostedByPost[d.ref_value] = true;
              }
            }
          }
          for (const d of commentDocs) {
            if (d.ref_value) commentsByPost[d.ref_value] = (commentsByPost[d.ref_value] || 0) + 1;
          }
          for (const p of results) {
            p.likes = likesByPost[p._id || ''] || 0;
            p.dislikes = dislikesByPost[p._id || ''] || 0;
            p.reposts = repostsByPost[p._id || ''] || 0;
            p.comments = commentsByPost[p._id || ''] || 0;
          }
          setLikedMap(likedByPost);
          setDislikedMap(dislikedByPost);
          setRepostedMap(repostedByPost);
          LOG(
            'engagement — counted',
            Object.values(likesByPost).reduce((a, b) => a + b, 0), 'reactions +',
            Object.values(commentsByPost).reduce((a, b) => a + b, 0), 'comments',
          );
        } catch (e) {
          LOG('engagement — failed (degrading to zero counts):', e);
        }
      }

      setPosts(results);
      hasLoadedRef.current = true;

      if (!token) {
        setLoading(false);
        return;
      }

      // Resolve profiles for authors
      const profiles: Record<string, ProfileRecord> = {};
      for (const post of results) {
        const key = `${post.author_username}@${post.author_provider}`;
        if (profiles[key]) continue;
        try {
          const profile = post.author_username === token.username
            ? await readProfile()
            : await readUserProfile(post.author_username || '');
          if (profile) profiles[key] = profile;
        } catch {
          // Profile not available — use author name
        }
      }
      setProfileMap(profiles);

      // Resolve media for posts that have media
      const postsWithMedia = results.filter(p => p.media_refs?.length);
      if (postsWithMedia.length) {
        try {
          const byAuthor = new Map<string, { posts: typeof postsWithMedia; refs: (string | ResolvedMediaRef)[] }>();
          for (const p of postsWithMedia) {
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
            // Dedupe by doc_id, keeping the original ref shape (resolved
            // objects carry the cross-user read_url; strings are doc_ids).
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
                mMap[p._id || ''] = media.filter(m => postRefIds.has(m._id || ''));
              }
            }
          }
          if (Object.keys(mMap).length) {
            setMediaMap(mMap);
          }
        } catch {
          // Media resolution failed — degrade gracefully
        }
      }
    } catch (e) {
      LOG('loadDiscover — failed:', e);
      // A failed re-read (a knob twist) keeps the previous grid on screen —
      // only a cold-start failure shows the empty state.
      if (!hasLoadedRef.current) setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Repost (reposts.md): independent of like/dislike. Optimistic update of the
  // reader's own repost flag + the post's repost count, rollback on error. The
  // data layer (toggleRepost) enforces one-repost-per-user + self-heal.
  async function handleToggleRepost(postId: string) {
    const token = getWapi().readToken();
    if (!token) return;
    const wasReposted = !!repostedMap[postId];
    const nextReposted = !wasReposted;
    const delta = nextReposted ? 1 : -1;
    setRepostedMap((prev) => ({ ...prev, [postId]: nextReposted }));
    setPosts((prev) =>
      prev.map((p) =>
        p._id === postId
          ? { ...p, reposts: Math.max(0, (p.reposts || 0) + delta) }
          : p,
      ),
    );
    try {
      await toggleRepost(postId);
    } catch (e) {
      console.error('Failed to toggle repost:', e);
      toast.error(errorMessage(e, 'Could not update your repost.'));
      setRepostedMap((prev) => ({ ...prev, [postId]: wasReposted }));
      setPosts((prev) =>
        prev.map((p) =>
          p._id === postId
            ? { ...p, reposts: Math.max(0, (p.reposts || 0) - delta) }
            : p,
        ),
      );
    }
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
  // The heat glow still needs a per-post score, so it's computed for DISPLAY
  // only (the fixed character — the knob is gone); it never affects order.
  const scoredPosts = useMemo(() => {
    return posts.map(p => ({
      ...p,
      score: scorePost(postToSignals(p), { ...knobState, character: FIXED_CHARACTER_DETEENT }),
    }));
  }, [posts, knobState]);

  const maxScore = useMemo(
    () => Math.max(1, ...scoredPosts.map(p => p.score ?? 0)),
    [scoredPosts],
  );

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

  // YouTube view: media posts only (video + image)
  const mediaPosts = useMemo(
    () => visiblePosts.filter(p => postHasVideo(p)),
    [visiblePosts],
  );

  const isInitialLoad = loading && posts.length === 0;

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchQuery(val);
    const params = new URLSearchParams(searchParams);
    if (val.trim()) {
      params.set('q', val.trim());
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  }

  function handleSearchClear() {
    setSearchQuery('');
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="md:max-w-xl md:mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md md:static md:bg-transparent md:mb-4">
        <div className="flex items-center justify-between px-4 py-3 md:px-0 gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Compass className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
            <h1 className="font-display text-lg font-bold text-foreground">Discover</h1>
          </div>
          {tab === 'posts' && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search posts…"
                data-testid="discover-search"
                className="w-full h-8 pl-8 pr-7 rounded-full border border-input bg-surface text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleSearchClear}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-elevated transition-colors duration-150"
                  aria-label="Clear search"
                  data-testid="discover-search-clear"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Subtabs: Posts | People | Groups (?tab=, posts is the bare URL) */}
      <div className="border-b border-border bg-surface/50" data-testid="discover-tab-row">
        <div className="px-4 md:px-0">
          <div className="flex items-center gap-1 py-1.5" role="tablist" aria-label="Discover sections">
            {DISCOVER_TABS.map(({ id, label, icon: TabIcon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-testid={`discover-tab-${id}`}
                onClick={() => setTabUrl(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  tab === id
                    ? 'bg-brand-muted text-brand-300'
                    : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                )}
              >
                <TabIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'posts' ? (
        <>
          {/* Controls: presets + knobs */}
          <div className="px-4 py-3 md:px-0">
            <KnobRack
              state={knobState}
              activePreset={activePreset}
              onChange={handleKnobChange}
              onPreset={handlePreset}
            />
          </div>

          {/* Topic filter chips */}
          {topics.length > 1 && (
            <div className="px-4 py-3 md:px-0">
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

          {/* View toggle — YouTube-style, below topics */}
          {!isInitialLoad && posts.length > 0 && (
            <div className="border-b border-border bg-surface/50">
              <div className="px-4 md:px-0">
                <div className="flex items-center gap-1 py-2" data-testid="discover-view-toggle">
                  {([
                    ['grid', 'Hot Gossip', Flame],
                    ['youtube', 'Video', Video],
                  ] as [DiscoverView, string, typeof Flame][]).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setViewUrl(v)}
                      data-testid={`discover-view-toggle-${v}`}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        view === v
                          ? 'bg-brand-muted text-brand-300'
                          : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 px-4 py-4 md:px-0">
            {isInitialLoad ? (
              <div className="grid grid-cols-1 gap-4" data-testid="discover-grid-skeleton">
                {Array.from({ length: 4 }).map((_, i) => (
                  <DiscoverSkeleton key={i} />
                ))}
              </div>
            ) : view === 'youtube' ? (
              /* YouTube view — media posts only, 16:9 thumbnails */
              mediaPosts.length > 0 ? (
                <div className="grid grid-cols-1 gap-6" data-testid="discover-youtube-grid">
                  {mediaPosts.map((post, i) => {
                    const authorKey = `${post.author_username}@${post.author_provider}`;
                    const profile = profileMap[authorKey];
                    const mediaItems = mediaMap[post._id || ''] || [];
                    const authorName = profile?.display_name || (post.author_username || '').replace(/[-_]/g, ' ');

                    return (
                      <DiscoverYouTubeCard
                        key={post._id || post.created_at}
                        post={post}
                        rank={i + 1}
                        authorName={authorName}
                        authorAvatar={
                          profile?.avatar_ref
                            ? mediaItems.find(m => m._id === profile.avatar_ref)?.url
                            : undefined
                        }
                        mediaItems={mediaItems}
                        onAuthorClick={() => navigateToUserProfile(post.author_username || '', post.author_provider || '')}
                        onCommentAuthorClick={(username, provider) => navigateToUserProfile(username, provider || '')}
                      />
                    );
                  })}
                </div>
              ) : (
                <DiscoverYouTubeEmptyState onSwitchToGrid={() => setViewUrl('grid')} />
              )
            ) : visiblePosts.length > 0 ? (
              <div className="grid grid-cols-1 gap-4" data-testid="discover-grid">
                {visiblePosts.map((post, i) => {
                  const authorKey = `${post.author_username}@${post.author_provider}`;
                  const profile = profileMap[authorKey];
                  const mediaItems = mediaMap[post._id || ''] || [];
                  const authorName = profile?.display_name || (post.author_username || '').replace(/[-_]/g, ' ');

                  return (
                    <DiscoverCard
                      key={post._id || post.created_at}
                      post={post}
                      rank={i + 1}
                      maxScore={maxScore}
                      authorName={authorName}
                      authorAvatar={
                        profile?.avatar_ref
                          ? mediaItems.find(m => m._id === profile.avatar_ref)?.url
                          : undefined
                      }
                      mediaItems={mediaItems}
                      onAuthorClick={() => navigateToUserProfile(post.author_username || '', post.author_provider || '')}
                      onCommentAuthorClick={(username, provider) => navigateToUserProfile(username, provider || '')}
                      liked={!!likedMap[post._id || '']}
                      disliked={!!dislikedMap[post._id || '']}
                      reposted={!!repostedMap[post._id || '']}
                      onToggleReaction={(kind) => handleToggleReaction(post._id || '', kind)}
                      onToggleRepost={() => handleToggleRepost(post._id || '')}
                    />              );
                })}
              </div>
            ) : (
              <DiscoverEmptyState />
            )}
          </div>
        </>
      ) : tab === 'people' ? (
        <DiscoverPeopleTab query={urlQuery} />
      ) : (
        <DiscoverGroupsTab query={urlQuery} />
      )}
      </div>
    </div>
  );
}