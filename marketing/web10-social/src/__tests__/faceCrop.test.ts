import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AVATAR_FACE,
  BANNER_FACE,
  clampFaceCrop,
  faceCropRect,
  cropFaceImage,
} from '@/lib/faceCrop';

describe('AVATAR_FACE / BANNER_FACE — the display frames', () => {
  it('the avatar is a square (the circle mask sits inside)', () => {
    expect(AVATAR_FACE.ratio).toBe(1);
    expect(AVATAR_FACE.outSize).toBe(512);
  });

  it('the banner is the wide band (≈4.36:1, the desktop display ratio)', () => {
    expect(BANNER_FACE.ratio).toBeCloseTo(768 / 176, 5);
    expect(BANNER_FACE.outW).toBe(1536);
    expect(BANNER_FACE.outH).toBe(352);
  });
});

describe('clampFaceCrop — pan never uncovers the frame edges', () => {
  // A 1000×1000 image in a 200×200 frame: at scale 1 the cover fit is
  // 200×200 (exactly the frame) → no pan is possible (maxX = maxY = 0).
  it('at scale 1 with an exact cover fit, pan is clamped to zero', () => {
    const clamped = clampFaceCrop({ scale: 1, x: 50, y: -30 }, 1000, 1000, 200, 200);
    expect(clamped).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('zooming in allows pan, bounded by the uncovered margin (frame-half fractions)', () => {
    // scale 2 → the display is 400×400 in a 200×200 frame → max pan =
    // (400-200)/200 = 1 frame-half (the image edge at the frame edge).
    const clamped = clampFaceCrop({ scale: 2, x: 5, y: -5 }, 1000, 1000, 200, 200);
    expect(clamped.x).toBe(1);
    expect(clamped.y).toBe(-1);
  });

  it('the pan bound grows with zoom (a 1:1-ratio image in a 1:1 frame)', () => {
    // scale 1.5 → display 300×300 → max pan = (300-200)/200 = 0.5 frame-half.
    const clamped = clampFaceCrop({ scale: 1.5, x: 0.9, y: 0 }, 1000, 1000, 200, 200);
    expect(clamped.x).toBeCloseTo(0.5, 5);
  });

  it('scale below 1 is floored to the cover baseline', () => {
    const clamped = clampFaceCrop({ scale: 0.2, x: 0, y: 0 }, 1000, 1000, 200, 200);
    expect(clamped.scale).toBe(1);
  });

  it('a wider-than-frame image at scale 1 can pan horizontally (cover crops the height)', () => {
    // 2000×1000 image in a 200×200 frame: cover scale = 0.2 → display 400×200.
    // Horizontal max pan = (400-200)/200 = 1 frame-half, vertical 0.
    const clamped = clampFaceCrop({ scale: 1, x: 999, y: 999 }, 2000, 1000, 200, 200);
    expect(clamped.x).toBe(1);
    expect(clamped.y).toBe(0);
  });
});

describe('faceCropRect — the visible window in source pixels', () => {
  it('at the baseline (scale 1, no pan) it is the center cover-crop', () => {
    // 2000×1000 image, 200×100 frame (2:1): the image matches the frame ratio
    // exactly → cover shows the whole image (sw × sh = the full source).
    const rect = faceCropRect({ scale: 1, x: 0, y: 0 }, 2000, 1000, 200, 100);
    expect(rect.sw).toBeCloseTo(2000, 5);
    expect(rect.sh).toBeCloseTo(1000, 5);
    expect(rect.sx).toBeCloseTo(0, 5);
    expect(rect.sy).toBeCloseTo(0, 5);
  });

  it('zooming in shrinks the window (more zoom = tighter crop)', () => {
    const at1 = faceCropRect({ scale: 1, x: 0, y: 0 }, 2000, 1000, 200, 100);
    const at2 = faceCropRect({ scale: 2, x: 0, y: 0 }, 2000, 1000, 200, 100);
    expect(at2.sw).toBeCloseTo(at1.sw / 2, 5);
    expect(at2.sh).toBeCloseTo(at1.sh / 2, 5);
    // Still centered.
    expect(at2.sx + at2.sw / 2).toBeCloseTo(1000, 5);
    expect(at2.sy + at2.sh / 2).toBeCloseTo(500, 5);
  });

  it('panning shifts the window (fraction of the frame half-size)', () => {
    // 2000×1000 image, 200×100 frame, scale 2: display 400×200 → maxX = 100px
    // = 0.5 frame-half → x: 1 (full pan right) moves the image right, so the
    // visible window moves LEFT in the source by 100px / (cover × scale)
    // = 100 / 0.2 = 500 source px.
    const at0 = faceCropRect({ scale: 2, x: 0, y: 0 }, 2000, 1000, 200, 100);
    const at1 = faceCropRect({ scale: 2, x: 1, y: 0 }, 2000, 1000, 200, 100);
    expect(at1.sx).toBeCloseTo(at0.sx - 500, 5);
    expect(at1.sy).toBeCloseTo(at0.sy, 5);
    // The window is clamped to the source bounds (it can't pan past the edge).
    expect(at1.sx).toBeGreaterThanOrEqual(0);
    expect(at1.sx + at1.sw).toBeLessThanOrEqual(2000 + 1e-9);
  });

  it('the window never leaves the source bounds (clamped)', () => {
    // Full pan right at scale 1 on an exact cover fit: the clamp zeroes the pan,
    // so the window is the center crop — in bounds by construction.
    const rect = faceCropRect({ scale: 1, x: 1, y: 1 }, 1000, 1000, 200, 200);
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(1000 + 1e-9);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(1000 + 1e-9);
  });

  it('a portrait image in the wide banner frame crops top/bottom (cover)', () => {
    // 1000×2000 (9:16-ish) image in a 560×128 frame: cover scale = 560/1000 = 0.56
    // → display 560×1120; the window is the full width × 128/0.56 ≈ 228.6 tall.
    const rect = faceCropRect({ scale: 1, x: 0, y: 0 }, 1000, 2000, 560, 128);
    expect(rect.sw).toBeCloseTo(1000, 5);
    expect(rect.sh).toBeCloseTo(128 / 0.56, 5);
    expect(rect.sy + rect.sh / 2).toBeCloseTo(1000, 5);
  });
});

describe('cropFaceImage — the canvas crop (fetch → bitmap → canvas → blob)', () => {
  let drawImageMock: ReturnType<typeof vi.fn>;
  let toBlobMock: ReturnType<typeof vi.fn>;
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['img'])),
    }));
    drawImageMock = vi.fn();
    toBlobMock = vi.fn().mockImplementation((cb: (b: Blob) => void, _type: string, _q: number) => {
      cb(new Blob(['out'], { type: 'image/jpeg' }));
    });
    bitmap = { width: 1000, height: 1000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const ctx = { drawImage: drawImageMock };
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toBlob: toBlobMock,
        } as unknown as HTMLCanvasElement;
      }
      return {} as HTMLElement;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('crops the visible window and encodes a jpeg at the target size (avatar)', async () => {
    const result = await cropFaceImage('https://cdn/x.png', { scale: 1, x: 0, y: 0 }, 200, 200, { size: 512 });
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.blob).toBeInstanceOf(Blob);
    // The source rect is the center cover-crop (a 1000×1000 image in a square
    // frame = the whole image), drawn into the 512×512 canvas.
    expect(drawImageMock).toHaveBeenCalledWith(bitmap, 0, 0, 1000, 1000, 0, 0, 512, 512);
    // The bitmap is closed (no leak).
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('a zoomed-in crop draws a smaller source rect (banner)', async () => {
    // scale 2 in a 560×128 frame over a 1000×1000 image: the window is
    // 560/(0.56*2) = 500 wide × 128/(0.56*2) ≈ 114.3 tall, centered.
    const result = await cropFaceImage('https://cdn/x.png', { scale: 2, x: 0, y: 0 }, 560, 128, { w: 1536, h: 352 });
    expect(result.width).toBe(1536);
    expect(result.height).toBe(352);
    const [ , sx, sy, sw, sh] = drawImageMock.mock.calls[0];
    expect(sw).toBeCloseTo(500, 5);
    expect(sh).toBeCloseTo(128 / 1.12, 5);
    expect(sx).toBeCloseTo(250, 5);
    expect(sy).toBeCloseTo(500 - sh / 2, 5);
  });

  it('rejects when the image fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }));
    await expect(cropFaceImage('https://cdn/404.png', { scale: 1, x: 0, y: 0 }, 200, 200, { size: 512 }))
      .rejects.toThrow('Failed to load image: 404');
  });
});
