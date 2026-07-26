import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Zap, ArrowUpRight, MessageCircleOff } from 'lucide-react';
import {
  TrendingCard,
  TrendingSkeleton,
  fetchDiscoverFeed,
  mapDiscoveryToFeedPost,
} from '@/components/FeedPreview';
import type { FeedPost } from '@/components/FeedPreview';
import { TrendingSidebar } from '@/components/TrendingSidebar';
import { KnobRack } from '@/components/KnobRack';
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

const INITIAL_PAGE = 20;
const PAGE_STEP = 20;
const MAX_RESULTS = 100;

interface RankedPost extends FeedPost {
  rank: number;
  featured: boolean;
}

function buildTopic(allTags: string[]): string[] {
  const unique = Array.from(new Set(allTags)).sort();
  return unique.slice(0, 12);
}

function postToSignals(post: FeedPost): PostSignals {
  return {
    ageMs: Date.now() - new Date(post.createdAt).getTime(),
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

  const loadFeed = useCallback(async (nextLimit: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const [trendingResults, recentResults] = await Promise.all([
        fetchDiscoverFeed('trending', nextLimit),
        fetchDiscoverFeed('recent', nextLimit),
      ]);
      // Merge both sources, deduplicate by post id
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

  // Listen for hash changes (back/forward, manual paste)
  useEffect(() => {
    const onHash = () => {
      const { state, preset } = readMixFromHash();
      setKnobState(state);
      setActivePreset(preset);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const maxScore = useMemo(
    () => Math.max(1, ...allPosts.map(p => p.engagementScore ?? 0)),
    [allPosts],
  );

  const topics = useMemo(
    () => ['All', ...buildTopic(allPosts.flatMap(p => p.tags ?? []))],
    [allPosts],
  );

  // Live re-rank by knob state (client-side, zero network calls)
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

  const handleReaction = (type: 'like' | 'repost') => {
    trackFunnel(type === 'like' ? 'trending_like_attempt' : 'trending_repost_attempt');
    window.open(SOCIAL_ORIGIN, '_blank');
  };

  const handleComment = () => {
    trackFunnel('trending_comment_attempt');
    window.open(SOCIAL_ORIGIN, '_blank');
  };

  const handleLoadMore = () => {
    const next = Math.min(limit + PAGE_STEP, MAX_RESULTS);
    setLimit(next);
    trackFunnel('trending_load_more');
    loadFeed(next, true);
  };

  const isInitialLoad = loading && allPosts.length === 0;

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
        </div>
      </header>

      {/* Knob Rack — synth control surface */}
      {!isInitialLoad && allPosts.length > 0 && (
        <div className="px-4 pb-4 sm:px-6">
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
            className="flex gap-2 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      onClick={() => setTopic(t)}
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

      {/* Body: grid + sidebar */}
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl gap-8">
          <div className="min-w-0 flex-1">
            {isInitialLoad ? (
              <div
                data-testid="trending-grid-skeleton"
                className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                <TrendingSkeleton featured />
                {Array.from({ length: 5 }).map((_, i) => (
                  <TrendingSkeleton key={i} />
                ))}
              </div>
            ) : visible.length > 0 ? (
              <>
                <div
                  data-testid="trending-grid"
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  {visible.map(post => (
                    <TrendingCard
                      key={post.id}
                      post={post}
                      rank={post.rank}
                      featured={post.featured}
                      maxScore={maxScore}
                      onLike={() => handleReaction('like')}
                      onComment={() => handleComment()}
                      onRepost={() => handleReaction('repost')}
                      cardRef={registerCard(post.id)}
                    />
                  ))}
                </div>
                {loadingMore && (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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

          {/* Sidebar — desktop only */}
          <TrendingSidebar
            entries={ranked
              .filter(p => topic === 'All' || (p.tags?.includes(topic) ?? false))
              .slice(0, 10)
              .map(p => ({ post: p, rank: p.rank }))}
            onSelect={scrollToCard}
          />
        </div>
      </main>
    </div>
  );
}

export default Trending;