import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
