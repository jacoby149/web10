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
});
