import { Bookmark } from 'lucide-react';
import type { CollectionRecord } from '@/data/saved';
import { textTileColor } from './textTileColor';

/**
 * The saved-collections card grid (D88, saved-collections.md) — the YouTube-
 * channel "Playlists" shape: a grid of collection cards (a 4:3 brand-tinted
 * cover + name + "N items"). One card shape, two surfaces: the profile's Saved
 * tab and the group page's Saved tab (a group is a profile). Tapping a card
 * calls `onOpenCollection` (the caller navigates to the collection's deep-
 * linkable detail view).
 */
interface SavedCollectionsGridProps {
  collections: CollectionRecord[];
  onOpenCollection: (groupId: string) => void;
  /** The empty-state copy (the profile says "save posts"; a group says "the
      group's manager can add collections"). */
  emptyHint?: string;
}

export function SavedCollectionsGrid({ collections, onOpenCollection, emptyHint }: SavedCollectionsGridProps) {
  if (!collections.length) {
    return (
      <div className="py-16 text-center" data-testid="saved-empty">
        <Bookmark className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">No collections yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{emptyHint || 'Save posts to build your first playlist.'}</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {collections.map((col) => (
          <button
            key={col.groupId}
            data-testid="saved-collection-card"
            onClick={() => onOpenCollection(col.groupId)}
            className="group text-left rounded-lg overflow-hidden bg-surface border border-border hover:border-brand/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* The cover — the collection's thumbnail (its cover media: the
                first thing saved, or the owner's pinned choice). A 4:3 frame
                (the playlist shape — a collection is a list, not a video) +
                the name/count below. No cover (a text-only collection, or a
                cover that can't be resolved) → the brand-tinted placeholder. */}
            <div
              className="relative aspect-[4/3] w-full overflow-hidden"
              style={{ backgroundColor: textTileColor(col.groupId) }}
            >
              {col.coverUrl ? (
                <img
                  src={col.coverUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(120% 85% at 22% 12%, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 42%, transparent 62%)',
                    }}
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Bookmark className="w-8 h-8 text-foreground/70" strokeWidth={1.5} />
                  </div>
                </>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-medium text-foreground truncate">{col.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {col.itemCount} item{col.itemCount === 1 ? '' : 's'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
