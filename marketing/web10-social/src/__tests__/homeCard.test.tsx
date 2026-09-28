import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);
import type { DiscoverPost, MediaItem } from '@web10/discover';

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
  duration_seconds: 123,
  thumbnail_url: 'https://cdn.example/thumb.jpg',
  created_at: new Date().toISOString(),
};

const post: DiscoverPost = {
  id: 'p1',
  author: 'video_creator',
  author_username: 'video_creator',
  text: 'Just a video',
  created_at: new Date().toISOString(),
  media: [videoMedia],
};

beforeEach(() => {
  FakeHls.instances = [];
  vi.clearAllMocks();
  window.Hls = FakeHls as unknown as typeof window.Hls;
});

describe('HomeCard — the duration badge is a live time-lapse (the YouTube home behavior)', () => {
  it('at rest: the badge shows the clip total (2:03 for a 123s clip)', async () => {
    const { HomeCard } = await import('@web10/discover');
    render(<HomeCard post={post} testId="hc" />);
    // 123s → 2:03. The badge is the total length at rest (nothing is playing).
    expect(screen.getByTestId('hc-duration')).toHaveTextContent('2:03');
  });

  it('while the hover preview plays: the badge counts up the elapsed position', async () => {
    const { HomeCard } = await import('@web10/discover');
    render(<HomeCard post={post} testId="hc" />);
    const frame = screen.getByTestId('hc');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});

    // At rest the badge is the total…
    expect(screen.getByTestId('hc-duration')).toHaveTextContent('2:03');

    // Hover → the preview plays. The source reports a duration + starts playing…
    Object.defineProperty(video, 'duration', { value: 123, configurable: true });
    fireEvent.mouseEnter(frame);
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('playing'));
    await waitFor(() => expect(video.className).toMatch(/opacity-100/));

    // …and as time advances the badge is a live clock (elapsed), not the frozen total.
    Object.defineProperty(video, 'currentTime', { value: 30, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    await waitFor(() => expect(screen.getByTestId('hc-duration')).toHaveTextContent('0:30'));

    Object.defineProperty(video, 'currentTime', { value: 61.5, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    await waitFor(() => expect(screen.getByTestId('hc-duration')).toHaveTextContent('1:02'));
  });

  it('when the pointer leaves: the badge returns to the clip total', async () => {
    const { HomeCard } = await import('@web10/discover');
    render(<HomeCard post={post} testId="hc" />);
    const frame = screen.getByTestId('hc');
    const video = frame.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'play').mockResolvedValue(undefined);
    vi.spyOn(video, 'pause').mockImplementation(() => {});

    Object.defineProperty(video, 'duration', { value: 123, configurable: true });
    fireEvent.mouseEnter(frame);
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('playing'));
    Object.defineProperty(video, 'currentTime', { value: 45, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    await waitFor(() => expect(screen.getByTestId('hc-duration')).toHaveTextContent('0:45'));

    // The pointer leaves → playback stops → the badge is the total again.
    fireEvent.mouseLeave(frame);
    video.dispatchEvent(new Event('pause'));
    await waitFor(() => expect(screen.getByTestId('hc-duration')).toHaveTextContent('2:03'));
  });
});
