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
 * Used by the feed's `PostCard` directly, and passed as the shared
 * `DiscoverCard`'s `renderAd` seam (the shared package is presentational and
 * doesn't know about these components).
 */
export function AttachedAd({ ad, className }: { ad: AdRecord; className?: string }) {
  if (ad.format === 'post') {
    return <PostAdCard ad={ad} className={className} />;
  }
  return <AdBlock ad={ad} className={className} />;
}
