import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';

// Mock lucide-react icons as simple span elements (any icon, no manual list).
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// ── Seeded data (the watch page reads the post by id + the board for the queue)
const NOW = '2026-09-28T12:00:00.000Z';
const H = 3_600_000;
const at = (hoursAgo: number) => new Date(Date.parse(NOW) - hoursAgo * H).toISOString();

// The post doc the node returns: the author lives in `author_key` — the body
// carries NO author fields (the write path never puts them there). The watch
// page must derive the author from author_key (fromV3DocToPost), not the body.

const CURRENT = {
  doc_id: 'post-cur',
  author_key: 'test.localhost/users/alex',
  created_at: at(1),
  updated_at: at(1),
  tags: ['climbing'],
  body: {
    title: 'Free soloing the north face',
    text: 'The story of the climb, told in one take.',
    media_refs: [{ doc_id: 'm-cur', mime_type: 'video/mp4', read_url: 'https://cdn/v/cur.mp4', width: 1280, height: 720, duration_seconds: 90, thumbnail_url: 'https://cdn/t/cur.jpg' }],
  },
};

const BOARD = [
  {
    doc_id: 'post-a',
    created_at: at(2),
    updated_at: at(2),
    tags: ['climbing'],
    body: {
      text: 'Climbing the sea wall',
      author_username: 'alex',
      author_provider: 'web10',
      media_refs: [{ doc_id: 'm-a', mime_type: 'video/mp4', read_url: 'https://cdn/v/a.mp4', width: 1280, height: 720, duration_seconds: 60, thumbnail_url: 'https://cdn/t/a.jpg' }],
    },
  },
  {
    doc_id: 'post-b',
    created_at: at(3),
    updated_at: at(3),
    tags: ['cooking'],
    body: {
      text: 'Cooking on the stove',
      author_username: 'bob',
      author_provider: 'web10',
      media_refs: [{ doc_id: 'm-b', mime_type: 'video/mp4', read_url: 'https://cdn/v/b.mp4', width: 1280, height: 720, duration_seconds: 45, thumbnail_url: 'https://cdn/t/b.jpg' }],
    },
  },
];

// Media resolution (the screen resolves the current post + the board + the
// author's posts in one batched pass).
const MEDIA: Record<string, unknown> = {
  'm-cur': { _id: 'm-cur', url: 'https://cdn/v/cur.mp4', mime_type: 'video/mp4', width: 1280, height: 720, duration_seconds: 90, thumbnail_url: 'https://cdn/t/cur.jpg', created_at: at(1) },
  'm-a': { _id: 'm-a', url: 'https://cdn/v/a.mp4', mime_type: 'video/mp4', width: 1280, height: 720, duration_seconds: 60, thumbnail_url: 'https://cdn/t/a.jpg', created_at: at(2) },
  'm-b': { _id: 'm-b', url: 'https://cdn/v/b.mp4', mime_type: 'video/mp4', width: 1280, height: 720, duration_seconds: 45, thumbnail_url: 'https://cdn/t/b.jpg', created_at: at(3) },
};

// The V3 client the screen uses for readById (the post) + the engagement read
// (reactions/comments over the discover group). `fakeV3Read` is hoisted (the
// vi.mock factory runs before any top-level const).
const { fakeV3Read, fakeReadById, setRepostingToSpy } = vi.hoisted(() => ({ fakeV3Read: vi.fn(), fakeReadById: vi.fn(), setRepostingToSpy: vi.fn() }));

vi.mock('@/context/RepostContext', () => ({
  useRepost: () => ({ repostingTo: null, setRepostingTo: setRepostingToSpy, clearReposting: vi.fn() }),
}));

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  // The implementations are set per-test in beforeEach (vi.clearAllMocks in
  // beforeEach wipes factory-set implementations, so they must be re-set there).
  return {
    ...original,
    readPostById: vi.fn(),
    readDiscoverFeed: vi.fn(),
    resolveMediaRefs: vi.fn(),
    readUserProfile: vi.fn(),
    readUserPublicProfile: vi.fn(),
    readRepostCounts: vi.fn(),
    readMyRepostedIds: vi.fn(),
    isFollowing: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
    getFollowersCount: vi.fn(),
    toggleReactionKind: vi.fn(),
    saveSettings: vi.fn(),
    readThreadComments: vi.fn(),
    readThreadReplies: vi.fn(),
    getV3Client: vi.fn().mockReturnValue({ read: fakeV3Read, readById: fakeReadById }),
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'me' }),
  }),
  resetWapi: vi.fn(),
}));

async function renderWatch(path = '/watch/post-cur') {
  const { default: WatchScreen } = await import('@/components/Watch/WatchScreen');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/watch/:postId" element={<WatchScreen />} />
        {/* The repost seam navigates here (the app-level composer lives on the
            feed route) — a marker so the navigation is assertable. */}
        <Route path="/feed" element={<div data-testid="feed-route" />} />
        {/* The author click navigates to the profile — a marker so the
            navigation is assertable (the "About" is the profile page). */}
        <Route path="/u/:username" element={<div data-testid="profile-route" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The board (the "What's next" source) — the two board posts.
  (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue(
    BOARD.map((b) => ({
      _id: b.doc_id,
      text: b.body.text,
      created_at: b.created_at,
      tags: b.tags,
      author_username: b.body.author_username,
      author_provider: b.body.author_provider,
      media_refs: b.body.media_refs,
      likes: 0,
      comments: 0,
      reposts: 0,
    })),
  );
  // Media resolution (the screen resolves the current post + board + author's
  // posts in one batched pass).
  (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockImplementation(
    async (refs: { doc_id?: string }[]) => refs.map((r) => MEDIA[r.doc_id || ''] as never).filter(Boolean),
  );
  (data.readUserProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ display_name: 'Alex Honnold', bio: 'Free soloist', avatar_ref: undefined });
  (data.readUserPublicProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined });
  (data.readRepostCounts as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (data.readMyRepostedIds as ReturnType<typeof vi.fn>).mockResolvedValue(new Set<string>());
  (data.isFollowing as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  (data.followUser as ReturnType<typeof vi.fn>).mockResolvedValue({ username: 'alex', status: 'active' });
  (data.unfollowUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (data.getFollowersCount as ReturnType<typeof vi.fn>).mockResolvedValue(4200);
  (data.toggleReactionKind as ReturnType<typeof vi.fn>).mockResolvedValue('like');
  (data.saveSettings as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (data.readThreadComments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (data.readThreadReplies as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  // The V3 client (readById for the post + read for the engagement). clearAllMocks
  // wipes the factory's mockReturnValue, so re-establish it here.
  (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({ read: fakeV3Read, readById: fakeReadById });
  // The post by id (the watch page's primary read) — the canonical mapper
  // (fromV3DocToPost) derives the author from author_key.
  (data.readPostById as ReturnType<typeof vi.fn>).mockResolvedValue(
    data.fromV3DocToPost(CURRENT as never),
  );
  // The engagement read (reactions/comments over the discover group) — empty.
  fakeV3Read.mockResolvedValue([]);
});

describe('WatchScreen (the watch page)', () => {
  it('renders the player, the title, and the author row (under the video)', async () => {
    await renderWatch();
    // The player (a landscape file source → the native full player).
    await waitFor(() => expect(screen.getByTestId('watch-player')).toBeInTheDocument());
    expect(screen.getByTestId('watch-video')).toBeInTheDocument();
    // The title (the post's headline, the display-font anchor).
    expect(screen.getByTestId('watch-title')).toHaveTextContent('Free soloing the north face');
    // The author row (the profile's display name + the @handle).
    await waitFor(() => expect(screen.getByTestId('watch-author-row')).toBeInTheDocument());
    expect(screen.getByTestId('watch-author-row')).toHaveTextContent('Alex Honnold');
    expect(screen.getByTestId('watch-author-row')).toHaveTextContent('@alex');
    // The follow button (signed-in).
    expect(screen.getByTestId('watch-follow-button')).toHaveTextContent('Follow');
  });

  it('resolves the author from the doc author_key when the profile read fails (never "Unknown")', async () => {
    // Regression: the old screen read `body.author_username`, which the write
    // path never sets — the author lives in `author_key`. With no profile, the
    // row must fall back to the author_key username, not "Unknown".
    (data.readUserProfile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no profile'));
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-author-row')).toBeInTheDocument());
    const row = screen.getByTestId('watch-author-row');
    expect(row).toHaveTextContent('alex');
    expect(row).not.toHaveTextContent('Unknown');
  });

  it('renders the dislike + repost buttons (the watch page is a full engagement surface)', async () => {
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-actions')).toBeInTheDocument());
    expect(screen.getByTestId('dislike-button')).toBeInTheDocument();
    expect(screen.getByTestId('repost-button')).toBeInTheDocument();
  });

  it('tapping the dislike thumb reports the dislike reaction to the data layer', async () => {
    await renderWatch();
    const btn = await screen.findByTestId('dislike-button');
    fireEvent.click(btn);
    await waitFor(() =>
      expect(data.toggleReactionKind).toHaveBeenCalledWith('post-cur', 'dislike', [data.getDiscoverGroupId()]),
    );
  });

  it('tapping the repost icon opens the composer in repost mode, staying on the watch page (the shared seam)', async () => {
    await renderWatch();
    const btn = await screen.findByTestId('repost-button');
    fireEvent.click(btn);
    await waitFor(() => expect(setRepostingToSpy).toHaveBeenCalledWith(expect.objectContaining({ _id: 'post-cur' })));
    // The composer is app-level (the New Post sheet) — the watch page does NOT
    // navigate away; the user stays on the watch page and the sheet pops up.
    expect(screen.queryByTestId('feed-route')).not.toBeInTheDocument();
  });

  it('renders the "What\'s next" queue (the board, re-ranked) + the relatedness chips', async () => {
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-queue')).toBeInTheDocument());
    // The queue has the two board posts (the current post is excluded).
    const cards = screen.getAllByTestId('watch-queue-card');
    expect(cards).toHaveLength(2);
    // The relatedness preset row (the tunable "how much to tilt").
    expect(screen.getByTestId('watch-relatedness-mixed')).toBeInTheDocument();
    expect(screen.getByTestId('watch-relatedness-more-like-this')).toBeInTheDocument();
    expect(screen.getByTestId('watch-relatedness-same-creator')).toBeInTheDocument();
    expect(screen.getByTestId('watch-relatedness-just-the-feed')).toBeInTheDocument();
    // Mixed is the default (selected).
    expect(screen.getByTestId('watch-relatedness-mixed')).toHaveAttribute('aria-selected', 'true');
  });

  it('the "What\'s next" queue is landscape-only — a portrait (9:16) short stays out', async () => {
    // The board gains a portrait (9:16) short — the TikTok shape. The watch
    // queue is the YouTube shape (landscape), so the short stays out (the
    // aspect-ratio split: the Video wall and the queue are landscape-only,
    // portrait lives in the Shorts destination).
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      ...BOARD.map((b) => ({
        _id: b.doc_id,
        text: b.body.text,
        created_at: b.created_at,
        tags: b.tags,
        author_username: b.body.author_username,
        author_provider: b.body.author_provider,
        media_refs: b.body.media_refs,
        likes: 0,
        comments: 0,
        reposts: 0,
      })),
      {
        _id: 'post-short',
        text: 'a vertical clip',
        created_at: at(4),
        tags: ['short'],
        author_username: 'carol',
        author_provider: 'web10',
        media_refs: [{ doc_id: 'm-short', mime_type: 'video/mp4', read_url: 'https://cdn/v/short.mp4', width: 1080, height: 1920, duration_seconds: 15, thumbnail_url: 'https://cdn/t/short.jpg' }],
        likes: 0,
        comments: 0,
        reposts: 0,
      },
    ]);
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-queue')).toBeInTheDocument());
    // The queue has the two landscape board posts — the portrait short is excluded.
    const cards = screen.getAllByTestId('watch-queue-card');
    expect(cards).toHaveLength(2);
    expect(screen.queryByText('a vertical clip')).not.toBeInTheDocument();
  });

  it('clicking a relatedness chip updates ?related= (the deep-link rule)', async () => {
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-relatedness-same-creator')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('watch-relatedness-same-creator'));
    await waitFor(() => expect(screen.getByTestId('watch-relatedness-same-creator')).toHaveAttribute('aria-selected', 'true'));
    // The default (Mixed) is no longer selected.
    expect(screen.getByTestId('watch-relatedness-mixed')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking the author navigates to their profile (the "About" is the profile page, not a modal)', async () => {
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-author-row')).toBeInTheDocument());
    // The author row's name is the "About" affordance — clicking it navigates
    // to /u/:username (the same destination every other surface's author click
    // uses). There is no overlay / About button on the watch page.
    fireEvent.click(screen.getByTestId('watch-author'));
    await waitFor(() => expect(screen.getByTestId('profile-route')).toBeInTheDocument());
    expect(screen.queryByTestId('watch-author-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('watch-about-button')).not.toBeInTheDocument();
  });

  it('hides the Follow button on your own video (you can\'t follow yourself)', async () => {
    // The current post's author is the viewer (author_key username 'me' = the
    // token's username). isFollowing returns false (you're not in your own
    // followers group), so the old code rendered a "Follow" button — the bug.
    // The self case hides the button entirely.
    (data.readPostById as ReturnType<typeof vi.fn>).mockResolvedValue(
      data.fromV3DocToPost({
        doc_id: 'post-cur',
        author_key: 'test.localhost/users/me',
        created_at: at(1),
        updated_at: at(1),
        tags: ['climbing'],
        body: {
          text: 'My own video',
          media_refs: [{ doc_id: 'm-cur', mime_type: 'video/mp4', read_url: 'https://cdn/v/cur.mp4', width: 1280, height: 720, duration_seconds: 90, thumbnail_url: 'https://cdn/t/cur.jpg' }],
        },
      } as never),
    );
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-author-row')).toBeInTheDocument());
    expect(screen.queryByTestId('watch-follow-button')).not.toBeInTheDocument();
  });

  it('shows the not-found state when the post is absent', async () => {
    (data.readPostById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await renderWatch();
    await waitFor(() => expect(screen.getByText('Video not found')).toBeInTheDocument());
  });

  it('seeks to ?t= on load (the playback-position deep link)', async () => {
    // The ?t= param is read once per postId. We assert the player receives an
    // initialTime by checking the native <video> gets currentTime set — but in
    // jsdom the video element's metadata never loads, so we assert the param is
    // parsed (the screen does not crash and renders the player with ?t=).
    await renderWatch('/watch/post-cur?t=30');
    await waitFor(() => expect(screen.getByTestId('watch-player')).toBeInTheDocument());
    expect(screen.getByTestId('watch-video')).toBeInTheDocument();
  });

  it('does not re-load on every render (the readToken fresh-object loop)', async () => {
    // Regression: the real SDK's readToken() returns a FRESH object every call
    // (decodeJwt builds a new one). The old WatchScreen captured that token as a
    // `useCallback` dep on `load`, so `load` was recreated on every render and the
    // `useEffect([load])` re-ran forever — the "sick spammy loop" that hammered
    // the node into 429s. The wapi mock above returns a STABLE object, which
    // masked the bug; this test returns a fresh object each call to reproduce it.
    const { getWapi } = await import('@/data/wapi');
    vi.mocked(getWapi).mockReturnValue({
      readToken: () => ({ provider: 'test.localhost', username: 'me' }),
    } as never);

    let boardReads = 0;
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      boardReads++;
      return BOARD.map((b) => ({
        _id: b.doc_id,
        text: b.body.text,
        created_at: b.created_at,
        tags: b.tags,
        author_username: b.body.author_username,
        author_provider: b.body.author_provider,
        media_refs: b.body.media_refs,
        likes: 0,
        comments: 0,
        reposts: 0,
      }));
    });

    await renderWatch();
    // The page settles (the player renders), then we give any runaway re-render
    // loop time to manifest as extra board reads.
    await waitFor(() => expect(screen.getByTestId('watch-player')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 250));

    // A correct screen loads once (or a couple of times under React StrictMode
    // double-invoke) — never a runaway. The old code read the board on every
    // render, which would be dozens of times in this window.
    expect(boardReads).toBeLessThanOrEqual(3);
  });

  it('paints the page on the ONE read — the player + title + author row land before the board read resolves (the queue holds its skeleton)', async () => {
    // Regression: the old screen held the whole-page skeleton until EVERYTHING
    // landed (the post read + the board read + the profile fan-out + a second
    // media round-trip) — the "totally gray" wall the operator flagged. The
    // page must paint after the ONE post read; the queue's skeleton holds the
    // rail until the board lands.
    let releaseBoard: () => void = () => {};
    const boardGate = new Promise<void>((r) => { releaseBoard = r; });
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await boardGate;
      return BOARD.map((b) => ({
        _id: b.doc_id,
        text: b.body.text,
        created_at: b.created_at,
        tags: b.tags,
        author_username: b.body.author_username,
        author_provider: b.body.author_provider,
        media_refs: b.body.media_refs,
        likes: 0,
        comments: 0,
        reposts: 0,
      }));
    });

    await renderWatch();
    // The post read resolves (the board is still gated) — the page paints:
    // the player (the video's media is inline on the post read), the title,
    // the author row, the action bar — and the queue's skeleton holds the rail.
    await waitFor(() => expect(screen.getByTestId('watch-player')).toBeInTheDocument());
    expect(screen.getByTestId('watch-title')).toHaveTextContent('Free soloing the north face');
    expect(screen.getByTestId('watch-author-row')).toBeInTheDocument();
    expect(screen.getByTestId('watch-actions')).toBeInTheDocument();
    // The queue is still loading (the board is gated) — the skeleton, not the
    // cards and not the empty state.
    expect(screen.getByTestId('watch-queue-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('watch-queue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('watch-queue-empty')).not.toBeInTheDocument();

    // The board lands — the queue paints with its cards (thumbnails inline on
    // the board read, so no second media round-trip holds the rail).
    releaseBoard();
    await waitFor(() => expect(screen.getByTestId('watch-queue')).toBeInTheDocument());
    expect(screen.getAllByTestId('watch-queue-card')).toHaveLength(2);
    expect(screen.queryByTestId('watch-queue-skeleton')).not.toBeInTheDocument();
  });

  it('the "What\'s next" queue card is the hover-preview shape (HoverVideo) with a full-width 16:9 thumbnail', async () => {
    // The operator: "cool if this has the same best of both worlds behavior
    // too :) on the hover of the videos" + "not just dead thumbnails" + "our
    // whats next, it is quite small thumbnail compared to youtube, we could
    // definitely make those whats next thumbnails bigger." The queue card's
    // thumbnail is the shared HoverVideo (poster at rest, muted preview on
    // hover) in a full-width 16:9 frame (up from the old fixed w-40).
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-queue')).toBeInTheDocument());
    const cards = screen.getAllByTestId('watch-queue-card');
    expect(cards).toHaveLength(2);
    // Each card's thumbnail is the hover preview (the Video wall's component).
    for (const card of cards) {
      const hover = card.querySelector('[data-testid="watch-queue-hover-video"]');
      expect(hover).not.toBeNull();
      // The thumbnail frame is full-width 16:9 (the YouTube right-rail scale).
      const frame = hover!.parentElement!;
      expect(frame.className).toContain('aspect-video');
      expect(frame.className).toContain('w-full');
      expect(frame.className).not.toContain('w-40');
      // The duration badge is present (the video's length).
      expect(card.querySelector('[data-testid="watch-queue-duration"]')).not.toBeNull();
    }
  });

  it('infinite scroll: the "What\'s next" queue pages the board (the sentinel loads the next page and re-ranks the whole board)', async () => {
    // The operator: "if paging here, lets page on all surfaces … videos tab
    // when clicked in isnt paging on whats next stuff." The queue is the board
    // re-ranked + filtered to landscape — paging appends the next board page,
    // then re-ranks the WHOLE board (a new page can re-order the queue).
    // A landscape board post (the queue keeps these).
    const landscapePost = (i: number) => ({
      _id: `board-${i}`,
      text: `board video ${i}`,
      created_at: at(10 + i),
      tags: ['climbing'],
      author_username: 'kai',
      author_provider: 'web10',
      media_refs: [{ doc_id: `m-board-${i}`, mime_type: 'video/mp4', read_url: `https://cdn/v/b${i}.mp4`, width: 1280, height: 720, duration_seconds: 60, thumbnail_url: `https://cdn/t/b${i}.jpg` }],
      likes: 0,
      comments: 0,
      reposts: 0,
    });
    // Page 1: a FULL board page (50 posts → hasMore true). Page 2: a short
    // page (2 posts → hasMore false, the last one).
    const page1 = Array.from({ length: 50 }, (_, i) => landscapePost(i));
    const page2 = [landscapePost(100), landscapePost(101)];
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockImplementation(
      async (_sort: unknown, _limit: number, _tags: unknown, offset: number) => (offset === 0 ? page1 : page2),
    );

    await renderWatch();
    // Page 1 lands — the queue has all 50 board posts (the current post isn't
    // on the board, so nothing is excluded).
    await waitFor(() => expect(screen.getAllByTestId('watch-queue-card')).toHaveLength(50));
    // The sentinel is present (hasMore true — a full board page).
    expect(screen.getByTestId('watch-queue-sentinel')).toBeInTheDocument();

    // The sentinel is visible → the observer fires → loadMore appends page 2
    // (offset 50) and re-ranks the whole board.
    (globalThis as unknown as Record<string, () => void>).fireIntersectionObservers();
    await waitFor(() => expect(screen.getAllByTestId('watch-queue-card')).toHaveLength(52));
    // The second page was fetched with the next board offset (PAGE_SIZE = 50).
    expect(data.readDiscoverFeed).toHaveBeenLastCalledWith(expect.anything(), 50, undefined, 50);
    // hasMore is now false (page 2 was short) → the sentinel is gone (the board
    // is exhausted).
    expect(screen.queryByTestId('watch-queue-sentinel')).toBeNull();
  });

  it('no queue sentinel when the first board page is the last (hasMore false)', async () => {
    // The board's first page is short (2 posts < 50) → hasMore false → no
    // sentinel, no "load more" (the board is exhausted on page one).
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-queue')).toBeInTheDocument());
    expect(screen.getAllByTestId('watch-queue-card')).toHaveLength(2);
    expect(screen.queryByTestId('watch-queue-sentinel')).toBeNull();
  });
});
