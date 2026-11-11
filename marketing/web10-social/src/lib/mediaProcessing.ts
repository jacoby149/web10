// Client-side media processing for composer attach.
// Downscale, recompress, extract dimensions, generate thumbnails/posters.
// Runs entirely in the browser — no server dependency.

import { VideoMetadataError } from './videoEditing';

const MAX_EDGE = 2048;
const THUMBNAIL_EDGE = 480;
const IMAGE_QUALITY = 0.8;
const THUMBNAIL_QUALITY = 0.7;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_VIDEO_DURATION = 10800; // 3 hours
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const VIDEO_MIMES = ['video/mp4', 'video/webm'];
const AUDIO_MIMES = ['audio/mpeg', 'audio/mp3'];

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}

export interface Thumbnail {
  blob: Blob;
  mimeType: string;
}

export interface VideoFrameCapture {
  /** The requested seek time (seconds), clamped into the file. */
  time: number;
  blob: Blob;
  mimeType: string;
}

/**
 * The creator's chosen poster for a video (video-experience.md "Creator
 * Controls — Cover frame pick"): either a frame captured from the video
 * (its `time`, in seconds) or the creator's own image (`custom`). The pick
 * rides the existing `thumbnail_object_key` — zero node surface.
 */
export interface VideoThumbnailSelection {
  blob: Blob;
  mimeType: string;
  time?: number;
  custom?: boolean;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

export interface AudioInfo {
  duration: number;
}

export interface ProcessingError {
  field: 'type' | 'size' | 'duration';
  message: string;
}

/** Validate a file at attach time. Returns an error or null. */
export function validateMedia(file: File): ProcessingError | null {
  const isImage = IMAGE_MIMES.includes(file.type);
  const isVideo = VIDEO_MIMES.includes(file.type);
  const isAudio = AUDIO_MIMES.includes(file.type);

  if (!isImage && !isVideo && !isAudio) {
    if (file.type.startsWith('video/')) {
      return {
        field: 'type',
        message: 'Only MP4 or WebM videos are supported. Please convert your video to MP4 first.',
      };
    }
    if (file.type.startsWith('audio/')) {
      return {
        field: 'type',
        message: 'Only MP3 audio is supported. Please convert your audio to MP3 first.',
      };
    }
    return {
      field: 'type',
      message: 'Only photos, MP4/WebM videos, and MP3 audio are supported.',
    };
  }

  if (isImage && file.size > MAX_IMAGE_SIZE) {
    return {
      field: 'size',
      message: `Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 20 MB.`,
    };
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return {
      field: 'size',
      message: `Video is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 500 MB.`,
    };
  }

  if (isAudio && file.size > MAX_AUDIO_SIZE) {
    return {
      field: 'size',
      message: `Audio is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 50 MB.`,
    };
  }

  return null;
}

/**
 * Downscale an image to max edge 2048 and recompress to webp (or jpeg fallback).
 * Returns the processed blob and its dimensions.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  if (width <= MAX_EDGE && height <= MAX_EDGE) {
    // No downscale needed, but still recompress for consistency
    const mimeType = preferWebp() ? 'image/webp' : 'image/jpeg';
    const quality = file.type === 'image/png' ? IMAGE_QUALITY : 1;
    const blob = await encodeBitmap(bitmap, mimeType, quality);
    bitmap.close();
    return { blob, width, height, mimeType };
  }

  // Calculate target dimensions preserving aspect ratio
  const scale = MAX_EDGE / Math.max(width, height);
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const mimeType = preferWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image compression failed'))),
      mimeType,
      IMAGE_QUALITY,
    );
  });

  return { blob, width: targetW, height: targetH, mimeType };
}

/**
 * Generate a thumbnail from an image file.
 * Thumbnail is scaled to max edge 480px, recompressed.
 */
export async function generateThumbnail(file: File): Promise<Thumbnail> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const scale = THUMBNAIL_EDGE / Math.max(width, height);
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const mimeType = preferWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Thumbnail generation failed'))),
      mimeType,
      THUMBNAIL_QUALITY,
    );
  });

  return { blob, mimeType };
}

/**
 * Capture a poster frame from a video file.
 * Seeks to 25% of the duration (avoids black intro frames), captures to canvas.
 */
export async function captureVideoPoster(file: File): Promise<Thumbnail> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // Seek to 25% to avoid black/silent intro frames
      const seekTime = Math.min(video.duration * 0.25, 5);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const mimeType = preferWebp() ? 'image/webp' : 'image/jpeg';
      canvas.toBlob(
        (b) => {
          URL.revokeObjectURL(url);
          video.remove();
          if (b) resolve({ blob: b, mimeType });
          else reject(new Error('Poster capture failed'));
        },
        mimeType,
        THUMBNAIL_QUALITY,
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      video.remove();
      reject(new Error('Failed to load video for poster capture'));
    };

    video.src = url;
  });
}

const METADATA_TIMEOUT_MS = 15000;

/** The seek settle budget per candidate frame (a stalled decode drops the
 *  candidate, it never hangs the picker). */
const FRAME_SEEK_TIMEOUT_MS = 8000;

/**
 * The candidate poster frames offered for a video of `duration` seconds —
 * "picking the thumbnail, or at least from a few options" (the operator,
 * 11.11.2026). Three points spread through the body:
 *
 * - the quarter frame, capped at 5s — exactly the auto-poster's seek
 *   (captureVideoPoster's `min(duration * 0.25, 5)`, the black-intro
 *   avoidance), so "keep the default" is candidate 0;
 * - the half;
 * - the three-quarter.
 *
 * Points are clamped off the very edges (a seek past the last decodable
 * frame can stall) and de-duped at a 0.2s floor (short clips).
 */
export function thumbnailCandidateTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const raw = [Math.min(duration * 0.25, 5), duration * 0.5, duration * 0.75];
  const times: number[] = [];
  for (const t of raw) {
    const clamped = Math.max(0.05, Math.min(t, duration - 0.05));
    if (times.length && clamped - times[times.length - 1] < 0.2) continue;
    times.push(Math.round(clamped * 1000) / 1000);
  }
  return times;
}

/**
 * Capture frames from a video file at the given times — one `<video>`,
 * sequential seeks, each frame drawn to a canvas at the source's native
 * resolution and encoded webp (jpeg fallback) at THUMBNAIL_QUALITY, the
 * same constants captureVideoPoster uses. A seek that never settles (a
 * stalled decode) drops that candidate; a file the browser cannot decode
 * rejects outright.
 */
export async function captureVideoFrames(file: File, times: number[]): Promise<VideoFrameCapture[]> {
  if (!times.length) return [];
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    const captures: VideoFrameCapture[] = [];
    let index = 0;

    const captureNext = () => {
      if (index >= times.length) {
        cleanup();
        if (!captures.length) reject(new Error('Could not capture any frame from this video.'));
        else resolve(captures);
        return;
      }
      const time = times[index];
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!canvas.width || !canvas.height) {
          // Undecodable at this point — drop the candidate, keep going.
          index += 1;
          captureNext();
          return;
        }
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const mimeType = preferWebp() ? 'image/webp' : 'image/jpeg';
        canvas.toBlob(
          (b) => {
            if (b) captures.push({ time, blob: b, mimeType });
            index += 1;
            captureNext();
          },
          mimeType,
          THUMBNAIL_QUALITY,
        );
      };
      const timer = setTimeout(settle, FRAME_SEEK_TIMEOUT_MS);
      const onSeeked = () => video.removeEventListener('seeked', onSeeked);
      video.addEventListener('seeked', () => {
        onSeeked();
        settle();
      });
      video.currentTime = time;
    };

    video.onloadedmetadata = () => captureNext();
    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load the video for thumbnail capture.'));
    };
    video.src = url;
  });
}

/**
 * Get video metadata (duration, dimensions) without playing.
 *
 * Rejects with a `VideoMetadataError` (a user-facing `message`) when the
 * browser cannot decode the file (undecodable codec — the classic HEVC/AV1
 * from a phone camera) or when the metadata never loads (corrupt file).
 */
export async function getVideoInfo(file: File): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const timer = setTimeout(() => {
      video.onerror = null;
      video.onloadedmetadata = null;
      cleanup();
      reject(new VideoMetadataError('timeout'));
    }, METADATA_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      const info: VideoInfo = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(info);
    };

    video.onerror = () => {
      cleanup();
      reject(new VideoMetadataError('codec'));
    };

    video.src = url;
  });
}

/**
 * Probe an audio file's duration in the browser.
 * Resolves with `{ duration }` (seconds) or rejects with a `VideoMetadataError`
 * (reused — the error shape is the same: a user-facing `message`).
 */
export async function getAudioInfo(file: File): Promise<AudioInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';

    const timer = setTimeout(() => {
      audio.onerror = null;
      audio.onloadedmetadata = null;
      cleanup();
      reject(new VideoMetadataError('timeout'));
    }, METADATA_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      audio.src = '';
    };

    audio.onloadedmetadata = () => {
      const info: AudioInfo = { duration: audio.duration };
      cleanup();
      resolve(info);
    };

    audio.onerror = () => {
      cleanup();
      reject(new VideoMetadataError('codec'));
    };

    audio.src = url;
  });
}

/** Validate video duration at attach time (after metadata load). */
export function validateVideoDuration(duration: number): ProcessingError | null {
  if (duration > MAX_VIDEO_DURATION) {
    return {
      field: 'duration',
      message: `Video is too long (${formatDuration(duration)}). Max is ${MAX_VIDEO_DURATION / 3600} hours.`,
    };
  }
  return null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function preferWebp(): boolean {
  // Check if the browser supports webp encoding
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

async function encodeBitmap(bitmap: ImageBitmap, mimeType: string, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))),
      mimeType,
      quality,
    );
  });
}
