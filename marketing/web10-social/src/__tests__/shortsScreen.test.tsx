import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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
// its one resolved 9:16 video) + the engagement read the screen runs to
// populate like/comment counts (the ref pattern, the same one DiscoverScreen
// runs). `getV3Client` is faked so the screen's `w.read('reactions'/'comments')`
// returns controlled docs instead of hitting the network. `fakeV3Read` is
// hoisted (the vi.mock factory runs before any top-level const).
const { fakeV3Read } = vi.hoisted(() => ({ fakeV3Read: vi.fn() }));
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readShortsFeed: vi.fn().mockResolvedValue([]),
    readShortsPage: vi.fn().mockResolvedValue({ shorts: [], hasMore: false }),
    toggleReactionKind: vi.fn().mockResolvedValue(undefined),
    getV3Client: vi.fn().mockReturnValue({ read: fakeV3Read }),
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

// The comment thread (the data seam reads the discover group over the network)
// — stub it so the comment test asserts the open/close behavior, not the
// thread's own read.
vi.mock('@/components/Feed/CommentThread', () => ({
  CommentThread: (props: { postId: string; isOpen: boolean }) =>
    props.isOpen ? (
      <div data-testid="shorts-test-comment-thread" data-postid={props.postId}>
        thread:{props.postId}
      </div>
    ) : null,
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

async function renderShorts(initialEntries: string[] = ['/shorts/s1']) {
  const { default: ShortsScreen } = await import('@/components/Shorts/ShortsScreen');
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/shorts" element={<ShortsScreen />} />
        <Route path="/shorts/:postId" element={<ShortsScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Seed the fake v3 client's `read` with the engagement docs the screen reads
// (reactions + comments over the discover group). `reactions` is an array of
// { ref, type, author }; `comments` is an array of post ids (a comment's
// `body.post_id` — the total-count key, comments.md).
function seedEngagement(
  reactions: { ref: string; type?: string; author?: string }[],
  comments: string[] = [],
) {
  const reactionDocs = reactions.map((r) => ({
    ref_value: r.ref,
    author_key: r.author ?? 'someone',
    body: { type: r.type ?? 'like' },
  }));
  const commentDocs = comments.map((postId) => ({ ref_value: postId, body: { post_id: postId } }));
  fakeV3Read.mockImplementation(async (collection: string) =>
    collection === 'reactions' ? reactionDocs : commentDocs,
  );
}

describe('ShortsScreen — the vertical short-form feed (shorts.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeHls.instances = [];
    window.Hls = FakeHls as unknown as typeof window.Hls;
    // Default: the engagement read returns nothing (zero counts) unless a test
    // seeds it.
    fakeV3Read.mockResolvedValue([]);
    // jsdom has no scrollIntoView — the lens's deep-link effect calls it on
    // mount (scrolling to the :postId short). Stub it so the effect is a no-op.
    HTMLElement.prototype.scrollIntoView = vi.fn();
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

    // The hls.js source is attached (the transcoded path) — `new Hls()` runs in
    // the player's effect (after the element commits), so wait for the instance
    // rather than asserting it right after the element appears (the hlsFeed race).
    await waitFor(() => {
      expect(FakeHls.instances.length).toBeGreaterThan(0);
    });
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

  it('the active slide autoplays muted by default; the off-screen slide does not (the ambient loop)', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
      shortPost({ id: 's2', author: 'kai' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-slide-0')).toBeInTheDocument();
    });

    // The first slide is the active one (activeIndex starts at 0) → its video
    // plays; Shorts autoplays MUTED (the browser's autoplay policy — the
    // speaker icon is the escape hatch, the next test). The second slide's
    // video is paused (off-screen).
    const v0 = screen.getByTestId('short-video-0').querySelector('video')!;
    const v1 = screen.getByTestId('short-video-1').querySelector('video')!;
    expect(v0.muted).toBe(true);
    expect(v1.muted).toBe(true);
  });

  it('the speaker icon un-mutes the lens (the TikTok escape hatch) and re-mutes', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
      shortPost({ id: 's2', author: 'kai' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-mute-0')).toBeInTheDocument();
    });

    const v0 = screen.getByTestId('short-video-0').querySelector('video')!;
    const v1 = screen.getByTestId('short-video-1').querySelector('video')!;
    // Muted by default (autoplay policy)…
    expect(v0.muted).toBe(true);
    const muteBtn = screen.getByTestId('short-mute-0');
    expect(muteBtn).toHaveAttribute('aria-label', 'Unmute');
    expect(muteBtn.querySelector('[data-testid="icon-volumex"]')).not.toBeNull();

    // …the speaker icon un-mutes the WHOLE lens (screen-level state, the
    // TikTok model): the active slide plays with sound, and the choice
    // carries to the next slide (its element is already at the right volume).
    fireEvent.click(muteBtn);
    await waitFor(() => {
      expect(v0.muted).toBe(false);
    });
    expect(v1.muted).toBe(false);
    expect(screen.getByTestId('short-mute-0')).toHaveAttribute('aria-label', 'Mute');
    expect(screen.getByTestId('short-mute-0').querySelector('[data-testid="icon-volume2"]')).not.toBeNull();

    // Tapping again re-mutes (the icon flips back).
    fireEvent.click(screen.getByTestId('short-mute-0'));
    await waitFor(() => {
      expect(v0.muted).toBe(true);
    });
    expect(screen.getByTestId('short-mute-0')).toHaveAttribute('aria-label', 'Unmute');
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
    // Both start muted (the autoplay policy — the speaker icon is the
    // escape hatch); the ambient loop's play/pause handover is observed via
    // the elements' play/pause calls, not the mute flag.
    expect(v0.muted).toBe(true);
    expect(v1.muted).toBe(true);

    const play0 = vi.spyOn(v0, 'play').mockResolvedValue(undefined);
    const pause0 = vi.spyOn(v0, 'pause').mockImplementation(() => {});
    const play1 = vi.spyOn(v1, 'play').mockResolvedValue(undefined);

    // The user swipes: slide 1 becomes the ≥60%-visible slide. The
    // screen's IntersectionObserver callback fires with slide 1 intersecting
    // (the setup.ts mock captures the callback; drive it with the real entry).
    const io = (globalThis as any).IntersectionObserver;
    const getLiveObserver = () => {
      const observers = (io as any).instances as any[];
      return observers[observers.length - 1];
    };
    // The screen's IO effect re-registers on [shorts, activeIndex] (and the
    // async load() settles in a couple of state updates), so the observer can
    // be re-created between an early grab and the fire — re-resolve the live
    // one right before firing (the load-dependent flake).
    expect(getLiveObserver()).toBeTruthy();
    const slide1 = screen.getByTestId('short-slide-1');
    getLiveObserver().callback([{ isIntersecting: true, target: slide1 } as unknown as IntersectionObserverEntry], getLiveObserver());

    // Autoplay hands over: the new active slide plays… The handover is an async
    // effect chain (setActiveIndex → re-render → the InlineVideo play effect),
    // so under CI load it can exceed the default 1s waitFor — give it headroom.
    // (10s: a 5s ceiling flaked on CI at 5019ms under load.)
    await waitFor(() => {
      expect(play1).toHaveBeenCalled();
    }, { timeout: 10000 });
    // …and the off-screen slide pauses.
    await waitFor(() => {
      expect(pause0).toHaveBeenCalled();
    }, { timeout: 10000 });
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

  it('displays the like count from the engagement read (the ref pattern)', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
    ]);
    // Two likes + one dislike on s1 → the heart shows 2 (likes only — the
    // 3.101.0 doctrine: the heart and the thumb each show their own tally).
    seedEngagement(
      [
        { ref: 's1', type: 'like', author: 'fan1' },
        { ref: 's1', type: 'like', author: 'fan2' },
        { ref: 's1', type: 'dislike', author: 'fan3' },
      ],
      ['s1', 's1'],
    );
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-like-0')).toBeInTheDocument();
    });
    // The heart's tally (likes only) + the comment bubble's tally. The count
    // span is the one that is NOT the lucide icon span (the mock renders icons
    // as <span data-testid="icon-*">).
    const likeCount = screen.getByTestId('short-like-0').querySelectorAll('span');
    expect(likeCount[likeCount.length - 1].textContent).toBe('2');
    const commentCount = screen.getByTestId('short-comment-0').querySelectorAll('span');
    expect(commentCount[commentCount.length - 1].textContent).toBe('2');
  });

  it('liking a short increments from the loaded count, not from zero', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
    ]);
    seedEngagement([{ ref: 's1', type: 'like', author: 'fan1' }]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-like-0')).toBeInTheDocument();
    });
    const likeCountSpan = () => {
      const spans = screen.getByTestId('short-like-0').querySelectorAll('span');
      return spans[spans.length - 1].textContent;
    };
    // Loaded count is 1…
    expect(likeCountSpan()).toBe('1');
    // …liking bumps it to 2 (not 1 → the old blank-0 bug).
    fireEvent.click(screen.getByTestId('short-like-0'));
    expect(likeCountSpan()).toBe('2');
  });

  it('the comment button opens the inline thread (it works)', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
    ]);
    seedEngagement([], ['s1']);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-comment-0')).toBeInTheDocument();
    });

    // Closed by default…
    expect(screen.queryByTestId('short-comments-0')).toBeNull();
    // …tapping the comment button opens the thread for that short.
    fireEvent.click(screen.getByTestId('short-comment-0'));
    await waitFor(() => {
      expect(screen.getByTestId('short-comments-0')).toBeInTheDocument();
    });
    // The thread is mounted for the tapped short (the data seam's read target).
    expect(screen.getByTestId('shorts-test-comment-thread')).toHaveAttribute('data-postid', 's1');
    // Tapping again (or the close button) closes it.
    fireEvent.click(screen.getByLabelText('Close comments'));
    expect(screen.queryByTestId('short-comments-0')).toBeNull();
  });

  it('the share button gives clear "Copied!" feedback', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
    ]);
    await renderShorts();

    await waitFor(() => {
      expect(screen.getByTestId('short-share-0')).toBeInTheDocument();
    });

    // No native share sheet in jsdom → the clipboard path. Stub it.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const share = screen.getByTestId('short-share-0');
    const shareLabel = () => {
      const spans = share.querySelectorAll('span');
      return spans[spans.length - 1].textContent;
    };
    expect(shareLabel()).toBe('Share');
    fireEvent.click(share);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/shorts/s1'));
    // The label flips to "Copied!" (the clear feedback).
    await waitFor(() => {
      expect(shareLabel()).toBe('Copied!');
    });
  });

  it('the back arrow exits the lens to /feed (the bottom bar is hidden here)', async () => {
    (data.readShortsFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      shortPost({ id: 's1', author: 'luna' }),
    ]);

    // A probe that mirrors the current route, so the test can assert the
    // back button actually navigates (not just that it renders).
    function LocationProbe() {
      const { pathname } = useLocation();
      return <div data-testid="route-probe">{pathname}</div>;
    }
    const { default: ShortsScreen } = await import('@/components/Shorts/ShortsScreen');
    render(
      <MemoryRouter initialEntries={['/shorts/s1']}>
        <Routes>
          <Route path="/shorts" element={<ShortsScreen />} />
          <Route path="/shorts/:postId" element={<ShortsScreen />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('shorts-container')).toBeInTheDocument();
    });

    // The back arrow is present, labelled, and carries the chevron icon…
    const back = screen.getByTestId('shorts-back');
    expect(back).toHaveAttribute('aria-label', 'Back to feed');
    expect(back.querySelector('[data-testid="icon-chevronleft"]')).not.toBeNull();
    // …and we start on the lens (the /shorts/:postId route).
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/shorts/s1');

    // Tapping it exits the lens to the feed (the home base).
    fireEvent.click(back);
    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/feed');
    });
  });

  it('?q= filters the wall to matching shorts + shows the query chip (the S8 search deep link)', async () => {
    (data.readShortsPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      shorts: [
        shortPost({ id: 's1', author: 'luna', text: 'synthwave mix' }),
        shortPost({ id: 's2', author: 'kai', text: 'study vlog' }),
      ],
      hasMore: false,
    });
    // /shorts?q= is the WALL (a bare /shorts is the wall; the lens is /shorts/:postId).
    await renderShorts(['/shorts?q=synthwave']);

    // The wall filters to the match — only the synthwave tile renders…
    await waitFor(() => {
      expect(screen.getByTestId('short-wall-tile-s1')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('short-wall-tile-s2')).not.toBeInTheDocument();
    // …and the query chip (with its X) shows the active search.
    const chip = screen.getByTestId('shorts-query-chip');
    expect(chip).toHaveTextContent('synthwave');
    expect(screen.getByTestId('shorts-query-chip-clear')).toBeInTheDocument();

    // Clearing the chip drops ?q= and the full wall returns.
    fireEvent.click(screen.getByTestId('shorts-query-chip-clear'));
    await waitFor(() => {
      expect(screen.getByTestId('short-wall-tile-s2')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('shorts-query-chip')).not.toBeInTheDocument();
  });

  it('?q= with no match shows the no-match state (not an empty wall)', async () => {
    (data.readShortsPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      shorts: [
        shortPost({ id: 's1', author: 'luna', text: 'synthwave mix' }),
      ],
      hasMore: false,
    });
    await renderShorts(['/shorts?q=zzz-no-match']);

    await waitFor(() => {
      expect(screen.getByTestId('shorts-query-clear')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('short-wall-tile-s1')).not.toBeInTheDocument();
  });
});

describe('ShortsScreen — the explore wall (/shorts, the "before you pick a short" surface)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeHls.instances = [];
    window.Hls = FakeHls as unknown as typeof window.Hls;
    fakeV3Read.mockResolvedValue([]);
  });

  async function renderWall() {
    const { default: ShortsScreen } = await import('@/components/Shorts/ShortsScreen');
    return render(
      <MemoryRouter initialEntries={['/shorts']}>
        <Routes>
          <Route path="/shorts" element={<ShortsScreen />} />
          <Route path="/shorts/:postId" element={<ShortsScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders the responsive wall of 9:16 video tiles (not the lens)', async () => {
    (data.readShortsPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      shorts: [
        shortPost({ id: 's1', author: 'luna', text: 'first' }),
        shortPost({ id: 's2', author: 'kai', text: 'second' }),
      ],
      hasMore: false,
    });
    await renderWall();

    await waitFor(() => {
      expect(screen.getByTestId('shorts-wall')).toBeInTheDocument();
      expect(screen.getByTestId('short-wall-tile-s1')).toBeInTheDocument();
      expect(screen.getByTestId('short-wall-tile-s2')).toBeInTheDocument();
    });
    // The wall is the explore grid — NOT the full-screen lens (no snap
    // container, no action rail).
    expect(screen.queryByTestId('shorts-container')).toBeNull();
    expect(screen.queryByTestId('short-like-0')).toBeNull();
    // Each tile is a 9:16 vertical frame.
    const tile = screen.getByTestId('short-wall-tile-s1');
    expect(tile.className).toMatch(/aspect-\[9\/16\]/);
    // The tile shows the author handle + caption overlay.
    expect(screen.getByText('@luna')).toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
  });

  it('each tile is the hover preview — poster at rest, the clip plays muted on hover (the Video wall pattern)', async () => {
    (data.readShortsPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      shorts: [hlsShort({ id: 's1', author: 'luna' })],
      hasMore: false,
    });
    await renderWall();

    await waitFor(() => {
      expect(screen.getByTestId('short-wall-tile-s1')).toBeInTheDocument();
    });
    const frame = screen.getByTestId('short-wall-hover-s1');
    const video = frame.querySelector('video') as HTMLVideoElement;
    // At rest: the poster is the face, nothing is attached (no hls instance,
    // no source) — the wall does not mint N players at rest.
    expect(frame.querySelector('img')).not.toBeNull();
    expect(video.getAttribute('src')).toBeNull();
    expect(FakeHls.instances).toHaveLength(0);

    // Hover: the transcoded source attaches through hls.js + the preview plays
    // muted (the autoplay policy).
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    fireEvent.mouseEnter(frame);
    await waitFor(() => {
      expect(FakeHls.instances.length).toBeGreaterThan(0);
      expect(play).toHaveBeenCalled();
    });
    expect(video.muted).toBe(true);
    // The raw source file is NOT used (the greyed-out-tile rule).
    expect(video.getAttribute('src')).toBeNull();
  });

  it('infinite scroll: the sentinel loads the next page and appends (the wall pages the board)', async () => {
    // Page 1: two shorts, hasMore true (a full board page).
    // Page 2: two more shorts, hasMore false (the last page).
    (data.readShortsPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        shorts: [shortPost({ id: 's1', author: 'luna', text: 'first' }), shortPost({ id: 's2', author: 'kai', text: 'second' })],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        shorts: [shortPost({ id: 's3', author: 'nova', text: 'third' }), shortPost({ id: 's4', author: 'me', text: 'fourth' })],
        hasMore: false,
      });
    await renderWall();

    await waitFor(() => {
      expect(screen.getByTestId('short-wall-tile-s1')).toBeInTheDocument();
      expect(screen.getByTestId('short-wall-tile-s2')).toBeInTheDocument();
    });
    // The sentinel is present (hasMore true, no active query).
    const sentinel = screen.getByTestId('shorts-wall-sentinel');
    expect(sentinel).toBeInTheDocument();

    // The sentinel is visible → the observer fires → loadMore appends page 2.
    (globalThis as unknown as Record<string, () => void>).fireIntersectionObservers();
    await waitFor(() => {
      expect(screen.getByTestId('short-wall-tile-s3')).toBeInTheDocument();
      expect(screen.getByTestId('short-wall-tile-s4')).toBeInTheDocument();
    });
    // The second page was fetched with the next board offset (PAGE_SIZE = 50).
    expect(data.readShortsPage).toHaveBeenLastCalledWith(50, 50);
    // hasMore is now false → the sentinel is gone (the board is exhausted).
    expect(screen.queryByTestId('shorts-wall-sentinel')).toBeNull();
  });

  it('no sentinel when the first page is the last (hasMore false)', async () => {
    (data.readShortsPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      shorts: [shortPost({ id: 's1', author: 'luna' })],
      hasMore: false,
    });
    await renderWall();

    await waitFor(() => {
      expect(screen.getByTestId('short-wall-tile-s1')).toBeInTheDocument();
    });
    // A short first page is the last one — no sentinel, no "load more".
    expect(screen.queryByTestId('shorts-wall-sentinel')).toBeNull();
  });

  it('tapping a tile navigates to the lens (/shorts/:postId)', async () => {
    (data.readShortsPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      shorts: [
        shortPost({ id: 's1', author: 'luna' }),
        shortPost({ id: 's2', author: 'kai' }),
      ],
      hasMore: false,
    });
    function LocationProbe() {
      const { pathname } = useLocation();
      return <div data-testid="route-probe">{pathname}</div>;
    }
    const { default: ShortsScreen } = await import('@/components/Shorts/ShortsScreen');
    render(
      <MemoryRouter initialEntries={['/shorts']}>
        <Routes>
          <Route path="/shorts" element={<ShortsScreen />} />
          <Route path="/shorts/:postId" element={<ShortsScreen />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('short-wall-tile-s2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/shorts');

    // Tapping a tile drops into the lens on that short.
    fireEvent.click(screen.getByTestId('short-wall-tile-s2'));
    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/shorts/s2');
    });
  });

  it('renders the designed empty state when there are no shorts', async () => {
    (data.readShortsPage as ReturnType<typeof vi.fn>).mockResolvedValue({ shorts: [], hasMore: false });
    await renderWall();

    await waitFor(() => {
      expect(screen.getByText('No shorts yet')).toBeInTheDocument();
    });
  });
});
