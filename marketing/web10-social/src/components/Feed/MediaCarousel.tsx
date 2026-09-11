import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { VideoPlayer, type VideoSource } from './VideoPlayer';
import type { MediaRecord } from '@/data/types';

/**
 * The shared multi-media carousel (video-player.md) — the inline replacement
 * for the lightbox carousel the feed lost when it went inline (3.68.0). A
 * fixed frame + a scroll-snap strip of all the post's media, with a position
 * indicator (1/N) where the old dead count badge was. Video slides render
 * through `<VideoPlayer fill>` (tap-to-play); image slides are `<img>`. Both
 * the feed and discover compose it, so the "no surface owns a `<video>`" rule
 * holds. The frame ratio is explicit (discover = 16:9) or the first item's
 * natural ratio (feed), so swiping never shifts the layout.
 */
export interface MediaCarouselProps {
  items: MediaRecord[];
  /** contain = letterbox (never crops); cover = fill the frame (crops). */
  fit?: 'contain' | 'cover';
  /** The frame's aspect ratio (w/h). Absent → the first item's natural ratio. */
  ratio?: number;
  /** Cap the frame height (contain only). */
  maxHeight?: string;
  /** testid for the frame container. */
  testId?: string;
  className?: string;
}

export function MediaCarousel({ items, fit = 'contain', ratio, maxHeight, testId, className }: MediaCarouselProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = items.length;
  const first = items[0];
  const frameRatio = ratio ?? (first?.width && first?.height ? first.width / first.height : 4 / 3);

  const onScroll = () => {
    const el = stripRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.min(count - 1, Math.max(0, i)));
  };

  return (
    <div
      data-testid={testId}
      className={cn('bg-elevated relative overflow-hidden', className)}
      style={{ aspectRatio: frameRatio, maxHeight }}
    >
      <div
        ref={stripRef}
        onScroll={onScroll}
        data-testid={testId ? `${testId}-strip` : undefined}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={`${count} media items`}
      >
        {items.map((item, i) => {
          const isVideo = item.mime_type?.startsWith('video/');
          // Carousel slides play the direct file (tap-to-play, fill). The full
          // HLS rack is the single-video viewing surface, not a carousel slide.
          const source: VideoSource = {
            type: 'file',
            url: item.url,
            poster: item.thumbnail_url,
            width: item.width,
            height: item.height,
            durationSeconds: item.duration_seconds,
          };
          return (
            <div key={item._id || i} className="h-full w-full shrink-0 snap-start">
              {isVideo ? (
                <VideoPlayer
                  source={source}
                  mode="inline"
                  fit={fit}
                  fill
                  showDuration={false}
                  testId={testId ? `${testId}-video-${i}` : undefined}
                />
              ) : (
                <img
                  src={item.thumbnail_url || item.url}
                  alt={item.alt_text || ''}
                  className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
                  loading="lazy"
                  data-testid={testId ? `${testId}-image-${i}` : undefined}
                />
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div
          className="absolute right-2 top-2 flex items-center justify-center rounded-full bg-background/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground backdrop-blur-sm"
          data-testid={testId ? `${testId}-position` : 'media-position'}
          aria-label={`Item ${index + 1} of ${count}`}
        >
          {index + 1}/{count}
        </div>
      )}
    </div>
  );
}
