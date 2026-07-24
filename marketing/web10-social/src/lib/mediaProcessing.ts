// Client-side media processing for composer attach.
// Downscale, recompress, extract dimensions, generate thumbnails/posters.
// Runs entirely in the browser — no server dependency.

const MAX_EDGE = 2048;
const THUMBNAIL_EDGE = 480;
const IMAGE_QUALITY = 0.8;
const THUMBNAIL_QUALITY = 0.7;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_VIDEO_DURATION = 180; // 3 minutes
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const VIDEO_MIMES = ['video/mp4', 'video/webm'];

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

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

export interface ProcessingError {
  field: 'type' | 'size' | 'duration';
  message: string;
}

/** Validate a file at attach time. Returns an error or null. */
export function validateMedia(file: File): ProcessingError | null {
  const isImage = IMAGE_MIMES.includes(file.type);
  const isVideo = VIDEO_MIMES.includes(file.type);

  if (!isImage && !isVideo) {
    if (file.type.startsWith('video/')) {
      return {
        field: 'type',
        message: 'Only MP4 or WebM videos are supported. Please convert your video to MP4 first.',
      };
    }
    return {
      field: 'type',
      message: 'Only photos and MP4/WebM videos are supported.',
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
      message: `Video is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 100 MB.`,
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

/** Get video metadata (duration, dimensions) without playing. */
export async function getVideoInfo(file: File): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    video.onloadedmetadata = () => {
      const info: VideoInfo = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      URL.revokeObjectURL(url);
      video.remove();
      resolve(info);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      video.remove();
      reject(new Error('Failed to read video metadata'));
    };

    video.src = url;
  });
}

/** Validate video duration at attach time (after metadata load). */
export function validateVideoDuration(duration: number): ProcessingError | null {
  if (duration > MAX_VIDEO_DURATION) {
    return {
      field: 'duration',
      message: `Video is too long (${formatDuration(duration)}). Max is 3 minutes.`,
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