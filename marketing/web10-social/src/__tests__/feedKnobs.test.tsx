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
    readFeedPage: vi.fn().mockResolvedValue({ posts: [], has_more: false, next_cursor: null }),
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

// The node ranks the feed server-side (the D36 power-mean sort) — the mock
// simulates the node: it inspects the knobState the feed passed to
// readFeedPage and returns posts in the order the node would for that tuning.
// The Newest preset (recency-only) → chronological (newest first); a
// likes-weighted tuning (the "Most loved" preset) → high-engagement first.
function mockFeed() {
  (data.readFeedPage as ReturnType<typeof vi.fn>).mockImplementation(
    async (opts: { knobState?: { recency: number; likes: number; comments: number } }) => {
      const ks = opts.knobState;
      if (ks && ks.likes > 0 && ks.recency === 0) {
        return { posts: [{ ...OLD_POST }, { ...NEW_POST }], has_more: false, next_cursor: null };
      }
      return { posts: [{ ...NEW_POST }, { ...OLD_POST }], has_more: false, next_cursor: null };
    },
  );
}

function cardOrder(): string[] {
  return screen
    .getAllByTestId('post-card')
    .map((c) => c.querySelector('[data-testid="post-author-link"]')?.textContent || '');
}

// The knobState the most recent readFeedPage call carried (the server-side
// ranking the node was asked to apply).
function lastReadFeedKnobState(): unknown {
  const calls = (data.readFeedPage as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0].knobState;
}

describe('FeedScreen — the D36 knobs (server-side ranking via readFeedPage)', () => {
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

  it('the rack is the three signals a user understands - the Time knob is gone', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    // The three user-facing signals stay (the knobs are always mounted — the
    // advanced panel only animates height, so they're in the DOM collapsed).
    expect(screen.getByTestId('knob-recency')).toBeInTheDocument();
    expect(screen.getByTestId('knob-likes')).toBeInTheDocument();
    expect(screen.getByTestId('knob-comments')).toBeInTheDocument();
    // The Time knob (the recency half-life) is gone — the half-life is fixed
    // at the middle (1 day).
    expect(screen.queryByTestId('knob-time')).not.toBeInTheDocument();
  });

  it('defaults to the Newest preset — a chronological read', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    expect(screen.getByTestId('preset-newest').classList).toContain('border-brand');
    // The node's chronological default: the brand-new post (user2) comes
    // before the week-old one.
    expect(cardOrder()).toEqual(['user2', 'user1']);
    // The default read carries the Newest knobState (recency-only).
    expect(lastReadFeedKnobState()).toMatchObject({ recency: 5, likes: 0, comments: 0 });
  });

  it('preset switch re-reads the feed from the node (debounced, Most loved first)', async () => {
    mockFeed();
    await renderFeed();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card').length).toBe(2);
    });
    // The initial read is the Newest (chronological) knobState.
    expect(lastReadFeedKnobState()).toMatchObject({ recency: 5, likes: 0 });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId('preset-most-loved'));
      // The re-read is debounced (a knob burst settles into one fetch).
      await vi.advanceTimersByTimeAsync(400);
      // Let the re-read's async resolution flush (fake timers: no real
      // waiting — advance a little more so microtasks settle).
      await vi.advanceTimersByTimeAsync(50);
      expect(screen.getByTestId('preset-most-loved').classList).toContain('border-brand');
      // The node re-ranked: the week-old post with 500 likes now comes first.
      expect(cardOrder()).toEqual(['user1', 'user2']);
      // The re-read carried the Most-loved knobState (likes-weighted).
      expect(lastReadFeedKnobState()).toMatchObject({ likes: 5, recency: 0 });
    } finally {
      vi.useRealTimers();
    }
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
    // The initial read carried the Most-loved knobState (the URL held the ranking).
    const firstCall = (data.readFeedPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.knobState).toMatchObject({ likes: 5, recency: 0 });
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
    // The saved tuning arrives async → the chip flips, then the re-read is
    // debounced 400ms. Wait for the re-read to land (the knobState-carrying call).
    await waitFor(() => {
      expect(lastReadFeedKnobState()).toMatchObject({ likes: 5, recency: 0 });
    }, { timeout: 2000 });
    expect(screen.getByTestId('preset-most-loved').classList).toContain('border-brand');
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
    // The URL's Newest preset wins — the read is chronological (recency-only).
    const firstCall = (data.readFeedPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.knobState).toMatchObject({ recency: 5, likes: 0 });
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
