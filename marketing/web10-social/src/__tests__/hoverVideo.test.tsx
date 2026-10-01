import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);
import type { MediaItem } from '@web10/discover';

// Fake hls.js (the vendored script attaches window.Hls) — the same surface
// the player uses: isSupported / loadSource / attachMedia / on / destroy.
class FakeHls {
  static Events = { MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched', ERROR: 'error' };
  static isSupported = vi.fn(() => true);
  static instances: FakeHls[] = [];
  loadSource = vi.fn();
  attachMedia = vi.fn();
  destroy = vi.fn();
  on = vi.fn();
  off = vi.fn();
  levels: { height: number }[] = [];
  currentLevel = -1;
  constructor() { FakeHls.instances.push(this); }
}

const videoMedia: MediaItem = {
  url: 'https://cdn.example/video.mp4?sig=x',
  mime_type: 'video/mp4',
  width: 1920,
  height: 1080,
  duration_seconds: 42,
  thumbnail_url: 'https://cdn.example/thumb.jpg',
  created_at: new Date().toISOString(),
};

const hlsMedia: MediaItem = {
  ...videoMedia,
  transcoding_settings: {
    status: 'done',
    manifest_url: '/v3/media/hls/manifest?doc_id=m1&sig=abc',
    variants: [{ width: 1280, height: 720 }],
  },
};

beforeEach(() => {
  FakeHls.instances = [];
  vi.clearAllMocks();
  window.Hls = FakeHls as unknown as typeof window.Hls;
});

describe('HoverVideo — the YouTube-style hover preview (video-player.md)', () => {
  it('at rest: the poster shows, nothing is attached, no speaker icon', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    // The poster is the resting face…
    const img = frame.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://cdn.example/thumb.jpg');
    // …the <video> exists but is inert (no source, hidden)…
    const video = frame.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute('src')).toBeNull();
    expect(video.className).toMatch(/opacity-0/);
    // …and nothing has been attached (no hls instance, no fetch).
    expect(FakeHls.instances).toHaveLength(0);
    // The speaker toggle is only for a live preview.
    expect(screen.queryByTestId('hv-mute')).toBeNull();
  });

  it('hover: the file source attaches + the video plays muted', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});

    fireEvent.mouseEnter(frame);
    await waitFor(() => {
      expect(play).toHaveBeenCalled();
    });
    // The direct file is attached (the non-transcoded path)…
    expect(video.getAttribute('src')).toBe('https://cdn.example/video.mp4?sig=x');
    // …and the preview starts muted (the autoplay policy).
    expect(video.muted).toBe(true);

    // The pointer leaves → playback stops (the poster returns).
    fireEvent.mouseLeave(frame);
    await waitFor(() => {
      expect(pause).toHaveBeenCalled();
    });
  });

  it('hover: a transcoded video attaches through hls.js (the manifest, not the raw file)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={hlsMedia} poster={hlsMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);

    fireEvent.mouseEnter(frame);
    await waitFor(() => {
      expect(FakeHls.instances.length).toBeGreaterThan(0);
    });
    expect(FakeHls.instances[0].loadSource).toHaveBeenCalledWith(
      expect.stringContaining('/v3/media/hls/manifest?doc_id=m1&sig=abc'),
    );
    // The raw source file is NOT used (the greyed-out-tile rule).
    expect(video.getAttribute('src')).toBeNull();
  });

  it('the speaker toggle (top-right) unmutes the live preview + flips the icon', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});

    fireEvent.mouseEnter(frame);
    // At the start of the preview the muted glyph (VolumeX) is up…
    const mute = screen.getByTestId('hv-mute');
    expect(mute).toHaveAttribute('aria-label', 'Unmute preview');

    // A tap on the speaker unmutes (the user's explicit gesture)…
    fireEvent.click(mute);
    expect(video.muted).toBe(false);
    expect(screen.getByTestId('hv-mute')).toHaveAttribute('aria-label', 'Mute preview');

    // …and tapping again re-mutes.
    fireEvent.click(screen.getByTestId('hv-mute'));
    expect(video.muted).toBe(true);
  });

  it('the speaker tap never navigates (it stops propagation out of the card link)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    const linkClicks = vi.fn();
    render(
      <a href="#post" onClick={linkClicks} className="relative block aspect-video">
        <HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />
      </a>,
    );
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);

    fireEvent.mouseEnter(frame);
    fireEvent.click(screen.getByTestId('hv-mute'));
    expect(linkClicks).not.toHaveBeenCalled();
  });

  it('a failed load degrades to the poster (the tile stays a working link)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);

    fireEvent.mouseEnter(frame);
    fireEvent.error(video);
    // The preview gives up: the frame is the poster <img> again (no <video>,
    // no speaker icon) — the tile still works as a link.
    await waitFor(() => {
      expect(screen.getByTestId('hv').tagName).toBe('IMG');
    });
    expect(screen.getByTestId('hv')).toHaveAttribute('src', 'https://cdn.example/thumb.jpg');
    expect(screen.queryByTestId('hv-mute')).toBeNull();
  });

  it('re-hover after a leave does not re-attach (one player per card)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={hlsMedia} poster={hlsMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});

    fireEvent.mouseEnter(frame);
    await waitFor(() => expect(FakeHls.instances.length).toBeGreaterThan(0));
    fireEvent.mouseLeave(frame);
    await waitFor(() => expect(play).toHaveBeenCalled());

    // A second hover reuses the attached player (play again, no new instance).
    fireEvent.mouseEnter(frame);
    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(2);
    });
    expect(FakeHls.instances).toHaveLength(1);
  });

  it('the video is revealed only when playing — the poster stays the backdrop (no gray flash)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});

    fireEvent.mouseEnter(frame);
    await waitFor(() => expect(play).toHaveBeenCalled());
    // Hovered but not yet playing (the source is still loading) → the video is
    // hidden, the poster is the visible face. This is the gray-flash fix: the
    // tile never shows a black/gray frame before the first frame is on screen.
    expect(video.className).toMatch(/opacity-0/);

    // The source starts playing (first frame on screen) → the video reveals.
    video.dispatchEvent(new Event('playing'));
    await waitFor(() => expect(video.className).toMatch(/opacity-100/));

    // The pointer leaves → playback stops → the video hides, the poster returns.
    fireEvent.mouseLeave(frame);
    await waitFor(() => expect(pause).toHaveBeenCalled());
    video.dispatchEvent(new Event('pause'));
    await waitFor(() => expect(video.className).toMatch(/opacity-0/));
  });

  it('the progress bar tracks the preview (the YouTube home behavior)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});

    // At rest: no progress bar.
    expect(screen.queryByTestId('hv-progress')).toBeNull();

    fireEvent.mouseEnter(frame);
    // Hovered but not playing / no duration known yet: still no bar.
    expect(screen.queryByTestId('hv-progress')).toBeNull();

    // The source reports a duration + starts playing…
    Object.defineProperty(video, 'duration', { value: 123, configurable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('playing'));
    await waitFor(() => expect(screen.getByTestId('hv-progress')).not.toBeNull());

    // …and the played portion fills as time advances (61.5s of 123s = 50%).
    Object.defineProperty(video, 'currentTime', { value: 61.5, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    await waitFor(() => {
      expect(screen.getByTestId('hv-progress').style.width).toBe('50%');
    });
  });

  it('unmuting is audible (the volume is raised if it was at zero)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});
    // The element rests at zero volume — unmuting must raise it, not just flip
    // the muted flag (the "no volume" complaint).
    Object.defineProperty(video, 'volume', { value: 0, writable: true, configurable: true });

    fireEvent.mouseEnter(frame);
    fireEvent.click(screen.getByTestId('hv-mute')); // unmute
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.8);
  });

  it('the video overlays the poster (both absolute inset-0) — the audio-plays-but-still-thumbnail fix', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const img = frame.querySelector('img') as HTMLImageElement;
    const video = frame.querySelector('video') as HTMLVideoElement;
    // Both the poster and the video must occupy the SAME box (absolute inset-0),
    // stacked — never flow one below the other. A flow layout pushed the video
    // off-screen below the poster, so the audio played but the visible image
    // stayed the thumbnail (the operator's "only hearing the audio, the image is
    // just the thumbnail" complaint).
    expect(img.className).toMatch(/absolute/);
    expect(img.className).toMatch(/inset-0/);
    expect(video.className).toMatch(/absolute/);
    expect(video.className).toMatch(/inset-0/);
  });

  it('the scrubber seeks on click (click a spot on the bar → jump to that position)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});
    Object.defineProperty(video, 'duration', { value: 120, configurable: true });
    let currentTime = 0;
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: (v: number) => { currentTime = v; },
      configurable: true,
    });

    fireEvent.mouseEnter(frame);
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('playing'));
    const scrubber = await screen.findByTestId('hv-scrubber');

    // The track spans 0–200px; clicking at x=100 (the middle) seeks to 50% of
    // 120s = 60s. The bar is a real control, not decoration.
    vi.spyOn(scrubber, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, top: 0, bottom: 12, width: 200, height: 12, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    fireEvent.click(scrubber, { clientX: 100 });
    expect(currentTime).toBe(60);
  });

  it('a scrubber click never navigates (it stops + prevents the card link)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    const linkClicks = vi.fn();
    render(
      <a href="#post" onClick={linkClicks} className="relative block aspect-video">
        <HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />
      </a>,
    );
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});
    Object.defineProperty(video, 'duration', { value: 120, configurable: true });

    fireEvent.mouseEnter(frame);
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('playing'));
    const scrubber = await screen.findByTestId('hv-scrubber');
    vi.spyOn(scrubber, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, top: 0, bottom: 12, width: 200, height: 12, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    // The scrubber is a control, not the card link: the click must not navigate.
    const result = fireEvent.click(scrubber, { clientX: 100 });
    expect(linkClicks).not.toHaveBeenCalled();
    expect(result).toBe(false); // preventDefault → the anchor's default navigation is cancelled
  });

  it('the speaker toggle cancels the anchor navigation (preventDefault, not just stopPropagation)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    render(
      <a href="#post" className="relative block aspect-video">
        <HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />
      </a>,
    );
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);

    fireEvent.mouseEnter(frame);
    const mute = screen.getByTestId('hv-mute');
    // fireEvent returns false when the event's default was prevented — the
    // speaker is a control, so clicking it must cancel the anchor's navigation
    // (the "clicking the audio button opens a new tab" bug).
    const result = fireEvent.click(mute);
    expect(result).toBe(false);
  });
});

// ── The touch-dwell preview (the mobile analog of hover, the YouTube mobile
// behavior): the preview plays when the finger STOPS over a tile that is ≥60%
// in view, keeps playing while it stays in view + the finger is idle, and
// stops the moment the user scrolls away. One preview at a time — the most
// visible eligible tile wins. ─────────────────────────────────────────────────
describe('HoverVideo — the touch-dwell preview (the mobile analog of hover)', () => {
  type MockIO = {
    instances: { callback: IntersectionObserverCallback }[];
  };

  // jsdom has no matchMedia — stub it to report a touch device
  // (hover: none + pointer: coarse) so useIsTouchDevice() is true.
  function mockTouchDevice() {
    (window as unknown as Record<string, unknown>).matchMedia = vi.fn().mockImplementation(
      (query: string) => ({
        matches: query === '(hover: none) and (pointer: coarse)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
  }

  function liveObservers(): { callback: IntersectionObserverCallback }[] {
    return ((globalThis as unknown as Record<string, MockIO>).IntersectionObserver as unknown as MockIO).instances;
  }

  // Fire a tile's OWN IntersectionObserver callback (the mock records the
  // element each observer was created for) with a visibility ratio.
  function fireIO(testId: string, ratio: number) {
    const el = screen.getByTestId(testId);
    const io = liveObservers().find((o) => (o as unknown as { observed?: Element }).observed === el);
    expect(io).toBeTruthy();
    io!.callback(
      [{ isIntersecting: ratio > 0, intersectionRatio: ratio, target: el } as unknown as IntersectionObserverEntry],
      io as unknown as IntersectionObserver,
    );
  }

  beforeEach(async () => {
    const { __resetDwellForTests } = await import('@web10/discover');
    __resetDwellForTests();
    ((globalThis as unknown as Record<string, MockIO>).IntersectionObserver as unknown as MockIO).instances = [];
    delete (window as unknown as Record<string, unknown>).matchMedia;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a scroll dwell (in view + finger stopped) starts the muted preview', async () => {
    const { HoverVideo } = await import('@web10/discover');
    mockTouchDevice();
    vi.useFakeTimers();
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});

    // The tile is ≥60% in view (the IntersectionObserver reports it)…
    fireIO('hv', 1);
    // …but the finger is still moving (scroll activity) — no preview yet.
    fireEvent.scroll(window);
    expect(play).not.toHaveBeenCalled();

    // The finger stops: after the dwell window (300ms) the preview starts,
    // muted (the autoplay policy), and the source attaches lazily.
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(50); // let the effect chain flush
    expect(play).toHaveBeenCalled();
    expect(video.muted).toBe(true);
    expect(video.getAttribute('src')).toBe('https://cdn.example/video.mp4?sig=x');

    // The user scrolls away → the preview stops (the poster returns).
    fireEvent.scroll(window);
    await vi.advanceTimersByTimeAsync(50);
    expect(pause).toHaveBeenCalled();
  });

  it('the preview keeps playing while the tile stays in view + the finger is idle', async () => {
    const { HoverVideo } = await import('@web10/discover');
    mockTouchDevice();
    vi.useFakeTimers();
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});

    fireIO('hv', 1);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(50);
    expect(play).toHaveBeenCalled();

    // The clip loops (the element's loop attribute) — and with no scroll and
    // no new IO report, nothing pauses it: the preview stays live for as long
    // as the finger is idle over the tile. (jsdom's video never truly plays,
    // so "stays live" is observed as: play was called, pause was not.)
    expect(video.loop).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it('scrolling away stops the preview, and the next dwell re-arms it (detects again a little later)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    mockTouchDevice();
    vi.useFakeTimers();
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});

    // First dwell: in view + finger stops → plays.
    fireIO('hv', 1);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(50);
    expect(play).toHaveBeenCalledTimes(1);

    // The user scrolls: the tile leaves the viewport (the IO reports 0) + the
    // scroll activity cancels → the preview stops.
    fireEvent.scroll(window);
    fireIO('hv', 0);
    await vi.advanceTimersByTimeAsync(50);
    expect(pause).toHaveBeenCalled();

    // The user scrolls back: the tile is in view again, and the finger stops
    // a little later → the preview re-arms and plays again.
    fireIO('hv', 1);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(50);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('a tile below the visibility threshold never plays (no half-visible previews)', async () => {
    const { HoverVideo } = await import('@web10/discover');
    mockTouchDevice();
    vi.useFakeTimers();
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);

    // The tile is only 25% in view (below the 60% threshold) — even with the
    // finger idle, nothing plays.
    fireIO('hv', 0.25);
    await vi.advanceTimersByTimeAsync(1000);
    expect(play).not.toHaveBeenCalled();
  });

  it('one preview at a time: the most visible eligible tile wins', async () => {
    const { HoverVideo, __dwellState } = await import('@web10/discover');
    mockTouchDevice();
    vi.useFakeTimers();
    render(
      <div>
        <div className="relative aspect-video">
          <HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv-a" />
        </div>
        <div className="relative aspect-video">
          <HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv-b" />
        </div>
      </div>,
    );
    const videoA = screen.getByTestId('hv-a').querySelector('video') as HTMLVideoElement;
    const videoB = screen.getByTestId('hv-b').querySelector('video') as HTMLVideoElement;
    const playA = vi.spyOn(videoA, 'play').mockResolvedValue(undefined);
    const pauseA = vi.spyOn(videoA, 'pause').mockImplementation(() => {});
    const playB = vi.spyOn(videoB, 'play').mockResolvedValue(undefined);
    const pauseB = vi.spyOn(videoB, 'pause').mockImplementation(() => {});

    // Both tiles are in view; A is fully visible, B is 75% → A wins.
    fireIO('hv-a', 1);
    fireIO('hv-b', 0.75);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(50);
    expect(playA).toHaveBeenCalled();
    expect(playB).not.toHaveBeenCalled();
    expect(__dwellState().winner).toBe('hv-a');

    // The user scrolls: B becomes the most visible eligible tile (A drops to
    // 40%, below the threshold). The win hands over to B.
    fireEvent.scroll(window);
    fireIO('hv-a', 0.4);
    fireIO('hv-b', 1);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(50);
    expect(playB).toHaveBeenCalled();
    expect(pauseA).toHaveBeenCalled();
    expect(__dwellState().winner).toBe('hv-b');
  });

  it('a touch device at rest (no dwell yet) keeps the static thumbnail — no autoplay on load', async () => {
    const { HoverVideo } = await import('@web10/discover');
    mockTouchDevice();
    vi.useFakeTimers();
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);

    // Mounted on a touch device, in view, but the finger has not dwelled yet
    // (no IO report + no quiet window) → the poster holds, nothing attaches.
    await vi.advanceTimersByTimeAsync(1000);
    expect(play).not.toHaveBeenCalled();
    expect(video.getAttribute('src')).toBeNull();
    expect(screen.queryByTestId('hv-mute')).toBeNull();
  });

  it('the pointer path is untouched on a hover-capable device (no matchMedia → desktop)', async () => {
    // No matchMedia stub (jsdom default) → useIsTouchDevice() is false → the
    // touch-dwell path is inert (no IntersectionObserver registered at all).
    const { HoverVideo } = await import('@web10/discover');
    render(<HoverVideo media={videoMedia} poster={videoMedia.thumbnail_url} testId="hv" />);
    const frame = screen.getByTestId('hv');
    const video = frame.querySelector('video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);

    // The touch-dwell path is inert: no observer, so a scroll does nothing.
    expect(liveObservers()).toHaveLength(0);
    fireEvent.scroll(window);
    await new Promise((r) => setTimeout(r, 400));
    expect(play).not.toHaveBeenCalled();

    // …but the pointer still does.
    fireEvent.mouseEnter(frame);
    await waitFor(() => expect(play).toHaveBeenCalled());
  });
});
