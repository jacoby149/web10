import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { ArrowUpRight, MessageCircleOff } from 'lucide-react';
import {
  TrendingCard,
  TrendingSkeleton,
  YouTubeSkeleton,
  fetchDiscoverFeed,
  searchDiscoverPosts,
  mapDiscoveryToFeedPost,
  feedPostToDiscover,
  parseCreatedAt,
  type FeedPost,
  type ResolvedMediaRef,
} from '@/components/FeedPreview';
import { HomeCard } from '@web10/discover';
import { TrendingSidebar } from '@/components/TrendingSidebar';
import { KnobRack } from '@/components/KnobRack';
import { SearchBar } from '@/components/SearchBar';
import { ProfilesBrowser } from '@/components/ProfilesBrowser';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SOCIAL_ORIGIN } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';
import {
  defaultKnobState,
  encodeMix,
  decodeMix,
  getPreset,
  rankPosts,
  PRESETS,
  type KnobState,
  type PresetId,
  type PostSignals,
} from '@/lib/powerMean';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'https://api.web10.app';
const INITIAL_PAGE = 20;
const PAGE_STEP = 20;
const MAX_RESULTS = 100;

// ── The four destinations (the Discover split, watch-page.md) ────────────────
// The old /trending salad (a `Trending | People` tab row PLUS a `Home | Hot
// Gossip` view toggle — three levels of "which list am I looking at" in one
// screen) retires. Each destination is a flat route the experience sidebar
// owns (ExperienceShell): **Video** (the video wall, the index route) ·
// **Shorts** (the vertical lens) · **Hot Gossip** (the ranked post board) ·
// **People** (the people + groups browser). The `?view=` toggle + the `?tab=`
// row are gone; legacy URLs redirect to the matching destination (carrying
// `?q=` / `?tag=`). The destination is set by the ROUTE, not a query param —
// the same rule the social app's split uses.
type ExperienceDest = 'video' | 'shorts' | 'hot-gossip' | 'people';

function destFromPath(pathname: string): ExperienceDest {
  if (pathname.startsWith('/trending/shorts')) return 'shorts';
  if (pathname.startsWith('/trending/hot-gossip')) return 'hot-gossip';
  if (pathname.startsWith('/trending/people')) return 'people';
  return 'video'; // `/trending` (the index)
}

// The social app's `?knobs=` encoding (DiscoverScreen): the five detent
// indices, comma-joined (recency,likes,comments,halfLife,character). The
// Video wall's link-out carries the ranking the visitor had ("keep you in
// the same feed settings").
const KNOB_KEYS: (keyof KnobState)[] = ['recency', 'likes', 'comments', 'halfLife', 'character'];
function encodeKnobs(state: KnobState): string {
  return KNOB_KEYS.map((k) => String(state[k])).join(',');
}

// The 1:1 link-out (watch-page.md): the marketing site is the anon preview;
// clicking an item link-outs to web10-social at the MATCHING destination.
// The destination is set by the tab you're in, not the content type.
//   Video      → the watch page (landscape) or the Shorts lens (portrait) —
//                the aspect-ratio gate, the same signal the social app's
//                Home card click uses (`width < height` on the resolved media).
//   Shorts     → the Shorts lens.
//   Hot Gossip → the Hot Gossip board, scrolled to + highlighting that post
//                (`?post=` — the Threads equivalent of the watch page: the
//                post is a full card in the stream, NOT a profile, NOT a
//                detail page).
//   People     → the person's profile (the People destination).

function firstMedia(post: FeedPost): ResolvedMediaRef | undefined {
  return post.mediaRefs?.find((r): r is ResolvedMediaRef => typeof r === 'object' && !!r.read_url);
}

function isPortraitVideo(post: FeedPost): boolean {
  const m = firstMedia(post);
  return (
    !!m &&
    (m.mime_type || '').startsWith('video/') &&
    !!m.width &&
    !!m.height &&
    m.width < m.height
  );
}

function videoPostHref(post: FeedPost, knobState: KnobState): string {
  if (!post.author) return SOCIAL_ORIGIN;
  if (isPortraitVideo(post)) {
    return `${SOCIAL_ORIGIN}/shorts/${encodeURIComponent(post.id)}`;
  }
  const knobs = encodeKnobs(knobState);
  return `${SOCIAL_ORIGIN}/watch/${encodeURIComponent(post.id)}?from=discover&knobs=${knobs}`;
}

function shortsPostHref(post: FeedPost): string {
  if (!post.author) return SOCIAL_ORIGIN;
  return `${SOCIAL_ORIGIN}/shorts/${encodeURIComponent(post.id)}`;
}

function gossipPostHref(post: FeedPost): string {
  if (!post.author) return SOCIAL_ORIGIN;
  return `${SOCIAL_ORIGIN}/hot-gossip?post=${encodeURIComponent(post.id)}`;
}

function authorProfileHref(post: FeedPost): string {
  if (!post.author) return SOCIAL_ORIGIN;
  return `${SOCIAL_ORIGIN}/u/${encodeURIComponent(post.author)}`;
}

// ── Matching users row (search's people results) ─────────────────────────────

interface DiscoverUser {
  username: string;
  post_count: number;
  engagement_score: number;
  followers_count: number;
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

async function fetchDiscoverUsers(limit = 20): Promise<DiscoverUser[]> {
  // M1: the real D0 read (the anon public people directory). One round-trip:
  // the node composes list_users + the I3 gate + profile faces + follower
  // counts.
  const resp = await fetch(`${API_ORIGIN}/v3/users/directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, offset: 0 }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.users || []).map((u: { username: string; follower_count: number }) => ({
    username: u.username,
    post_count: 0,
    engagement_score: 0,
    followers_count: u.follower_count,
  }));
}

function formatFollowers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function MatchingUsersRow({ users, query }: { users: DiscoverUser[]; query: string }) {
  if (users.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        People
      </p>
      <div className="flex flex-wrap gap-3">
        {users.slice(0, 6).map(u => {
          const name = u.username.replace(/[-_]/g, ' ');
          const initial = u.username.charAt(0).toUpperCase();
          const color = hashToColor(u.username);
          return (
            <a
              key={u.username}
              href={`${SOCIAL_ORIGIN}/u/${u.username}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2.5 transition-colors duration-150 ease-out hover:border-border/80 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Avatar className={color}>
                <AvatarFallback className="text-foreground">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFollowers(u.followers_count)} followers
                </p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

interface RankedPost extends FeedPost {
  rank: number;
  featured: boolean;
}

// The marketing search (the social app's `searchPosts` shape, mirrored): the
// discover board's pool, filtered client-side. The node has no multi-entity
// search endpoint (the documented v1 floor — global-search.md), so the board
// read + the client filter IS the search.
async function fetchSearchResults(query: string, limit = 50): Promise<FeedPost[]> {
  console.log('[trending] search —', query);
  const results = await searchDiscoverPosts(query, limit);
  console.log('[trending] search —', query, '→', results.length, 'result(s)');
  return results;
}

function buildTopic(allTags: string[]): string[] {
  const unique = Array.from(new Set(allTags)).sort();
  return unique.slice(0, 12);
}

function postToSignals(post: FeedPost): PostSignals {
  return {
    ageMs: Math.max(0, Date.now() - parseCreatedAt(post.createdAt)),
    likes: post.likesCount,
    comments: post.commentsCount,
    reposts: post.repostsCount,
  };
}

// The preset whose state matches exactly, or null (a custom tuning). The
// mix-code hash carries the knob state, not the preset id — so on a
// hashchange round-trip (a preset click writes #mix=..., the browser fires
// hashchange, we re-read) we must match the decoded state back to its preset,
// or the just-clicked chip's highlight is clobbered (activePreset → null).
function presetIdForState(state: KnobState): PresetId | null {
  const match = PRESETS.find(
    p =>
      p.state.recency === state.recency &&
      p.state.likes === state.likes &&
      p.state.comments === state.comments &&
      p.state.halfLife === state.halfLife &&
      p.state.character === state.character,
  );
  return match ? match.id : null;
}

function readMixFromHash(): { state: KnobState; preset: PresetId | null } {
  const hash = window.location.hash.slice(1);
  const match = hash.match(/^mix=(\d{5})/);
  if (match) {
    const state = decodeMix(match[1]);
    if (state) {
      return { state, preset: presetIdForState(state) };
    }
  }
  return { state: defaultKnobState(), preset: 'balanced' };
}

function writeMixToHash(state: KnobState) {
  const code = encodeMix(state);
  window.location.hash = `mix=${code}`;
}

function Trending() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dest = destFromPath(pathname);

  const [allPosts, setAllPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [limit, setLimit] = useState(INITIAL_PAGE);
  const [hasMore, setHasMore] = useState(true);
  const [topic, setTopic] = useState<string>('All');
  const [knobState, setKnobState] = useState<KnobState>(() => readMixFromHash().state);
  const [activePreset, setActivePreset] = useState<PresetId | null>(
    () => readMixFromHash().preset,
  );
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  // ── The URL is the state (the deep-link rule) ──────────────────────────────
  // One useSearchParams for the whole screen: the legacy-redirect check, the
  // search query (?q=), and the People destination's query chip all read it.
  const [searchParams, setSearchParams] = useSearchParams();

  // Search state — the query is URL-driven (?q=), the single source of truth
  // (the deep-link rule; the social Discover holds its query the same way).
  // The People destination's query chip (with its X) clears ?q= from the URL,
  // so a state-only query would make that X a no-op.
  const searchQuery = searchParams.get('q') ?? '';
  const [searchResults, setSearchResults] = useState<FeedPost[]>([]);
  const [searchUsers, setSearchUsers] = useState<DiscoverUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Write ?q= into the URL (replace — no history spam while typing).
  const setSearchQuery = useCallback((value: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (value) params.set('q', value);
        else params.delete('q');
        return params;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const loadFeed = useCallback(async (nextLimit: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const [trendingResults, recentResults] = await Promise.all([
        fetchDiscoverFeed('trending', nextLimit),
        fetchDiscoverFeed('recent', nextLimit),
      ]);
      const all = [...trendingResults];
      const seen = new Set(all.map(p => p.post_id));
      for (const p of recentResults) {
        if (!seen.has(p.post_id)) {
          all.push(p);
          seen.add(p.post_id);
        }
      }
      const posts = all.map(mapDiscoveryToFeedPost);
      setAllPosts(posts);
      setHasMore(posts.length === nextLimit && nextLimit < MAX_RESULTS);
    } catch {
      setAllPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // The board read powers Video + Shorts + Hot Gossip (the People destination
  // has its own reads — ProfilesBrowser — and skips the board).
  useEffect(() => {
    if (dest === 'people') return;
    loadFeed(INITIAL_PAGE, false);
    trackFunnel('trending_view', { dest });
  }, [loadFeed, dest]);

  // Auto-focus search when navigated from nav (?focus=search)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('focus') === 'search') {
      searchInputRef.current?.focus();
      // Clean up the param so refresh doesn't re-focus
      params.delete('focus');
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      const { state, preset } = readMixFromHash();
      setKnobState(state);
      setActivePreset(preset);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Debounced search
  const doSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchUsers([]);
      setSearchSearched(false);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchSearched(true);
    setSearchError(null);
    trackFunnel('trending_search', { query: trimmed.startsWith('#') ? 'tag' : 'text' });
    try {
      const cleaned = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
      const [posts, users] = await Promise.all([
        fetchSearchResults(cleaned),
        fetchDiscoverUsers(6),
      ]);
      setSearchResults(posts);
      // Filter users by query match on username
      const filteredUsers = cleaned.includes('#')
        ? users
        : users.filter(u =>
            u.username.toLowerCase().includes(cleaned.toLowerCase()),
          );
      setSearchUsers(filteredUsers);
    } catch (err) {
      setSearchResults([]);
      setSearchUsers([]);
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // The query is URL-driven (?q=), so EVERY change — typing in the field, the
  // People destination's query-chip X, a topic chip, a deep link — flows
  // through this one debounced effect. (The chip's X rewrites ?q= via
  // react-router; a state-only query would make it a no-op.)
  useEffect(() => {
    const t = setTimeout(() => doSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, doSearch]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
    },
    [setSearchQuery],
  );

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  // When a topic chip is clicked during search, filter search results by tag
  // When not searching, the topic chip already filters the board via setTopic
  const handleTopicClick = useCallback(
    (t: string) => {
      setTopic(t);
      if (searchSearched && t !== 'All') {
        // If searching and a tag is selected, add it to the search query
        // (the ?q= effect runs the search).
        setSearchQuery(`#${t}`);
      } else if (searchSearched && t === 'All') {
        // Clear search tag filter when "All" is clicked during search
        handleSearchClear();
      }
    },
    [searchSearched, setSearchQuery, handleSearchClear],
  );

  const maxScore = useMemo(
    () => Math.max(1, ...allPosts.map(p => p.engagementScore ?? 0)),
    [allPosts],
  );

  const topics = useMemo(
    () => ['All', ...buildTopic(allPosts.flatMap(p => p.tags ?? []))],
    [allPosts],
  );

  const ranked: RankedPost[] = useMemo(() => {
    const sorted = rankPosts(allPosts, postToSignals, knobState);
    return sorted.map((post, i) => ({
      ...post,
      rank: i + 1,
      featured: i === 0,
    })) as RankedPost[];
  }, [allPosts, knobState]);

  const visible = useMemo(
    () => (topic === 'All' ? ranked : ranked.filter(p => p.tags?.includes(topic) ?? false)),
    [ranked, topic],
  );

  // Video wall: landscape videos only (the YouTube shape). Portrait videos are
  // shorts — they live in the Shorts destination (the TikTok shape), not here.
  // The aspect-ratio split keeps the two from bleeding into each other.
  const videoPosts = useMemo(
    () => {
      const landscapeOnly = visible.filter(p => p.media === 'video' && !isPortraitVideo(p));
      return topic === 'All' ? landscapeOnly : landscapeOnly.filter(p => p.tags?.includes(topic) ?? false);
    },
    [visible, topic],
  );

  // Shorts wall: the vertical videos (the 9:16 gate, re-derived from the
  // resolved media — the same signal the social Shorts lens uses). Derived from
  // `visible`, not `videoPosts` — the Video wall is landscape-only, so the
  // portrait shorts live here, not there.
  const shortsPosts = useMemo(
    () => visible.filter(p => p.media === 'video' && isPortraitVideo(p)),
    [visible],
  );

  const maxSearchScore = useMemo(
    () => Math.max(1, ...searchResults.map(p => p.engagementScore ?? 0)),
    [searchResults],
  );

  const rankedSearchResults: RankedPost[] = useMemo(() => {
    if (!searchSearched || searchResults.length === 0) return [];
    const sorted = rankPosts(searchResults, postToSignals, knobState);
    return sorted.map((post, i) => ({
      ...post,
      rank: i + 1,
      featured: i === 0,
    })) as RankedPost[];
  }, [searchResults, searchSearched, knobState]);

  const visibleSearchResults = useMemo(
    () =>
      topic === 'All'
        ? rankedSearchResults
        : rankedSearchResults.filter(p => p.tags?.includes(topic) ?? false),
    [rankedSearchResults, topic],
  );

  const handleKnobChange = useCallback((key: keyof KnobState, value: number) => {
    setKnobState(prev => {
      const next = { ...prev, [key]: value };
      writeMixToHash(next);
      setActivePreset(null);
      return next;
    });
  }, []);

  const handlePreset = useCallback((id: PresetId) => {
    const preset = getPreset(id);
    if (!preset) return;
    setKnobState(preset.state);
    setActivePreset(id);
    writeMixToHash(preset.state);
    trackFunnel('trending_preset', { preset: id });
  }, []);

  const scrollToCard = useCallback((postId: string) => {
    const el = cardRefs.current.get(postId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      (el as HTMLElement).focus?.();
    }
  }, []);

  const registerCard = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const handleReaction = (type: 'like' | 'repost', postId: string) => {
    trackFunnel(type === 'like' ? 'trending_like_attempt' : 'trending_repost_attempt');
    const post = allPosts.find(p => p.id === postId) || searchResults.find(p => p.id === postId);
    if (post?.author) {
      window.open(`${SOCIAL_ORIGIN}/u/${encodeURIComponent(post.author)}/p/${encodeURIComponent(postId)}`, '_blank');
    } else {
      window.open(SOCIAL_ORIGIN, '_blank');
    }
  };

  const handleComment = (postId: string) => {
    trackFunnel('trending_comment_attempt');
    const post = allPosts.find(p => p.id === postId) || searchResults.find(p => p.id === postId);
    if (post?.author) {
      window.open(`${SOCIAL_ORIGIN}/u/${encodeURIComponent(post.author)}/p/${encodeURIComponent(postId)}`, '_blank');
    } else {
      window.open(SOCIAL_ORIGIN, '_blank');
    }
  };

  const handleLoadMore = () => {
    const next = Math.min(limit + PAGE_STEP, MAX_RESULTS);
    setLimit(next);
    trackFunnel('trending_load_more');
    loadFeed(next, true);
  };

  const isInitialLoad = loading && allPosts.length === 0;
  const isSearching = searchSearched;

  // ── Legacy redirects (the salad retires) — AFTER all the hooks (a
  //     conditional return between hook calls breaks the hook order). The old
  //     `?view=grid` (Hot Gossip) + `?tab=profiles|people|groups` (the People
  //     browser) map to the flat destinations, carrying `?q=` / `?tag=` over.
  const legacyView = searchParams.get('view');
  const legacyTab = searchParams.get('tab');
  if ((legacyView === 'grid' || legacyView === 'youtube') && dest === 'video') {
    const params = new URLSearchParams(searchParams);
    params.delete('view');
    const qs = params.toString();
    return <Navigate to={`/trending/hot-gossip${qs ? `?${qs}` : ''}`} replace />;
  }
  if (legacyTab && dest === 'video') {
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    const qs = params.toString();
    return <Navigate to={`/trending/people${qs ? `?${qs}` : ''}`} replace />;
  }

  // ── The People destination — the people + groups browser (the old `?tab=
  //     profiles` content). The search field above filters it live. ──────────
  if (dest === 'people') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <ControlBand
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearchClear={handleSearchClear}
          searchInputRef={searchInputRef}
        />
        <main className="flex-1 px-4 py-6 sm:px-6">
          <ProfilesBrowser query={searchQuery} />
        </main>
      </div>
    );
  }

  // ── The board destinations (Video · Shorts · Hot Gossip) ──────────────────
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ControlBand
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchClear={handleSearchClear}
        searchInputRef={searchInputRef}
      />

      {/* Knob Rack — only show when not searching */}
      {!isInitialLoad && allPosts.length > 0 && !isSearching && (
        <div className="px-4 pt-4 pb-2 sm:px-6">
          <KnobRack
            state={knobState}
            activePreset={activePreset}
            onChange={handleKnobChange}
            onPreset={handlePreset}
          />
        </div>
      )}

      {/* Topic filter — sticky, horizontal scroll */}
      <div
        data-testid="trending-topics"
        className="border-b border-border bg-background/95 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div
            className="flex gap-2 overflow-x-auto py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_left,transparent,black_40px)]"
            role="tablist"
            aria-label="Filter by topic"
          >
            {isInitialLoad
              ? Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="h-7 w-16 shrink-0 animate-pulse rounded-full bg-elevated" />
                ))
              : topics.map(t => {
                  const active = t === topic;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid="trending-topic"
                      onClick={() => handleTopicClick(t)}
                      className={[
                        'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        active
                          ? 'border-brand bg-brand-muted text-brand-300'
                          : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {t === 'All' ? 'All' : `#${t}`}
                    </button>
                  );
                })}
          </div>
        </div>
      </div>

      {/* Body — the destination's content. Hot Gossip keeps the Top 10 rail
          (a content rail, not the nav); Video + Shorts are full-width walls. */}
      <main className="flex-1 px-4 py-6 sm:px-6">
        <div className={`mx-auto flex ${dest === 'hot-gossip' && !isSearching ? 'max-w-7xl gap-8' : 'w-full'}`}>
          <div className="min-w-0 flex-1">
            {isSearching ? (
              /* Search results (all three board destinations share the shape) */
              searchLoading ? (
                <div
                  data-testid="trending-grid-skeleton"
                  className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4"
                >
                  <TrendingSkeleton featured />
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TrendingSkeleton key={i} />
                  ))}
                </div>
              ) : searchError ? (
                <div
                  data-testid="trending-search-error"
                  className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-danger/30 bg-danger-muted/50 px-6 py-16 text-center"
                >
                  <MessageCircleOff className="h-10 w-10 text-danger" strokeWidth={1.5} />
                  <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                    Search unavailable
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {searchError}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setSearchError(null); doSearch(searchQuery); }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={handleSearchClear}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <>
                  <MatchingUsersRow users={searchUsers} query={searchQuery} />
                  {visibleSearchResults.length > 0 ? (
                    <>
                      <p className="mb-4 text-sm text-muted-foreground">
                        {visibleSearchResults.length} result{visibleSearchResults.length !== 1 ? 's' : ''}
                        {topic !== 'All' ? ` for #${topic}` : ` for "${searchQuery.trim()}"`}
                      </p>
                      <div
                        data-testid="trending-grid"
                        className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4"
                      >
                        {visibleSearchResults.map(post => (
                          <TrendingCard
                            key={post.id}
                            post={post}
                            rank={post.rank}
                            featured={post.featured}
                            maxScore={maxSearchScore}
                            onLike={() => handleReaction('like', post.id)}
                            onComment={() => handleComment(post.id)}
                            onRepost={() => handleReaction('repost', post.id)}
                            cardRef={registerCard(post.id)}
                            postHref={gossipPostHref(post)}
                            authorHref={authorProfileHref(post)}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div
                      data-testid="trending-empty"
                      className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center"
                    >
                      <MessageCircleOff className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                      <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                        Nothing matches &ldquo;{searchQuery.trim()}&rdquo;
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Try a different term, or browse what&apos;s trending below.
                      </p>
                      <button
                        type="button"
                        onClick={handleSearchClear}
                        className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                </>
              )
            ) : isInitialLoad ? (
              <div
                data-testid="trending-grid-skeleton"
                className={`grid w-full gap-x-4 gap-y-6 ${dest === 'shorts' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <YouTubeSkeleton key={i} portrait={dest === 'shorts'} />
                ))}
              </div>
            ) : dest === 'video' ? (
              /* Video — the YouTube-style video wall (16:9 thumbnails, title +
                 author attribution). Videos only. The 1:1 link-out: a
                 landscape tile → the watch page (carrying the knobs), a
                 portrait tile → the Shorts lens (the aspect-ratio gate). */
              <>
                {videoPosts.length > 0 ? (
                  <>
                    <div
                      data-testid="trending-home-grid"
                      className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {videoPosts.map(post => (
                        <HomeCard
                          key={post.id}
                          post={feedPostToDiscover(post)}
                          remote
                          postHref={videoPostHref(post, knobState)}
                          authorHref={authorProfileHref(post)}
                          testId="home-card"
                        />
                      ))}
                    </div>
                    {loadingMore && (
                      <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <YouTubeSkeleton key={`home-more-${i}`} />
                        ))}
                      </div>
                    )}
                    {hasMore && !loadingMore && (
                      <div className="mt-8 flex justify-center">
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          data-testid="trending-load-more"
                          className="rounded-full border border-brand bg-brand-muted px-6 py-2.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          Load more
                        </button>
                      </div>
                    )}
                    {!hasMore && allPosts.length > 0 && (
                      <p className="mt-8 text-center text-sm text-muted-foreground">
                        That&apos;s all trending media right now.
                      </p>
                    )}
                  </>
                ) : (
                  <EmptyBoard
                    title="No media posts yet"
                    body="The Video wall shows posts with videos."
                    ctaLabel="Switch to Hot Gossip"
                    ctaHref="/trending/hot-gossip"
                  />
                )}
              </>
            ) : dest === 'shorts' ? (
              /* Shorts — the vertical lens's wall (9:16 tiles). The 1:1
                 link-out: every tile → the Shorts lens on web10 social. */
              <>
                {shortsPosts.length > 0 ? (
                  <>
                    <div
                      data-testid="trending-shorts-grid"
                      className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4"
                    >
                      {shortsPosts.map(post => (
                        <HomeCard
                          key={post.id}
                          post={feedPostToDiscover(post)}
                          remote
                          frame="portrait"
                          postHref={shortsPostHref(post)}
                          authorHref={authorProfileHref(post)}
                          testId="shorts-card"
                        />
                      ))}
                    </div>
                    {loadingMore && (
                      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <YouTubeSkeleton key={`shorts-more-${i}`} portrait />
                        ))}
                      </div>
                    )}
                    {hasMore && !loadingMore && (
                      <div className="mt-8 flex justify-center">
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          data-testid="trending-load-more"
                          className="rounded-full border border-brand bg-brand-muted px-6 py-2.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          Load more
                        </button>
                      </div>
                    )}
                    {!hasMore && allPosts.length > 0 && (
                      <p className="mt-8 text-center text-sm text-muted-foreground">
                        That&apos;s all trending shorts right now.
                      </p>
                    )}
                  </>
                ) : (
                  <EmptyBoard
                    title="No shorts yet"
                    body="The Shorts wall shows vertical (9:16) videos."
                    ctaLabel="Switch to Video"
                    ctaHref="/trending"
                  />
                )}
              </>
            ) : visible.length > 0 ? (
              /* Hot Gossip — the ranked post board (the Threads shape). The
                 1:1 link-out: a post → the Hot Gossip board on web10 social,
                 scrolled to + highlighting that post (`?post=`). */
              <>
                <div
                  data-testid="trending-grid"
                  className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4"
                >
                  {visible.map(post => (
                    <TrendingCard
                      key={post.id}
                      post={post}
                      rank={post.rank}
                      featured={post.featured}
                      maxScore={maxScore}
                      onLike={() => handleReaction('like', post.id)}
                      onComment={() => handleComment(post.id)}
                      onRepost={() => handleReaction('repost', post.id)}
                      cardRef={registerCard(post.id)}
                      postHref={gossipPostHref(post)}
                      authorHref={authorProfileHref(post)}
                    />
                  ))}
                </div>
                {loadingMore && (
                  <div className="mx-auto mt-4 grid w-full max-w-2xl grid-cols-1 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <TrendingSkeleton key={`more-${i}`} />
                    ))}
                  </div>
                )}
                {hasMore && !loadingMore && (
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      data-testid="trending-load-more"
                      className="rounded-full border border-brand bg-brand-muted px-6 py-2.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      Load more
                    </button>
                  </div>
                )}
                {!hasMore && allPosts.length > 0 && (
                  <p className="mt-8 text-center text-sm text-muted-foreground">
                    That&apos;s everything trending right now.
                  </p>
                )}
              </>
            ) : (
              <EmptyBoard
                title="The network is quiet"
                body="Nobody has posted yet. Be the first — a single post makes the whole thing start to move."
                ctaLabel="Open web10 social"
                ctaHref={SOCIAL_ORIGIN}
                external
              />
            )}
          </div>

          {/* Sidebar — the Top 10 rail is Hot Gossip only (the Video + Shorts
              walls are full-width, with no rail). Desktop only, and not while
              searching. */}
          {dest === 'hot-gossip' && !isSearching && (
            <TrendingSidebar
              entries={ranked
                .filter(p => topic === 'All' || (p.tags?.includes(topic) ?? false))
                .slice(0, 10)
                .map(p => ({ post: p, rank: p.rank }))}
              onSelect={scrollToCard}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ── The sticky control band (search) — the chrome recedes so the content is
//     the hero (design.md §10). The destination nav lives in the ExperienceShell
//     sidebar (the salad's tab row + view toggle retire). ─────────────────────

function ControlBand({
  searchQuery,
  onSearchChange,
  onSearchClear,
  searchInputRef,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1 basis-52">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            onClear={onSearchClear}
            inputRef={searchInputRef}
            placeholder="Search posts, tags, topics…"
          />
        </div>
      </div>
    </div>
  );
}

// ── The board empty state (a destination with no posts) ─────────────────────

function EmptyBoard({
  title,
  body,
  ctaLabel,
  ctaHref,
  external = false,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  external?: boolean;
}) {
  return (
    <div
      data-testid="trending-empty"
      className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center"
    >
      <MessageCircleOff className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      <h2 className="mt-4 font-display text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <a
        href={ctaHref}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        data-testid="trending-empty-cta"
        className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {ctaLabel}
        <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
      </a>
    </div>
  );
}

export default Trending;
