import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWapi } from '@/data/wapi';
import { readShortsFeed, toggleReactionKind, type ShortPost } from '@/data';
import { VideoPlayer, sourceFromMedia } from '@/components/Feed/VideoPlayer';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { requestInstallPrompt, isMobile } from '@/lib/pwa';

const LOG = (...args: unknown[]) => console.log('[shorts]', ...args);

/**
 * The Shorts surface (shorts.md) — the full-screen, vertical, swipe-between-
 * posts feed. The video IS the screen: each slide is a full-viewport-height
 * snap slide, the video fills it (`fit="cover"`, `immersive` — no control
 * rack, no phone-width column), and the author/caption overlay + the
 * like/comment/share rail sit on top.
 *
 * The frame: on a phone (a 9:16 viewport) the slide is already ~9:16, so the
 * video is full-bleed. On a wide desktop viewport the slide is a centered
 * 9:16 column that fills the viewport height (the designed letterbox — the
 * YouTube-Shorts shape); the video fills the column, never a small box in a
 * void.
 *
 * The swipe: native CSS scroll-snap (one slide per viewport) + keyboard
 * (ArrowUp/ArrowDown/PageUp/PageDown scroll one slide — the desktop
 * equivalent of the swipe). The active slide (≥60% visible) autoplays muted;
 * off-screen slides pause.
 */
export default function ShortsScreen() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [shorts, setShorts] = useState<ShortPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [reactionMap, setReactionMap] = useState<Record<string, number>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await readShortsFeed(50);
      LOG('loaded', result.length, 'shorts');
      setShorts(result);
    } catch (e) {
      console.error('[shorts] load failed:', e);
      setError('Could not load shorts. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // D72: the install prompt fires at the moment of value — a phone user who
  // opens Shorts and stays ~3s has signaled "this is the thing I'm here for."
  // Mobile only (a desktop user gets the explicit affordance, not a nag). The
  // dismissal is remembered in requestInstallPrompt, so it never re-nags.
  useEffect(() => {
    if (!isMobile()) return;
    const t = setTimeout(() => requestInstallPrompt('shorts'), 3000);
    return () => clearTimeout(t);
  }, []);

  // Deep link: scroll to the specific short when :postId is present
  useEffect(() => {
    if (!postId || shorts.length === 0) return;
    const idx = shorts.findIndex((s) => s.post._id === postId);
    if (idx >= 0 && containerRef.current) {
      const el = containerRef.current.children[idx] as HTMLElement;
      el?.scrollIntoView({ behavior: 'instant' });
      LOG('deep link — scrolled to short', idx, postId);
    }
  }, [postId, shorts]);

  // Track which slide is the active one (≥60% visible) — the source of truth
  // for the ambient autoplay (the active slide plays muted, the rest pause)
  // and for the deep-link sync.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Array.from(container.children).indexOf(entry.target);
            if (idx !== activeIndex) {
              LOG('active slide →', idx);
              setActiveIndex(idx);
            }
            break;
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    Array.from(container.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [shorts, activeIndex]);

  // The swipe, keyboard edition: ArrowUp/ArrowDown + PageUp/PageDown scroll
  // one slide (the desktop equivalent of the swipe). The container is the
  // only scroller on the screen, so a keypress always lands on a neighbor.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      containerRef.current?.children[Math.min(activeIndex + 1, shorts.length - 1)]
        ?.scrollIntoView({ behavior: 'smooth' });
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      containerRef.current?.children[Math.max(activeIndex - 1, 0)]
        ?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async function handleToggleLike(shortId: string) {
    const token = getWapi().readToken();
    if (!token) return;
    const wasLiked = !!likedMap[shortId];
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    setLikedMap((prev) => ({ ...prev, [shortId]: nextLiked }));
    setReactionMap((prev) => ({ ...prev, [shortId]: Math.max(0, (prev[shortId] || 0) + delta) }));
    try {
      await toggleReactionKind(shortId, 'like');
    } catch (e) {
      console.error('[shorts] toggle like failed:', e);
      setLikedMap((prev) => ({ ...prev, [shortId]: wasLiked }));
      setReactionMap((prev) => ({ ...prev, [shortId]: Math.max(0, (prev[shortId] || 0) - delta) }));
    }
  }

  function handleShare(shortId: string) {
    const url = `${window.location.origin}/shorts/${shortId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

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
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
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

  return (
    <div
      ref={containerRef}
      data-testid="shorts-container"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Shorts feed"
      className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {shorts.map((short, i) => (
        // The slide: full viewport height, one per swipe (snap-y mandatory).
        // The frame: on a phone the slide IS the 9:16 frame (full-bleed); on a
        // wide desktop viewport the frame is a centered 9:16 column that fills
        // the viewport height (the designed letterbox — the YouTube-Shorts
        // shape). The video fills the frame; the black around it is the
        // letterbox, not a bug.
        <div
          key={short.post._id}
          data-testid={`short-slide-${i}`}
          className="relative h-full w-full snap-start overflow-hidden bg-black flex items-center justify-center"
        >
          <div
            data-testid={`short-frame-${i}`}
            className="relative h-full w-full md:w-auto md:aspect-[9/16]"
          >
            <VideoPlayer
              source={sourceFromMedia(short.media)}
              mode="inline"
              fit="cover"
              immersive
              active={i === activeIndex}
              testId={`short-video-${i}`}
              className="absolute inset-0 w-full h-full"
              showDuration={false}
            />

            {/* Bottom gradient overlay */}
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />

            {/* Author + caption overlay */}
            <div className="absolute bottom-4 left-4 right-16 flex items-end gap-3">
              <Avatar className="w-9 h-9 shrink-0">
                {short.post.avatar_url ? (
                  <AvatarImage src={short.post.avatar_url} alt={short.post.author_username || ''} />
                ) : (
                  <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
                    {(short.post.author_username || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  @{short.post.author_username}
                </p>
                {short.post.text && (
                  <p className="text-xs text-white/80 line-clamp-2 mt-0.5">{short.post.text}</p>
                )}
              </div>
            </div>

            {/* Action rail */}
            <div className="absolute bottom-6 right-3 flex flex-col items-center gap-4">
              <button
                data-testid={`short-like-${i}`}
                onClick={() => handleToggleLike(short.post._id!)}
                className="flex flex-col items-center gap-1 text-white/90 hover:text-white transition-colors"
                aria-label={likedMap[short.post._id!] ? 'Unlike' : 'Like'}
              >
                <Heart
                  className={cn('w-6 h-6 transition-colors', likedMap[short.post._id!] && 'fill-red-500 text-red-500')}
                  strokeWidth={1.75}
                />
                <span className="text-[0.625rem] font-medium">
                  {(reactionMap[short.post._id!] ?? short.post.likes ?? 0) || ''}
                </span>
              </button>
              <button
                onClick={() => navigate(`/u/${short.post.author_username}/p/${short.post._id}`)}
                className="flex flex-col items-center gap-1 text-white/90 hover:text-white transition-colors"
                aria-label="View comments"
              >
                <MessageCircle className="w-6 h-6" strokeWidth={1.75} />
                <span className="text-[0.625rem] font-medium">
                  {short.post.comments || ''}
                </span>
              </button>
              <button
                onClick={() => handleShare(short.post._id!)}
                className="flex flex-col items-center gap-1 text-white/90 hover:text-white transition-colors"
                aria-label="Share"
              >
                <Share2 className="w-6 h-6" strokeWidth={1.75} />
                <span className="text-[0.625rem] font-medium">Share</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
