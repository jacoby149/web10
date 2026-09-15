// Client-side video editing for the composer: trim (in/out) + ratio crop.
// Same pattern as the media demo's client-side reframe (video-experience.md):
// canvas + MediaRecorder, real-time (an 8s clip takes ~8s). The FINISHED file
// is what gets uploaded — the node never sees the original.

export interface VideoEditOptions {
  /** In-point in seconds. Default 0. */
  startTime?: number;
  /** Out-point in seconds. Default = full duration. */
  endTime?: number;
  /** Target aspect ratio (width/height). null/undefined = no crop. */
  cropRatio?: number | null;
  /** Output video bitrate. Default 2.5 Mbps. */
  videoBitsPerSecond?: number;
  /**
   * Progress callback, called on every animation frame with the fraction of
   * the trim window encoded so far (0 → 1). The encode is real-time (canvas +
   * MediaRecorder), so this is the only way the caller can show the user how
   * much is left instead of a bare spinner.
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
 * ratio). The `canvas.captureStream` + `MediaRecorder` re-encode is a
 * real-time capture: it plays the source and records each frame + the audio in
 * wall-clock time. When the main thread stutters (frame draws, React work),
 * the audio capture drops or mis-times samples, producing a pitch/timbre
 * distortion (the "Darth Vader" effect). A no-op edit re-encodes nothing — it
 * just re-wraps the same pixels + sound through a lossy real-time path for no
 * benefit. Callers should skip the re-encode and upload the original file
 * directly (the node transcodes it to clean HLS — the node's ffmpeg is the
 * deterministic path, not the browser's real-time capture).
 */
export function isNoopEdit(opts: VideoEditOptions, duration: number): boolean {
  const start = opts.startTime ?? 0;
  const end = opts.endTime ?? duration;
  const noTrim = start <= 0.05 && end >= duration - 0.05;
  const noCrop = opts.cropRatio == null;
  return noTrim && noCrop;
}

function pickMime(): string {
  return (
    ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
      (m) => MediaRecorder.isTypeSupported(m),
    ) || 'video/webm'
  );
}

/**
 * Trim and/or crop a video file entirely in the browser.
 *
 * Plays the source from `startTime` to `endTime`, drawing each frame to a
 * canvas (cover-cropped to `cropRatio` when set) while a MediaRecorder
 * captures the canvas stream + the source audio. Returns the finished blob.
 *
 * Throws on unsupported input (no MediaRecorder / captureStream) or on
 * playback failure.
 */
export async function editVideo(file: File, opts: VideoEditOptions = {}): Promise<VideoEditResult> {
  console.log(
    '[video-editor] editVideo — start, file:',
    file.name,
    'opts:',
    JSON.stringify({
      startTime: opts.startTime ?? 0,
      endTime: opts.endTime ?? null,
      cropRatio: opts.cropRatio ?? null,
    }),
  );

  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('This browser does not support in-browser video editing.');
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('could not read video metadata'));
    });

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const duration = video.duration;
    console.log('[video-editor] editVideo — source:', `${vw}x${vh}`, 'duration:', duration.toFixed(2));

    const start = Math.max(0, Math.min(opts.startTime ?? 0, Math.max(0, duration - 0.1)));
    const end = Math.max(start + 0.1, Math.min(opts.endTime ?? duration, duration));
    const outDuration = end - start;
    console.log('[video-editor] editVideo — trim window:', `${start.toFixed(2)} → ${end.toFixed(2)} (${outDuration.toFixed(2)}s)`);

    const geo = opts.cropRatio ? computeCropGeometry(vw, vh, opts.cropRatio) : passthroughGeometry(vw, vh);
    console.log(
      '[video-editor] editVideo — crop:',
      `${Math.round(geo.sourceW)}x${Math.round(geo.sourceH)} @ (${Math.round(geo.sourceX)}, ${Math.round(geo.sourceY)})`,
      'output:',
      `${geo.outW}x${geo.outH}`,
    );

    const canvas = document.createElement('canvas');
    canvas.width = geo.outW;
    canvas.height = geo.outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('could not get a 2d canvas context');

    const stream = canvas.captureStream(30);

    // Audio: route the source element's audio through an AudioContext into
    // the recorded stream. The <video> is NOT muted: once
    // createMediaElementSource() is called, the element's audio is
    // disconnected from the speakers and flows only into this WebAudio
    // graph (we never connect to audioCtx.destination), so the user hears
    // nothing — but muting the element would ALSO silence the
    // MediaElementSourceNode and ship a silent webm.
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      // An AudioContext created without a fresh user gesture can boot
      // "suspended" and produce no audio — resume it before recording.
      await audioCtx.resume();
      const srcNode = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      srcNode.connect(dest);
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
        console.log('[video-editor] editVideo — audio track attached');
      } else {
        console.log('[video-editor] editVideo — source has no audio track');
      }
    } catch (e) {
      // Routing failed — fall back to a silent encode, but mute the element
      // so the user doesn't hear the raw clip play during the encode.
      video.muted = true;
      console.log('[video-editor] editVideo — no audio (silent edit):', (e as Error).message);
    }

    const mime = pickMime();
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: opts.videoBitsPerSecond ?? 2_500_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((res) => {
      recorder.onstop = () => res();
    });

    let rafId = 0;
    const drawFrame = () =>
      ctx.drawImage(video, geo.sourceX, geo.sourceY, geo.sourceW, geo.sourceH, 0, 0, geo.outW, geo.outH);
    const draw = () => {
      drawFrame();
      if (opts.onProgress && outDuration > 0) {
        opts.onProgress(Math.max(0, Math.min(1, (video.currentTime - start) / outDuration)));
      }
      if (video.currentTime < end - 0.03 && !video.ended) {
        rafId = requestAnimationFrame(draw);
      }
    };

    video.currentTime = start;
    await new Promise<void>((res) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', finish);
        res();
      };
      video.addEventListener('seeked', finish);
      // Some browsers fire seeked immediately for a same-position seek.
      setTimeout(finish, 2000);
    });

    draw();
    recorder.start(1000);
    const t0 = Date.now();
    await new Promise<void>((res, rej) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('error', onError);
        video.pause();
        if (err) rej(err);
        else res();
      };
      const onTimeUpdate = () => {
        if (video.currentTime >= end - 0.02) finish();
      };
      const onEnded = () => finish();
      const onError = () => finish(new Error('video playback failed during edit'));
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('ended', onEnded);
      video.addEventListener('error', onError);
      video.play().catch((e) => finish(e instanceof Error ? e : new Error(String(e))));
    });
    // One final frame at the out-point so the last moment is captured.
    drawFrame();
    if (opts.onProgress) opts.onProgress(1);
    recorder.stop();
    await stopped;
    if (audioCtx) await audioCtx.close().catch(() => {});
    cancelAnimationFrame(rafId);

    const blob = new Blob(chunks, { type: recorder.mimeType || mime });
    console.log(
      '[video-editor] editVideo — done in',
      Date.now() - t0,
      'ms, blob:',
      `${blob.type}`,
      blob.size,
      'bytes',
    );
    return { blob, mimeType: blob.type, width: geo.outW, height: geo.outH, duration: outDuration };
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }
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
