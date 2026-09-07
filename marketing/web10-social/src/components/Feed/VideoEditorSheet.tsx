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

  const startPct = duration ? (startTime / duration) * 100 : 0;
  const endPct = duration ? ((endTime || duration) / duration) * 100 : 100;
  const playheadPct = duration ? (currentTime / duration) * 100 : 0;

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

        <video
          ref={videoRef}
          src={previewUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-72 rounded-lg bg-background object-contain ring-1 ring-border"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={handleDuration}
          data-testid="video-editor-preview"
        />

        {/* Trim */}
        <div className="mt-4" data-testid="video-editor-trim">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Scissors className="w-3.5 h-3.5" />
              Trim
            </span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {formatTimecode(startTime)} <span className="text-muted-foreground">/</span> {formatTimecode(endTime || duration)}
              <span className="ml-2 text-muted-foreground">
                ({formatTimecode(Math.max(0, (endTime || duration) - startTime))})
              </span>
            </span>
          </div>

          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            className="relative h-10 cursor-pointer rounded bg-elevated ring-1 ring-border"
            data-testid="video-editor-timeline"
          >
            {/* Selected window */}
            <div
              className="absolute inset-y-0 bg-brand/25 border-x-2 border-brand"
              style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
              data-testid="video-editor-selection"
            />
            {/* Playhead */}
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground"
              style={{ left: `${playheadPct}%` }}
              aria-hidden="true"
            />
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
