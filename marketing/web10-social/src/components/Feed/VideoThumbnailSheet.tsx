import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReliableImage } from '@web10/discover/image';
import { cn } from '@/lib/utils';
import { formatTimecode } from '@/lib/videoEditing';
import {
  captureVideoFrames,
  generateThumbnail,
  thumbnailCandidateTimes,
  getVideoInfo,
  type VideoFrameCapture,
  type VideoThumbnailSelection,
} from '@/lib/mediaProcessing';

/** The tray item fields the picker needs (a video item only). */
export interface ThumbnailPickerItem {
  id: number;
  file: File;
  duration: number;
  /** The pick the tray already carries (a frame's time, or a custom image). */
  thumbnail?: VideoThumbnailSelection;
}

/**
 * The video thumbnail picker (video-experience.md "Creator Controls — Cover
 * frame pick"): the creator chooses the poster, not the auto-extracted one.
 *
 * Two sources, one seam:
 * - a few frames captured from the video (thumbnailCandidateTimes — the
 *   quarter frame capped at 5s is candidate 0: the auto-poster's exact seek,
 *   so "keep the default" is a real choice here);
 * - the creator's own image (downscaled through generateThumbnail — the
 *   album-art idiom).
 *
 * The pick rides the existing `thumbnail_object_key` (uploadMedia's
 * thumbnailFile) — zero node surface, D60. Captures run lazily when the
 * sheet opens (the intent signal), on one `<video>` with sequential seeks.
 */
export function VideoThumbnailSheet({
  open,
  item,
  onClose,
  onApply,
}: {
  open: boolean;
  item: ThumbnailPickerItem | null;
  onClose: () => void;
  onApply: (selection: VideoThumbnailSelection) => void;
}) {
  const [frames, setFrames] = useState<VideoFrameCapture[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [custom, setCustom] = useState<VideoThumbnailSelection | null>(null);
  const [customBusy, setCustomBusy] = useState(false);

  // The capture's object URLs (frames + the processed custom image) —
  // revoked on close/unmount. The tray keeps its own URL for the applied
  // pick (the selection's blob is shared by reference, not copied).
  const urlsRef = useRef(new Set<string>());
  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const frameUrls = useMemo(
    () => frames.map((f) => {
      const url = URL.createObjectURL(f.blob);
      urlsRef.current.add(url);
      return url;
    }),
    [frames],
  );
  const customUrl = useMemo(() => {
    if (!custom) return null;
    const url = URL.createObjectURL(custom.blob);
    urlsRef.current.add(url);
    return url;
  }, [custom]);

  // Latest item (the composer re-renders it — the effect keys on open + id,
  // so alt-text typing never re-runs the capture).
  const itemRef = useRef(item);
  itemRef.current = item;

  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;
    const target = item;
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = new Set();
    setFrames([]);
    setError(null);
    setCustom(null);
    setCustomBusy(false);
    // Pre-select the tray's existing pick (the re-open shows where the user
    // left off): a custom pick restores the creator's image; else candidate 0
    // until the capture settles (the time-matched frame, or the default).
    if (target.thumbnail?.custom) {
      setCustom({ blob: target.thumbnail.blob, mimeType: target.thumbnail.mimeType, custom: true });
      setSelectedFrame(null);
    } else {
      setSelectedFrame(0);
    }
    setCapturing(true);
    const run = async () => {
      try {
        const source = itemRef.current;
        if (!source || source.id !== target.id) return;
        let duration = target.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          duration = (await getVideoInfo(source.file)).duration;
        }
        const times = thumbnailCandidateTimes(duration);
        if (!times.length) throw new Error('Could not read this video to offer frames.');
        console.log('[thumbnail-picker] capturing frames — times:', times.map((t) => formatTimecode(t)).join(', '));
        const captured = await captureVideoFrames(source.file, times);
        if (cancelled) return;
        setFrames(captured);
        // The pre-selection: the tray's pick if it matches a captured frame
        // (same time within epsilon), else candidate 0. A custom pick is
        // already restored above (the creator's image — not a frame).
        if (target.thumbnail && !target.thumbnail.custom) {
          const match = captured.findIndex((f) => Math.abs(f.time - (target.thumbnail?.time ?? 0)) < 0.25);
          setSelectedFrame(match >= 0 ? match : 0);
        } else if (!target.thumbnail) {
          setSelectedFrame(0);
        }
        console.log('[thumbnail-picker] frames captured:', captured.length);
      } catch (e) {
        console.error('[thumbnail-picker] frame capture failed:', e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not capture frames from this video.');
      } finally {
        if (!cancelled) setCapturing(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, item?.id, item?.thumbnail]);

  const handleCustomPick = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const target = itemRef.current;
      if (!target) return;
      setCustomBusy(true);
      try {
        // The album-art idiom: the uploaded image is downscale+recompressed
        // to the 480-edge thumbnail — the pick ships exactly this. The frame
        // candidates stay offered (the user can switch back to a frame).
        const thumb = await generateThumbnail(file);
        if (!itemRef.current || itemRef.current.id !== target.id) return;
        setCustom({ blob: thumb.blob, mimeType: thumb.mimeType, custom: true });
        setSelectedFrame(null);
        console.log('[thumbnail-picker] custom image picked:', file.name, thumb.mimeType);
      } catch (e) {
        console.error('[thumbnail-picker] custom image failed:', e);
        setError('That image could not be used as a thumbnail. Try a different one.');
      } finally {
        setCustomBusy(false);
      }
    },
    [],
  );

  if (!open || !item) return null;

  const canApply =
    !capturing &&
    ((selectedFrame !== null && frames[selectedFrame]) || (custom !== null && !customBusy));

  const currentUrl = custom !== null ? customUrl : selectedFrame !== null ? frameUrls[selectedFrame] : null;
  const currentLabel =
    custom !== null
      ? 'Your image'
      : selectedFrame !== null && frames[selectedFrame]
        ? `Frame at ${formatTimecode(frames[selectedFrame].time)}`
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Choose video thumbnail"
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={canApply ? undefined : onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-lg rounded-t-lg border-t border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.35)] sm:rounded-lg sm:border"
        data-testid="video-thumbnail-sheet"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-medium text-foreground">Video thumbnail</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">This picture represents your video everywhere.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* The live preview of the current pick (what will ship). */}
        <div
          className="relative w-full overflow-hidden rounded-lg bg-background ring-1 ring-border flex items-center justify-center"
          style={{ maxHeight: 288 }}
          data-testid="video-thumbnail-preview"
        >
          {error ? (
            <div className="flex flex-col items-center gap-2 p-6" data-testid="video-thumbnail-error">
              <AlertTriangle className="w-5 h-5 text-danger" />
              <p className="text-sm text-foreground text-center leading-relaxed">{error}</p>
            </div>
          ) : capturing || !currentUrl ? (
            <div className="w-full py-16" aria-label="Preparing frames">
              <div className="mx-auto h-4 w-40 animate-pulse rounded bg-elevated" />
              <div className="mx-auto mt-2 h-2.5 w-28 animate-pulse rounded bg-elevated" />
            </div>
          ) : (
            <>
              <ReliableImage
                src={currentUrl}
                alt={currentLabel || 'Thumbnail preview'}
                className="max-h-72 w-auto max-w-full object-contain"
              />
              {currentLabel && (
                <span className="absolute bottom-1.5 left-1.5 bg-background/80 rounded px-1.5 py-0.5 text-[0.625rem] font-mono tabular-nums text-foreground">
                  {currentLabel}
                </span>
              )}
            </>
          )}
        </div>

        {/* The options: the captured frames + the creator's own image. */}
        <div className="mt-3 grid grid-cols-4 gap-2" data-testid="video-thumbnail-frames">
          {capturing
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-lg bg-elevated" aria-hidden="true" />
              ))
            : frames.map((frame, i) => (
                <button
                  key={frame.time}
                  type="button"
                  onClick={() => {
                    setCustom(null);
                    setSelectedFrame(i);
                  }}
                  aria-label={`Use the frame at ${formatTimecode(frame.time)}`}
                  aria-pressed={selectedFrame === i && custom === null}
                  className={cn(
                    'relative aspect-video overflow-hidden rounded-lg transition-all duration-150',
                    selectedFrame === i && custom === null
                      ? 'ring-2 ring-brand'
                      : 'ring-1 ring-border hover:ring-brand/50',
                  )}
                  data-testid={`video-thumbnail-frame-${i}`}
                >
                  <ReliableImage src={frameUrls[i]} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
                  <span className="absolute bottom-1 left-1 bg-background/80 rounded px-1 text-[0.625rem] font-mono tabular-nums text-foreground">
                    {formatTimecode(frame.time)}
                  </span>
                </button>
              ))}

          <label
            className={cn(
              'relative flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg transition-all duration-150',
              custom !== null
                ? 'ring-2 ring-brand'
                : 'ring-1 ring-border hover:ring-brand/50',
            )}
            data-testid="video-thumbnail-custom"
          >
            {custom && customUrl ? (
              <ReliableImage src={customUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-elevated/50 text-muted-foreground">
                {customBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                ) : (
                  <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
                )}
                <span className="px-1 text-center text-[0.5625rem] font-medium leading-tight">
                  {custom ? 'Change image' : 'Use your own image'}
                </span>
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCustomPick(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {error && (
          <p className="mt-2 text-xs text-muted-foreground" role="alert">
            You can still use your own image below — frames from this video are unavailable.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} data-testid="video-thumbnail-cancel">
            Cancel
          </Button>
          <Button
            variant="brand"
            className="flex-1"
            onClick={() => {
              if (custom !== null) onApply(custom);
              else if (selectedFrame !== null && frames[selectedFrame]) {
                onApply({
                  blob: frames[selectedFrame].blob,
                  mimeType: frames[selectedFrame].mimeType,
                  time: frames[selectedFrame].time,
                });
              }
            }}
            disabled={!canApply}
            data-testid="video-thumbnail-apply"
          >
            Use thumbnail
          </Button>
        </div>
      </div>
    </div>
  );
}
