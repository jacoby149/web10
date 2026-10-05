import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readDiscoverFeed: vi.fn().mockResolvedValue([]),
    readProfile: vi.fn().mockResolvedValue(null),
    readUserProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readComments: vi.fn().mockResolvedValue([]),
    // The v3 client (the discover board's reaction/comment read) — controllable
    // per test so a test can seed the reader's own reaction on a post.
    getV3Client: vi.fn(),
    // The reaction tap handler (post-actions.md) — spied to assert the like
    // is wired to the data layer.
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    // The Explore tab's paged reads (people = the D0 directory, groups = the
    // D53 directory) — mocked so the Explore section tests control the data.
    fetchPeoplePage: vi.fn().mockResolvedValue({ people: [], hasMore: false }),
    readGroupDirectory: vi.fn().mockResolvedValue([]),
    // The Explore tab's own-graph reads (the Following / Followers / My Groups
    // filters) — mocked so the filter tests control the data.
    fetchMyFollowersCards: vi.fn().mockResolvedValue([]),
    fetchMyFollowingCards: vi.fn().mockResolvedValue([]),
    getMyCommunityGroups: vi.fn().mockResolvedValue([]),
    // The Explore tab's "New group" create entry (the Groups section header) —
    // the same draft flow as the /groups screen.
    createDraftGroup: vi.fn().mockResolvedValue('test.localhost/groups/users/testuser/new-group'),
  };
});

// Mock wapi
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
  resetWapi: vi.fn(),
}));

// The sort config the most recent readDiscoverFeed call carried (the
// server-side ranking the node was asked to apply).
function lastDiscoverSort(): unknown {
  const calls = (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0];
}

describe('DiscoverScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default v3 client: the discover board's reaction/comment read resolves
    // to nothing (the screen degrades to the payload counts). A test that
    // needs to seed the reader's own reaction overrides this.
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockResolvedValue([]),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
  });

  it('renders skeleton while loading', async () => {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid-skeleton')).toBeInTheDocument();
    });
  });

  it('renders empty state when discovery returns nothing', async () => {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('discover-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('Nothing trending yet')).toBeInTheDocument();
    expect(screen.getByTestId('discover-empty-follow-cta')).toBeInTheDocument();
  });

  it('renders discover header with preset chips', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'noodle-empress',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Just finished a new recipe!',
        tags: ['cooking', 'food'],
        created_at: new Date().toISOString(),
        likes: 42,
        comments: 8,
        reposts: 3,
        score: 47,
      },
      {
        author: 'solar-flare-69',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Check out this sunset',
        tags: ['photography', 'nature'],
        created_at: new Date(Date.now() - 3600000).toISOString(),
        likes: 120,
        comments: 25,
        reposts: 10,
        score: 175,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // The tab row is gone (the Discover split retires the ?tab= salad).
    expect(screen.queryByTestId('discover-tab-row')).not.toBeInTheDocument();
    // KnobRack preset chips (testids: preset-{id})
    expect(screen.getByTestId('preset-most-recent')).toBeInTheDocument();
    expect(screen.getByTestId('preset-most-liked')).toBeInTheDocument();
    expect(screen.getByTestId('preset-balanced')).toBeInTheDocument();
  });

  it('the owner kebab shows on the reader\'s own discover post (and not on others\')', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'testuser', // the signed-in user (the token's username)
        author_username: 'testuser',
        provider: 'test.localhost',
        author_provider: 'test.localhost',
        post_id: 'own-1',
        _id: 'own-1',
        text: 'my own post on discover',
        tags: ['mine'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 50,
      },
      {
        author: 'someone-else',
        author_username: 'someone-else',
        provider: 'api.web10.app',
        author_provider: 'api.web10.app',
        post_id: 'other-1',
        _id: 'other-1',
        text: 'not my post',
        tags: ['theirs'],
        created_at: new Date().toISOString(),
        likes: 9,
        comments: 2,
        reposts: 1,
        score: 60,
      },
    ]);
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });
    // Exactly one owner kebab — on the reader's own post, not the other's.
    // (The board renders the feed's PostCard — the owner menu is its kebab.)
    const kebabs = await screen.findAllByTestId('post-options-button');
    expect(kebabs).toHaveLength(1);
    // Opening it reveals the "Edit post" action (the ONE edit path).
    fireEvent.click(kebabs[0]);
    expect(await screen.findByTestId('post-option-edit')).toBeInTheDocument();
  });

  it('the Top 10 rail ranks the board (rank lives in the rail, not on the card)', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'top-user',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Top post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 200,
        comments: 50,
        reposts: 20,
        score: 250,
      },
      {
        author: 'second-user',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Second post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 100,
        comments: 30,
        reposts: 10,
        score: 150,
      },
      {
        author: 'third-user',
        provider: 'api.web10.app',
        post_id: 'p3',
        text: 'Third post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 50,
        comments: 10,
        reposts: 5,
        score: 75,
      },
      {
        author: 'fourth-user',
        provider: 'api.web10.app',
        post_id: 'p4',
        text: 'Fourth post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 20,
        comments: 5,
        reposts: 2,
        score: 27,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBeGreaterThanOrEqual(1);
    });

    // The rank is the Top 10 rail's job (the card is the X-style feed card,
    // which carries no rank badge). The rail lists the top posts by rank.
    const railEntries = screen.getAllByTestId('hot-gossip-sidebar-entry');
    expect(railEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('the Top 10 rail tally shows the engagement count, not the normalized score', async () => {
    // The power-mean score is a 0–1 float — Math.round() of it is always 0,
    // which is why the rail used to show a wall of zeros. The tally is the
    // raw engagement count (likes + comments + reposts) instead. The counts
    // come from the live engagement read (the v3 client), so seed it.
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockImplementation(async (service: string) =>
        service === 'reactions'
          ? [
              { doc_id: 'r1', author_key: 'test.localhost/other', body: { type: 'like' }, ref_value: 'p1', created_at: new Date().toISOString() },
              { doc_id: 'r2', author_key: 'test.localhost/other2', body: { type: 'like' }, ref_value: 'p1', created_at: new Date().toISOString() },
              { doc_id: 'r3', author_key: 'test.localhost/other3', body: { type: 'like' }, ref_value: 'p1', created_at: new Date().toISOString() },
            ]
          : service === 'comments'
            ? [
                { doc_id: 'c1', author_key: 'test.localhost/other', body: { post_id: 'p1' }, ref_value: 'p1', created_at: new Date().toISOString() },
                { doc_id: 'c2', author_key: 'test.localhost/other2', body: { post_id: 'p1' }, ref_value: 'p1', created_at: new Date().toISOString() },
              ]
            : []
      ),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'p1',
        author: 'top-user',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Top post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
      },
      {
        _id: 'p2',
        author: 'second-user',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Second post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    const railEntries = await screen.findAllByTestId('hot-gossip-sidebar-entry');
    expect(railEntries.length).toBeGreaterThanOrEqual(2);
    // First post: 3 likes + 2 comments = 5 — a real number, not 0.
    expect(railEntries[0]).toHaveTextContent('5');
    // Second post: no engagement — the tally falls back to the dash.
    expect(railEntries[1]).toHaveTextContent('—');
  });

  it('renders topic filter chips when posts have tags', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Post about cooking',
        tags: ['cooking', 'food'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Post about tech',
        tags: ['tech', 'coding'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    // Wait for grid to appear (posts loaded)
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Topics should be derived from post tags
    const topics = screen.getAllByTestId('discover-topic');
    expect(topics.length).toBeGreaterThanOrEqual(2);
  });

  it('filters posts by topic when a topic chip is selected', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Cooking post',
        tags: ['cooking'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Tech post',
        tags: ['tech'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBeGreaterThanOrEqual(2);
    });

    const topics = screen.getAllByTestId('discover-topic');
    if (topics.length > 1) {
      fireEvent.click(topics[1]);
      await waitFor(() => {
        const cards = screen.getAllByTestId('discover-card');
        expect(cards.length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('shows engagement bar with like, comment, repost counts', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Test post',
        tags: [],
        created_at: new Date().toISOString(),
        likes: 42,
        comments: 8,
        reposts: 3,
        score: 53,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-card')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('icon-heart').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('icon-messagecircle').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('icon-repeat2').length).toBeGreaterThanOrEqual(1);
  });

  it('the board is the X-style list — posts touch vertically (no gap), same as the Following tab', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'First post',
        tags: [],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Second post',
        tags: [],
        created_at: new Date(Date.now() - 60000).toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(2);
    });

    // The board list has no vertical gap — the posts touch, separated by the
    // single border-b hairline (the feed's X-style shape, not floating cards).
    const grid = screen.getByTestId('discover-grid');
    expect(grid.className).not.toMatch(/gap-/);
    const cards = screen.getAllByTestId('discover-card');
    for (const card of cards) {
      expect(card.className).toMatch(/border-b/);
    }
  });

  it('switches preset between most-recent, most-liked, and balanced (server-side re-read)', async () => {
    // The node ranks the board server-side — the mock simulates it: it records
    // the sort config each re-read carries.
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockImplementation(async () => [
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Old post with lots of likes',
        tags: ['trending'],
        created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
        likes: 500,
        comments: 100,
        reposts: 50,
        score: 650,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Brand new post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 1,
        comments: 0,
        reposts: 0,
        score: 1,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Balanced is the default preset — the initial read carries the Balanced
    // (power-mean) sort config.
    expect(screen.getByTestId('preset-balanced').classList).toContain('border-brand');
    const firstSort = (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstSort).toMatchObject({ recency: 0.6, likes: 0.6 });

    vi.useFakeTimers();
    try {
      // Click "Newest" — a chronological re-read (no sort param).
      fireEvent.click(screen.getByTestId('preset-most-recent'));
      await vi.advanceTimersByTimeAsync(450);
      expect(screen.getByTestId('preset-most-recent').classList).toContain('border-brand');
      expect(lastDiscoverSort()).toBeNull();

      // Click "Most liked" — a likes-weighted re-read.
      fireEvent.click(screen.getByTestId('preset-most-liked'));
      await vi.advanceTimersByTimeAsync(450);
      expect(screen.getByTestId('preset-most-liked').classList).toContain('border-brand');
      expect(lastDiscoverSort()).toMatchObject({ likes: 1, recency: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Deep-link tests: ?tag= and ?q= ──────────────────────────────────

  it('restores active tag from ?tag= on initial render', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Cooking post',
        tags: ['cooking'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Tech post',
        tags: ['tech'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip?tag=cooking']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // The cooking topic chip should be active
    const topics = screen.getAllByTestId('discover-topic');
    const cookingChip = topics.find(t => t.textContent?.includes('cooking'));
    expect(cookingChip).toBeTruthy();
    expect(cookingChip!.classList).toContain('border-brand');

    // Only cooking posts should be visible
    const cards = screen.getAllByTestId('discover-card');
    expect(cards.length).toBe(1);
  });

  it('restores search query from ?q= on initial render', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Hello world post',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Another post here',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip?q=hello']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    // The ?q= query filters the board to matching posts.
    await waitFor(() => {
      const cards = screen.getAllByTestId('discover-card');
      expect(cards.length).toBe(1);
    });
  });

  it('restores both ?tag= and ?q= together', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Delicious cooking recipe',
        tags: ['cooking'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Baking is fun too',
        tags: ['cooking'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
      {
        author: 'user3',
        provider: 'api.web10.app',
        post_id: 'p3',
        text: 'Tech news today',
        tags: ['tech'],
        created_at: new Date().toISOString(),
        likes: 20,
        comments: 5,
        reposts: 2,
        score: 28,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip?tag=cooking&q=delicious']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Should show only 1 post: cooking tag AND contains "delicious"
    const cards = screen.getAllByTestId('discover-card');
    expect(cards.length).toBe(1);
  });

  it('clicking a topic chip writes ?tag= to URL', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Cooking post',
        tags: ['cooking'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Tech post',
        tags: ['tech'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Click the "cooking" topic chip
    const topics = screen.getAllByTestId('discover-topic');
    const cookingChip = topics.find(t => t.textContent?.includes('cooking'));
    expect(cookingChip).toBeTruthy();
    fireEvent.click(cookingChip!);

    // Topic chip should now be active
    await waitFor(() => {
      expect(cookingChip!.classList).toContain('border-brand');
    });
  });

  it('a ?q= query filters the board to matching posts', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Hello world post',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Another post here',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip?q=hello']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    // Initially 2 cards; the ?q= query filters to the 1 matching post.
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(1);
    });
  });

  // ── D-trending-views: view toggle + Home (video) view ─────────────────

  it('the view toggle is gone (the Discover split retires the ?view= salad)', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Test post',
        tags: ['video'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/video']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-grid')).toBeInTheDocument();
    });

    // The ?view= toggle (Home | Hot Gossip) is retired — the sidebar owns the
    // nav now (the Discover split, watch-page.md). The mode is the route.
    expect(screen.queryByTestId('discover-view-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discover-view-toggle-home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discover-view-toggle-grid')).not.toBeInTheDocument();
  });

  it('the Video destination renders the video wall (the old Home view)', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Video post',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Text only post',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/video']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    // The Video destination is the video wall — only media posts, as Home cards.
    await waitFor(() => {
      expect(screen.getByTestId('discover-home-grid')).toBeInTheDocument();
    });

    // Only 1 Home card (the video post, not the text-only post)
    expect(screen.getAllByTestId('discover-home-card').length).toBe(1);
  });

  it('the Video destination shows its empty state when no media posts exist', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Text only post',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/video']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('No videos yet')).toBeInTheDocument();
    expect(screen.getByTestId('discover-home-empty-cta')).toBeInTheDocument();
  });

  it('the Video empty-state CTA navigates to the Hot Gossip destination', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Text only post',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);

    let lastPath = '';
    function PathProbe() {
      const location = useLocation();
      lastPath = location.pathname;
      return null;
    }

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/video']}>
        <PathProbe />
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-empty')).toBeInTheDocument();
    });

    // Click the CTA — it navigates to the Hot Gossip destination (the split's
    // flat route; the old in-screen ?view= toggle is gone).
    fireEvent.click(screen.getByTestId('discover-home-empty-cta'));
    await waitFor(() => {
      expect(lastPath).toBe('/hot-gossip');
    });
  });

  it('Home card renders 16:9 thumbnail, title, and author attribution', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'video-creator',
        author_username: 'video-creator',
        author_provider: 'api.web10.app',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'My amazing video content',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date(Date.now() - 3600000).toISOString(),
        likes: 42,
        comments: 8,
        reposts: 3,
        score: 53,
      },
    ]);
    (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'm1',
        url: 'https://cdn.example/video.mp4',
        mime_type: 'video/mp4',
        width: 1080,
        height: 1920,
        duration_seconds: 42,
        thumbnail_url: 'https://cdn.example/thumb.jpg',
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/video']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-grid')).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId('discover-home-card');
    expect(cards.length).toBe(1);
    // The 16:9 thumbnail is present…
    expect(screen.getByTestId('discover-home-card-thumb')).toBeInTheDocument();
    // …the title is the (truncated) post text…
    expect(screen.getByTestId('discover-home-card-title')).toHaveTextContent('My amazing video content');
    // …and the author attribution is shown.
    expect(screen.getByTestId('discover-home-card')).toHaveTextContent('video creator');
  });

  it('the Hot Gossip destination renders the ranked board (all posts)', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Post with video',
        tags: ['video'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
      {
        author: 'user2',
        provider: 'api.web10.app',
        post_id: 'p2',
        text: 'Text only post',
        tags: ['general'],
        created_at: new Date().toISOString(),
        likes: 5,
        comments: 1,
        reposts: 0,
        score: 7,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Both posts visible in grid (text + media)
    expect(screen.getAllByTestId('discover-card').length).toBe(2);
  });

  // ── Video playback: the discover page must let you WATCH videos ──────────

  it('grid view renders a playable <video> for a resolved video post', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'video-creator',
        provider: 'api.web10.app',
        post_id: 'p1',
        author_username: 'video-creator',
        author_provider: 'api.web10.app',
        text: 'Watch this',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);
    (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'm1',
        url: 'https://cdn.example/video.mp4',
        mime_type: 'video/mp4',
        width: 1080,
        height: 1920,
        duration_seconds: 42,
        thumbnail_url: 'https://cdn.example/thumb.jpg',
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    // The board renders the feed's PostCard — the inline video is the feed's
    // media-video surface (the two tabs look exactly the same).
    await waitFor(() => {
      expect(screen.getByTestId('media-video')).toBeInTheDocument();
    });

    // The playable video element is wired to the resolved media url
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.getAttribute('src')).toBe('https://cdn.example/video.mp4');
  });

  it('video renders at natural ratio like the feed — a portrait clip is object-contain, not a cropped 16:9 tile', async () => {
    // A PORTRAIT clip (9:16). Discover renders video the SAME way the feed
    // does (video-player.md): natural ratio + object-contain (never crops),
    // so a 9:16 clip shows as a tall 9:16 box — no letterbox borders, no
    // center-crop. (The old uniform-16:9 youtubey tile is retired.)
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'video-creator',
        provider: 'api.web10.app',
        post_id: 'p1',
        author_username: 'video-creator',
        author_provider: 'api.web10.app',
        text: 'Vertical clip',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);
    (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'm1',
        url: 'https://cdn.example/video.mp4',
        mime_type: 'video/mp4',
        width: 1080,
        height: 1920, // portrait
        duration_seconds: 42,
        thumbnail_url: 'https://cdn.example/thumb.jpg',
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    const tile = await screen.findByTestId('media-video');
    // Natural ratio (the clip's 9:16), NOT a forced 16:9 tile.
    expect(tile.className).not.toMatch(/aspect-video/);
    // object-contain (never crops) — the feed's behavior, no letterbox bars.
    const video = tile.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.className).toMatch(/object-contain/);
    expect(video!.className).not.toMatch(/object-cover/);
  });

  it('a portrait (9:16) clip renders at the feed height (the board matches the Following tab)', async () => {
    // A full-width 9:16 box is ~1.78× the card tall — too big on desktop and it
    // buries the control rack at its bottom. The board renders the feed's
    // PostCard, which caps the inline video at 60vh (maxHeight) — the same
    // behavior as the Following tab (the two tabs look exactly the same).
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'video-creator',
        provider: 'api.web10.app',
        post_id: 'p1',
        author_username: 'video-creator',
        author_provider: 'api.web10.app',
        text: 'Vertical clip',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);
    (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'm1',
        url: 'https://cdn.example/video.mp4',
        mime_type: 'video/mp4',
        width: 1080,
        height: 1920, // portrait
        duration_seconds: 42,
        thumbnail_url: 'https://cdn.example/thumb.jpg',
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    const tile = await screen.findByTestId('media-video');
    // The frame is capped at the feed height (60vh) — the cap shrinks the box,
    // it does not squash the video.
    expect(tile.style.maxHeight).toBe('60vh');
    // The source ratio is still reserved (9:16).
    expect(parseFloat(tile.style.aspectRatio)).toBeCloseTo(1080 / 1920, 5);
  });

  it('the discover card is inline — no lightbox; the comment count toggles the thread', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'video-creator',
        provider: 'api.web10.app',
        post_id: 'p1',
        author_username: 'video-creator',
        author_provider: 'api.web10.app',
        text: 'Watch this',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);
    (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'm1',
        url: 'https://cdn.example/video.mp4',
        mime_type: 'video/mp4',
        width: 1080,
        height: 1920,
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-card')).toBeInTheDocument();
    });

    // The inline modality (video-player.md): clicking the card opens NO
    // lightbox — the video plays inline and comments expand in the card.
    fireEvent.click(screen.getByTestId('discover-card'));
    expect(screen.queryByTestId('post-lightbox')).not.toBeInTheDocument();

    // The comment count toggles the inline thread (the feed's pattern).
    const commentButton = screen.getByRole('button', { name: /comments/ });
    expect(screen.queryByTestId('comment-thread')).not.toBeInTheDocument();
    fireEvent.click(commentButton);
    await waitFor(() => {
      expect(screen.getByTestId('comment-thread')).toBeInTheDocument();
    });
  });

  it('the Home-view card is a thumbnail — no inline video, no lightbox', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'video-creator',
        provider: 'api.web10.app',
        post_id: 'p1',
        author_username: 'video-creator',
        author_provider: 'api.web10.app',
        text: 'Watch this',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 14,
      },
    ]);
    (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'm1',
        url: 'https://cdn.example/video.mp4',
        mime_type: 'video/mp4',
        width: 1920,
        height: 1080,
        thumbnail_url: 'https://cdn.example/thumb.jpg',
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/video']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-card')).toBeInTheDocument();
    });

    // The Home card is a thumbnail — the poster <img> + the hover preview's
    // <video> (inert at rest: no source, hidden), NOT a live inline player.
    expect(screen.getByTestId('discover-home-card-thumb')).toBeInTheDocument();
    const card = screen.getByTestId('discover-home-card');
    expect(card.querySelector('img')).not.toBeNull();
    const preview = card.querySelector('video');
    expect(preview).not.toBeNull();
    expect(preview!.getAttribute('src')).toBeNull();
    expect(preview!.className).toMatch(/opacity-0/);
    // Clicking the card opens no lightbox (it navigates to the post permalink).
    fireEvent.click(screen.getByTestId('discover-home-card-thumb'));
    expect(screen.queryByTestId('post-lightbox')).not.toBeInTheDocument();
  });

  // ── Media isolation: one author, multiple posts ──────────────────────────

  it('each post keeps only its own media when one author has multiple posts (no cross-post leak)', async () => {
    // The regression: the per-author ref accumulator aliased the first post's
    // media_refs array and pushed the later posts' refs into it, so the first
    // post's per-ref filter matched ALL of the author's media — the video
    // post rendered a carousel of the other post's media (the "blacked out"
    // trending tile: a transcoded video's raw source file, unplayable).
    const videoPost = {
      _id: 'p1',
      author: 'creator',
      provider: 'api.web10.app',
      post_id: 'p1',
      author_username: 'creator',
      author_provider: 'api.web10.app',
      text: 'Watch this',
      tags: ['video'],
      media_refs: ['m1'],
      created_at: new Date().toISOString(),
      likes: 10,
      comments: 2,
      reposts: 1,
      score: 14,
    };
    const imagePost = {
      _id: 'p2',
      author: 'creator',
      provider: 'api.web10.app',
      post_id: 'p2',
      author_username: 'creator',
      author_provider: 'api.web10.app',
      text: 'A photo',
      tags: ['photography'],
      media_refs: ['m2'],
      created_at: new Date(Date.now() - 60000).toISOString(),
      likes: 5,
      comments: 1,
      reposts: 0,
      score: 7,
    };
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([videoPost, imagePost]);
    // The real resolver returns a record per requested ref — mirror that so
    // the leak is observable (the buggy code requests BOTH refs for the
    // author and the filter then matches both against the first post).
    (data.resolveMediaRefs as ReturnType<typeof vi.fn>).mockImplementation(async (refs: (string | { doc_id?: string })[]) =>
      refs.map((r) => {
        const id = typeof r === 'string' ? r : r.doc_id || '';
        return {
          _id: id,
          url: `https://cdn.example/${id}`,
          mime_type: id === 'm1' ? 'video/mp4' : 'image/jpeg',
          width: 1080,
          height: 1920,
          created_at: new Date().toISOString(),
        };
      }),
    );

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(2);
    });

    // The video post: its own single video, inline — NO carousel.
    expect(screen.getByTestId('media-video')).toBeInTheDocument();
    expect(screen.queryByTestId('media-carousel')).not.toBeInTheDocument();
    const video = document.querySelector('video');
    expect(video!.getAttribute('src')).toBe('https://cdn.example/m1');

    // The image post: its own image.
    const img = document.querySelector('img[src="https://cdn.example/m2"]');
    expect(img).toBeTruthy();

    // The first post's media_refs array is never mutated by the grouping.
    expect(videoPost.media_refs).toEqual(['m1']);
  });
});

describe('DiscoverScreen — the engagement bar is interactive (post-actions.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockResolvedValue([]),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
  });

  function renderDiscover(posts: unknown[]) {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue(posts);
    return import('@/components/Discover/DiscoverScreen').then(({ default: DiscoverScreen }) => {
      render(
        <MemoryRouter initialEntries={['/hot-gossip']}>
          <DiscoverScreen />
        </MemoryRouter>,
      );
    });
  }

  it('the discover card renders an interactive like button (not a display span)', async () => {
    await renderDiscover([
      { _id: 'p1', author: 'creator', author_username: 'creator', author_provider: 'api.web10.app', text: 'A post', created_at: new Date().toISOString(), likes: 3, comments: 1, reposts: 0, score: 5 },
    ]);
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(1);
    });
    // The like is a real button (the feed's behavior), not the old display <span>.
    const card = screen.getAllByTestId('discover-card')[0];
    const likeButton = card.querySelector('[data-testid="like-button"]');
    expect(likeButton).not.toBeNull();
    expect(likeButton!.tagName).toBe('BUTTON');
    expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    // The dislike pair is interactive too (parity with the feed).
    expect(card.querySelector('[data-testid="dislike-button"]')).not.toBeNull();
  });

  it('liking from discover calls toggleReactionKind and fills the heart optimistically', async () => {
    const { toggleReactionKind } = await import('@/data');
    await renderDiscover([
      { _id: 'p1', author: 'creator', author_username: 'creator', author_provider: 'api.web10.app', text: 'A post', created_at: new Date().toISOString(), likes: 3, comments: 1, reposts: 0, score: 5 },
    ]);
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(1);
    });
    const card = screen.getAllByTestId('discover-card')[0];
    fireEvent.click(card.querySelector('[data-testid="like-button"]')!);

    await waitFor(() => {
      expect(toggleReactionKind).toHaveBeenCalledWith('p1', 'like');
    });
    // Optimistic: the heart fills before the write resolves. Re-query each poll
    // — the heart-burst re-keys the button when the like lands.
    await waitFor(() => {
      expect(card.querySelector('[data-testid="like-button"]')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('a post the reader already liked shows a filled heart on load', async () => {
    // Seed the reader's own like from the discover-group reaction read (the
    // screen reads it via getV3Client().read('reactions')).
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockImplementation(async (service: string) =>
        service === 'reactions'
          ? [{ doc_id: 'r1', author_key: 'test.localhost/testuser', body: { type: 'like' }, ref_value: 'p1', created_at: new Date().toISOString() }]
          : []
      ),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
    await renderDiscover([
      { _id: 'p1', author: 'creator', author_username: 'creator', author_provider: 'api.web10.app', text: 'A post', created_at: new Date().toISOString(), likes: 3, comments: 1, reposts: 0, score: 5 },
    ]);
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(1);
    });
    const card = screen.getAllByTestId('discover-card')[0];
    await waitFor(() => {
      expect(card.querySelector('[data-testid="like-button"]')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('the Home-view card (the Video wall) has the like/dislike pair, like the feed', async () => {
    // The operator: "these video thumbnails dont have dislikes, should have!
    // we have them on the regular feed!" The HomeCard's engagement row now
    // carries the like/dislike pair (parity with the feed's PostActions).
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      { _id: 'p1', author: 'creator', author_username: 'creator', author_provider: 'api.web10.app', text: 'A video post', tags: ['video'], media_refs: ['m1'], created_at: new Date().toISOString(), likes: 3, comments: 1, reposts: 0, score: 5 },
    ]);
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/video']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-home-card').length).toBe(1);
    });
    const card = screen.getAllByTestId('discover-home-card')[0];
    // Both the like and the dislike are real, tappable buttons (not display spans).
    const like = card.querySelector('[data-testid="discover-home-card-like"]');
    const dislike = card.querySelector('[data-testid="discover-home-card-dislike"]');
    expect(like).not.toBeNull();
    expect(like!.tagName).toBe('BUTTON');
    expect(dislike).not.toBeNull();
    expect(dislike!.tagName).toBe('BUTTON');
    expect(dislike).toHaveAttribute('aria-label', 'Dislike');
  });
});

// ── The Discover split: the four flat destinations ──────────────────────────
// The old ?tab= / ?view= salad is retired — each destination is a top-level
// route the sidebar owns. The screen derives its mode from the path. ?q= /
// ?tag= / ?knobs= survive as URL state on the relevant destinations.

describe('DiscoverScreen — the four destinations (the Discover split)', () => {
  // A probe that captures the router location (MemoryRouter keeps its own
  // history — window.location never moves).
  let lastSearch = '';
  let lastPath = '';
  function LocationProbe() {
    const location = useLocation();
    lastSearch = location.search;
    lastPath = location.pathname;
    return null;
  }

  async function renderDiscoverAt(path: string) {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    lastSearch = '';
    lastPath = '';
    return render(
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <DiscoverScreen />
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'p1',
        author: 'user1',
        author_username: 'user1',
        author_provider: 'api.web10.app',
        text: 'A trending post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 13,
      },
    ]);
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockResolvedValue([]),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
  });

  it('the tab row is gone (the Discover split retires the ?tab= salad)', async () => {
    await renderDiscoverAt('/video');
    // The seeded post is text-only, so the Video wall shows its empty state.
    await waitFor(() => {
      expect(screen.getByTestId('discover-home-empty')).toBeInTheDocument();
    });
    // The Trending | People tab row is retired — the sidebar owns the nav now.
    expect(screen.queryByTestId('discover-tab-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discover-tab-trending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discover-tab-explore')).not.toBeInTheDocument();
  });

  it('the People destination renders the people + groups browser', async () => {
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('discover-explore-tab')).toBeInTheDocument();
    });
    // The People destination is the browser (the old ?tab=explore content).
    expect(screen.getByTestId('explore-show-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('discover-grid')).not.toBeInTheDocument();
  });

  it('the Hot Gossip destination renders the ranked board (not the browser)', async () => {
    await renderDiscoverAt('/hot-gossip');
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });
    // The Hot Gossip destination is the post board (the old ?view=grid content).
    expect(screen.queryByTestId('discover-explore-tab')).not.toBeInTheDocument();
  });

  it('the Video destination renders the video wall (not the browser)', async () => {
    // Seed a video post so the wall has a card (the beforeEach seed is text-only).
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: 'p1',
        author: 'user1',
        author_username: 'user1',
        author_provider: 'api.web10.app',
        text: 'A video post',
        tags: ['video'],
        media_refs: ['m1'],
        created_at: new Date().toISOString(),
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 13,
      },
    ]);
    await renderDiscoverAt('/video');
    await waitFor(() => {
      expect(screen.getByTestId('discover-home-grid')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('discover-explore-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discover-grid')).not.toBeInTheDocument();
  });

  it('passes ?q= through to the People destination', async () => {
    await renderDiscoverAt('/people?q=lofi');
    await waitFor(() => {
      expect(screen.getByTestId('discover-explore-tab')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-explore-tab-query')).toHaveTextContent('lofi');
  });

  it('shows the query chip on the Video destination (?q=)', async () => {
    await renderDiscoverAt('/video?q=lofi');
    await waitFor(() => {
      expect(screen.getByTestId('discover-trending-tab-query')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-trending-tab-query')).toHaveTextContent('lofi');
  });

  it('X on the Video destination query chip clears ?q= (back to the unfiltered board)', async () => {
    await renderDiscoverAt('/video?q=lofi');
    await waitFor(() => {
      expect(screen.getByTestId('discover-trending-tab-query')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('discover-trending-tab-query-clear'));
    await waitFor(() => {
      expect(screen.queryByTestId('discover-trending-tab-query')).not.toBeInTheDocument();
    });
    // The ?q= param is gone from the URL (lastSearch is a render side-effect of
    // the LocationProbe — wait for it to settle, not a synchronous read).
    await waitFor(() => {
      expect(lastSearch).not.toContain('q=');
    });
  });

  // ── The People / Groups visibility toggle (?show=) ────────────────────────
  // Seed the Explore tab's data so the sections render (the mock's default v3
  // client has no listPeopleDirectory, so fetchPeoplePage would error).
  function seedExploreData() {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue({
      people: [
        { username: 'alice', provider: 'test.localhost', followers_count: 3, mutuals: 2, is_following: true },
        { username: 'bob', provider: 'test.localhost', followers_count: 5, mutuals: 0, is_following: false },
      ],
      hasMore: false,
    });
    (data.readGroupDirectory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { group_id: 'g1', name: 'Lofi', owner: 'alice', tags: ['music'] },
    ]);
  }

  it('renders the People | Groups toggle with both active by default', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-show-toggle')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-show-people')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('explore-show-groups')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('explore-people-section')).toBeInTheDocument();
    expect(screen.getByTestId('explore-groups-section')).toBeInTheDocument();
  });

  it('hides the people section (and the sort row) when People is toggled off', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-show-toggle')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-sort-toggle')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('explore-show-people'));

    await waitFor(() => {
      expect(screen.queryByTestId('explore-people-section')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-show-people')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('explore-groups-section')).toBeInTheDocument();
    // The sort row is people-only — it hides with the section.
    expect(screen.queryByTestId('explore-sort-toggle')).not.toBeInTheDocument();
    // ?show=groups is written (the bare URL is "both").
    await waitFor(() => {
      expect(lastSearch).toContain('show=groups');
    });
  });

  it('shows the neutral empty state when both sections are hidden', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-show-toggle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('explore-show-people'));
    await waitFor(() => {
      expect(screen.queryByTestId('explore-people-section')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('explore-show-groups'));
    await waitFor(() => {
      expect(screen.getByTestId('explore-show-none')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('explore-groups-section')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(lastSearch).toContain('show=none');
    });
  });

  it('restores ?show=groups on initial render (deep link)', async () => {
    seedExploreData();
    await renderDiscoverAt('/people?show=groups');
    await waitFor(() => {
      expect(screen.getByTestId('explore-show-toggle')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-show-people')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('explore-show-groups')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('explore-people-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('explore-groups-section')).toBeInTheDocument();
  });

  it('re-shows a hidden section when its toggle is clicked again', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-show-toggle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('explore-show-people'));
    await waitFor(() => {
      expect(screen.queryByTestId('explore-people-section')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('explore-show-people'));
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-show-people')).toHaveAttribute('aria-pressed', 'true');
    // Back to "both" — the ?show= param is cleared (bare URL).
    await waitFor(() => {
      expect(lastSearch).not.toContain('show=');
    });
  });

  // ── The People / Groups filter chips (?personFilter= / ?groupFilter=) ──────
  // The "easy filters": People = All | Following | Mutuals | Followers;
  // Groups = All | My Groups | Discover.

  it('renders the People filter chips with All active by default', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-people-filter-all')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('explore-people-filter-following')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('explore-people-filter-mutuals')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('explore-people-filter-followers')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the Groups filter chips with All active by default', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-groups-filter')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-groups-filter-all')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('explore-groups-filter-mine')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('explore-groups-filter-discover')).toHaveAttribute('aria-selected', 'false');
  });

  it('the Mutuals filter shows only people with mutuals > 0', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter')).toBeInTheDocument();
    });
    // Both alice (2 mutuals) + bob (0 mutuals) show under All.
    expect(screen.getAllByTestId('people-card')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('explore-people-filter-mutuals'));

    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter-mutuals')).toHaveAttribute('aria-selected', 'true');
    });
    // Only alice (mutuals 2) remains — bob (0 mutuals) is filtered out.
    await waitFor(() => {
      expect(screen.getAllByTestId('people-card')).toHaveLength(1);
    });
    expect(screen.getByTestId('people-card')).toHaveTextContent('alice');
    await waitFor(() => {
      expect(lastSearch).toContain('personFilter=mutuals');
    });
  });

  it('the Following filter lists the reader\'s own following (separate read)', async () => {
    seedExploreData();
    (data.fetchMyFollowingCards as ReturnType<typeof vi.fn>).mockResolvedValue([
      { username: 'carol', provider: 'test.localhost', display_name: 'Carol', followers_count: 9, mutuals: 0, is_following: true },
    ]);
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('explore-people-filter-following'));
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter-following')).toHaveAttribute('aria-selected', 'true');
    });
    // The directory (alice/bob) is replaced by the following read (carol).
    await waitFor(() => {
      expect(screen.getByTestId('people-card')).toHaveTextContent('carol');
    });
    expect(data.fetchMyFollowingCards).toHaveBeenCalled();
    await waitFor(() => {
      expect(lastSearch).toContain('personFilter=following');
    });
  });

  it('the Followers filter lists the reader\'s own followers (separate read)', async () => {
    seedExploreData();
    (data.fetchMyFollowersCards as ReturnType<typeof vi.fn>).mockResolvedValue([
      { username: 'dave', provider: 'test.localhost', display_name: 'Dave', followers_count: 9, mutuals: 0, is_following: false },
    ]);
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('explore-people-filter-followers'));
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter-followers')).toHaveAttribute('aria-selected', 'true');
    });
    await waitFor(() => {
      expect(screen.getByTestId('people-card')).toHaveTextContent('dave');
    });
    expect(data.fetchMyFollowersCards).toHaveBeenCalled();
    await waitFor(() => {
      expect(lastSearch).toContain('personFilter=followers');
    });
  });

  it('the My Groups filter lists the reader\'s own groups (separate read)', async () => {
    seedExploreData();
    (data.getMyCommunityGroups as ReturnType<typeof vi.fn>).mockResolvedValue([
      { group_id: 'test.localhost/groups/communities/my-crew', join_policy: 'open', my_role: 'member', member_count: 4, tags: [] },
    ]);
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-groups-filter')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('explore-groups-filter-mine'));
    await waitFor(() => {
      expect(screen.getByTestId('explore-groups-filter-mine')).toHaveAttribute('aria-selected', 'true');
    });
    // The directory (Lofi) is replaced by the My Groups list (my-crew).
    await waitFor(() => {
      expect(screen.getByTestId('explore-groups-mine-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('groups-my-row')).toHaveTextContent('my-crew');
    expect(data.getMyCommunityGroups).toHaveBeenCalled();
    await waitFor(() => {
      expect(lastSearch).toContain('groupFilter=mine');
    });
  });

  it('the Groups section carries the "New group" create entry (the People tab is the groups browser home)', async () => {
    seedExploreData();
    await renderDiscoverAt('/people');
    await waitFor(() => {
      expect(screen.getByTestId('explore-groups-filter')).toBeInTheDocument();
    });
    // The create entry is in the Groups section header (the same flow as the
    // /groups screen's button).
    const btn = screen.getByTestId('explore-groups-new-button');
    expect(btn).toHaveTextContent('New group');
    // Tapping it creates a draft group and navigates to the group page in
    // edit mode (the G4 create flow).
    fireEvent.click(btn);
    await waitFor(() => {
      expect(data.createDraftGroup).toHaveBeenCalledWith('testuser');
    });
    // The draft's group page in edit mode is the navigation target.
    await waitFor(() => {
      expect(lastPath).toBe('/groups/test.localhost%2Fgroups%2Fusers%2Ftestuser%2Fnew-group');
      expect(lastSearch).toBe('?edit=1');
    });
  });

  it('restores ?personFilter=mutuals on initial render (deep link)', async () => {
    seedExploreData();
    await renderDiscoverAt('/people?personFilter=mutuals');
    await waitFor(() => {
      expect(screen.getByTestId('explore-people-filter')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-people-filter-mutuals')).toHaveAttribute('aria-selected', 'true');
    // Only alice (mutuals 2) shows.
    await waitFor(() => {
      expect(screen.getAllByTestId('people-card')).toHaveLength(1);
    });
  });
});

describe('DiscoverScreen — the post-format ad renders as its own card, next in line (ad-improvements.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockResolvedValue([]),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
  });

  const POST_AD = {
    _id: 'ad-1',
    text: 'Everything I use, linked.',
    created_at: new Date().toISOString(),
    offer: { link: 'https://amzn.to/abc', cta: 'Check it out', disclosure: 'I may earn a commission.' },
    status: 'active',
    author_username: 'alice',
    variant: 'creator',
    format: 'post',
    media_refs: [],
  };

  const INLINE_AD = {
    _id: 'ad-inline-1',
    text: 'The compact inline ad.',
    offer: { link: 'https://amzn.to/xyz', cta: 'Get it', disclosure: 'I may earn a commission.' },
    status: 'active',
    author_username: 'alice',
    variant: 'creator',
    format: 'inline',
    media_refs: [],
  };

  it('a post-format ad attached to a discover post renders as a standalone card AFTER that post (not inside it)', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'top-user',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Top post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 200,
        comments: 50,
        reposts: 20,
        score: 250,
        ad: POST_AD,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    const card = await screen.findByTestId('discover-card');
    const adCard = screen.getByTestId('post-ad-card');

    // The ad is its own standalone card, NOT nested inside the discover card.
    expect(adCard.tagName).toBe('ARTICLE');
    expect(adCard.getAttribute('data-ad-standalone')).toBe('true');
    expect(card.contains(adCard)).toBe(false);
    // Next in line on the board — directly after the post's card.
    expect(card.nextElementSibling).toBe(adCard);
    // The ad dressing is intact.
    expect(screen.getByTestId('post-ad-badge')).toHaveTextContent('Ad');
    expect(screen.getByTestId('post-ad-author')).toHaveTextContent('@alice');
    expect(screen.getByTestId('post-ad-cta')).toHaveTextContent('Check it out');
  });

  it('an inline ad stays in the discover card (no standalone card)', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'top-user',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Top post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 200,
        comments: 50,
        reposts: 20,
        score: 250,
        ad: INLINE_AD,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    const card = await screen.findByTestId('discover-card');
    // The compact AdBlock renders inside the card's ad slot.
    const adBlock = screen.getByTestId('ad-block');
    expect(card.contains(adBlock)).toBe(true);
    // No standalone post-ad card.
    expect(screen.queryByTestId('post-ad-card')).toBeNull();
  });
});

describe('DiscoverScreen — the control rows keep the desktop gutter (operator pass, 25.09.2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockResolvedValue([]),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
  });

  it('the Trending tab control rows (query chip, KnobRack, view toggle) carry the desktop gutter', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'top-user',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'jacob top post',
        tags: ['trending'],
        created_at: new Date().toISOString(),
        likes: 200,
        comments: 50,
        reposts: 20,
        score: 250,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/hot-gossip?q=jacob']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );
    await screen.findByTestId('discover-grid');

    // The query chip row (was flush at md:px-0 — the controls had no padding).
    const chip = screen.getByTestId('discover-trending-tab-query');
    const chipRow = chip.parentElement as HTMLElement;
    expect(chipRow.className).toContain('md:px-4');
    expect(chipRow.className).toContain('lg:px-6');
    expect(chipRow.className).not.toContain('md:px-0');

    // The KnobRack row (presets + Advanced) keeps the same gutter as the
    // content column.
    const rack = screen.getByTestId('knob-rack');
    const rackRow = rack.parentElement as HTMLElement;
    expect(rackRow.className).toContain('md:px-4');
    expect(rackRow.className).toContain('lg:px-6');
    expect(rackRow.className).not.toContain('md:px-0');

    // The view toggle is gone (the Discover split retires the ?view= salad).
    expect(screen.queryByTestId('discover-view-toggle')).not.toBeInTheDocument();
  });

  it('the People tab control rows (query chip, Profiles/Groups toggle) carry the desktop gutter', async () => {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/people?q=jacob']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );
    await screen.findByTestId('discover-explore-tab');

    // The query chip row.
    const chip = screen.getByTestId('discover-explore-tab-query');
    const chipRow = chip.parentElement as HTMLElement;
    expect(chipRow.className).toContain('md:px-4');
    expect(chipRow.className).toContain('lg:px-6');
    expect(chipRow.className).not.toContain('md:px-0');

    // The Profiles | Groups visibility toggle row.
    const showToggle = screen.getByTestId('explore-show-toggle');
    const showRow = showToggle.parentElement as HTMLElement;
    expect(showRow.className).toContain('md:px-4');
    expect(showRow.className).toContain('lg:px-6');
    expect(showRow.className).not.toContain('md:px-0');
  });
});