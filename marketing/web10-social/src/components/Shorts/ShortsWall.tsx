import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Search, X, Loader2 } from 'lucide-react';
import { readShortsPage, type ShortPost } from '@/data';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const LOG = (...args: unknown[]) => console.log('[shorts-wall]', ...args);

// The page size for the board read (the "load more" increment).
const PAGE_SIZE = 50;

/**
 * The Shorts explore wall — the "before you pick a short" surface (the
 * operator: "the moment you visit it looks like [the wall] … click a video
 * get into that [infinite scroll] view"). A responsive grid of 9:16 vertical
 * video tiles, capped at 4 columns (`auto-fill, minmax(max(160px, 25%), 1fr)`
 * — each column at least 25% wide, so never more than 4; never narrower than
 * 160px, so fewer columns on small screens — the same wall shape as the
 * profile's content wall). Tapping a tile navigates to `/shorts/:postId` — the
 * existing full-screen swipe lens (the "youtube what's next" / TikTok infinite
 * scroll).
 *
 * The data is the same `readShortsFeed` the lens uses (the render-time 9:16
 * gate), so the wall and the lens show the same shorts.
 */
export default function ShortsWall() {
  const navigate = useNavigate();
  const [shorts, setShorts] = useState<ShortPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Infinite scroll (the feed's pattern): the wall pages the board until it's
  // exhausted. `hasMore` keys off the board page size (a full page of tagged
  // shorts means there may be another); `nextOffsetRef` is the next offset to
  // fetch (a ref so the stable `loadMore` reads the latest without a stale
  // closure); `loadingMore` guards against double-fires from the sentinel.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextOffsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Deep link: the search query from ?q= (the global search's Shorts category
  // lands here — /shorts?q=…, the S8 four-category search). The wall is now the
  // Shorts destination (a bare /shorts is the wall, the lens is /shorts/:postId),
  // so the search's ?q= filters the wall tiles to the matches (text/author,
  // case-insensitive — a view over the loaded wall, not a re-read) and shows a
  // query chip (with its X) so the search is visible + clearable.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
    LOG('query cleared');
  }, [searchParams, setSearchParams]);

  const visibleShorts = urlQuery.trim()
    ? shorts.filter((s) => {
        const q = urlQuery.trim().toLowerCase();
        return (
          (s.post.title && s.post.title.toLowerCase().includes(q)) ||
          (s.post.text && s.post.text.toLowerCase().includes(q)) ||
          (s.post.author_username && s.post.author_username.toLowerCase().includes(q))
        );
      })
    : shorts;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { shorts: page, hasMore: more } = await readShortsPage(PAGE_SIZE, 0);
      LOG('loaded', page.length, 'shorts, hasMore:', more);
      nextOffsetRef.current = PAGE_SIZE;
      setShorts(page);
      setHasMore(more);
    } catch (e) {
      console.error('[shorts-wall] load failed:', e);
      setError('Could not load shorts. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Infinite scroll: append the next board page (the sentinel's
  // IntersectionObserver fires this). A full page means there may be another;
  // a short page is the last one.
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { shorts: page, hasMore: more } = await readShortsPage(PAGE_SIZE, nextOffsetRef.current);
      LOG('loadMore — appended', page.length, 'shorts, hasMore:', more);
      // Advance by the BOARD page size (not the filtered count) — the 9:16 gate
      // can drop some of a full page, so advancing by page.length would re-read
      // tagged shorts. A full board page (hasMore true) is exactly PAGE_SIZE.
      nextOffsetRef.current += PAGE_SIZE;
      // Dedupe by post id (offset paging can surface a post twice if the board
      // shifts between page reads — a new short posted mid-scroll).
      setShorts((prev) => {
        const seen = new Set(prev.map((s) => s.post._id).filter(Boolean));
        return [...prev, ...page.filter((s) => !s.post._id || !seen.has(s.post._id))];
      });
      setHasMore(more);
    } catch (e) {
      console.error('[shorts-wall] loadMore failed:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  useEffect(() => {
    load();
  }, [load]);

  // Infinite scroll: a sentinel at the bottom of the wall triggers loadMore
  // when it scrolls into view (rootMargin prefetches a page early). Only active
  // when there's no active ?q= — with a query the wall is a filtered view over
  // the loaded shorts, and a short filtered grid would rapidly page the whole
  // board (loading non-matching pages that get filtered out).
  const queryActive = urlQuery.trim() !== '';
  useEffect(() => {
    if (queryActive) return;
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
  }, [queryActive, loadMore, shorts.length]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading shorts…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={load}
            className="text-sm text-brand-300 hover:text-brand-400 underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (shorts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-center px-6">
          <p className="text-sm font-medium text-foreground">No shorts yet</p>
          <p className="text-xs text-muted-foreground max-w-52">
            Vertical videos (9:16) you post will appear here.
          </p>
        </div>
      </div>
    );
  }

  // A ?q= that matches no loaded short (the search is a filter over the wall,
  // not a re-read) — a designed no-match state with the clear affordance.
  if (urlQuery.trim() && visibleShorts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <p className="text-sm font-medium text-foreground">No shorts match &ldquo;{urlQuery.trim()}&rdquo;</p>
          <p className="text-xs text-muted-foreground max-w-52">
            Try a different name or caption.
          </p>
          <button
            onClick={clearQuery}
            data-testid="shorts-query-clear"
            className="text-sm text-brand-300 hover:text-brand-400 underline underline-offset-2 transition-colors"
          >
            Clear search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4" data-testid="shorts-wall">
      {/* The active ?q= filter (from the global search's Shorts category) —
          a chip that shows the query + clears it (the S8 deep-link idiom;
          the wall filtered to the matches). */}
      {urlQuery.trim() !== '' && (
        <div className="mb-3 flex justify-center" data-testid="shorts-query-chip">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated border border-border px-3 py-1.5 text-xs text-foreground">
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            {urlQuery.trim()}
            <button
              type="button"
              onClick={clearQuery}
              data-testid="shorts-query-chip-clear"
              aria-label="Clear search"
              className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-colors duration-150"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        </div>
      )}
      {/* The wall: a responsive grid of 9:16 vertical tiles, capped at 4
          columns. `auto-fill, minmax(max(160px, 25%), 1fr)` — each column is
          at least 25% wide (so never more than 4) and never narrower than
          160px (so fewer columns as the width shrinks). */}
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(max(160px,25%),1fr))]">
        {visibleShorts.map((short) => (
          <button
            key={short.post._id}
            type="button"
            data-testid={`short-wall-tile-${short.post._id}`}
            aria-label={`Watch short by @${short.post.author_username}`}
            onClick={() => navigate(`/shorts/${short.post._id}`)}
            className="relative aspect-[9/16] w-full bg-elevated overflow-hidden rounded-lg group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset text-left"
          >
            <video
              src={short.media.url}
              poster={short.media.thumbnail_url}
              className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-105"
              preload="metadata"
              playsInline
              muted
            />
            {/* The play badge (the video affordance, top-right). */}
            <div className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-md bg-black/50 backdrop-blur-sm" aria-hidden="true">
              <Play className="w-3.5 h-3.5 text-white ml-px" fill="currentColor" strokeWidth={0} />
            </div>
            {/* The author + caption overlay (the TikTok/Instagram position). */}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none">
              <div className="flex items-center gap-1.5">
                <Avatar className="w-5 h-5 shrink-0">
                  {short.post.avatar_url ? (
                    <AvatarImage src={short.post.avatar_url} alt="" />
                  ) : (
                    <AvatarFallback className="bg-brand-muted text-brand-300 text-[0.625rem] font-semibold">
                      {(short.post.author_username || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <p className="text-xs font-medium text-white truncate">@{short.post.author_username}</p>
              </div>
              {/* The post's two bodies (D82): the title is the lead line, the
                  caption (`text`) under it. A short with only a caption shows
                  the caption; a title-only short shows the title. */}
              {short.post.title && (
                <p className="text-xs font-medium text-white line-clamp-1 mt-1 leading-snug">{short.post.title}</p>
              )}
              {short.post.text && (
                <p className="text-xs text-white/80 line-clamp-2 mt-1 leading-snug">{short.post.text}</p>
              )}
            </div>
          </button>
        ))}
      </div>
      {/* The infinite-scroll sentinel (triggers loadMore when it scrolls in).
          Only rendered for the plain wall browse (no active ?q=) — with a
          query the wall is a filtered view, and a short filtered grid would
          rapidly page the whole board (loading non-matching pages). */}
      {!queryActive && hasMore && !loading && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6" data-testid="shorts-wall-sentinel">
          {loadingMore && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              Loading more…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
