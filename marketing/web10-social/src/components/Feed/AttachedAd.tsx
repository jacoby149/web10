import { AdBlock } from './AdBlock';
import { PostAdCard } from './PostAdCard';
import type { AdRecord } from '@/data/types';

/**
 * Render an attached ad per its format (ad-improvements.md). The attachment is
 * the same for both (the post's `ad_preference` / the node's read-time attach);
 * only the rendering differs:
 * - `inline` (default) → the compact `AdBlock` (square thumbnail + offer +
 *   disclosure).
 * - `post` → a full post-like `PostAdCard` (media, copy, offer, disclosure,
 *   like) — "looks like a post."
 *
 * `standalone` (the post format only): the ad renders as its own card in the
 * stream, next in line after the post it's attached to (full feed-card chrome,
 * nothing indicating the pin). Absent (the default), a post-format ad renders
 * in the attached (compact) variant inside the post's own ad slot.
 *
 * Used by the feed's `PostCard` directly, and passed as the shared
 * `DiscoverCard`'s `renderAd` seam (the shared package is presentational and
 * doesn't know about these components).
 */
export function AttachedAd({ ad, className, standalone = false }: { ad: AdRecord; className?: string; standalone?: boolean }) {
  if (ad.format === 'post') {
    return <PostAdCard ad={ad} className={className} standalone={standalone} />;
  }
  return <AdBlock ad={ad} className={className} />;
}
