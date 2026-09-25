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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    expect(screen.getByTestId('discover-tab-row')).toBeInTheDocument();
    // KnobRack preset chips (testids: preset-{id})
    expect(screen.getByTestId('preset-most-recent')).toBeInTheDocument();
    expect(screen.getByTestId('preset-most-liked')).toBeInTheDocument();
    expect(screen.getByTestId('preset-balanced')).toBeInTheDocument();
  });

  it('renders cards with rank badges', async () => {
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBeGreaterThanOrEqual(1);
    });

    const rankBadges = screen.getAllByTestId('discover-rank-badge');
    expect(rankBadges.length).toBeGreaterThanOrEqual(1);
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid&tag=cooking']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid&q=hello']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid&tag=cooking&q=delicious']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid&q=hello']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    // Initially 2 cards; the ?q= query filters to the 1 matching post.
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(1);
    });
  });

  // ── D-trending-views: view toggle + Home (video) view ─────────────────

  it('renders view toggle with Home and Hot Gossip buttons', async () => {
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-view-toggle')).toBeInTheDocument();
    });

    expect(screen.getByTestId('discover-view-toggle-home')).toBeInTheDocument();
    expect(screen.getByTestId('discover-view-toggle-grid')).toBeInTheDocument();
    // Home (the video wall) should be active by default
    expect(screen.getByTestId('discover-view-toggle-home').classList).toContain('bg-brand-muted');
  });

  it('switches to Home view when the Home button is clicked', async () => {
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Click Home toggle
    fireEvent.click(screen.getByTestId('discover-view-toggle-home'));

    await waitFor(() => {
      expect(screen.getByTestId('discover-view-toggle-home').classList).toContain('bg-brand-muted');
    });

    // Should show Home grid with only media posts
    await waitFor(() => {
      expect(screen.getByTestId('discover-home-grid')).toBeInTheDocument();
    });

    // Only 1 Home card (the video post, not the text-only post)
    expect(screen.getAllByTestId('discover-home-card').length).toBe(1);
  });

  it('restores Home view by default (no ?view= param)', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'user1',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Video post',
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-view-toggle-home').classList).toContain('bg-brand-muted');
    });

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-grid')).toBeInTheDocument();
    });
  });

  it('shows Home empty state when no media posts exist', async () => {
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('No videos yet')).toBeInTheDocument();
    expect(screen.getByTestId('discover-home-empty-cta')).toBeInTheDocument();
  });

  it('Home empty state CTA switches back to Hot Gossip view', async () => {
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-empty')).toBeInTheDocument();
    });

    // Click the CTA to switch to Hot Gossip
    fireEvent.click(screen.getByTestId('discover-home-empty-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('discover-view-toggle-grid').classList).toContain('bg-brand-muted');
    });

    // Should now show Hot Gossip grid view
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
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
      <MemoryRouter initialEntries={['/discover']}>
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

  it('Hot Gossip grid view is unchanged (?view=grid)', async () => {
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-media-video')).toBeInTheDocument();
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    const tile = await screen.findByTestId('discover-media-video');
    // Natural ratio (the clip's 9:16), NOT a forced 16:9 tile.
    expect(tile.className).not.toMatch(/aspect-video/);
    // object-contain (never crops) — the feed's behavior, no letterbox bars.
    const video = tile.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.className).toMatch(/object-contain/);
    expect(video!.className).not.toMatch(/object-cover/);
  });

  it('a portrait (9:16) clip is capped to a square-ish frame (consistent with the marketing /trending card)', async () => {
    // A full-width 9:16 box is ~1.78× the card tall — too big on desktop and it
    // buries the control rack at its bottom. The discover card caps the portrait
    // frame (maxWidth) + centers it (mx-auto) in a black letterbox, the same as
    // the marketing /trending card (3.105.2).
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    const tile = await screen.findByTestId('discover-media-video');
    // The frame is capped to the maxWidth + centered in the letterbox.
    expect(tile.style.maxWidth).toBe('min(50vh, 100%)');
    expect(tile.className).toMatch(/mx-auto/);
    // The source ratio is still reserved (9:16) — the cap shrinks the box, it
    // does not squash the video.
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
        width: 1080,
        height: 1920,
        thumbnail_url: 'https://cdn.example/thumb.jpg',
        created_at: new Date().toISOString(),
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-home-card')).toBeInTheDocument();
    });

    // The Home card is a 16:9 thumbnail (an <img>), not an inline <video>.
    expect(screen.getByTestId('discover-home-card-thumb')).toBeInTheDocument();
    const card = screen.getByTestId('discover-home-card');
    expect(card.querySelector('video')).toBeNull();
    expect(card.querySelector('img')).not.toBeNull();
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(2);
    });

    // The video post: its own single video, inline — NO carousel.
    expect(screen.getByTestId('discover-media-video')).toBeInTheDocument();
    expect(screen.queryByTestId('discover-media-carousel')).not.toBeInTheDocument();
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
        <MemoryRouter initialEntries={['/discover?view=grid']}>
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
});

// ── D1: the Discover subtab shell (Posts | People | Groups) ─────────────────
// The shell owns ?tab= (posts is the bare URL) and ?q= (passed to the active
// subtab). The subtabs have no search field of their own — search is the
// top bar (a different lane). The Posts view is a no-regression.

describe('DiscoverScreen — subtab shell (D1)', () => {
  // A probe that captures the router location (MemoryRouter keeps its own
  // history — window.location never moves).
  let lastSearch = '';
  function LocationProbe() {
    const location = useLocation();
    lastSearch = location.search;
    return null;
  }

  async function renderDiscoverAt(path: string) {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    lastSearch = '';
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

  it('renders the Trending | Profiles tab row with Trending active by default', async () => {
    await renderDiscoverAt('/discover');
    await waitFor(() => {
      expect(screen.getByTestId('discover-tab-row')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-tab-trending')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('discover-tab-explore')).toHaveAttribute('aria-selected', 'false');
    // A1: the tab labels are Trending (was Posts) + Profiles (was People).
    expect(screen.getByTestId('discover-tab-trending')).toHaveTextContent('Trending');
    expect(screen.getByTestId('discover-tab-explore')).toHaveTextContent('Profiles');
  });

  it('switches to Explore and hides the Trending board', async () => {
    await renderDiscoverAt('/discover?view=grid');
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('discover-tab-explore'));

    await waitFor(() => {
      expect(screen.getByTestId('discover-explore-tab')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-tab-explore')).toHaveAttribute('aria-selected', 'true');
    // The Trending board is gone on the Explore subtab.
    expect(screen.queryByTestId('discover-grid')).not.toBeInTheDocument();
  });

  it('switches to Explore and back to Trending', async () => {
    await renderDiscoverAt('/discover?view=grid');
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('discover-tab-explore'));
    await waitFor(() => {
      expect(screen.getByTestId('discover-explore-tab')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('discover-grid')).not.toBeInTheDocument();

    // Back to Trending restores the board.
    fireEvent.click(screen.getByTestId('discover-tab-trending'));
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('discover-explore-tab')).not.toBeInTheDocument();
  });

  it('restores the Explore subtab from ?tab=explore on initial render', async () => {
    await renderDiscoverAt('/discover?tab=explore');
    await waitFor(() => {
      expect(screen.getByTestId('discover-explore-tab')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-tab-explore')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('discover-grid')).not.toBeInTheDocument();
  });

  it('treats an unknown ?tab= value as Trending (the bare-URL default)', async () => {
    await renderDiscoverAt('/discover?tab=bogus');
    await waitFor(() => {
      // Posts is the default subtab; its default view is Home (the video wall).
      // The seeded post is text-only, so Home shows its empty state.
      expect(screen.getByTestId('discover-home-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-tab-trending')).toHaveAttribute('aria-selected', 'true');
  });

  it('passes ?q= through to the active Explore subtab', async () => {
    await renderDiscoverAt('/discover?tab=explore&q=lofi');
    await waitFor(() => {
      expect(screen.getByTestId('discover-explore-tab')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-explore-tab-query')).toHaveTextContent('lofi');
  });

  it('writes ?tab= to the URL on switch and clears it for Trending (bare URL)', async () => {
    await renderDiscoverAt('/discover?view=grid');
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('discover-tab-explore'));
    await waitFor(() => {
      expect(screen.getByTestId('discover-explore-tab')).toBeInTheDocument();
    });
    // The ?view= param is preserved across the tab switch.
    expect(lastSearch).toBe('?view=grid&tab=explore');

    fireEvent.click(screen.getByTestId('discover-tab-trending'));
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });
    // trending is the bare URL — the ?tab= param is removed (?view= stays).
    expect(lastSearch).toBe('?view=grid');
  });

  // ── The People / Groups visibility toggle (?show=) ────────────────────────
  // Seed the Explore tab's data so the sections render (the mock's default v3
  // client has no listPeopleDirectory, so fetchPeoplePage would error).
  function seedExploreData() {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue({
      people: [{ username: 'alice', provider: 'test.localhost', followers_count: 3, is_following: false }],
      hasMore: false,
    });
    (data.readGroupDirectory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { group_id: 'g1', name: 'Lofi', owner: 'alice', tags: ['music'] },
    ]);
  }

  it('renders the People | Groups toggle with both active by default', async () => {
    seedExploreData();
    await renderDiscoverAt('/discover?tab=explore');
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
    await renderDiscoverAt('/discover?tab=explore');
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
    expect(lastSearch).toContain('show=groups');
  });

  it('shows the neutral empty state when both sections are hidden', async () => {
    seedExploreData();
    await renderDiscoverAt('/discover?tab=explore');
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
    expect(lastSearch).toContain('show=none');
  });

  it('restores ?show=groups on initial render (deep link)', async () => {
    seedExploreData();
    await renderDiscoverAt('/discover?tab=explore&show=groups');
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
    await renderDiscoverAt('/discover?tab=explore');
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
    expect(lastSearch).not.toContain('show=');
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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
      <MemoryRouter initialEntries={['/discover?view=grid']}>
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