import { useEffect, useState } from 'react';
import { X, Megaphone, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdRecord, AdAlbum } from '@/data';
import { cn } from '@/lib/utils';

/**
 * The "Pin an ad" picker — a bottom sheet listing the creator's ads (from an
 * album or all) to pin to the post being composed, or "No ad" to clear.
 * Selecting an ad sets the post's `ad_preference` (`pinned` + the ad's doc_id).
 */
export function AdPicker({
  open,
  ads,
  albums,
  selectedAdId,
  loading,
  onClose,
  onSelect,
  onClear,
}: {
  open: boolean;
  ads: AdRecord[];
  albums: AdAlbum[];
  selectedAdId?: string;
  loading: boolean;
  onClose: () => void;
  onSelect: (ad: AdRecord) => void;
  onClear: () => void;
}) {
  const [filterAlbum, setFilterAlbum] = useState<string | null>(null);
  useEffect(() => {
    if (open) setFilterAlbum(null);
  }, [open]);

  if (!open) return null;

  const visible = filterAlbum ? ads.filter((a) => a.albums?.includes(filterAlbum)) : ads;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Pin an ad">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-t-lg border-t border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.35)]" data-testid="ad-picker">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-medium text-foreground">Pin an ad</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading your ads…</div>
        ) : ads.length === 0 ? (
          <div className="py-8 text-center">
            <Megaphone className="mx-auto w-8 h-8 text-muted-foreground" strokeWidth={1.25} />
            <p className="mt-3 text-sm font-medium text-foreground">No ads yet</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
              Create an ad in your Studio, then come back to pin it to a post.
            </p>
          </div>
        ) : (
          <>
            {albums.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <FilterChip
                  label="All"
                  active={filterAlbum === null}
                  onClick={() => setFilterAlbum(null)}
                  count={ads.length}
                />
                {albums.map((album) => (
                  <FilterChip
                    key={album._id}
                    label={album.name || 'Album'}
                    active={filterAlbum === album._id}
                    onClick={() => setFilterAlbum(album._id!)}
                    count={ads.filter((a) => a.albums?.includes(album._id!)).length}
                  />
                ))}
              </div>
            )}

            <div className="max-h-72 space-y-1 overflow-y-auto">
              <button
                type="button"
                onClick={onClear}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  !selectedAdId ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                )}
                data-testid="ad-picker-none"
              >
                <span className="flex-1">No ad</span>
                {!selectedAdId && <Check className="w-4 h-4" />}
              </button>
              {visible.map((ad) => (
                <button
                  key={ad._id}
                  type="button"
                  onClick={() => onSelect(ad)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
                    selectedAdId === ad._id ? 'bg-brand-muted' : 'hover:bg-elevated',
                  )}
                  data-testid={`ad-picker-item-${ad._id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm', selectedAdId === ad._id ? 'text-brand-300' : 'text-foreground')}>
                      {ad.text || 'Untitled ad'}
                    </p>
                    {ad.offer?.partner && (
                      <p className="truncate text-xs text-muted-foreground">{ad.offer.partner}</p>
                    )}
                  </div>
                  {ad.status === 'paused' && (
                    <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">paused</span>
                  )}
                  {selectedAdId === ad._id && <Check className="w-4 h-4 text-brand-300 shrink-0" />}
                </button>
              ))}
              {visible.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No ads in this album yet.</p>
              )}
            </div>
          </>
        )}

        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onClose} data-testid="ad-picker-done">
          Done
        </Button>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active ? 'border-brand bg-brand-muted text-brand-300' : 'border-border text-muted-foreground hover:border-brand/50',
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
