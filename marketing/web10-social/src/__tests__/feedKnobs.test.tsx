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
    readFeed: vi.fn().mockResolvedValue([]),
    getFeedGroups: vi.fn().mockResolvedValue([]),
    readFeedEngagement: vi.fn().mockResolvedValue({ likes: {}, comments: {} }),
    readProfile: vi.fn().mockResolvedValue(null),
    readUserProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    countReactions: vi.fn().mockResolvedValue(0),
    countComments: vi.fn().mockResolvedValue(0),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
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

// A probe that captures the router location (MemoryRouter keeps its own
// history — window.location never moves).
let lastSearch = '';
function LocationProbe() {
  const location = useLocation();
  lastSearch = location.search;
  return null;
}

async function renderFeed(path = '/feed') {
  const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
  lastSearch = '';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <FeedScreen onAuthorClick={() => {}} />
    </MemoryRouter>,
  );
}

const OLD_POST = {
  _id: 'p1',
  author_username: 'user1',
  author_provider: 'test.localhost',
  text: 'Old post with lots of likes',
  created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
  likes: 500,
  comments: 100,
  reposts: 0,
};

const NEW_POST = {
  _id: 'p2',
  author_username: 'user2',
  author_provider: 'test.localhost',
  text: 'Brand new post',
  created_at: new Date().toISOString(),
  likes: 1,
  comments: 0,
  reposts: 0,
};

function mockFeed() {
  (data.readFeed as ReturnType<typeof vi.fn>).mockResolvedValue([
    { ...OLD_POST },
    { ...NEW_POST },
  ]);
  // The ref pattern populates the engagement counts (the knobs' signal).
  (data.getFeedGroups as ReturnType<typeof vi.fn>).mockResolvedValue(['g1']);
  (data.readFeedEngagement as ReturnType<typeof vi.fn>).mockResolvedValue({
    likes: { p1: 500, p2: 1 },
    comments: { p1: 100, p2: 0 },
  });
}

function cardOrder(): string[] {
  return screen
    .getAllByTestId('post-card')
    .map((c) => c.querySelector('[data-testid="post-author-link"]')?.textContent || '');
}

describe('FeedScreen — the D36 knobs (same rack as the trending page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (data.readSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ defaultVisibility: 'public' });
  });

  it('renders the knob rack (preset chips + advanced toggle)', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    expect(screen.getByTestId('knob-rack')).toBeInTheDocument();
    expect(screen.getByTestId('preset-newest')).toBeInTheDocument();
    expect(screen.getByTestId('preset-most-loved')).toBeInTheDocument();
    expect(screen.getByTestId('preset-balanced')).toBeInTheDocument();
    expect(screen.getByTestId('knobs-advanced-toggle')).toBeInTheDocument();
  });

  it('defaults to the Newest preset (the feed is chronological until tuned)', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    expect(screen.getByTestId('preset-newest').classList).toContain('border-brand');
    // Newest first: the brand-new post (user2) ranks before the week-old one.
    expect(cardOrder()).toEqual(['user2', 'user1']);
  });

  it('preset switch re-ranks the feed (Most loved puts the high-engagement post first)', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });

    fireEvent.click(screen.getByTestId('preset-most-loved'));
    await waitFor(() => {
      expect(screen.getByTestId('preset-most-loved').classList).toContain('border-brand');
    });
    // The week-old post with 500 likes now ranks first.
    expect(cardOrder()).toEqual(['user1', 'user2']);
  });

  it('writes the knob state to the URL (?knobs=, the deep-link rule)', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });

    fireEvent.click(screen.getByTestId('preset-most-loved'));
    await waitFor(() => {
      expect(lastSearch).toContain('knobs=');
    });
  });

  it('restores the knob state from ?knobs= on initial render (deep link)', async () => {
    mockFeed();
    // most-loved preset encoding: recency 0, likes 5, comments 0, halfLife 5, character 0
    await renderFeed('/feed?knobs=0,5,0,5,0');
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    expect(screen.getByTestId('preset-most-loved').classList).toContain('border-brand');
    expect(cardOrder()).toEqual(['user1', 'user2']);
  });

  it('restores the saved tuning from the settings service (no URL knobs)', async () => {
    (data.readSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      defaultVisibility: 'public',
      feedKnobs: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
    });
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('preset-most-loved').classList).toContain('border-brand');
    });
    expect(cardOrder()).toEqual(['user1', 'user2']);
  });

  it('the URL beats the saved settings (a shared link carries its own ranking)', async () => {
    (data.readSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      defaultVisibility: 'public',
      feedKnobs: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 }, // most-loved
    });
    mockFeed();
    // URL says newest-first (the Newest preset encoding)
    await renderFeed('/feed?knobs=5,0,0,0,0');
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    expect(screen.getByTestId('preset-newest').classList).toContain('border-brand');
    expect(cardOrder()).toEqual(['user2', 'user1']);
  });

  it('persists the tuning to the settings service (debounced)', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId('preset-most-loved'));
      await vi.advanceTimersByTimeAsync(500);

      expect(data.saveSettings).toHaveBeenCalledWith({
        feedKnobs: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
