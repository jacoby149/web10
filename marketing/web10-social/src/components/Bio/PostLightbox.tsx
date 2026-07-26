import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PostRecord, MediaRecord } from '@/data/types';

interface PostLightboxProps {
  post: PostRecord;
  mediaMap: Record<string, MediaRecord>;
  onClose: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// PostLightbox — Instagram-style enlarged view of a single post. Media
// on the left (paged if there are several refs), caption + meta on the
// right; stacks on mobile. Backdrop click, Escape, and the close button
// all dismiss. Follows the app modal idiom (ReportBug): fixed overlay,
// animate-overlay-in / animate-panel-in, shadow reserved for floats.
export function PostLightbox({ post, mediaMap, onClose }: PostLightboxProps) {
  const media = (post.media_refs || [])
    .map(ref => mediaMap[ref])
    .filter((m): m is MediaRecord => Boolean(m));
  const [index, setIndex] = useState(0);
  const hasMedia = media.length > 0;
  const multiple = media.length > 1;

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + media.length) % media.length);
  }, [media.length]);
  const next = useCallback(() => {
    setIndex(i => (i + 1) % media.length);
  }, [media.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && multiple) prev();
      else if (e.key === 'ArrowRight' && multiple) next();
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next, multiple]);

  const current = media[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-overlay-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Post"
      data-testid="post-lightbox"
    >
      <div
        className="relative flex w-full max-w-4xl max-h-[88vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_30px_rgb(0_0_0/0.35)] animate-panel-in sm:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          data-testid="post-lightbox-close"
          className="absolute right-2 top-2 z-10 bg-background/60 backdrop-blur-sm hover:bg-background/80"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Media pane */}
        {hasMedia && (
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
            {current.mime_type?.startsWith('video/') ? (
              <video
                key={current._id || current.url}
                src={current.url}
                poster={current.thumbnail_url}
                controls
                playsInline
                className="max-h-[50vh] w-full object-contain sm:max-h-[88vh]"
              />
            ) : (
              <img
                src={current.url}
                alt={current.alt_text || ''}
                className="max-h-[50vh] w-full object-contain sm:max-h-[88vh]"
              />
            )}
            {multiple && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous"
                  data-testid="post-lightbox-prev"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Next"
                  data-testid="post-lightbox-next"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-2 py-0.5 text-xs font-mono tabular-nums text-foreground backdrop-blur-sm">
                  {index + 1} / {media.length}
                </div>
              </>
            )}
          </div>
        )}

        {/* Details pane */}
        <div className="flex min-h-0 shrink-0 flex-col overflow-y-auto p-5 pr-14 sm:w-80">
          {post.text ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {post.text}
            </p>
          ) : (
            !hasMedia && (
              <p className="text-sm text-muted-foreground">This post has no content.</p>
            )
          )}
          <span className="mt-4 text-xs text-muted-foreground">
            {formatTimeAgo(post.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
