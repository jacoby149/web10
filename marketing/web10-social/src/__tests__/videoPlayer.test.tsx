import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

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

beforeEach(() => {
  FakeHls.instances = [];
  vi.clearAllMocks();
  window.Hls = FakeHls as unknown as typeof window.Hls;
});

describe('VideoPlayer — the shared video surface (video-player.md)', () => {
  it('hls source renders the full rack (the existing HlsVideoPlayer)', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    render(<VideoPlayer source={{ type: 'hls', manifestUrl: '/v3/media/hls/manifest?doc_id=m1&sig=abc' }} mode="inline" />);
    expect(screen.getByTestId('hls-video-player')).toBeInTheDocument();
    expect(FakeHls.instances.length).toBeGreaterThan(0);
    expect(FakeHls.instances[0].loadSource).toHaveBeenCalledWith(expect.stringContaining('/v3/media/hls/manifest?doc_id=m1&sig=abc'));
  });

  it('file source + inline renders the shared tap-to-play <video>', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    render(
      <VideoPlayer
        source={{ type: 'file', url: 'http://x/v.mp4', width: 1080, height: 1920, durationSeconds: 42 }}
        mode="inline"
        fit="contain"
        testId="vp-inline"
      />,
    );
    const container = screen.getByTestId('vp-inline');
    expect(container.querySelector('video')?.getAttribute('src')).toBe('http://x/v.mp4');
  });

  it('file source + cover + 16:9 renders a uniform aspect-video tile (the discover/youtube case)', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    render(
      <VideoPlayer
        source={{ type: 'file', url: 'http://x/v.mp4', width: 1080, height: 1920 }}
        mode="inline"
        fit="cover"
        ratio={16 / 9}
        testId="vp-cover"
      />,
    );
    const container = screen.getByTestId('vp-cover');
    expect(container.className).toMatch(/aspect-video/);
    const video = container.querySelector('video');
    expect(video?.className).toMatch(/object-cover/);
    expect(video?.className).not.toMatch(/object-contain/);
  });

  it('file source + full renders native <video controls> (the lightbox non-transcoded path)', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    render(<VideoPlayer source={{ type: 'file', url: 'http://x/v.mp4' }} mode="full" testId="vp-full" />);
    const video = screen.getByTestId('vp-full') as HTMLVideoElement;
    expect(video.tagName).toBe('VIDEO');
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.getAttribute('src')).toBe('http://x/v.mp4');
  });

  it('file source + full surfaces the designed error when the native load fails', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    render(<VideoPlayer source={{ type: 'file', url: 'http://x/v.mp4' }} mode="full" testId="vp-full" />);
    const video = screen.getByTestId('vp-full') as HTMLVideoElement;
    // A failed load (403/404/expired presigned URL, undecodable codec) fires
    // `error` on the <video> — the player must degrade to the designed state,
    // not a silent black box (the iOS Safari gap).
    fireEvent.error(video);
    expect(await screen.findByTestId('video-error')).toBeInTheDocument();
    expect(screen.queryByTestId('vp-full')).toBeNull();
  });

  it('youtube source renders an iframe (the Shorts path — a source case, not a component)', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    render(<VideoPlayer source={{ type: 'youtube', id: 'abc123' }} mode="inline" testId="vp-yt" />);
    const iframe = screen.getByTestId('vp-yt').querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('src')).toContain('youtube.com/embed/abc123');
  });

  it('sourceFromMedia: transcoded (done + manifest) → hls; anything else → file', async () => {
    const { sourceFromMedia } = await import('@/components/Feed/VideoPlayer');
    const transcoded = sourceFromMedia({
      url: 'http://x/raw.mp4',
      created_at: '',
      mime_type: 'video/mp4',
      transcoding_settings: { status: 'done', manifest_url: '/m?sig=x', variants: [{ width: 360, height: 640 }] },
    });
    expect(transcoded.type).toBe('hls');
    if (transcoded.type === 'hls') expect(transcoded.manifestUrl).toBe('/m?sig=x');

    const processing = sourceFromMedia({
      url: 'http://x/raw.mp4',
      created_at: '',
      mime_type: 'video/mp4',
      transcoding_settings: { status: 'processing' },
    });
    expect(processing.type).toBe('file');

    const raw = sourceFromMedia({ url: 'http://x/raw.mp4', created_at: '', mime_type: 'video/mp4' });
    expect(raw.type).toBe('file');
  });

  it('the inline tap never reaches the card (the modal-yank invariant)', async () => {
    const { InlineVideo } = await import('@/components/Feed/VideoPlayer');
    const parentClicks = vi.fn();
    render(
      <div onClick={parentClicks}>
        <InlineVideo url="http://x/v.mp4" testId="vp-stop" />
      </div>,
    );
    fireEvent.click(screen.getByTestId('vp-stop'));
    expect(parentClicks).not.toHaveBeenCalled();
  });

  // ── immersive (the Shorts slide — the video fills the frame the surface
  //    gives it; no own ratio box, no phone-width column, no control rack) ──

  it('hls + immersive renders the video-only fill (no rack, no phone-width column)', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    const { container } = render(
      <VideoPlayer
        source={{ type: 'hls', manifestUrl: '/v3/media/hls/manifest?doc_id=m1&sig=abc', width: 720, height: 1280 }}
        mode="inline"
        fit="cover"
        immersive
        active
        testId="vp-imm-hls"
      />,
    );
    // The hls.js source is attached…
    expect(FakeHls.instances.length).toBeGreaterThan(0);
    // …the video fills the frame (absolute inset-0, object-cover)…
    const video = screen.getByTestId('immersive-hls-video') as HTMLVideoElement;
    expect(video.className).toMatch(/object-cover/);
    // …there is NO full rack (the scrubber/quality/speed belong to the
    // lightbox's mode="full")…
    expect(screen.queryByTestId('player-controls')).toBeNull();
    expect(screen.queryByTestId('quality-select')).toBeNull();
    expect(screen.queryByTestId('scrubber')).toBeNull();
    // …and NO phone-width column (the feed's max-w-[280px] is a feed layout).
    expect(container.querySelector('.max-w-\\[280px\\]')).toBeNull();
  });

  it('file + immersive fills the frame (no own aspect-ratio, video absolute + cover)', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    const { container } = render(
      <VideoPlayer
        source={{ type: 'file', url: 'http://x/v.mp4', width: 720, height: 1280 }}
        mode="inline"
        fit="cover"
        immersive
        testId="vp-imm-file"
      />,
    );
    const frame = screen.getByTestId('vp-imm-file');
    // No own aspect-ratio — the frame takes the size the surface gives it.
    expect(frame.style.aspectRatio).toBe('');
    const video = frame.querySelector('video')!;
    expect(video.className).toMatch(/object-cover/);
    expect(video.className).toMatch(/absolute/);
    // No duration badge on the immersive slide (the surface shows its own).
    expect(frame.textContent).not.toContain('42s');
  });

  it('immersive + active autoplays muted; inactive pauses (the ambient loop)', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    const { rerender } = render(
      <VideoPlayer
        source={{ type: 'file', url: 'http://x/v.mp4', width: 720, height: 1280 }}
        mode="inline"
        fit="cover"
        immersive
        active
        testId="vp-imm-loop"
      />,
    );
    const video = screen.getByTestId('vp-imm-loop').querySelector('video')!;
    // Active → playing (the effect calls play(); jsdom leaves `paused` true,
    // but the muted flag is the observable seam: playing ⇒ unmuted intent).
    expect(video.muted).toBe(false);

    // The slide scrolls off-screen (active → false) → paused + muted again.
    rerender(
      <VideoPlayer
        source={{ type: 'file', url: 'http://x/v.mp4', width: 720, height: 1280 }}
        mode="inline"
        fit="cover"
        immersive
        active={false}
        testId="vp-imm-loop"
      />,
    );
    expect(video.muted).toBe(true);
  });

  it('immersive: a tap toggles play/pause in place and never escapes the slide', async () => {
    const { VideoPlayer } = await import('@/components/Feed/VideoPlayer');
    const slideClicks = vi.fn();
    render(
      <div onClick={slideClicks}>
        <VideoPlayer
          source={{ type: 'file', url: 'http://x/v.mp4', width: 720, height: 1280 }}
          mode="inline"
          fit="cover"
          immersive
          active
          testId="vp-imm-tap"
        />
      </div>,
    );
    const frame = screen.getByTestId('vp-imm-tap');
    const video = frame.querySelector('video')!;
    expect(video.muted).toBe(false); // active → playing
    fireEvent.click(frame);
    expect(video.muted).toBe(true); // tapped → paused
    expect(slideClicks).not.toHaveBeenCalled(); // the tap never escapes
    fireEvent.click(frame);
    expect(video.muted).toBe(false); // tapped again → playing
  });
});
