import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

const img = (id: string, url: string) => ({
  _id: id, url, created_at: '', mime_type: 'image/png', width: 800, height: 600, thumbnail_url: url,
});
const vid = (id: string, url: string) => ({
  _id: id, url, created_at: '', mime_type: 'video/mp4', width: 1080, height: 1920, duration_seconds: 42, thumbnail_url: url,
});

describe('MediaCarousel — the shared multi-media carousel (video-player.md)', () => {
  it('renders every item as a slide (no more first-item-only)', async () => {
    const { MediaCarousel } = await import('@/components/Feed/MediaCarousel');
    render(<MediaCarousel items={[img('a', 'http://x/a.png'), img('b', 'http://x/b.png'), img('c', 'http://x/c.png')]} testId="mc" />);
    expect(screen.getByTestId('mc-image-0')).toBeInTheDocument();
    expect(screen.getByTestId('mc-image-1')).toBeInTheDocument();
    expect(screen.getByTestId('mc-image-2')).toBeInTheDocument();
  });

  it('shows a position indicator (1/N) for multi-item, none for single', async () => {
    const { MediaCarousel } = await import('@/components/Feed/MediaCarousel');
    const { unmount } = render(<MediaCarousel items={[img('a', 'http://x/a.png'), img('b', 'http://x/b.png')]} testId="mc2" />);
    expect(screen.getByTestId('mc2-position')).toHaveTextContent('1/2');
    unmount();
    render(<MediaCarousel items={[img('a', 'http://x/a.png')]} testId="mc3" />);
    expect(screen.queryByTestId('mc3-position')).toBeNull();
  });

  it('renders a video slide through <VideoPlayer fill> — tap-to-play, fills the frame', async () => {
    const { MediaCarousel } = await import('@/components/Feed/MediaCarousel');
    render(<MediaCarousel items={[img('a', 'http://x/a.png'), vid('v', 'http://x/v.mp4')]} fit="cover" ratio={16 / 9} testId="mc4" />);
    const videoSlide = screen.getByTestId('mc4-video-1');
    expect(videoSlide).toBeInTheDocument();
    // Fill mode: the slide fills the frame (w-full h-full, no own aspect-ratio).
    expect(videoSlide.className).toMatch(/h-full/);
    expect(videoSlide.className).toMatch(/w-full/);
    expect(videoSlide.querySelector('video')?.getAttribute('src')).toBe('http://x/v.mp4');
  });

  it('cover fit crops (object-cover), contain letterboxes (object-contain)', async () => {
    const { MediaCarousel } = await import('@/components/Feed/MediaCarousel');
    const { unmount } = render(<MediaCarousel items={[img('a', 'http://x/a.png')]} fit="cover" testId="mc5" />);
    expect(screen.getByTestId('mc5-image-0').className).toMatch(/object-cover/);
    unmount();
    render(<MediaCarousel items={[img('a', 'http://x/a.png')]} fit="contain" testId="mc6" />);
    expect(screen.getByTestId('mc6-image-0').className).toMatch(/object-contain/);
  });
});
