import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Scissors, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { editVideo, formatTimecode } from '@/lib/videoEditing';

export interface VideoEditResult {
  file: File;
  width: number;
  height: number;
  duration: number;
}

const RATIO_PRESETS: { key: string; label: string; ratio: number | null }[] = [
  { key: 'original', label: 'Original', ratio: null },
  { key: 'vertical', label: '9:16', ratio: 9 / 16 },
  { key: 'square', label: '1:1', ratio: 1 },
  { key: 'portrait', label: '4:5', ratio: 4 / 5 },
  { key: 'landscape', label: '16:9', ratio: 16 / 9 },
];

const MIN_TRIM_SECONDS = 0.5;

/**
 * The pre-post video editor — a bottom sheet with trim (in/out points) and
 * ratio crop (cover-crop presets). The edit runs client-side (canvas +
 * MediaRecorder, video-experience.md); the finished file is what gets
 * uploaded, the node never sees the original.
 *
 * The controls are live: the preview shows the cropped frame the moment a
 * ratio is picked (object-cover in a ratio-locked frame — the same center
 * cover-crop the re-encode produces), the trim window has draggable in/out
 * handles, the playhead runs on rAF (a ref-driven DOM update, not the 4Hz
 * timeupdate, so it never stutters or re-renders the sheet), and playback
 * loops inside the selected window so you preview exactly what ships.
 */
export function VideoEditorSheet({
  open,
  file,
  onClose,
  onEdited,
}: {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onEdited: (result: VideoEditResult) => void;
}) {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // One object URL per file — a fresh URL per render would restart playback
  // on every timeupdate and leak.
  const previewUrl = useMemo(() => (open && file ? URL.createObjectURL(file) : null), [open, file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Reset the editor state whenever a new file opens the sheet.
  useEffect(() => {
    if (open && file) {
      setStartTime(0);
      setEndTime(0); // 0 = "not set yet" → full duration once metadata loads
      setCurrentTime(0);
      setRatio(null);
      setProcessing(false);
      setError(null);
    }
  }, [open, file]);

  // End the video when the sheet closes (stops playback + audio).
  useEffect(() => {
    if (!open) videoRef.current?.pause();
  }, [open]);

  // Smooth playhead — a ref-driven DOM update on rAF. Reading
  // video.currentTime per frame and setting the playhead's `left` directly
  // keeps the line at 60fps without re-rendering the sheet (the 4Hz
  // timeupdate is what made the old playhead crawl in steps).
  useEffect(() => {
    if (!open || !duration) return;
    const tick = () => {
      const v = videoRef.current;
      const ph = playheadRef.current;
      if (v && ph) {
        const pct = Math.max(0, Math.min(100, (v.currentTime / duration) * 100));
        ph.style.left = `${pct}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [open, duration]);

  const handleDuration = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    setDuration(d);
    setEndTime((prev) => (prev === 0 ? d : prev));
  }, []);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !isFinite(t)) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || 0));
  }, []);

  // The selected window (0 → full duration until the user sets an out-point).
  const effStart = startTime;
  const effEnd = endTime > 0 ? endTime : duration;

  // Keeps the time readout + Set in/out current (4Hz is plenty for a number
  // and a button) AND loops playback inside the selected window: when the
  // video crosses the out-point, jump back to the in-point so the preview
  // shows exactly what ships.
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      setCurrentTime(v.currentTime);
      if (effEnd > effStart && v.currentTime >= effEnd - 0.05) {
        v.currentTime = effStart;
        try {
          void v.play().catch(() => {});
        } catch {
          // jsdom: play() is not implemented — the seek already happened.
        }
      }
    },
    [effStart, effEnd],
  );

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = timelineRef.current;
      if (!el || !duration) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(frac * duration);
    },
    [duration, seekTo],
  );

  // Draggable in/out handles. A pointerdown on a handle tracks pointermove
  // on the window until pointerup, converting the x position to a time. The
  // handle is clamped to the other handle ± the min trim so the window can
  // never invert or collapse. (Each drag moves only one handle, so the
  // captured other-boundary is stable for the duration of the drag.)
  const beginDrag = useCallback(
    (which: 'in' | 'out') => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = timelineRef.current;
      if (!el || !duration) return;
      const rect = el.getBoundingClientRect();
      const timeAt = (clientX: number) => {
        const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return frac * duration;
      };
      const onMove = (ev: PointerEvent) => {
        const t = timeAt(ev.clientX);
        if (which === 'in') {
          setStartTime(Math.max(0, Math.min(t, (endTime || duration) - MIN_TRIM_SECONDS)));
        } else {
          setEndTime(Math.min(duration, Math.max(t, startTime + MIN_TRIM_SECONDS)));
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [duration, endTime, startTime],
  );

  const setInPoint = useCallback(() => {
    const next = Math.min(currentTime, (endTime || duration) - MIN_TRIM_SECONDS);
    setStartTime(Math.max(0, next));
  }, [currentTime, endTime, duration]);

  const setOutPoint = useCallback(() => {
    const next = Math.max(currentTime, startTime + MIN_TRIM_SECONDS);
    setEndTime(Math.min(duration || next, next));
  }, [currentTime, startTime, duration]);

  const resetTrim = useCallback(() => {
    setStartTime(0);
    setEndTime(duration);
  }, [duration]);

  const trimmed = endTime > 0 && (startTime > 0 || endTime < duration);
  const hasEdits = trimmed || ratio !== null;

  const handleApply = useCallback(async () => {
    if (!file || !duration || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await editVideo(file, {
        startTime,
        endTime,
        cropRatio: ratio,
      });
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
      const edited = new File([result.blob], `${baseName}-edited.webm`, { type: result.mimeType });
      console.log('[video-editor] apply — edited file ready:', edited.name, edited.size, 'bytes');
      onEdited({ file: edited, width: result.width, height: result.height, duration: result.duration });
    } catch (e) {
      console.error('[video-editor] apply — edit failed:', e);
      setError(e instanceof Error ? e.message : 'Could not edit the video. Try again.');
    } finally {
      setProcessing(false);
    }
  }, [file, duration, processing, startTime, endTime, ratio, onEdited]);

  if (!open || !file) return null;

  const startPct = duration ? (effStart / duration) * 100 : 0;
  const endPct = duration ? (effEnd / duration) * 100 : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Edit video">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={processing ? undefined : onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-lg rounded-t-lg border-t border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.35)] sm:rounded-lg sm:border"
        data-testid="video-editor"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-medium text-foreground">Edit video</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            aria-label="Close"
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live crop preview — when a ratio is picked, the frame locks to that
            ratio and the video cover-crops into it (the exact center crop the
            re-encode produces). Original shows the natural frame. */}
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-lg bg-background ring-1 ring-border',
            ratio === null && 'flex justify-center',
          )}
          style={ratio !== null ? { aspectRatio: String(ratio) } : undefined}
          data-testid="video-editor-preview-frame"
        >
          <video
            ref={videoRef}
            src={previewUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className={cn(
              'rounded-lg',
              ratio !== null ? 'h-full w-full object-cover' : 'max-h-72 w-auto max-w-full object-contain',
            )}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleDuration}
            data-testid="video-editor-preview"
          />
        </div>

        {/* Trim */}
        <div className="mt-4" data-testid="video-editor-trim">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Scissors className="w-3.5 h-3.5" />
              Trim
            </span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {formatTimecode(effStart)} <span className="text-muted-foreground">/</span> {formatTimecode(effEnd)}
              <span className="ml-2 text-muted-foreground">
                ({formatTimecode(Math.max(0, effEnd - effStart))})
              </span>
            </span>
          </div>

          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            className="relative h-10 cursor-pointer touch-none select-none rounded bg-elevated ring-1 ring-border"
            data-testid="video-editor-timeline"
          >
            {/* Dimmed regions outside the selected window */}
            <div
              className="absolute inset-y-0 left-0 rounded-l bg-background/40"
              style={{ width: `${startPct}%` }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r bg-background/40"
              style={{ width: `${Math.max(0, 100 - endPct)}%` }}
              aria-hidden="true"
            />
            {/* Selected window */}
            <div
              className="absolute inset-y-0 border-x-2 border-brand bg-brand/25"
              style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
              data-testid="video-editor-selection"
            />
            {/* Playhead — position is driven by the rAF loop (ref), not state */}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground"
              style={{ left: '0%' }}
              aria-hidden="true"
              data-testid="video-editor-playhead"
            />
            {/* Draggable in-point handle */}
            <div
              role="slider"
              aria-label="Trim in point"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 100) / 100}
              aria-valuenow={Math.round(effStart * 100) / 100}
              onPointerDown={beginDrag('in')}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-y-0 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: `${startPct}%` }}
              data-testid="video-editor-handle-in"
            >
              <div className="h-full w-1 rounded bg-brand" />
            </div>
            {/* Draggable out-point handle */}
            <div
              role="slider"
              aria-label="Trim out point"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 100) / 100}
              aria-valuenow={Math.round(effEnd * 100) / 100}
              onPointerDown={beginDrag('out')}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-y-0 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: `${endPct}%` }}
              data-testid="video-editor-handle-out"
            >
              <div className="h-full w-1 rounded bg-brand" />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={setInPoint} disabled={processing || !duration} data-testid="video-editor-set-in">
              Set in
            </Button>
            <Button variant="outline" size="sm" onClick={setOutPoint} disabled={processing || !duration} data-testid="video-editor-set-out">
              Set out
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetTrim}
              disabled={processing || !trimmed}
              className="text-muted-foreground hover:text-foreground"
              data-testid="video-editor-reset-trim"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset
            </Button>
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">{formatTimecode(currentTime)}</span>
          </div>
        </div>

        {/* Crop */}
        <div className="mt-4" data-testid="video-editor-crop">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Crop to ratio</span>
          <div className="flex flex-wrap gap-1.5">
            {RATIO_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setRatio(preset.ratio)}
                disabled={processing}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-colors',
                  ratio === preset.ratio
                    ? 'border-brand bg-brand-muted text-brand-300'
                    : 'border-border text-muted-foreground hover:border-brand/50',
                )}
                data-testid={`video-editor-ratio-${preset.key}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-danger" role="alert" data-testid="video-editor-error">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={processing} data-testid="video-editor-cancel">
            Cancel
          </Button>
          <Button
            variant="brand"
            className="flex-1"
            onClick={handleApply}
            disabled={processing || !hasEdits || !duration}
            data-testid="video-editor-apply"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Editing…
              </>
            ) : (
              'Apply'
            )}
          </Button>
        </div>
        {processing && (
          <p className="mt-2 text-center text-xs text-muted-foreground" data-testid="video-editor-progress">
            Editing in real time — this takes as long as the clip.
          </p>
        )}
      </div>
    </div>
  );
}
