import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, X, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWapi } from '@/data/wapi';
import { readShortsFeed, toggleReactionKind, getV3Client, getDiscoverGroupId, extractUsername, type ShortPost } from '@/data';
import { VideoPlayer, sourceFromMedia } from '@/components/Feed/VideoPlayer';
import { CommentThread } from '@/components/Feed/CommentThread';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { requestInstallPrompt, isMobile } from '@/lib/pwa';

const LOG = (...args: unknown[]) => console.log('[shorts]', ...args);

// The sound choice is a SESSION choice (the TikTok model): muted by default
// (the browser's autoplay policy requires it), and once the user un-mutes in
// the lens, every short — now and after leaving + returning to Shorts —
// plays with sound until they re-mute. A module-level flag survives the
// screen unmount within the session (no storage: a page reload is a fresh
// lens, back to muted).
let sessionMuted = true;

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
  // The slide whose comment thread is open (one at a time — the active short's
  // comments, the TikTok "tap comments → overlay" behavior).
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  // The screen-level sound state (shorts.md): one toggle for the whole lens,
  // seeded from the session flag so the choice survives leaving + returning.
  // Muted by default — the browser's autoplay policy requires it for the
  // ambient loop; the speaker icon is the escape hatch (the TikTok model).
  const [muted, setMuted] = useState<boolean>(sessionMuted);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleToggleMute() {
    setMuted((cur) => {
      const next = !cur;
      sessionMuted = next;
      LOG('sound →', next ? 'muted' : 'unmuted');
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await readShortsFeed(50);
      LOG('loaded', result.length, 'shorts');

      // Engagement counts (the ref pattern — the same one DiscoverScreen runs):
      // `readShortsFeed` maps through `fromV3DocToPost`, which never populates
      // `likes`/`comments` (those come from the feed query or a client-side
      // count). Without this the heart and the comment bubble render blank —
      // the "shorts show the wrong number of likes" bug. One read of the
      // reactions + comments collections over the discover group, counted
      // client-side by ref_value. Likes and dislikes are counted separately
      // (the heart shows likes only — the 3.101.0 doctrine). The reader's own
      // reaction per short is captured too, so a like made earlier renders
      // filled on load (the "refresh my like is gone" class of bug).
      const token = getWapi().readToken();
      if (token && result.length) {
        try {
          const w = getV3Client();
          const discoverId = getDiscoverGroupId();
          const [reactionDocs, commentDocs] = await Promise.all([
            w.read('reactions', { groups: [discoverId], limit: 500 }),
            w.read('comments', { groups: [discoverId], limit: 500 }),
          ]);
          const likesByPost: Record<string, number> = {};
          const commentsByPost: Record<string, number> = {};
          const likedByPost: Record<string, boolean> = {};
          for (const d of reactionDocs) {
            if (!d.ref_value) continue;
            const type = (d.body as Record<string, unknown>)?.type as string | undefined;
            if (type !== 'dislike') {
              likesByPost[d.ref_value] = (likesByPost[d.ref_value] || 0) + 1;
            }
            if (extractUsername(d.author_key) === token.username && type === 'like') {
              likedByPost[d.ref_value] = true;
            }
          }
          for (const d of commentDocs) {
            if (d.ref_value) commentsByPost[d.ref_value] = (commentsByPost[d.ref_value] || 0) + 1;
          }
          for (const s of result) {
            const id = s.post._id || '';
            s.post.likes = likesByPost[id] || 0;
            s.post.comments = commentsByPost[id] || 0;
          }
          setLikedMap(likedByPost);
          LOG(
            'engagement — counted',
            Object.values(likesByPost).reduce((a, b) => a + b, 0), 'likes +',
            Object.values(commentsByPost).reduce((a, b) => a + b, 0), 'comments',
          );
        } catch (e) {
          console.error('[shorts] engagement count failed (degrading to zero counts):', e);
        }
      }

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
    // Base the optimistic count on the CURRENT displayed count (the loaded
    // server tally, or the last optimistic value) — not a blank 0. Without
    // this a like on a short that already had N likes would show 1, not N+1.
    const base = reactionMap[shortId] ?? shorts.find((s) => s.post._id === shortId)?.post.likes ?? 0;
    setLikedMap((prev) => ({ ...prev, [shortId]: nextLiked }));
    setReactionMap((prev) => ({ ...prev, [shortId]: Math.max(0, base + delta) }));
    try {
      await toggleReactionKind(shortId, 'like');
    } catch (e) {
      console.error('[shorts] toggle like failed:', e);
      setLikedMap((prev) => ({ ...prev, [shortId]: wasLiked }));
      setReactionMap((prev) => ({ ...prev, [shortId]: Math.max(0, base - delta) }));
    }
  }

  function handleShare(shortId: string) {
    const url = `${window.location.origin}/shorts/${shortId}`;
    // The native share sheet where available (mobile); the clipboard is the
    // universal fallback. Either way the user gets clear "copied" feedback —
    // the old fire-and-forget `writeText().catch(() => {})` gave none.
    const markCopied = () => {
      setCopiedFor(shortId);
      window.setTimeout(() => setCopiedFor((cur) => (cur === shortId ? null : cur)), 2000);
    };
    const copy = () => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(markCopied).catch(() => markCopied());
      } else {
        markCopied();
      }
    };
    if (typeof navigator.share === 'function') {
      navigator.share({ title: 'web10 short', url }).catch((e: unknown) => {
        // The user dismissed the share sheet (AbortError) — no feedback needed.
        if ((e as { name?: string })?.name === 'AbortError') return;
        copy();
      });
    } else {
      copy();
    }
  }

  function handleToggleComments(shortId: string) {
    setCommentsOpenFor((cur) => (cur === shortId ? null : shortId));
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
              muted={muted}
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
              {/* The sound toggle (shorts.md): Shorts autoplays muted (the
                  browser's autoplay policy), but the user must be able to HEAR
                  the video — one speaker icon for the whole lens (the TikTok
                  model), above the heart. The tap never reaches the video
                  (no play/pause toggle from a sound tap). */}
              <button
                data-testid={`short-mute-${i}`}
                onClick={(e) => { e.stopPropagation(); handleToggleMute(); }}
                className="flex flex-col items-center gap-1 text-white/90 hover:text-white transition-colors"
                aria-label={muted ? 'Unmute' : 'Mute'}
                aria-pressed={!muted}
              >
                {muted ? (
                  <VolumeX className="w-6 h-6" strokeWidth={1.75} />
                ) : (
                  <Volume2 className="w-6 h-6" strokeWidth={1.75} />
                )}
              </button>
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
                data-testid={`short-comment-${i}`}
                onClick={() => handleToggleComments(short.post._id!)}
                className={cn(
                  'flex flex-col items-center gap-1 transition-colors',
                  commentsOpenFor === short.post._id ? 'text-white' : 'text-white/90 hover:text-white',
                )}
                aria-label="View comments"
                aria-expanded={commentsOpenFor === short.post._id}
              >
                <MessageCircle className="w-6 h-6" strokeWidth={1.75} />
                <span className="text-[0.625rem] font-medium">
                  {short.post.comments || ''}
                </span>
              </button>
              <button
                data-testid={`short-share-${i}`}
                onClick={() => handleShare(short.post._id!)}
                className="flex flex-col items-center gap-1 text-white/90 hover:text-white transition-colors"
                aria-label="Share"
              >
                <Share2 className="w-6 h-6" strokeWidth={1.75} />
                <span className="text-[0.625rem] font-medium">
                  {copiedFor === short.post._id ? 'Copied!' : 'Share'}
                </span>
              </button>
            </div>

            {/* Comment thread — a bottom sheet over the active short (the
                TikTok "tap comments → overlay"). One at a time; it reads the
                thread from the discover group (the short's board). */}
            {commentsOpenFor === short.post._id && (
              <div
                data-testid={`short-comments-${i}`}
                className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] overflow-y-auto rounded-t-2xl bg-background/95 backdrop-blur border-t border-border"
              >
                <div className="sticky top-0 flex items-center justify-between px-4 py-2.5 bg-background/95 backdrop-blur border-b border-border">
                  <span className="text-sm font-medium text-foreground">
                    {short.post.comments || 0} comments
                  </span>
                  <button
                    onClick={() => setCommentsOpenFor(null)}
                    aria-label="Close comments"
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <CommentThread
                  postId={short.post._id!}
                  isOpen
                  count={short.post.comments || 0}
                  onCountChange={(n) => {
                    setShorts((prev) =>
                      prev.map((s) => (s.post._id === short.post._id ? { ...s, post: { ...s.post, comments: n } } : s)),
                    );
                  }}
                  postAuthor={short.post.author_username}
                  postService="posts"
                  onAuthorClick={(username) => navigate(`/u/${username}`)}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
