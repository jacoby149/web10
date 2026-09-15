// The deterministic client-side transcode engine (ffmpeg.wasm).
//
// Replaces the old real-time `canvas.captureStream` + `MediaRecorder` re-encode,
// which dropped/mis-timed audio samples (the "Darth Vader" pitch effect) and
// drifted A/V whenever the main thread stuttered. ffmpeg.wasm runs the full
// FFmpeg binary in a Web Worker as a file-to-file operation: no playback, no
// real-time capture, frame-accurate trim + crop, guaranteed A/V sync.
//
// Self-hosted: the ~32MB core is imported with `?url` so Vite emits it as an
// asset served from OUR origin (not unpkg). The single-threaded core needs no
// COOP/COEP headers. Lazy-loaded on editor open (the intent signal) — the
// no-op fast path (unedited videos) never touches it.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
// Self-host the core: `?url` makes Vite emit each file as an asset served from
// OUR origin (not unpkg). `@ffmpeg/core` → the JS loader, `@ffmpeg/core/wasm`
// → the WASM binary (the package's two export subpaths).
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

let ffmpeg: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

/**
 * Load the ffmpeg.wasm core (singleton). The core is fetched once and cached
 * by the browser; subsequent loads resolve instantly. Call this when the user
 * opens the editor (the intent signal) so the download runs in the background
 * while they adjust trim/crop — NOT on app load (most users never edit).
 */
export function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (loading) return loading;
  loading = (async () => {
    const ff = new FFmpeg();
    await ff.load({ coreURL, wasmURL });
    ffmpeg = ff;
    return ff;
  })();
  loading.catch(() => {
    loading = null; // allow a retry after a failed load
  });
  return loading;
}

export interface TranscodeOptions {
  /** In-point in seconds. */
  startTime: number;
  /** Out-point in seconds. */
  endTime: number;
  /** An ffmpeg `-vf` filter (e.g. `crop=…:scale=…`). Null = no video filter. */
  filter: string | null;
}

/**
 * Trim + optionally crop a video deterministically via ffmpeg.wasm. Returns the
 * finished MP4 blob. The node re-transcodes to HLS, so the output just needs to
 * be valid + trimmed + cropped — the preset is `veryfast` (fast, good enough for
 * social; the node's ffmpeg is the final-quality path).
 */
export async function transcodeWithFFmpeg(
  file: File,
  opts: TranscodeOptions,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const ff = await loadFFmpeg();
  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  // The worker FS persists per-instance — clear any stale files from a prior run.
  await ff.deleteFile(inputName).catch(() => {});
  await ff.deleteFile(outputName).catch(() => {});
  await ff.writeFile(inputName, await fetchFile(file));

  // ffmpeg.wasm emits progress events as it processes the input — a good
  // spinner estimate for a trim (the output is shorter, so it's approximate).
  const onFFProgress = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)));
  };
  ff.on('progress', onFFProgress);

  const duration = Math.max(0, opts.endTime - opts.startTime);
  const args = [
    '-ss',
    String(opts.startTime),
    '-i',
    inputName,
    '-t',
    String(duration),
    ...(opts.filter ? ['-vf', opts.filter] : []),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    outputName,
  ];

  try {
    const code = await ff.exec(args);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = await ff.readFile(outputName);
    return new Blob([data as Uint8Array], { type: 'video/mp4' });
  } finally {
    ff.off('progress', onFFProgress);
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
  }
}
