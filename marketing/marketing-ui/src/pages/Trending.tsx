import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Zap, ArrowUpRight, MessageCircleOff, Flame, Video } from 'lucide-react';
import {
  TrendingCard,
  TrendingSkeleton,
  YouTubeCard,
  YouTubeSkeleton,
  fetchDiscoverFeed,
  mapDiscoveryToFeedPost,
  parseCreatedAt,
} from '@/components/FeedPreview';
import type { FeedPost } from '@/components/FeedPreview';
import { TrendingSidebar } from '@/components/TrendingSidebar';
import { KnobRack } from '@/components/KnobRack';
import { SearchBar } from '@/components/SearchBar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SOCIAL_ORIGIN } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';
import {
  defaultKnobState,
  encodeMix,
  decodeMix,
  getPreset,
  rankPosts,
  type KnobState,
  type PresetId,
  type PostSignals,
} from '@/lib/powerMean';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'https://api.web10.app';
const INITIAL_PAGE = 20;
const PAGE_STEP = 20;
const MAX_RESULTS = 100;

type TrendingView = 'grid' | 'youtube';

// ── Discover users (A14: followers_count included) ──────────────────────────

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
  const resp = await fetch(`${API_ORIGIN}/discover/users`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { limit, services: 'public_posts' } }),
  });
  if (!resp.ok) return [];
  return resp.json();
}

function formatFollowers(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Matching users row ──────────────────────────────────────────────────────

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

async function fetchSearchResults(query: string, limit = 50): Promise<FeedPost[]> {
  const resp = await fetch(`${API_ORIGIN}/discover/search`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { q: query, limit, services: 'public_posts' } }),
  });
  if (!resp.ok) throw new Error(`Search failed (${resp.status})`);
  const results = await resp.json();
  return results.map(mapDiscoveryToFeedPost);
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

function readMixFromHash(): { state: KnobState; preset: PresetId | null } {
  const hash = window.location.hash.slice(1);
  const match = hash.match(/^mix=(\d{5})/);
  if (match) {
    const state = decodeMix(match[1]);
    if (state) {
      return { state, preset: null };
    }
  }
  return { state: defaultKnobState(), preset: 'balanced' };
}

function writeMixToHash(state: KnobState) {
  const code = encodeMix(state);
  window.location.hash = `mix=${code}`;
}

function Trending() {
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

  // Search state
  // View toggle: read from ?view= query param (deep-link rule)
  const [view, setView] = useState<TrendingView>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('view') as TrendingView) || 'grid';
  });

  const setViewUrl = useCallback((v: TrendingView) => {
    setView(v);
    const params = new URLSearchParams(window.location.search);
    params.set('view', v);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    trackFunnel('trending_view_toggle', { view: v });
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FeedPost[]>([]);
  const [searchUsers, setSearchUsers] = useState<DiscoverUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    loadFeed(INITIAL_PAGE, false);
    trackFunnel('trending_view');
  }, [loadFeed]);

  // Auto-focus search when navigated from nav (hash #search or ?focus=search)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    if (params.get('focus') === 'search' || hash === '#search') {
      searchInputRef.current?.focus();
      // Clean up the param so refresh doesn't re-focus
      params.delete('focus');
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${hash === '#search' ? '' : window.location.hash}`;
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

  const debouncedSearch = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      clearTimeout(debouncedSearch.current);
      debouncedSearch.current = setTimeout(() => doSearch(value), 300);
    },
    [doSearch],
  );

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchUsers([]);
    setSearchSearched(false);
    setSearchError(null);
    clearTimeout(debouncedSearch.current);
  }, []);

  // When a topic chip is clicked during search, filter search results by tag
  // When not searching, the topic chip already filters the trending feed via setTopic
  const handleTopicClick = useCallback(
    (t: string) => {
      setTopic(t);
      if (searchSearched && t !== 'All') {
        // If searching and a tag is selected, add it to the search query
        const tagQuery = `#${t}`;
        setSearchQuery(tagQuery);
        doSearch(tagQuery);
      } else if (searchSearched && t === 'All') {
        // Clear search tag filter when "All" is clicked during search
        handleSearchClear();
      }
    },
    [searchSearched, doSearch, handleSearchClear],
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

  // YouTube view: media posts only (video + image), filtered by topic
  const mediaPosts = useMemo(
    () => {
      const mediaOnly = visible.filter(p => p.media === 'video' || p.media === 'image');
      return topic === 'All' ? mediaOnly : mediaOnly.filter(p => p.tags?.includes(topic) ?? false);
    },
    [visible, topic],
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Hero */}
      <header className="border-b border-border bg-background px-4 pt-12 pb-8 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-2 text-brand-400">
            <Zap className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-xs font-medium uppercase tracking-[0.08em]">
              Trending
            </span>
          </div>
          <h1 className="reveal mt-4 font-display text-4xl font-bold tracking-[-0.02em] text-foreground sm:text-5xl">
            What&apos;s actually trending.
            <br />
            <span className="text-muted-foreground">No algorithm.</span>
          </h1>
          <p className="reveal mt-4 max-w-xl text-muted-foreground [animation-delay:80ms]">
            Live engagement across the network, ordered by real reactions —
            not a recommender. Ranked, not curated.
          </p>
          {/* Search bar — YouTube placement, header row */}
          <div className="reveal mt-6 max-w-xl [animation-delay:160ms]">
            <SearchBar
              value={searchQuery}
              onChange={handleSearchChange}
              onClear={handleSearchClear}
              inputRef={searchInputRef}
              placeholder={isSearching ? 'Search posts, tags, topics…' : 'Search posts, tags, topics…'}
            />
          </div>
        </div>
      </header>

      {/* Knob Rack — only show when not searching */}
      {!isInitialLoad && allPosts.length > 0 && !isSearching && (
        <div className="px-4 pt-6 pb-4 sm:px-6">
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
        className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-md"
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div
            className="flex gap-2 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_left,transparent,black_40px)]"
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

      {/* View toggle — YouTube-style, below topics */}
      {!isInitialLoad && !isSearching && (
        <div className="border-b border-border bg-surface/50">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="flex items-center gap-1 py-2" data-testid="trending-view-toggle">
              {([
                ['grid', 'Hot Gossip', Flame],
                ['youtube', 'Video', Video],
              ] as [TrendingView, string, typeof Flame][]).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewUrl(v)}
                  data-testid={`view-toggle-${v}`}
                  className={[
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    view === v
                      ? 'bg-brand-muted text-brand-300'
                      : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Body: grid + sidebar */}
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl gap-8">
          <div className="min-w-0 flex-1">
            {isSearching ? (
              /* Search results */
              searchLoading ? (
                <div
                  data-testid="trending-grid-skeleton"
                  className="mx-auto grid w-full max-w-xl grid-cols-1 gap-4"
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
                        className="mx-auto grid w-full max-w-xl grid-cols-1 gap-4"
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
                className="mx-auto grid w-full max-w-xl grid-cols-1 gap-4"
              >
                <TrendingSkeleton featured />
                {Array.from({ length: 5 }).map((_, i) => (
                  <TrendingSkeleton key={i} />
                ))}
              </div>
            ) : view === 'youtube' ? (
              /* YouTube view — media posts only, 16:9 thumbnails */
              <>
                {mediaPosts.length > 0 ? (
                  <>
                    <div
                      data-testid="trending-youtube-grid"
                      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    >
                      {mediaPosts.map(post => (
                        <YouTubeCard
                          key={post.id}
                          post={post}
                          rank={post.rank}
                        />
                      ))}
                    </div>
                    {loadingMore && (
                      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <YouTubeSkeleton key={`yt-more-${i}`} />
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
                  <div
                    data-testid="trending-empty"
                    className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center"
                  >
                    <MessageCircleOff className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                    <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                      No media posts yet
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      The video view shows posts with videos and images.
                      Switch to Hot Gossip to see all trending posts.
                    </p>
                    <button
                      type="button"
                      onClick={() => setViewUrl('grid')}
                      className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      Switch to Hot Gossip
                    </button>
                  </div>
                )}
              </>
            ) : visible.length > 0 ? (
              <>
                <div
                  data-testid="trending-grid"
                  className="mx-auto grid w-full max-w-xl grid-cols-1 gap-4"
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
                     />
                   ))}
                </div>
                {loadingMore && (
                  <div className="mx-auto mt-4 grid w-full max-w-xl grid-cols-1 gap-4">
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
              <div
                data-testid="trending-empty"
                className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center"
              >
                <MessageCircleOff className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                  The network is quiet
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Nobody has posted yet. Be the first — a single post makes
                  the whole thing start to move.
                </p>
                <a
                  href={SOCIAL_ORIGIN}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="trending-empty-cta"
                  className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Open web10 social
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                </a>
              </div>
            )}
          </div>

          {/* Sidebar — desktop only, only when not searching */}
          {!isSearching && (
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

export default Trending;
