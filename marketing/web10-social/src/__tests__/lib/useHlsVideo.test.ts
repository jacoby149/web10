import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHlsVideo, hlsSource, hlsEngineAvailable } from '@/lib/useHlsVideo';
import type { MediaRecord } from '@/data/types';

function videoMedia(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    _id: 'vid-1',
    url: 'https://minio.example.com/alice/vid.mp4?sig=direct',
    created_at: '2026-09-07T00:00:00',
    mime_type: 'video/mp4',
    ...overrides,
  };
}

function makeVideoElement() {
  return document.createElement('video');
}

function mockHls() {
  const instances: MockHls[] = [];
  class MockHls {
    static isSupported = vi.fn().mockReturnValue(true);
    static Events = {
      MANIFEST_PARSED: 'manifestParsed',
      LEVEL_SWITCHED: 'levelSwitched',
      ERROR: 'error',
    };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    on = vi.fn();
    currentLevel = -1;
    constructor() {
      instances.push(this);
    }
  }
  return { Hls: MockHls, instances };
}

describe('hlsSource', () => {
  it('returns the absolute manifest URL when the transcode is done', () => {
    const media = videoMedia({
      transcoding_settings: {
        enabled: true,
        status: 'done',
        manifest_url: '/v3/media/hls/manifest?doc_id=vid-1&sig=abc',
      },
    });
    const src = hlsSource(media);
    expect(src).not.toBeNull();
    expect(src).toContain('/v3/media/hls/manifest?doc_id=vid-1&sig=abc');
    expect(src).toMatch(/^https?:\/\//);
  });

  it('returns null while processing (the direct file plays in the meantime)', () => {
    const media = videoMedia({
      transcoding_settings: { enabled: false, status: 'processing' },
    });
    expect(hlsSource(media)).toBeNull();
  });

  it('returns null for failed / missing settings', () => {
    expect(hlsSource(videoMedia({ transcoding_settings: { enabled: false, status: 'failed', error: 'x' } }))).toBeNull();
    expect(hlsSource(videoMedia())).toBeNull();
    expect(hlsSource(null)).toBeNull();
  });
});

describe('useHlsVideo', () => {
  let canPlayTypeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canPlayTypeMock = vi.fn().mockReturnValue('');
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockImplementation(canPlayTypeMock as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches hls.js when supported — the engine owns the source', () => {
    const { Hls, instances } = mockHls();
    vi.stubGlobal('Hls', Hls);

    const el = makeVideoElement();
    const ref = { current: el };
    const media = videoMedia({
      transcoding_settings: {
        enabled: true,
        status: 'done',
        manifest_url: '/v3/media/hls/manifest?doc_id=vid-1&sig=abc',
      },
    });

    const { result, unmount } = renderHook(() => useHlsVideo(ref as never, media));
    expect(result.current).not.toBeNull();
    expect(instances).toHaveLength(1);
    expect(instances[0].loadSource).toHaveBeenCalledWith(result.current);
    expect(instances[0].attachMedia).toHaveBeenCalledWith(el);
    unmount();
    expect(instances[0].destroy).toHaveBeenCalled();
  });

  it('falls back to native HLS on older Safari (no hls.js)', () => {
    canPlayTypeMock.mockReturnValue('probably');
    const el = makeVideoElement();
    const ref = { current: el };
    const media = videoMedia({
      transcoding_settings: {
        enabled: true,
        status: 'done',
        manifest_url: '/v3/media/hls/manifest?doc_id=vid-1&sig=abc',
      },
    });

    const { result } = renderHook(() => useHlsVideo(ref as never, media));
    expect(result.current).not.toBeNull();
    expect(el.getAttribute('src')).toBe(result.current);
  });

  it('keeps the direct file when no HLS engine exists', () => {
    canPlayTypeMock.mockReturnValue('');
    const el = makeVideoElement();
    const ref = { current: el };
    const media = videoMedia({
      transcoding_settings: {
        enabled: true,
        status: 'done',
        manifest_url: '/v3/media/hls/manifest?doc_id=vid-1&sig=abc',
      },
    });

    const { result } = renderHook(() => useHlsVideo(ref as never, media));
    expect(result.current).toBeNull();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('does nothing while the transcode is processing', () => {
    const { Hls, instances } = mockHls();
    vi.stubGlobal('Hls', Hls);
    const el = makeVideoElement();
    const ref = { current: el };
    const media = videoMedia({ transcoding_settings: { enabled: false, status: 'processing' } });

    const { result } = renderHook(() => useHlsVideo(ref as never, media));
    expect(result.current).toBeNull();
    expect(instances).toHaveLength(0);
  });

  it('re-attaches when the manifest changes (a fresh read mints a fresh sig)', () => {
    const { Hls, instances } = mockHls();
    vi.stubGlobal('Hls', Hls);
    const el = makeVideoElement();
    const ref = { current: el };
    const done = (sig: string) =>
      videoMedia({
        transcoding_settings: { enabled: true, status: 'done', manifest_url: `/v3/media/hls/manifest?doc_id=vid-1&sig=${sig}` },
      });

    const { result, rerender, unmount } = renderHook(({ m }) => useHlsVideo(ref as never, m), { initialProps: { m: done('sig-1') } });
    expect(instances).toHaveLength(1);
    expect(instances[0].loadSource).toHaveBeenCalledTimes(1);

    rerender({ m: done('sig-2') });
    expect(instances).toHaveLength(2);
    expect(instances[0].destroy).toHaveBeenCalled();
    expect(instances[1].loadSource).toHaveBeenCalledWith(expect.stringContaining('sig-2'));
    expect(result.current).toContain('sig-2');
    unmount();
    expect(instances[1].destroy).toHaveBeenCalled();
  });
});

describe('hlsEngineAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is true when hls.js is supported', () => {
    const { Hls } = mockHls();
    vi.stubGlobal('Hls', Hls);
    expect(hlsEngineAvailable()).toBe(true);
  });

  it('is true on native-HLS Safari, false elsewhere', () => {
    expect(hlsEngineAvailable()).toBe(false); // jsdom: no Hls, canPlayType ''
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue('probably');
    expect(hlsEngineAvailable()).toBe(true);
  });
});
