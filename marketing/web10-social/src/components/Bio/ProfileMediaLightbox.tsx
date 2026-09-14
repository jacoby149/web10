import { useEffect, useMemo, useState } from 'react';
import { X, Check, Loader2, ImagePlus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MediaRecord, PostRecord, ResolvedMediaRef } from '@/data/types';
import { mediaRefId, fromResolvedMediaRef } from '@/data/types';
import { cn } from '@/lib/utils';

/**
 * The profile face lightbox — the Facebook-like "your profile picture is a
 * photo you picked from your posts."
 *
 * Two jobs, one modal:
 *  - **View** (everyone): the profile picture or banner, enlarged. Click the
 *    avatar or banner on a profile → it opens here. Escape / backdrop / close
 *    dismiss.
 *  - **Pick** (owner only): below the enlarged face, a grid of the owner's own
 *    posts' media. Tapping one sets it as the profile picture or banner — the
 *    face becomes a real post's media, "selected as the profile picture."
 *
 * The picker is a pure view: the parent owns the save (it calls saveProfile
 * with the chosen ref and re-resolves media), so this component only reports
 * the pick via `onSelect`. That keeps the data flow in the screen (the same
 * place the upload path already lives) and makes the modal trivially testable.
 */

export interface ProfileMediaOption {
  post: PostRecord;
  ref: string | ResolvedMediaRef;
}

interface ProfileMediaLightboxProps {
  /** The face media to show enlarged (the current avatar or banner). */
  media: MediaRecord | null;
  /** Which face this is — drives the label ("Profile picture" / "Banner"). */
  field: 'avatar' | 'banner';
  onClose: () => void;
  /** Owner of the profile — enables the pick-from-your-posts grid. */
  isOwner: boolean;
  /** The owner's own posts' media (the picker's source). Owner only. */
  options?: ProfileMediaOption[];
  /** The owner tapped a media to set as the face. */
  onSelect?: (ref: string | ResolvedMediaRef) => void;
  /** A set-as is in flight (the tapped tile shows a spinner). */
  saving?: boolean;
  /** The owner's display name — shown in the picker header. */
  displayName?: string;
}

export function ProfileMediaLightbox({
  media,
  field,
  onClose,
  isOwner,
  options = [],
  onSelect,
  saving = false,
  displayName,
}: ProfileMediaLightboxProps) {
  const [savingId, setSavingId] = useState<string | null>(null);

  const isVideo = media?.mime_type?.startsWith('video/');
  const label = field === 'avatar' ? 'Profile picture' : 'Banner';

  // The picker's media, resolved (deduped by doc_id, resolved records only —
  // an unresolvable ref has no url to render or set). Only image media are
  // pickable: a profile face is an image (the upload path accepts image/*).
  const pickable = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; ref: string | ResolvedMediaRef; media: MediaRecord }[] = [];
    for (const opt of options) {
      const id = mediaRefId(opt.ref);
      if (!id || seen.has(id)) continue;
      const rec = typeof opt.ref === 'string' ? null : opt.ref;
      if (!rec) continue; // unresolvable (bare string) — nothing to render
      const media = fromResolvedMediaRef(rec);
      if (!media.mime_type?.startsWith('image/')) continue;
      seen.add(id);
      out.push({ id, ref: opt.ref, media });
    }
    return out;
  }, [options]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function handlePick(id: string, ref: string | ResolvedMediaRef) {
    if (saving || savingId) return;
    setSavingId(id);
    try {
      onSelect?.(ref);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-overlay-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="profile-media-lightbox"
    >
      <div
        className="relative flex w-full max-w-2xl max-h-[88vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_30px_rgb(0_0_0/0.35)] animate-panel-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          data-testid="profile-media-lightbox-close"
          className="absolute right-2 top-2 z-10 bg-background/60 backdrop-blur-sm hover:bg-background/80"
        >
          <X className="h-5 w-5" />
        </Button>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Enlarged face */}
          <div className="relative flex items-center justify-center bg-black">
            {media ? (
              isVideo ? (
                <video
                  src={media.url}
                  poster={media.thumbnail_url}
                  className="max-h-[40vh] w-full object-contain sm:max-h-[50vh]"
                  playsInline
                  muted
                  controls
                />
              ) : (
                <img
                  src={media.url}
                  alt={field === 'avatar' ? `${displayName || 'Profile'} profile picture` : 'Banner'}
                  className="max-h-[40vh] w-full object-contain sm:max-h-[50vh]"
                  data-testid="profile-media-lightbox-image"
                />
              )
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No image set
              </div>
            )}
          </div>

          {/* Owner picker — the face becomes a post's media, selected as the
              profile picture (the Facebook-like system). */}
          {isOwner && (
            <div className="border-t border-border p-4" data-testid="profile-media-picker">
              <div className="mb-3 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">
                  Set as {label.toLowerCase()}
                </h2>
                <span className="text-xs text-muted-foreground">
                  — pick one of your posts
                </span>
              </div>
              {pickable.length ? (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {pickable.map(({ id, ref, media: m }) => {
                    const busy = savingId === id;
                    const isVideoTile = m.mime_type?.startsWith('video/');
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={saving || busy}
                        onClick={() => handlePick(id, ref)}
                        aria-label={`Set as ${label.toLowerCase()}`}
                        data-testid="profile-media-pick"
                        className="group relative aspect-square overflow-hidden rounded-md bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60"
                      >
                        {isVideoTile ? (
                          <div className="w-full h-full relative">
                            <video
                              src={m.url}
                              poster={m.thumbnail_url}
                              className="w-full h-full object-cover"
                              preload="metadata"
                              playsInline
                              muted
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <Play className="w-4 h-4 text-white" strokeWidth={2} />
                            </div>
                          </div>
                        ) : (
                          <img
                            src={m.url}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                        {busy && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                            <Loader2 className="h-5 w-5 text-foreground animate-spin" />
                          </div>
                        )}
                        {/* The "set" affordance — a check ring on hover */}
                        <div className="absolute inset-0 flex items-center justify-center bg-brand/0 opacity-0 transition-opacity duration-150 group-hover:bg-brand/20 group-hover:opacity-100">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm">
                            <Check className="h-4 w-4 text-foreground" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Post a photo first, then pick it as your {label.toLowerCase()}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
