import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { readShortsFeed, type ShortPost } from '@/data';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const LOG = (...args: unknown[]) => console.log('[shorts-wall]', ...args);

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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await readShortsFeed(50);
      LOG('loaded', result.length, 'shorts');
      setShorts(result);
    } catch (e) {
      console.error('[shorts-wall] load failed:', e);
      setError('Could not load shorts. Try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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

  return (
    <div className="px-4 py-4" data-testid="shorts-wall">
      {/* The wall: a responsive grid of 9:16 vertical tiles, capped at 4
          columns. `auto-fill, minmax(max(160px, 25%), 1fr)` — each column is
          at least 25% wide (so never more than 4) and never narrower than
          160px (so fewer columns as the width shrinks). */}
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(max(160px,25%),1fr))]">
        {shorts.map((short) => (
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
              {short.post.text && (
                <p className="text-xs text-white/80 line-clamp-2 mt-1 leading-snug">{short.post.text}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
