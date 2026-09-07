import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeCropGeometry,
  passthroughGeometry,
  editVideo,
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

// ── editVideo: the re-encode flow (mocked browser APIs) ─────────────────────

class MockVideoElement extends HTMLElement {
  duration = 10;
  videoWidth = 1920;
  videoHeight = 1080;
  muted = false;
  playsInline = false;
  ended = false;
  private _src = '';
  private _currentTime = 0;
  private _playReject: ((e: Error) => void) | null = null;

  set src(value: string) {
    this._src = value;
    // A detached <video> with a src loads metadata in a real browser —
    // mirror that (connectedCallback would never fire, the element is
    // never appended).
    queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
  }
  get src() {
    return this._src;
  }

  set currentTime(value: number) {
    this._currentTime = value;
    this.seekedTo = value;
    // A real element fires 'seeked' when the seek completes.
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  }
  get currentTime() {
    return this._currentTime;
  }
  seekedTo: number | null = null;

  play(): Promise<void> {
    return new Promise((_, reject) => {
      this._playReject = reject;
      // Simulate playback crossing the out-point (timeupdate fires ~4Hz).
      queueMicrotask(() => {
        this._currentTime = this.duration;
        this.dispatchEvent(new Event('timeupdate'));
      });
      queueMicrotask(() => {
        this.ended = true;
        this.dispatchEvent(new Event('ended'));
      });
    });
  }

  pause() {}
  remove() {}
}

// jsdom: HTMLElement subclasses must be in the custom element registry.
if (!customElements.get('mock-video')) {
  customElements.define('mock-video', MockVideoElement);
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn((m: string) => m === 'video/webm;codecs=vp9,opus');
  mimeType = 'video/webm;codecs=vp9,opus';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream, public options: MediaRecorderOptions) {}
  start() {
    queueMicrotask(() => this.ondataavailable?.({ data: new Blob(['mock-video-bytes']) }));
  }
  stop() {
    queueMicrotask(() => this.onstop?.());
  }
}

class MockMediaStream {
  getAudioTracks() {
    return [];
  }
  addTrack() {}
}

function installBrowserMocks() {
  class MockCanvas {
    width = 0;
    height = 0;
    getContext() {
      return { drawImage: vi.fn() };
    }
  }
  (MockCanvas.prototype as unknown as HTMLCanvasElement).captureStream = vi.fn(() => new MediaStream());

  // Capture the real document BEFORE stubbing (the stub delegates to it).
  const realDocument = globalThis.document;
  vi.stubGlobal('HTMLCanvasElement', MockCanvas);
  vi.stubGlobal('MediaStream', MockMediaStream);
  vi.stubGlobal(
    'document',
    {
      createElement: (tag: string) => {
        if (tag === 'video') {
          return new MockVideoElement();
        }
        if (tag === 'canvas') {
          return new MockCanvas() as unknown as HTMLCanvasElement;
        }
        return realDocument.createElement(tag);
      },
    } as unknown as Document,
  );
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  vi.stubGlobal('AudioContext', undefined); // force the silent-edit path
}

describe('editVideo', () => {
  const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

  beforeEach(() => {
    vi.restoreAllMocks();
    installBrowserMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-encodes a trimmed + cropped window and returns the finished blob', async () => {
    const result = await editVideo(file, { startTime: 2, endTime: 5, cropRatio: 9 / 16 });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(result.width).toBe(606); // 1080 * 9/16 = 607.5, floored to even
    expect(result.height).toBe(1080);
    expect(result.duration).toBeCloseTo(3);
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('full-duration passthrough (no trim, no crop) keeps source dims', async () => {
    const result = await editVideo(file);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.duration).toBeCloseTo(10);
  });

  it('clamps the trim window inside the source', async () => {
    // start past the end → clamped; end before start → widened to 0.1s min
    const result = await editVideo(file, { startTime: 9.95, endTime: 0 });
    // start clamped to duration - 0.1 = 9.9, end widened to start + 0.1 = 10
    expect(result.duration).toBeGreaterThan(0);
    expect(result.duration).toBeLessThanOrEqual(0.2);
  });

  it('seeks to the in-point before recording', async () => {
    const created: MockVideoElement[] = [];
    const stubbed = globalThis.document as unknown as { createElement: (t: string) => unknown };
    const originalCreate = stubbed.createElement.bind(globalThis.document);
    stubbed.createElement = (tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'video') created.push(el as MockVideoElement);
      return el;
    };

    await editVideo(file, { startTime: 3 });

    expect(created.length).toBe(1);
    // The element was seeked to the in-point (the setter records it).
    expect(created[0].seekedTo).toBe(3);
  });
});
