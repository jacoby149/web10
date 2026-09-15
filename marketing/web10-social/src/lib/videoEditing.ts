// Client-side video editing for the composer: trim (in/out) + ratio crop.
// The re-encode runs through ffmpeg.wasm (a deterministic file-to-file op in a
// Web Worker — no real-time capture, no A/V drift, no pitch shift). The
// FINISHED file is what gets uploaded; the node re-transcodes it to HLS.
// The no-op case (no trim, no crop) skips the re-encode entirely — see
// isNoopEdit + the PostComposer fast path.

import { transcodeWithFFmpeg } from '@/lib/ffmpegEngine';

export interface VideoEditOptions {
  /** In-point in seconds. Default 0. */
  startTime?: number;
  /** Out-point in seconds. Default = full duration. */
  endTime?: number;
  /** Target aspect ratio (width/height). null/undefined = no crop. */
  cropRatio?: number | null;
  /**
   * Progress callback, called with the fraction of the transcode done so far
   * (0 → 1). The encode runs through ffmpeg.wasm (as fast as the CPU allows),
   * so this is the only way the caller can show the user how much is left
   * instead of a bare spinner.
   */
  onProgress?: (fraction: number) => void;
}

export interface VideoEditResult {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  /** Duration of the edited output in seconds. */
  duration: number;
}

export interface CropGeometry {
  /** Source rect to draw (cover-crop into the target ratio, centered). */
  sourceX: number;
  sourceY: number;
  sourceW: number;
  sourceH: number;
  /** Output canvas dimensions (even, no upscale). */
  outW: number;
  outH: number;
}

/**
 * Cover-crop geometry: fill the target ratio, crop the overflow (center).
 * Output = the cropped window at source scale (no upscale), both dims
 * forced even (H.264/VP8 need even dims).
 */
export function computeCropGeometry(
  vw: number,
  vh: number,
  ratio: number,
): CropGeometry {
  let cropW: number;
  let cropH: number;
  if (vw / vh > ratio) {
    cropH = vh;
    cropW = vh * ratio;
  } else {
    cropW = vw;
    cropH = vw / ratio;
  }
  const outW = Math.max(2, Math.floor(cropW / 2) * 2);
  const outH = Math.max(2, Math.floor(cropH / 2) * 2);
  return {
    sourceX: (vw - cropW) / 2,
    sourceY: (vh - cropH) / 2,
    sourceW: cropW,
    sourceH: cropH,
    outW,
    outH,
  };
}

/** No-crop geometry: the source as-is (dims floored to even, no upscale). */
export function passthroughGeometry(vw: number, vh: number): CropGeometry {
  return {
    sourceX: 0,
    sourceY: 0,
    sourceW: vw,
    sourceH: vh,
    outW: Math.max(2, Math.floor(vw / 2) * 2),
    outH: Math.max(2, Math.floor(vh / 2) * 2),
  };
}

/**
 * True when the edit is a no-op — no trim (full duration) and no crop (source
 * ratio). A no-op edit re-encodes nothing, so callers should skip the
 * re-encode entirely and upload the original file directly: the node's ffmpeg
 * transcodes it to clean HLS (the deterministic path). Running a no-op through
 * the client re-encode (ffmpeg.wasm) would just burn CPU re-wrapping the same
 * pixels + sound for no benefit — and the no-op fast path is also what keeps
 * the common (unedited) upload from ever paying for the ~32MB engine.
 */
export function isNoopEdit(opts: VideoEditOptions, duration: number): boolean {
  const start = opts.startTime ?? 0;
  const end = opts.endTime ?? duration;
  const noTrim = start <= 0.05 && end >= duration - 0.05;
  const noCrop = opts.cropRatio == null;
  return noTrim && noCrop;
}

/** Read a video file's dimensions + duration (metadata only, no playback). */
async function readVideoMetadata(file: File): Promise<{ width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.src = url;
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('could not read video metadata'));
    });
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }
}

/**
 * Trim and/or crop a video file entirely in the browser, via ffmpeg.wasm.
 *
 * The re-encode is a deterministic file-to-file operation in a Web Worker —
 * no real-time capture, no A/V drift, no pitch shift (the "Darth Vader" bug).
 * The trim is frame-accurate (`-ss` before `-i` + re-encode), and the crop is
 * a `crop` filter to the cover-crop window at even output dims. Returns the
 * finished MP4 blob; the node re-transcodes it to HLS.
 *
 * Throws on a failed transcode.
 */
export async function editVideo(file: File, opts: VideoEditOptions = {}): Promise<VideoEditResult> {
  console.log(
    '[video-editor] editVideo — start (ffmpeg.wasm), file:',
    file.name,
    'opts:',
    JSON.stringify({
      startTime: opts.startTime ?? 0,
      endTime: opts.endTime ?? null,
      cropRatio: opts.cropRatio ?? null,
    }),
  );

  const { width: vw, height: vh, duration } = await readVideoMetadata(file);
  console.log('[video-editor] editVideo — source:', `${vw}x${vh}`, 'duration:', duration.toFixed(2));

  const start = Math.max(0, Math.min(opts.startTime ?? 0, Math.max(0, duration - 0.1)));
  const end = Math.max(start + 0.1, Math.min(opts.endTime ?? duration, duration));
  const outDuration = end - start;
  console.log(
    '[video-editor] editVideo — trim window:',
    `${start.toFixed(2)} → ${end.toFixed(2)} (${outDuration.toFixed(2)}s)`,
  );

  const geo = opts.cropRatio ? computeCropGeometry(vw, vh, opts.cropRatio) : passthroughGeometry(vw, vh);
  console.log(
    '[video-editor] editVideo — crop:',
    `${Math.round(geo.sourceW)}x${Math.round(geo.sourceH)} @ (${Math.round(geo.sourceX)}, ${Math.round(geo.sourceY)})`,
    'output:',
    `${geo.outW}x${geo.outH}`,
  );

  // The ffmpeg -vf filter: crop to the cover-crop window at even output dims
  // (a crop is a reframe — the window IS the output), or scale to even dims
  // for the no-crop (Original) case (a safety net for odd source dims).
  const filter = opts.cropRatio
    ? `crop=${geo.outW}:${geo.outH}:${Math.round(geo.sourceX)}:${Math.round(geo.sourceY)}`
    : `scale=${geo.outW}:${geo.outH}`;

  const t0 = Date.now();
  const blob = await transcodeWithFFmpeg(
    file,
    { startTime: start, endTime: end, filter },
    opts.onProgress,
  );
  console.log(
    '[video-editor] editVideo — done in',
    Date.now() - t0,
    'ms, blob:',
    `${blob.type}`,
    blob.size,
    'bytes',
  );
  return { blob, mimeType: blob.type, width: geo.outW, height: geo.outH, duration: outDuration };
}

/** Format seconds as m:ss (for the editor UI). */
export function formatTimecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const whole = Math.floor(rem);
  const tenth = Math.floor((rem - whole) * 10);
  return m > 0 ? `${m}:${String(whole).padStart(2, '0')}` : `${whole}.${tenth}s`;
}
