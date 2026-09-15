import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
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

// Mock data layer — the Shorts feed (the render-time gate output: a post +
// its one resolved 9:16 video).
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readShortsFeed: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock wapi (the like toggle reads the token).
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
  resetWapi: vi.fn(),
}));

// The PWA install prompt (ShortsScreen fires it on mobile after ~3s) — keep
// the screen test focused on the surface, not the D72 trigger.
vi.mock('@/lib/pwa', () => ({
  requestInstallPrompt: vi.fn(),
  isMobile: vi.fn().mockReturnValue(false),
}));

// A short: a discover post whose single media is a real 9:16 video.
function shortPost(over: { id: string; author: string; text?: string; media?: Record<string, unknown> }) {
  return {
    post: {
      _id: over.id,
      author_username: over.author,
      author_provider: 'web10',
      text: over.text ?? '',
      likes: 10,
      comments: 2,
      created_at: new Date().toISOString(),
    },
    media: {
      _id: `m-${over.id}`,
      url: `http://x/${over.id}.mp4`,
      created_at: new Date().toISOString(),
      mime_type: 'video/mp4',
      width: 720,
      height: 1280,
      duration_seconds: 42,
      ...over.media,
    },
  };
}

// A transcoded (D44) short — the source the node serves for real uploads
// (status done + a minted manifest_url → the hls path).
function hlsShort(over: { id: string; author: string }) {
  return shortPost({
    ...over,
    media: {
      transcoding_settings: {
        status: 'done',
        manifest_url: `/v3/media/hls/manifest?doc_id=${over.id}&sig=abc`,
        variants: [{ width: 540, height: 960 }],
      },
      thumbnail_url: `http://x/${over.id}.jpg`,
    },
  });
}

async function renderShorts(initialEntries: string[] = ['/shorts']) {
  const { default: ShortsScreen } = await import('@/components/Shorts/ShortsScreen');
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ShortsScreen />
    </MemoryRouter>,
  );
}

describe('ShortsScreen — the vertical short-form feed (shorts.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeHls.instances = [];
    window.Hls = FakeHls as unknown as typeof window.Hls;
  });

  it('renders one snap slide per short, the video filling the slide', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna', text: 'first' }),
      shortPost({ id: 's2', author: 'kai', text: 'second' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-slide-0')).toBeInTheDocument();
      expect(screen.getByTestId('short-slide-1')).toBeInTheDocument();
    });

    // The swipe container: vertical scroll-snap, one slide per viewport.
    const container = screen.getByTestId('shorts-container');
    expect(container.className).toMatch(/snap-y/);
    expect(container.className).toMatch(/snap-mandatory/);

    // The frame: on a wide desktop viewport the slide is a centered 9:16
    // column that fills the viewport height (the designed letterbox); on a
    // phone the slide IS the frame (full-bleed).
    const frame = screen.getByTestId('short-video-0').parentElement!;
    expect(frame.className).toMatch(/md:aspect-\[9\/16\]/);
    expect(frame.className).toMatch(/h-full/);

    // The video fills the frame (immersive: no own ratio box, object-cover).
    const video = screen.getByTestId('short-video-0').querySelector('video')!;
    expect(video.className).toMatch(/object-cover/);
  });

  it('a transcoded (hls) short renders the video-only fill — no control rack, no phone-width column', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      hlsShort({ id: 'h1', author: 'luna' }),
    ]);
    const { container } = await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-video-0')).toBeInTheDocument();
    });

    // The hls.js source is attached (the transcoded path)…
    expect(FakeHls.instances.length).toBeGreaterThan(0);
    // …but the slide is the video-only immersive fill: no full rack…
    expect(screen.queryByTestId('player-controls')).toBeNull();
    expect(screen.queryByTestId('quality-select')).toBeNull();
    expect(screen.queryByTestId('scrubber')).toBeNull();
    // …and no phone-width column (the feed's max-w-[280px] is a feed layout).
    expect(container.querySelector('.max-w-\\[280px\\]')).toBeNull();
    // The video fills the frame.
    const video = screen.getByTestId('immersive-hls-video') as HTMLVideoElement;
    expect(video.className).toMatch(/object-cover/);
  });

  it('the active slide autoplays muted; the off-screen slide does not (the ambient loop)', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
      shortPost({ id: 's2', author: 'kai' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-slide-0')).toBeInTheDocument();
    });

    // The first slide is the active one (activeIndex starts at 0) → its video
    // plays (unmuted intent); the second slide's video is paused (muted).
    const v0 = screen.getByTestId('short-video-0').querySelector('video')!;
    const v1 = screen.getByTestId('short-video-1').querySelector('video')!;
    expect(v0.muted).toBe(false);
    expect(v1.muted).toBe(true);
  });

  it('swiping to the next slide (the IntersectionObserver fires) hands autoplay over', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
      shortPost({ id: 's2', author: 'kai' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-slide-1')).toBeInTheDocument();
    });

    const v0 = screen.getByTestId('short-video-0').querySelector('video')!;
    const v1 = screen.getByTestId('short-video-1').querySelector('video')!;
    expect(v0.muted).toBe(false); // slide 0 active
    expect(v1.muted).toBe(true); // slide 1 off-screen

    // The user swipes: slide 1 becomes the ≥60%-visible slide. The
    // screen's IntersectionObserver callback fires with slide 1 intersecting
    // (the setup.ts mock captures the callback; drive it with the real entry).
    const io = (globalThis as any).IntersectionObserver;
    // The mock stores every constructed observer; the newest one is the
    // current render's (it re-registers on shorts/activeIndex changes).
    const observers = (io as any).instances as any[];
    const slideObserver = observers[observers.length - 1];
    expect(slideObserver).toBeTruthy();
    const slide1 = screen.getByTestId('short-slide-1');
    slideObserver.callback([{ isIntersecting: true, target: slide1 } as unknown as IntersectionObserverEntry], slideObserver);

    await waitFor(() => {
      expect(v1.muted).toBe(false); // slide 1 now active → playing
      expect(v0.muted).toBe(true); // slide 0 off-screen → paused
    });
  });

  it('keyboard: ArrowDown swipes to the next slide (the desktop swipe)', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
      shortPost({ id: 's2', author: 'kai' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-slide-1')).toBeInTheDocument();
    });

    const scrolled: Element[] = [];
    // jsdom has no scrollIntoView — define it on the prototype (the screen's
    // keyboard handler calls it on a child; the element is `this`, not an arg).
    HTMLElement.prototype.scrollIntoView = function () {
      scrolled.push(this as unknown as Element);
    };
    const container = screen.getByTestId('shorts-container');
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    // It scrolls the NEXT slide (index 1) into view.
    expect(scrolled).toEqual([screen.getByTestId('short-slide-1')]);
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
  });

  it('the author/caption overlay + the like/comment/share rail sit on the video', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna', text: 'Vertical cut from the studio day.' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-slide-0')).toBeInTheDocument();
    });

    // The author handle + caption…
    expect(screen.getByText('@luna')).toBeInTheDocument();
    expect(screen.getByText('Vertical cut from the studio day.')).toBeInTheDocument();
    // …and the action rail (like / comments / share).
    expect(screen.getByTestId('short-like-0')).toBeInTheDocument();
    expect(screen.getByLabelText('View comments')).toBeInTheDocument();
    expect(screen.getByLabelText('Share')).toBeInTheDocument();
  });

  it('liking a short toggles the heart optimistically', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-like-0')).toBeInTheDocument();
    });

    const like = screen.getByTestId('short-like-0');
    // The lucide mock renders a span (not an svg) carrying the icon's props.
    const heart = like.querySelector('[data-testid="icon-heart"]')!;
    expect(heart.className).not.toMatch(/fill-red-500/);
    fireEvent.click(like);
    expect(data.toggleReactionKind).toHaveBeenCalledWith('s1', 'like');
    expect(heart.className).toMatch(/fill-red-500/);
  });

  it('renders the designed empty state when there are no shorts', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByText('No shorts yet')).toBeInTheDocument();
    });
  });
});
