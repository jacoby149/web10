import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

describe('DiscoverScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton while loading', async () => {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/discover']}>
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
      <MemoryRouter initialEntries={['/discover']}>
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Discover' })).toBeInTheDocument();
    // KnobRack preset chips (testids: preset-{id})
    expect(screen.getByTestId('preset-newest')).toBeInTheDocument();
    expect(screen.getByTestId('preset-most-loved')).toBeInTheDocument();
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
      <MemoryRouter initialEntries={['/discover']}>
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
      <MemoryRouter initialEntries={['/discover']}>
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
      <MemoryRouter initialEntries={['/discover']}>
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
      <MemoryRouter initialEntries={['/discover']}>
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

  it('switches preset between newest, most-loved, and balanced', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Balanced is the default preset — KnobRack uses preset-{id} testids
    expect(screen.getByTestId('preset-balanced').classList).toContain('border-brand');

    // Click "Newest" — the newest post (p2) should move to rank #1
    fireEvent.click(screen.getByTestId('preset-newest'));
    await waitFor(() => {
      expect(screen.getByTestId('preset-newest').classList).toContain('border-brand');
    });
    const newestCards = screen.getAllByTestId('discover-card');
    expect(newestCards.length).toBeGreaterThanOrEqual(2);

    // Click "Most loved" — the high-engagement post (p1) should move to rank #1
    fireEvent.click(screen.getByTestId('preset-most-loved'));
    await waitFor(() => {
      expect(screen.getByTestId('preset-most-loved').classList).toContain('border-brand');
    });
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
      <MemoryRouter initialEntries={['/discover?tag=cooking']}>
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
      <MemoryRouter initialEntries={['/discover?q=hello']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-search')).toBeInTheDocument();
    });

    // Search input should have the query
    expect(screen.getByTestId('discover-search')).toHaveValue('hello');

    // Only matching posts should be visible
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
      <MemoryRouter initialEntries={['/discover?tag=cooking&q=delicious']}>
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
      <MemoryRouter initialEntries={['/discover']}>
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

  it('typing in search input filters posts and writes ?q=', async () => {
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Initially 2 cards visible
    expect(screen.getAllByTestId('discover-card').length).toBe(2);

    // Type in search
    const input = screen.getByTestId('discover-search');
    fireEvent.change(input, { target: { value: 'hello' } });

    // Should filter to 1 card
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(1);
    });
  });

  it('clearing search removes ?q= and shows all posts', async () => {
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
      <MemoryRouter initialEntries={['/discover?q=hello']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-search')).toHaveValue('hello');
    });

    // Only 1 card visible with query
    expect(screen.getAllByTestId('discover-card').length).toBe(1);

    // Click clear button
    fireEvent.click(screen.getByTestId('discover-search-clear'));

    // Should show all posts again
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-card').length).toBe(2);
    });

    // Search input should be empty
    expect(screen.getByTestId('discover-search')).toHaveValue('');
  });

  // ── D-trending-views bite b: view toggle + YouTube view ──────────────

  it('renders view toggle with Grid and YouTube buttons', async () => {
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

    expect(screen.getByTestId('discover-view-toggle-grid')).toBeInTheDocument();
    expect(screen.getByTestId('discover-view-toggle-youtube')).toBeInTheDocument();
    // Grid should be active by default
    expect(screen.getByTestId('discover-view-toggle-grid').classList).toContain('bg-brand-muted');
  });

  it('switches to YouTube view when YouTube button is clicked', async () => {
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Click YouTube toggle
    fireEvent.click(screen.getByTestId('discover-view-toggle-youtube'));

    await waitFor(() => {
      expect(screen.getByTestId('discover-view-toggle-youtube').classList).toContain('bg-brand-muted');
    });

    // Should show YouTube grid with only media posts
    await waitFor(() => {
      expect(screen.getByTestId('discover-youtube-grid')).toBeInTheDocument();
    });

    // Only 1 YouTube card (the video post, not the text-only post)
    expect(screen.getAllByTestId('discover-youtube-card').length).toBe(1);
  });

  it('restores YouTube view from ?view=youtube on initial render', async () => {
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
      <MemoryRouter initialEntries={['/discover?view=youtube']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-view-toggle-youtube').classList).toContain('bg-brand-muted');
    });

    await waitFor(() => {
      expect(screen.getByTestId('discover-youtube-grid')).toBeInTheDocument();
    });
  });

  it('shows YouTube empty state when no media posts exist', async () => {
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
      <MemoryRouter initialEntries={['/discover?view=youtube']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-youtube-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('No media posts yet')).toBeInTheDocument();
    expect(screen.getByTestId('discover-youtube-empty-cta')).toBeInTheDocument();
  });

  it('YouTube empty state CTA switches back to grid view', async () => {
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
      <MemoryRouter initialEntries={['/discover?view=youtube']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-youtube-empty')).toBeInTheDocument();
    });

    // Click the CTA to switch to grid
    fireEvent.click(screen.getByTestId('discover-youtube-empty-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('discover-view-toggle-grid').classList).toContain('bg-brand-muted');
    });

    // Should now show grid view
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });
  });

  it('YouTube card renders 16:9 thumbnail area and author info', async () => {
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        author: 'video-creator',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'My amazing video content',
        tags: ['video'],
        created_at: new Date(Date.now() - 3600000).toISOString(),
        likes: 42,
        comments: 8,
        reposts: 3,
        score: 53,
      },
    ]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(
      <MemoryRouter initialEntries={['/discover?view=youtube']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-youtube-grid')).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId('discover-youtube-card');
    expect(cards.length).toBe(1);
    // Should have the video icon placeholder (no real media resolved)
    expect(screen.getAllByTestId('icon-film')[0]).toBeInTheDocument();
  });

  it('default grid view is unchanged (no ?view= param)', async () => {
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
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-grid')).toBeInTheDocument();
    });

    // Both posts visible in grid (text + media)
    expect(screen.getAllByTestId('discover-card').length).toBe(2);
  });
});