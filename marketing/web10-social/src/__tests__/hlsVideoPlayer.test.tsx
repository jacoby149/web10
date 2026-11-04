import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
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
  startLoad = vi.fn();
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
  it('keeps film-plus-image carousel slides on HLS with carrier renewal and frame sizing', async () => {
    installFakeHls();
    const { MediaCarousel, HlsRenewalContext } = await import('@web10/discover');
    const renew = vi.fn().mockResolvedValue('/fresh');
    render(<HlsRenewalContext.Provider value={renew}><MediaCarousel items={[
      { _id: 'film', url: '/raw.mp4', mime_type: 'video/mp4', transcoding_settings: { status: 'done', manifest_url: '/manifest?doc_id=film&sig=old' } },
      { _id: 'poster', url: '/poster.jpg', mime_type: 'image/jpeg' },
    ]} /></HlsRenewalContext.Provider>);
    const hls = FakeHls.instances[0];
    expect(hls.loadSource).toHaveBeenCalledWith(expect.stringContaining('/manifest?doc_id=film'));
    const player = screen.getByTestId('hls-video-player');
    expect(player).toHaveClass('h-full');
    expect(screen.getByTestId('hls-video')).not.toHaveAttribute('autoplay');
    expect((player.firstElementChild as HTMLElement).style.aspectRatio).toBe('');
    await act(async () => hls.fire('error', { response: { code: 403 } }));
    expect(renew).toHaveBeenCalledWith('/manifest?doc_id=film&sig=old');
    expect(hls.loadSource).toHaveBeenLastCalledWith(expect.stringContaining('/fresh'));
  });

  it('renews a denied segment once and restores position, speed and playback', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    let resolve!: (url: string) => void;
    const refresh = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    render(<HlsVideoPlayer manifestUrl="/old" refreshManifest={refresh} />);
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.currentTime = 730;
    video.playbackRate = 1.5;
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    const hls = FakeHls.instances[0];
    await act(async () => {
      hls.fire('error', { response: { code: 403 }, fatal: false });
      hls.fire('error', { response: { code: 403 }, fatal: true });
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => resolve('/fresh'));
    expect(hls.loadSource).toHaveBeenLastCalledWith(expect.stringContaining('/fresh'));
    expect(hls.startLoad).toHaveBeenCalledWith(730);
    video.currentTime = 0;
    video.playbackRate = 1;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(730);
    expect(video.playbackRate).toBe(1.5);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('hls-player-error')).not.toBeInTheDocument();
  });

  it('uses expiry only as a renewal hint, including short lifetimes and paused resume', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const now = Math.floor(Date.now() / 1000);
    const url = (iat: number, exp: number) => `/manifest?sig=x.${btoa(JSON.stringify({ iat, exp }))}.x`;
    const refresh = vi.fn().mockResolvedValue(url(now, now + 600));
    render(<HlsVideoPlayer manifestUrl={url(now - 7, now + 1)} refreshManifest={refresh} />);
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    fireEvent.timeUpdate(video);
    expect(refresh).not.toHaveBeenCalled();
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    await act(async () => fireEvent.play(video));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.timeUpdate(video));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['session', 'native-pause', 'speed', 'seek'])('respects %s changes after source replacement and before metadata', async (change) => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    let current = true;
    const refresh = vi.fn().mockResolvedValue({ url: '/fresh', isCurrent: () => current });
    render(<HlsVideoPlayer manifestUrl="/old" refreshManifest={refresh} />);
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.currentTime = 700;
    Object.defineProperty(video, 'duration', { configurable: true, value: 1200 });
    fireEvent.durationChange(video);
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    await act(async () => FakeHls.instances[0].fire('error', { response: { code: 403 } }));
    if (change === 'session') current = false;
    if (change === 'native-pause') fireEvent.pause(video);
    if (change === 'speed') {
      fireEvent.click(screen.getByTestId('speed-select'));
      fireEvent.click(screen.getByTestId('speed-select-option-2'));
    }
    if (change === 'seek') fireEvent.change(screen.getByTestId('scrubber'), { target: { value: '90' } });
    fireEvent.loadedMetadata(video);
    if (change === 'session') expect(screen.getByTestId('hls-player-error')).toBeInTheDocument();
    if (change === 'speed') expect(video.playbackRate).toBe(2);
    else if (change === 'seek') expect(video.currentTime).toBe(90);
    else expect(play).not.toHaveBeenCalled();
  });

  it('bounds recovery when a replacement is also denied', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const refresh = vi.fn().mockResolvedValue('/fresh');
    render(<HlsVideoPlayer manifestUrl="/old" refreshManifest={refresh} />);
    const hls = FakeHls.instances[0];
    await act(async () => hls.fire('error', { response: { code: 403 } }));
    await act(async () => hls.fire('error', { response: { code: 403 } }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('hls-player-error')).toBeInTheDocument();
  });

  it('does not install a late renewal after navigation to another source', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    let resolve!: (url: string) => void;
    const refresh = () => new Promise<string>((r) => { resolve = r; });
    const view = render(<HlsVideoPlayer manifestUrl="/old" refreshManifest={refresh} />);
    const old = FakeHls.instances[0];
    act(() => old.fire('error', { response: { code: 403 } }));
    view.rerender(<HlsVideoPlayer manifestUrl="/different" refreshManifest={refresh} />);
    await act(async () => resolve('/late'));
    expect(old.loadSource).toHaveBeenCalledTimes(1);
    expect(FakeHls.instances[1].loadSource).toHaveBeenCalledTimes(1);
  });

  it.each(['denied', 'unchanged'])('stops renewal after %s rather than looping', async (mode) => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const refresh = mode === 'denied' ? vi.fn().mockRejectedValue(new Error('403')) : vi.fn().mockResolvedValue('/old');
    render(<HlsVideoPlayer manifestUrl="/old" refreshManifest={refresh} />);
    const hls = FakeHls.instances[0];
    await act(async () => hls.fire('error', { response: { code: 403 } }));
    expect(screen.getByTestId('hls-player-error')).toBeInTheDocument();
    await act(async () => hls.fire('error', { response: { code: 403 } }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renews native HLS without autoplaying a paused video', async () => {
    uninstallHls();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const refresh = vi.fn().mockResolvedValue('/fresh');
    render(<HlsVideoPlayer manifestUrl="/old" refreshManifest={refresh} />);
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    const load = vi.spyOn(video, 'load').mockImplementation(() => {});
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    video.currentTime = 900;
    await act(async () => fireEvent.error(video));
    expect(video.src).toContain('/fresh');
    expect(load).toHaveBeenCalledTimes(1);
    video.currentTime = 0;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(900);
    expect(play).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

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

    // MANIFEST_PARSED populates the quality menu (Auto + each level).
    hls.fire('manifestParsed', { levels: [{ height: 360 }, { height: 720 }] });
    await waitFor(() => {
      expect(screen.getByTestId('quality-select')).toBeInTheDocument();
    });

    // The quality menu is a designed popover (RackMenu), not a native <select>:
    // opening it reveals the options (Auto + 360p + 720p).
    fireEvent.click(screen.getByTestId('quality-select'));
    await waitFor(() => {
      const menu = screen.getByTestId('quality-select-menu');
      expect(menu).toBeInTheDocument();
      expect(menu).toHaveTextContent('Auto');
      expect(menu).toHaveTextContent('360p');
      expect(menu).toHaveTextContent('720p');
    });

    // Picking a level sets hls.currentLevel (the YouTube gear menu). Index 2
    // = the second level (720p) → currentLevel 1.
    fireEvent.click(screen.getByTestId('quality-select-option-2'));
    await waitFor(() => expect(hls.currentLevel).toBe(1));

    // Speed menu drives playbackRate: open it, pick 2x (index 2).
    fireEvent.click(screen.getByTestId('speed-select'));
    await waitFor(() => {
      expect(screen.getByTestId('speed-select-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('speed-select-option-2'));
    await waitFor(() => expect(video.playbackRate).toBe(2));

    // The fullscreen button is present (the player spec).
    expect(screen.getByTestId('fullscreen-button')).toBeInTheDocument();

    // Unmount destroys the hls.js instance (no leaked MSE source).
    cleanup();
    expect(hls.destroy).toHaveBeenCalled();
  });

  it('exposes the overlaid control rack: play/pause, scrubber, time, volume', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);

    // The full rack is present on the overlaid control surface.
    expect(screen.getByTestId('play-pause-button')).toBeInTheDocument();
    expect(screen.getByTestId('scrubber')).toBeInTheDocument();
    expect(screen.getByTestId('time-display')).toBeInTheDocument();
    expect(screen.getByTestId('volume-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('volume-slider')).toBeInTheDocument();

    // The time readout starts at 0:00 / 0:00 (no metadata yet).
    expect(screen.getByTestId('time-display')).toHaveTextContent('0:00 / 0:00');

    // The scrubber is a range input bound to the duration.
    const scrubber = screen.getByTestId('scrubber') as HTMLInputElement;
    expect(scrubber.type).toBe('range');

    // The video is muted by default (the feed's ambient autoplay), so the
    // mute icon is the muted variant and the volume slider reads 0.
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(screen.getByTestId('volume-slider')).toHaveValue('0');
  });

  it('the play/pause button drives the video and swaps its icon', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);

    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    const setPaused = (p: boolean) => Object.defineProperty(video, 'paused', { value: p, configurable: true });

    // Starts paused (jsdom never autoplays) → clicking plays.
    setPaused(true);
    fireEvent.click(screen.getByTestId('play-pause-button'));
    expect(play).toHaveBeenCalled();

    // Now "playing" → clicking pauses.
    setPaused(false);
    fireEvent.click(screen.getByTestId('play-pause-button'));
    expect(pause).toHaveBeenCalled();
  });

  it('the scrubber seeks the video to the dragged position', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);

    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    // Give the scrubber a real range to seek within.
    Object.defineProperty(video, 'duration', { value: 120, configurable: true });
    fireEvent.loadedMetadata(video);

    fireEvent.change(screen.getByTestId('scrubber'), { target: { value: '45' } });
    await waitFor(() => expect(video.currentTime).toBe(45));
    // The time readout reflects the seek.
    expect(screen.getByTestId('time-display')).toHaveTextContent('0:45 / 2:00');
  });

  it('the volume slider sets volume and unmutes at non-zero', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);

    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    fireEvent.change(screen.getByTestId('volume-slider'), { target: { value: '0.5' } });
    await waitFor(() => {
      expect(video.volume).toBe(0.5);
      expect(video.muted).toBe(false);
    });
    expect(screen.getByTestId('volume-slider')).toHaveValue('0.5');
  });

  it('the mute toggle flips the muted state', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);

    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    fireEvent.click(screen.getByTestId('volume-toggle'));
    await waitFor(() => expect(video.muted).toBe(false));
    fireEvent.click(screen.getByTestId('volume-toggle'));
    await waitFor(() => expect(video.muted).toBe(true));
  });

  it('hides the controls while playing + idle, keeps them while paused', async () => {
    vi.useFakeTimers();
    installFakeHls();
    try {
      const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
      render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      const setPaused = (p: boolean) => Object.defineProperty(video, 'paused', { value: p, configurable: true });

      // Playing: after the idle window the rack fades out (pointer-events off).
      setPaused(false);
      fireEvent.play(video);
      await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
      const controlsAfter = screen.getByTestId('player-controls');
      expect(controlsAfter.className).toContain('pointer-events-none');

      // Pausing brings the rack back and it stays (no auto-hide while paused).
      setPaused(true);
      act(() => { fireEvent.pause(video); });
      expect(controlsAfter.className).not.toContain('pointer-events-none');
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(controlsAfter.className).not.toContain('pointer-events-none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the controls visible while the pointer is over the player (reaching for a control must not hide the rack)', async () => {
    vi.useFakeTimers();
    installFakeHls();
    try {
      const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
      const { container } = render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      const setPaused = (p: boolean) => Object.defineProperty(video, 'paused', { value: p, configurable: true });
      // The player box is the div that carries the mouse handlers (the
      // aspect-ratio frame, capped to a phone column for vertical video).
      const box = container.querySelector('[data-testid="hls-video-player"] > div') as HTMLElement;
      const controls = screen.getByTestId('player-controls');

      // Playing + pointer over the player: the idle window elapses but the
      // rack stays up (the pointer is still here, mid-reach for a control).
      setPaused(false);
      fireEvent.play(video);
      fireEvent.mouseEnter(box);
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(controls.className).not.toContain('pointer-events-none');

      // Pointer leaves the player while playing: now the rack may auto-hide.
      fireEvent.mouseLeave(box);
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(controls.className).toContain('pointer-events-none');

      // Pointer returns: the rack is immediately reachable again.
      fireEvent.mouseEnter(box);
      expect(controls.className).not.toContain('pointer-events-none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a vertical (9:16) video full-bleed — no phone-width column, the frame reserves the source ratio', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" width={720} height={1280} />,
    );
    // The redesign: no phone-width column (the old `max-w-[280px]` gutter is
    // gone) — the video is full-bleed in the card.
    expect(container.querySelector('.max-w-\\[280px\\]')).toBeNull();
    // The frame reserves the source ratio (9:16 = 0.5625) and fills the width.
    const frame = container.querySelector('[data-testid="hls-video-player"] > div') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.className).toMatch(/w-full/);
    const ar = parseFloat(frame.style.aspectRatio);
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

  it('the native HLS path (iOS Safari) surfaces the designed error when the <video> fails', async () => {
    uninstallHls();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    // iOS Safari has no MSE → hls.js is skipped → the native <video> loads the
    // manifest. A failed fetch (expired sig / 403 / network) fires `error`;
    // without the handler the player sat as a silent black box.
    fireEvent.error(video);
    expect(await screen.findByTestId('hls-player-error')).toBeInTheDocument();
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

  it('speed and quality menus carry distinct icons (two identical dials read as one control)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
    // The speed trigger is a speedometer (Gauge); the quality trigger is a
    // screen (MonitorPlay) — distinct glyphs, so a user can tell "speed" from
    // "resolution" at a glance.
    const speedBtn = screen.getByTestId('speed-select');
    const qualityBtn = screen.getByTestId('quality-select');
    expect(speedBtn.querySelector('[data-testid="icon-gauge"]')).not.toBeNull();
    expect(qualityBtn.querySelector('[data-testid="icon-monitorplay"]')).not.toBeNull();
    // And they are NOT the same glyph (the old bug: both were Gauge).
    expect(speedBtn.querySelector('[data-testid="icon-monitorplay"]')).toBeNull();
    expect(qualityBtn.querySelector('[data-testid="icon-gauge"]')).toBeNull();
  });

  it('switching quality mid-playback resumes the video (a level switch re-buffers; without a nudge it stalls)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" />);
    const hls = FakeHls.instances[0];
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    // The video is playing (not paused) when the user picks a new level.
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    hls.fire('manifestParsed', { levels: [{ height: 360 }, { height: 720 }] });
    await waitFor(() => expect(screen.getByTestId('quality-select')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('quality-select'));
    await waitFor(() => expect(screen.getByTestId('quality-select-menu')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('quality-select-option-1'));
    // The level switch set currentLevel AND nudged playback (the resume fix).
    await waitFor(() => expect(hls.currentLevel).toBe(0));
    expect(play).toHaveBeenCalled();
  });

  it('a maxWidth cap centers a square-ish frame (the lightbox/grid portrait case)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" width={720} height={1280} maxWidth="min(50vh, 100%)" />,
    );
    // The frame is capped to the maxWidth + centered (mx-auto) in the
    // full-width black letterbox — the 9:16 box no longer runs the full card
    // width (which made it ~1.78× the card tall, burying the rack).
    const frame = container.querySelector('[data-testid="hls-video-player"] > div') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.style.maxWidth).toBe('min(50vh, 100%)');
    expect(frame.className).toMatch(/mx-auto/);
    // The source ratio is still reserved (9:16).
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(720 / 1280, 5);
  });

  it('no maxWidth → the frame is full-width (the feed/discover default, unchanged)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" width={720} height={1280} />,
    );
    const frame = container.querySelector('[data-testid="hls-video-player"] > div') as HTMLElement;
    expect(frame.style.maxWidth).toBe('');
    expect(frame.className).not.toMatch(/mx-auto/);
  });

  it('a maxHeight cap shrinks + centers a portrait frame (the feed case — a 9:16 clip must not blow up the card)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" width={720} height={1280} maxHeight="60vh" />,
    );
    // The frame keeps the source ratio (9:16) AND is capped to the height —
    // the width shrinks to fit (the aspect-ratio box honors max-height), and
    // the shrunken frame is centered (mx-auto) in the full-width black
    // letterbox. Without this the feed rendered a full-width 9:16 box
    // (~1.78× the card tall) with the rack buried below the fold.
    const frame = container.querySelector('[data-testid="hls-video-player"] > div') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(720 / 1280, 5);
    expect(frame.style.maxHeight).toBe('60vh');
    expect(frame.className).toMatch(/mx-auto/);
  });

  it('shows the poster as a backdrop <img> and reveals the video only once it is playing (the no-gray idiom)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" poster="http://x/poster.jpg" width={720} height={1280} />,
    );
    const video = screen.getByTestId('hls-video') as HTMLVideoElement;
    // The poster is a real <img> backdrop (not just the <video poster> attr) so
    // the thumbnail loads independently of the video and shows FIRST — the frame
    // is never a gray/black void while the manifest + first segment load.
    const poster = container.querySelector('img') as HTMLImageElement;
    expect(poster).toBeTruthy();
    expect(poster.getAttribute('src')).toBe('http://x/poster.jpg');
    // The video is hidden until it has actually played (frames on screen — the
    // `playing` event, not `canplay`).
    expect(video.className).toMatch(/opacity-0/);
    // `playing` fires (frames on screen) → the video fades in over the poster.
    fireEvent.playing(video);
    await waitFor(() => expect(video.className).toMatch(/opacity-100/));
  });

  it('a maxHeight cap is a no-op for a landscape clip (already shorter than full-width)', async () => {
    installFakeHls();
    const { HlsVideoPlayer } = await import('@/components/Feed/HlsVideoPlayer');
    const { container } = render(
      <HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=m1&sig=abc" width={1280} height={720} maxHeight="60vh" />,
    );
    // Landscape (ratio ≥ 1): the cap is not applied — the frame stays
    // full-width 16:9, no centering (the feed's landscape look is unchanged).
    const frame = container.querySelector('[data-testid="hls-video-player"] > div') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(1280 / 720, 5);
    expect(frame.style.maxHeight).toBe('');
    expect(frame.className).not.toMatch(/mx-auto/);
  });
});
