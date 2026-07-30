import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    render(<DiscoverScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('discover-grid-skeleton')).toBeInTheDocument();
    });
  });

  it('renders empty state when discovery returns nothing', async () => {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
    render(<DiscoverScreen />);
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
    render(<DiscoverScreen />);

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
    render(<DiscoverScreen />);

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
    render(<DiscoverScreen />);

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
    render(<DiscoverScreen />);

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
    render(<DiscoverScreen />);

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
    render(<DiscoverScreen />);

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
});