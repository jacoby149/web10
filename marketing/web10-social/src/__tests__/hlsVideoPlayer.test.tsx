import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// ── Fake hls.js (the vendored script attaches window.Hls) ──────────────────
// The same API surface the player uses: isSupported / loadSource /
// attachMedia / on / levels / currentLevel / destroy.

type HlsListener = (event: string, data: any) => void;

class FakeHls {
  static Events = {
    MANIFEST_PARSED: 'manifestParsed',
    LEVEL_SWITCHED: 'levelSwitched',
    ERROR: 'error',
  };
  static isSupported = vi.fn(() => true);
  static instances: FakeHls[] = [];

  loadSource = vi.fn();
  attachMedia = vi.fn();
  destroy = vi.fn();
  on = vi.fn();
  off = vi.fn();
  levels: { height: number; width: number; bitrate: number }[] = [];
  currentLevel = -1;

  constructor() {
    FakeHls.instances.push(this);
  }

  /** Fire a captured event listener (the way hls.js emits). */
  fire(event: string, data: any) {
    const call = this.on.mock.calls.find((c) => c[0] === event);
    if (call) call[1](event, data);
  }
}

function installFakeHls() {
  window.Hls = FakeHls as any;
}
function uninstallHls() {
  delete (window as any).Hls;
}

beforeEach(() => {
  FakeHls.instances = [];
  vi.clearAllMocks();
});
afterEach(() => {
  uninstallHls();
  cleanup();
});

// ---------------------------------------------------------------------------
// HlsVideoPlayer — the player unit
// ---------------------------------------------------------------------------

describe('HlsVideoPlayer', () => {
  it('plays through hls.js: loadSource + attachMedia, quality dropdown from levels', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(
      <HlsVideoPlayer
        manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc"
        width={720}
        height={1280}
      />,
    );

    const hls = FakeHls.instances[0];
    expect(hls).toBeTruthy();
    // The path-only manifest URL is resolved against the API origin.
    expect(hls.loadSource).toHaveBeenCalledWith(expect.stringContaining('/v3/media/hls/manifest?doc_id=m1&sig=abc'));
    expect(hls.attachMedia).toHaveBeenCalled();

    // The video is muted + autoplay + loop (the feed behavior, video-experience.md).
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('autoplay')).toBe(true);
    expect(video.hasAttribute('loop')).toBe(true);

    // MANIFEST_PARSED populates the quality dropdown (Auto + each level).
    hls.fire('manifestParsed', { levels: [{ height: 360 }, { height: 720 }] });
    await waitFor(() => {
      const quality = screen.getByTestId('quality-select') as HTMLSelectElement;
      expect(quality.options.length).toBe(3);
    });
    expect(screen.getByTestId('quality-select')).toHaveTextContent('Auto');
    expect(screen.getByTestId('quality-select')).toHaveTextContent('360p');
    expect(screen.getByTestId('quality-select')).toHaveTextContent('720p');

    // Picking a level sets hls.currentLevel (the YouTube gear menu).
    fireEvent.change(screen.getByTestId('quality-select'), { target: { value: '1' } });
    await waitFor(() => expect(hls.currentLevel).toBe(1));

    // Speed control drives playbackRate.
    fireEvent.change(screen.getByTestId('speed-select'), { target: { value: '2' } });
    await waitFor(() => expect(video.playbackRate).toBe(2));

    // The fullscreen button is present (the player spec).
    expect(screen.getByTestId('fullscreen-button')).toBeInTheDocument();

    // Unmount destroys the hls.js instance (no leaked MSE source).
    cleanup();
    expect(hls.destroy).toHaveBeenCalled();
  });

  it('renders a vertical (9:16) video in a phone-width column', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" width={720} height={1280} />,
    );
    // The video column is capped at phone width (the immersive feed feel);
    // the controls row follows the same column.
    const column = container.querySelector('.max-w-\\[280px\\]');
    expect(column).toBeTruthy();
    // …and it reserves the source ratio (9:16 = 0.5625).
    const ar = parseFloat((column as HTMLElement).style.aspectRatio);
    expect(ar).toBeCloseTo(720 / 1280, 5);
  });

  it('renders a landscape video full width (no phone column)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" width={1280} height={720} />,
    );
    expect(container.querySelector('.max-w-\\[280px\\]')).toBeNull();
  });

  it('falls back to native HLS on Safari (no hls.js, canPlayType supported)', async () => {
    uninstallHls();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    expect(video.src).toContain('/v3/media/hls/manifest?doc_id=m1&sig=abc');
    vi.restoreAllMocks();
  });

  it('shows a designed error state when no HLS support exists', async () => {
    uninstallHls();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
    expect(await screen.findByTestId('hls-player-error')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('shows the error state on a fatal hls.js error', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
    const hls = FakeHls.instances[0];
    hls.fire('error', { type: 'networkError', details: 'manifestLoadError', fatal: true });
    expect(await screen.findByTestId('hls-player-error')).toBeInTheDocument();
  });
});
