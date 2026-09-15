import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Loader2, ImagePlus, RotateCcw, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MediaRecord, PostRecord, ResolvedMediaRef } from '@/data/types';
import { mediaRefId, fromResolvedMediaRef } from '@/data/types';
import { cn } from '@/lib/utils';
import {
  AVATAR_FACE,
  BANNER_FACE,
  clampFaceCrop,
  cropFaceImage,
  type FaceCropState,
} from '@/lib/faceCrop';

/**
 * The profile face lightbox — the Facebook-like "your profile picture is a
 * photo you picked from your posts."
 *
 * Two jobs, one modal:
 *  - **View** (everyone): the profile picture or banner, enlarged. Click the
 *    avatar or banner on a profile → it opens here. Escape / backdrop / close
 *    dismiss.
 *  - **Pick** (owner only): below the enlarged face, a grid of the owner's own
 *    posts' media. Tapping one opens the **crop step** — the image in the
 *    actual display frame (a circle for the avatar, the wide band for the
 *    banner), pan + zoom to frame it, confirm. The confirmed crop is encoded
 *    client-side and reported via `onCrop` — the parent owns the upload +
 *    save (it uploads the crop as a new media doc and saves its doc_id as
 *    avatar_ref / banner_ref). The face IS the crop, so every surface shows
 *    the framed image, not a center-cropped guess.
 *
 * The picker is a pure view: the parent owns the save, so this component
 * only reports intent (the crop blob + dims). That keeps the data flow in
 * the screen (the same place the upload path already lives) and makes the
 * modal trivially testable.
 */

export interface ProfileMediaOption {
  post: PostRecord;
  ref: string | ResolvedMediaRef;
}

export interface FaceCropResult {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
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
  /** The owner confirmed a crop — the parent uploads it + saves the ref. */
  onCrop?: (result: FaceCropResult) => void;
  /** A set-as is in flight (the confirm button shows a spinner). */
  saving?: boolean;
  /** The owner's display name — shown in the picker header. */
  displayName?: string;
}

// The preview frames, in CSS pixels. The crop math is resolution-independent
// (it derives the source rect from the frame ratio + the image's natural
// dims), so the preview size only affects how big the user sees it.
const AVATAR_FRAME = 224; // square — the circle mask sits inside
const BANNER_FRAME_W = 560;
const BANNER_FRAME_H = Math.round(BANNER_FRAME_W / BANNER_FACE.ratio); // ≈ 128

export function ProfileMediaLightbox({
  media,
  field,
  onClose,
  isOwner,
  options = [],
  onCrop,
  saving = false,
  displayName,
}: ProfileMediaLightboxProps) {
  const isVideo = media?.mime_type?.startsWith('video/');
  const label = field === 'avatar' ? 'Profile picture' : 'Banner';
  const frameW = field === 'avatar' ? AVATAR_FRAME : BANNER_FRAME_W;
  const frameH = field === 'avatar' ? AVATAR_FRAME : BANNER_FRAME_H;

  const [savingId, setSavingId] = useState<string | null>(null);
  // The media currently in the crop step (the tapped tile's image).
  const [cropId, setCropId] = useState<string | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  // The crop transform (pan + zoom), reset per pick.
  const [crop, setCrop] = useState<FaceCropState>({ scale: 1, x: 0, y: 0 });
  const [cropError, setCropError] = useState<string | null>(null);
  // The image's natural dims (known once it loads — the clamp needs them).
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // The rendered frame width (the banner frame is fluid below its max — the
  // pan's pixel↔fraction conversion needs the real width, not the max).
  const [renderedW, setRenderedW] = useState<number>(frameW);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

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
      const m = fromResolvedMediaRef(rec);
      if (!m.mime_type?.startsWith('image/')) continue;
      seen.add(id);
      out.push({ id, ref: opt.ref, media: m });
    }
    return out;
  }, [options]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape in the crop step goes back to the picker, not out of the
        // modal (the crop is a sub-step, the modal is the surface).
        if (cropId) {
          setCropId(null);
          setCropUrl(null);
          setNatural(null);
          setCropError(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, cropId]);

  function startCrop(id: string, url: string) {
    console.log('[face-crop] start crop', { id, url, field });
    setCropId(id);
    setCropUrl(url);
    setCrop({ scale: 1, x: 0, y: 0 });
    setNatural(null);
    setCropError(null);
  }

  function backToPicker() {
    console.log('[face-crop] back to picker from', cropId);
    setCropId(null);
    setCropUrl(null);
    setNatural(null);
    setCropError(null);
  }

  // Track the rendered frame width (the banner frame is fluid below its max).
  useEffect(() => {
    if (!cropId) return;
    const el = frameRef.current;
    if (!el) return;
    const update = () => setRenderedW(el.getBoundingClientRect().width || frameW);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cropId, frameW]);

  // Wheel zoom (desktop) — anchored at the frame center (the simple,
  // predictable variant; the pan handles the rest).
  useEffect(() => {
    if (!cropId) return;
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCrop((prev) => {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const scale = Math.min(8, Math.max(1, prev.scale * factor));
        return natural ? clampFaceCrop({ ...prev, scale }, natural.w, natural.h, frameW, frameH) : { ...prev, scale };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [cropId, natural, frameW, frameH]);

  // Pointer pan (mouse + touch, one code path). The pan is stored as a
  // fraction of the frame half-size, so it is resolution-independent — the
  // same drag on a narrow phone frame and a wide desktop frame frames the
  // same part of the image.
  function onPointerDown(e: React.PointerEvent) {
    if (!cropId) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: crop.x, baseY: crop.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !natural) return;
    const halfW = renderedW / 2;
    const halfH = (renderedW * frameH) / (2 * frameW);
    const next = clampFaceCrop(
      {
        ...crop,
        x: drag.baseX + (e.clientX - drag.startX) / halfW,
        y: drag.baseY + (e.clientY - drag.startY) / halfH,
      },
      natural.w,
      natural.h,
      frameW,
      frameH,
    );
    setCrop(next);
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  const zoomBy = useCallback((factor: number) => {
    setCrop((prev) => {
      const scale = Math.min(8, Math.max(1, prev.scale * factor));
      return natural ? clampFaceCrop({ ...prev, scale }, natural.w, natural.h, frameW, frameH) : { ...prev, scale };
    });
  }, [natural, frameW, frameH]);

  async function handleConfirm() {
    if (!cropUrl || !natural || saving || savingId) return;
    setSavingId(cropId);
    setCropError(null);
    console.log('[face-crop] confirm', { id: cropId, field, crop });
    try {
      const out = field === 'avatar' ? { size: AVATAR_FACE.outSize } : { w: BANNER_FACE.outW, h: BANNER_FACE.outH };
      const result = await cropFaceImage(cropUrl, crop, frameW, frameH, out);
      console.log('[face-crop] cropped', { width: result.width, height: result.height, bytes: result.blob.size });
      onCrop?.(result);
    } catch (e) {
      console.error('[face-crop] crop failed:', e);
      setCropError(e instanceof Error ? e.message : 'Could not crop the image. Please try again.');
    } finally {
      setSavingId(null);
    }
  }

  // The crop preview: the image cover-fit to the frame at scale 1, then
  // scaled + panned by the crop state. The base (cover-fit) size is derived
  // from the frame + natural dims — the same math the crop uses, so the
  // preview IS the crop.
  const baseSize = useMemo(() => {
    if (!natural) return null;
    const cover = Math.max(frameW / natural.w, frameH / natural.h);
    return { w: natural.w * cover, h: natural.h * cover };
  }, [natural, frameW, frameH]);

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
          {cropId && cropUrl ? (
            /* ── The crop step — the image in the actual display frame ── */
            <div className="flex flex-col items-center gap-4 p-6" data-testid="face-crop-view">
              <div className="flex items-center gap-2 self-stretch">
                <button
                  type="button"
                  onClick={backToPicker}
                  aria-label="Back to picker"
                  data-testid="face-crop-back"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-medium text-foreground">
                  Set as {label.toLowerCase()}
                </h2>
                <span className="text-xs text-muted-foreground">
                  — drag to position, scroll or pinch to zoom
                </span>
              </div>

              {/* The frame — the circle for the avatar, the band for the banner. */}
              <div
                ref={frameRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={cn(
                  'relative touch-none select-none overflow-hidden bg-elevated',
                  field === 'avatar' ? 'rounded-full' : 'rounded-md',
                  natural ? 'cursor-grab active:cursor-grabbing' : '',
                )}
                style={field === 'avatar'
                  ? { width: frameW, height: frameH }
                  : { width: '100%', maxWidth: frameW, aspectRatio: `${frameW} / ${frameH}` }}
                data-testid="face-crop-frame"
                role="application"
                aria-label={`Crop ${label.toLowerCase()}`}
              >
                {cropUrl && (
                  <img
                    src={cropUrl}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      console.log('[face-crop] image loaded', { w: img.naturalWidth, h: img.naturalHeight });
                      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                    className="absolute left-1/2 top-1/2 max-w-none"
                    style={baseSize ? {
                      width: baseSize.w,
                      height: baseSize.h,
                      transform: `translate(calc(-50% + ${crop.x * renderedW / 2}px), calc(-50% + ${crop.y * renderedW * frameH / (2 * frameW)}px)) scale(${crop.scale})`,
                    } : undefined}
                    data-testid="face-crop-image"
                  />
                )}
                {/* The circle guide for the avatar — the ring is the display
                    mask; the dimmed corners show what gets cropped out. */}
                {field === 'avatar' && (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{ boxShadow: 'inset 0 0 0 9999px rgb(0 0 0 / 0.55)' }}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Zoom controls (the touch-friendly pair — the wheel covers
                  desktop, these cover everyone). */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => zoomBy(1 / 1.3)}
                  aria-label="Zoom out"
                  data-testid="face-crop-zoom-out"
                  disabled={!natural || crop.scale <= 1}
                  className="border border-border"
                >
                  <span className="text-sm font-medium">−</span>
                </Button>
                <span className="w-14 text-center text-xs tabular-nums text-muted-foreground">
                  {Math.round(crop.scale * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => zoomBy(1.3)}
                  aria-label="Zoom in"
                  data-testid="face-crop-zoom-in"
                  disabled={!natural || crop.scale >= 8}
                  className="border border-border"
                >
                  <span className="text-sm font-medium">+</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCrop({ scale: 1, x: 0, y: 0 })}
                  aria-label="Reset crop"
                  data-testid="face-crop-reset"
                  disabled={!natural || (crop.scale === 1 && crop.x === 0 && crop.y === 0)}
                  className="border border-border"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              {cropError && (
                <p className="text-sm text-danger" role="alert" data-testid="face-crop-error">
                  {cropError}
                </p>
              )}

              <div className="flex items-center gap-2 self-stretch">
                <Button
                  variant="ghost"
                  onClick={backToPicker}
                  className="flex-1"
                  data-testid="face-crop-cancel"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="brand"
                  onClick={handleConfirm}
                  disabled={!natural || saving || !!savingId}
                  className="flex-1"
                  data-testid="face-crop-confirm"
                >
                  {saving || savingId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {saving || savingId ? 'Setting…' : `Set as ${label.toLowerCase()}`}
                </Button>
              </div>
            </div>
          ) : (
            <>
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

              {/* Owner picker — the face becomes a post's media, selected as
                  the profile picture (the Facebook-like system). */}
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
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={saving || !!savingId}
                            onClick={() => startCrop(id, m.url)}
                            aria-label={`Set as ${label.toLowerCase()}`}
                            data-testid="profile-media-pick"
                            className="group relative aspect-square overflow-hidden rounded-md bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60"
                          >
                            <img
                              src={m.url}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-105"
                              loading="lazy"
                            />
                            {busy && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                                <Loader2 className="h-5 w-5 text-foreground animate-spin" />
                              </div>
                            )}
                            {/* The "set" affordance — a crop badge on hover */}
                            <div className="absolute inset-0 flex items-center justify-center bg-brand/0 opacity-0 transition-opacity duration-150 group-hover:bg-brand/20 group-hover:opacity-100">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm">
                                <ImagePlus className="h-4 w-4 text-foreground" />
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
