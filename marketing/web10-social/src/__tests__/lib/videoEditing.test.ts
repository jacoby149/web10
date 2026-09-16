import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeCropGeometry,
  passthroughGeometry,
  editVideo,
  isNoopEdit,
  formatTimecode,
} from '@/lib/videoEditing';

describe('computeCropGeometry', () => {
  it('center-crops a landscape source into 9:16 (vertical)', () => {
    // 1920x1080 source → 9:16: full height, width = 1080 * 9/16 = 607.5
    const geo = computeCropGeometry(1920, 1080, 9 / 16);
    expect(geo.sourceH).toBe(1080);
    expect(geo.sourceW).toBeCloseTo(1080 * (9 / 16));
    expect(geo.sourceY).toBe(0);
    expect(geo.sourceX).toBeCloseTo((1920 - geo.sourceW) / 2);
    expect(geo.outH).toBe(1080);
    expect(geo.outW).toBe(606); // 607.5 → even (floored)
    expect(geo.outW % 2).toBe(0);
    expect(geo.outH % 2).toBe(0);
  });

  it('center-crops a vertical source into 1:1 (square)', () => {
    // 1080x1920 source → 1:1: full width, height = 1080
    const geo = computeCropGeometry(1080, 1920, 1);
    expect(geo.sourceW).toBe(1080);
    expect(geo.sourceH).toBe(1080);
    expect(geo.sourceX).toBe(0);
    expect(geo.sourceY).toBeCloseTo((1920 - 1080) / 2);
    expect(geo.outW).toBe(1080);
    expect(geo.outH).toBe(1080);
  });

  it('crops a vertical source into 4:5 (portrait)', () => {
    const geo = computeCropGeometry(1080, 1920, 4 / 5);
    expect(geo.sourceW).toBe(1080);
    expect(geo.sourceH).toBeCloseTo(1080 / (4 / 5)); // 1350
    expect(geo.outW).toBe(1080);
    expect(geo.outH).toBe(1350);
  });

  it('never upscales: output equals the cropped window at source scale', () => {
    const geo = computeCropGeometry(320, 240, 16 / 9);
    expect(geo.outW).toBe(320);
    expect(geo.outH).toBe(180); // 320 / (16/9), the crop window
  });

  it('keeps dims even for odd sources', () => {
    const geo = computeCropGeometry(321, 241, 1);
    expect(geo.outW % 2).toBe(0);
    expect(geo.outH % 2).toBe(0);
    expect(geo.outW).toBeLessThanOrEqual(321);
    expect(geo.outH).toBeLessThanOrEqual(241);
  });
});

describe('passthroughGeometry', () => {
  it('returns the source as-is with even dims', () => {
    const geo = passthroughGeometry(1920, 1080);
    expect(geo.sourceX).toBe(0);
    expect(geo.sourceY).toBe(0);
    expect(geo.sourceW).toBe(1920);
    expect(geo.sourceH).toBe(1080);
    expect(geo.outW).toBe(1920);
    expect(geo.outH).toBe(1080);
  });

  it('forces odd dims to even (nearest even, no upscale)', () => {
    const geo = passthroughGeometry(1921, 1081);
    expect(geo.outW % 2).toBe(0);
    expect(geo.outH % 2).toBe(0);
    expect(geo.outW).toBeLessThanOrEqual(1921);
    expect(geo.outH).toBeLessThanOrEqual(1081);
  });
});

describe('formatTimecode', () => {
  it('formats sub-minute as s.t', () => {
    expect(formatTimecode(3.25)).toBe('3.2s');
  });
  it('formats minutes as m:ss', () => {
    expect(formatTimecode(65)).toBe('1:05');
  });
  it('clamps negatives to zero', () => {
    expect(formatTimecode(-5)).toBe('0.0s');
  });
});

describe('isNoopEdit', () => {
  it('is a no-op with no opts (full duration, source ratio) — the default edit', () => {
    expect(isNoopEdit({}, 10)).toBe(true);
  });

  it('is a no-op when start=0 and end=duration (explicit full window)', () => {
    expect(isNoopEdit({ startTime: 0, endTime: 10 }, 10)).toBe(true);
  });

  it('is NOT a no-op when trimmed (start > 0)', () => {
    expect(isNoopEdit({ startTime: 2, endTime: 10 }, 10)).toBe(false);
  });

  it('is NOT a no-op when trimmed (end < duration)', () => {
    expect(isNoopEdit({ startTime: 0, endTime: 5 }, 10)).toBe(false);
  });

  it('is NOT a no-op when cropped (cropRatio set)', () => {
    expect(isNoopEdit({ cropRatio: 9 / 16 }, 10)).toBe(false);
  });

  it('is a no-op when cropRatio is explicitly null', () => {
    expect(isNoopEdit({ cropRatio: null }, 10)).toBe(true);
  });

  it('tolerates a tiny end-point rounding (within 50ms of duration)', () => {
    // A caller that computes end = duration - 0.01 (floating-point) is still a no-op.
    expect(isNoopEdit({ startTime: 0, endTime: 9.99 }, 10)).toBe(true);
  });

  it('is NOT a no-op when the trim window is meaningfully smaller', () => {
    expect(isNoopEdit({ startTime: 0, endTime: 9.0 }, 10)).toBe(false);
  });
});

// ── editVideo: the re-encode is the ffmpeg.wasm engine's job ──────────────────
//
// editVideo reads the source metadata, computes the trim window + crop geometry,
// builds the ffmpeg -vf filter, and delegates the actual transcode to
// transcodeWithFFmpeg (the engine). The engine is mocked here — the real
// ffmpeg.wasm needs a Web Worker + WebAssembly, which jsdom doesn't provide.
// The tests pin that editVideo hands the engine the right trim + filter.

const transcodeMock = vi.fn();
vi.mock('@/lib/ffmpegEngine', () => ({
  transcodeWithFFmpeg: (...args: unknown[]) => transcodeMock(...args),
}));

// A minimal <video> element for readVideoMetadata (metadata only, no playback).
class MockVideoElement extends HTMLElement {
  duration = 10;
  videoWidth = 1920;
  videoHeight = 1080;
  muted = false;
  private _src = '';
  set src(value: string) {
    this._src = value;
    // A detached <video> with a src loads metadata in a real browser — mirror
    // that (the element is never appended, so connectedCallback never fires).
    queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
  }
  get src() {
    return this._src;
  }
  remove() {}
}

// jsdom: HTMLElement subclasses must be in the custom element registry.
if (!customElements.get('mock-video')) {
  customElements.define('mock-video', MockVideoElement);
}

function installVideoMock() {
  const realDocument = globalThis.document;
  vi.stubGlobal(
    'document',
    {
      createElement: (tag: string) => {
        if (tag === 'video') return new MockVideoElement();
        return realDocument.createElement(tag);
      },
    } as unknown as Document,
  );
}

describe('editVideo', () => {
  const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

  beforeEach(() => {
    vi.clearAllMocks();
    transcodeMock.mockResolvedValue(new Blob(['edited-bytes'], { type: 'video/mp4' }));
    installVideoMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('trims + crops via the engine and returns the finished blob', async () => {
    const result = await editVideo(file, { startTime: 2, endTime: 5, cropRatio: 9 / 16 });

    // The engine was called with the trim window + a crop filter.
    expect(transcodeMock).toHaveBeenCalledTimes(1);
    const [fileArg, opts] = transcodeMock.mock.calls[0];
    expect(fileArg).toBe(file);
    expect(opts.startTime).toBe(2);
    expect(opts.endTime).toBe(5);
    // A crop filter: crop=outW:outH:x:y (the cover-crop window at even dims).
    expect(opts.filter).toMatch(/^crop=\d+:\d+:\d+:\d+$/);

    // The result carries the engine's blob + the cropped dims.
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.mimeType).toBe('video/mp4');
    expect(result.width).toBe(606); // 1080 * 9/16 = 607.5, floored to even
    expect(result.height).toBe(1080);
    expect(result.duration).toBeCloseTo(3);
  });

  it('full-duration passthrough (no trim, no crop) scales to even source dims', async () => {
    const result = await editVideo(file);

    expect(transcodeMock).toHaveBeenCalledTimes(1);
    const [, opts] = transcodeMock.mock.calls[0];
    expect(opts.startTime).toBe(0);
    expect(opts.endTime).toBe(10);
    // No crop → a scale to the even source dims (a safety net for odd dims).
    expect(opts.filter).toBe('scale=1920:1080');
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.duration).toBeCloseTo(10);
  });

  it('clamps the trim window inside the source', async () => {
    // start past the end → clamped; end before start → widened to 0.1s min
    await editVideo(file, { startTime: 9.95, endTime: 0 });

    const [, opts] = transcodeMock.mock.calls[0];
    // start clamped to duration - 0.1 = 9.9, end widened to start + 0.1 = 10
    expect(opts.startTime).toBeCloseTo(9.9);
    expect(opts.endTime).toBe(10);
  });

  it('passes the onProgress callback through to the engine', async () => {
    const onProgress = vi.fn();
    await editVideo(file, { startTime: 2, endTime: 6, onProgress });

    const [, , progressArg] = transcodeMock.mock.calls[0];
    expect(progressArg).toBe(onProgress);
  });

  it('throws when the engine fails', async () => {
    transcodeMock.mockRejectedValueOnce(new Error('ffmpeg exited with code 1'));
    await expect(editVideo(file, { startTime: 2, endTime: 5 })).rejects.toThrow(
      'ffmpeg exited with code 1',
    );
  });
});
