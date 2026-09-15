// Client-side face cropping for the profile avatar / banner — the
// Facebook-style "how it will display" step. The picker shows the image in
// the actual display frame (a circle for the avatar, a wide band for the
// banner); the user pans + zooms to frame it, and on confirm the exact
// visible window is cropped on a canvas and uploaded as a new media doc.
// The face IS the crop — every surface (feed avatar, profile, share card)
// shows the framed image, not a center-cropped guess.
//
// The transform model (shared by the preview and the crop, so what you see
// is what ships): the image is cover-fit to the frame at scale 1 (the
// object-cover baseline), then scaled by `scale` (>= 1) and panned by
// (x, y) frame pixels from the frame center. Pan is clamped so the image
// always covers the frame — no empty edges, the same invariant object-cover
// gives you for free.

export interface FaceCropState {
  /** Zoom over the cover fit (1 = cover, >1 = zoomed in). */
  scale: number;
  /** Pan, as a fraction of the frame half-size (-1 = full left, 1 = full right). */
  x: number;
  y: number;
}

export interface FaceCropRect {
  /** Source-pixel rect of the visible window. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Output canvas dimensions (the crop, at source resolution, capped). */
  outW: number;
  outH: number;
}

/** The avatar displays as a circle (the Avatar's rounded-full). */
export const AVATAR_FACE = { ratio: 1, outSize: 512 } as const;
/**
 * The banner displays as a full-width band (h-32 sm:h-44, object-cover).
 * The crop locks to the desktop display ratio (768:176 ≈ 4.36:1) — the same
 * move as the video editor's ratio presets: one fixed frame, object-cover
 * re-crops it per viewport at render time.
 */
export const BANNER_FACE = { ratio: 768 / 176, outW: 1536, outH: 352 } as const;

const MAX_OUT_EDGE = 2048;

/**
 * Clamp pan so the (cover-fit × scale) image still covers the frame. The pan
 * is a fraction of the frame half-size; the max pan (image edge at frame
 * edge) is (disp − frame) / 2 pixels, which in frame-half fractions is
 * (scale − 1) / (1 + 1/coverRatio) per axis — always ≤ 1 (at scale 1 the
 * cover fit guarantees the image ≥ the frame, so the interval includes 0).
 */
export function clampFaceCrop(
  state: FaceCropState,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): FaceCropState {
  const scale = Math.max(1, state.scale);
  const cover = Math.max(frameW / imgW, frameH / imgH);
  const dispW = imgW * cover * scale;
  const dispH = imgH * cover * scale;
  const maxX = Math.max(0, (dispW - frameW) / frameW);
  const maxY = Math.max(0, (dispH - frameH) / frameH);
  // `+ 0` normalizes -0 → +0 (Math.max(-0, negative) yields -0).
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)) + 0,
    y: Math.min(maxY, Math.max(-maxY, state.y)) + 0,
  };
}

/**
 * The visible window in source pixels. Derives the same rect the preview
 * shows: frame / (cover × scale) source pixels wide, centered on the frame
 * center, shifted by the pan.
 */
export function faceCropRect(
  state: FaceCropState,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): FaceCropRect {
  const { scale, x, y } = clampFaceCrop(state, imgW, imgH, frameW, frameH);
  const cover = Math.max(frameW / imgW, frameH / imgH);
  const sw = frameW / (cover * scale);
  const sh = frameH / (cover * scale);
  // The frame center, in source pixels (the image's cover-fit center is the
  // image center; the pan — a fraction of the frame half-size — moves the
  // window by pan × frame-half / (cover × scale) source pixels).
  const cx = imgW / 2 - (x * (frameW / 2)) / (cover * scale);
  const cy = imgH / 2 - (y * (frameH / 2)) / (cover * scale);
  const sx = Math.min(Math.max(0, cx - sw / 2), imgW - sw);
  const sy = Math.min(Math.max(0, cy - sh / 2), imgH - sh);
  return { sx, sy, sw, sh, outW: 0, outH: 0 };
}

/**
 * Crop the image to the visible window and encode it. Output is the crop at
 * source resolution (never upscaled), longest edge capped at 2048 (the
 * mediaProcessing MAX_EDGE — a face is displayed at ≤ 768px wide).
 *
 * The image is fetched as a blob (not an <img>) so the canvas stays
 * untainted regardless of the presigned URL's CORS posture — the same
 * createImageBitmap + canvas + toBlob idiom as mediaProcessing.ts.
 */
export async function cropFaceImage(
  url: string,
  state: FaceCropState,
  frameW: number,
  frameH: number,
  out: { size?: number; w?: number; h?: number },
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const rect = faceCropRect(state, bitmap.width, bitmap.height, frameW, frameH);
    let outW = Math.round(rect.sw);
    let outH = Math.round(rect.sh);
    if (out.size) {
      // Square face (the avatar): the output is a square at the target size —
      // the crop rect is already square (frame ratio 1), so this is a resize,
      // not a re-crop.
      outW = out.size;
      outH = out.size;
    } else if (out.w && out.h) {
      // Fixed-ratio face (the banner): the output is the crop at the target
      // ratio (the frame ratio), scaled to the target width.
      outW = out.w;
      outH = out.h;
    }
    const cap = Math.max(outW, outH);
    if (cap > MAX_OUT_EDGE) {
      const f = MAX_OUT_EDGE / cap;
      outW = Math.round(outW * f);
      outH = Math.round(outH * f);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, outW);
    canvas.height = Math.max(1, outH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);
    const mimeType = 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image crop failed'))), mimeType, 0.9);
    });
    return { blob, width: canvas.width, height: canvas.height, mimeType };
  } finally {
    bitmap.close();
  }
}
