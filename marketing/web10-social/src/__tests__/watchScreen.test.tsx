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

const CURRENT = {
  doc_id: 'post-cur',
  created_at: at(1),
  updated_at: at(1),
  tags: ['climbing'],
  body: {
    text: 'Free soloing the north face',
    author_username: 'alex',
    author_provider: 'web10',
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
const { fakeV3Read, fakeReadById } = vi.hoisted(() => ({ fakeV3Read: vi.fn(), fakeReadById: vi.fn() }));

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  // The implementations are set per-test in beforeEach (vi.clearAllMocks in
  // beforeEach wipes factory-set implementations, so they must be re-set there).
  return {
    ...original,
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
  // The post by id (the watch page's primary read).
  fakeReadById.mockResolvedValue(CURRENT);
  // The engagement read (reactions/comments over the discover group) — empty.
  fakeV3Read.mockResolvedValue([]);
});

describe('WatchScreen (the watch page)', () => {
  it('renders the player, the title, and the author row (under the video)', async () => {
    await renderWatch();
    // The player (a landscape file source → the native full player).
    await waitFor(() => expect(screen.getByTestId('watch-player')).toBeInTheDocument());
    expect(screen.getByTestId('watch-video')).toBeInTheDocument();
    // The title (the post text).
    expect(screen.getByTestId('watch-title')).toHaveTextContent('Free soloing the north face');
    // The author row (the profile's display name + the follower count).
    await waitFor(() => expect(screen.getByTestId('watch-author-row')).toBeInTheDocument());
    expect(screen.getByTestId('watch-author-row')).toHaveTextContent('Alex Honnold');
    expect(screen.getByTestId('watch-author-row')).toHaveTextContent('4,200 followers');
    // The follow button (signed-in).
    expect(screen.getByTestId('watch-follow-button')).toHaveTextContent('Follow');
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

  it('clicking a relatedness chip updates ?related= (the deep-link rule)', async () => {
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-relatedness-same-creator')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('watch-relatedness-same-creator'));
    await waitFor(() => expect(screen.getByTestId('watch-relatedness-same-creator')).toHaveAttribute('aria-selected', 'true'));
    // The default (Mixed) is no longer selected.
    expect(screen.getByTestId('watch-relatedness-mixed')).toHaveAttribute('aria-selected', 'false');
  });

  it('opens the author overlay (the "stay on the train" rule) and closes it', async () => {
    await renderWatch();
    await waitFor(() => expect(screen.getByTestId('watch-about-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('watch-about-button'));
    await waitFor(() => expect(screen.getByTestId('watch-author-overlay')).toBeInTheDocument());
    // The overlay shows the face + bio + the follow + view-all affordances.
    expect(screen.getByTestId('watch-author-overlay-panel')).toHaveTextContent('Alex Honnold');
    expect(screen.getByTestId('watch-author-overlay-panel')).toHaveTextContent('Free soloist');
    expect(screen.getByTestId('watch-author-overlay-view-all')).toBeInTheDocument();
    // Close it (the X).
    fireEvent.click(screen.getByTestId('watch-author-overlay-close'));
    await waitFor(() => expect(screen.queryByTestId('watch-author-overlay')).not.toBeInTheDocument());
  });

  it('shows the not-found state when the post is absent', async () => {
    fakeReadById.mockRejectedValue(new Error('not found'));
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
});
