import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer — the D2 People browser's data source (fetchPeoplePage)
// + the follow handlers.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    fetchPeoplePage: vi.fn().mockResolvedValue([]),
    followUser: vi.fn().mockResolvedValue({ status: 'active' }),
    unfollowUser: vi.fn().mockResolvedValue({ status: 'inactive' }),
  };
});

function person(username: string, over: Partial<data.PersonCard> = {}): data.PersonCard {
  return {
    username,
    provider: 'api.localhost',
    display_name: username,
    followers_count: 0,
    mutuals: 0,
    is_following: false,
    ...over,
  };
}

// The "It's quiet here" state fires below 10 people — tests that need the list
// visible pad to 10+ with fillers so they exercise the list, not the quiet state.
function filler(n: number): data.PersonCard[] {
  return Array.from({ length: n }, (_, i) => person(`filler${i}`));
}

async function renderTab(initialPath = '/discover?tab=people', query = '') {
  const { default: DiscoverPeopleTab } = await import('@/components/Discover/DiscoverPeopleTab');
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <DiscoverPeopleTab query={query} />
    </MemoryRouter>,
  );
}

describe('DiscoverPeopleTab (D2 — the People browser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('shows the skeleton while the first page loads', async () => {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    await renderTab();
    expect(screen.getByTestId('discover-people-skeleton')).toBeInTheDocument();
  });

  it('shows the three sorts (Mutuals default, Popular, A–Z) and writes ?sort=', async () => {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([
      person('alpha', { mutuals: 1, followers_count: 10 }),
      person('beta', { mutuals: 5, followers_count: 5 }),
      ...filler(8),
    ]);
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-list')).toBeInTheDocument();
    });
    // Mutuals is the default (bare URL) — active, and the list is mutuals-sorted.
    expect(screen.getByTestId('discover-people-sort-mutuals')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('discover-people-sort-popular')).toHaveAttribute('aria-selected', 'false');
    // beta (5 mutuals) before alpha (1 mutuals); fillers (0) last.
    const cards = screen.getAllByTestId('people-card');
    expect(cards[0].textContent).toContain('beta');
    expect(cards[1].textContent).toContain('alpha');

    // Switch to Popular — alpha (10 followers) before beta (5).
    fireEvent.click(screen.getByTestId('discover-people-sort-popular'));
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-sort-popular')).toHaveAttribute('aria-selected', 'true');
    });
    const popularCards = screen.getAllByTestId('people-card');
    expect(popularCards[0].textContent).toContain('alpha');
    expect(popularCards[1].textContent).toContain('beta');

    // Switch to A–Z — alpha before beta.
    fireEvent.click(screen.getByTestId('discover-people-sort-az'));
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-sort-az')).toHaveAttribute('aria-selected', 'true');
    });
    const azCards = screen.getAllByTestId('people-card');
    expect(azCards[0].textContent).toContain('alpha');
    expect(azCards[1].textContent).toContain('beta');
  });

  it('restores the sort from ?sort= on initial render', async () => {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([
      person('alpha', { mutuals: 1, followers_count: 10 }),
      person('beta', { mutuals: 5, followers_count: 5 }),
      ...filler(8),
    ]);
    await renderTab('/discover?tab=people&sort=az');
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('discover-people-sort-az')).toHaveAttribute('aria-selected', 'true');
    // A–Z: alpha before beta.
    const cards = screen.getAllByTestId('people-card');
    expect(cards[0].textContent).toContain('alpha');
    expect(cards[1].textContent).toContain('beta');
  });

  it('filters by ?q= (name/handle) — the shell passes the query down', async () => {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([
      person('lofi-lisa', { display_name: 'Lofi Lisa' }),
      person('techno-tom', { display_name: 'Techno Tom' }),
      ...filler(8),
    ]);
    // The shell passes ?q=lofi down as the `query` prop.
    await renderTab('/discover?tab=people', 'lofi');
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-list')).toBeInTheDocument();
    });
    // Only the matching person (lofi-lisa) is shown.
    const cards = screen.getAllByTestId('people-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('lofi-lisa');
  });

  it('shows the no-results state when ?q= matches nothing', async () => {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([
      person('alice'),
      person('bob'),
      ...filler(8),
    ]);
    await renderTab('/discover?tab=people', 'zzz');
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-no-results')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('discover-people-list')).not.toBeInTheDocument();
  });

  it('shows "It\'s quiet here" when the node has fewer than ~10 public people', async () => {
    // 3 people (< 10) — a degenerate ranked list reads as broken.
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([
      person('alice'),
      person('bob'),
      person('carol'),
    ]);
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-quiet')).toBeInTheDocument();
    });
    expect(screen.getByText("It's quiet here")).toBeInTheDocument();
    expect(screen.queryByTestId('discover-people-list')).not.toBeInTheDocument();
  });

  it('shows the ranked list (not quiet) when there are 10+ people', async () => {
    const many = Array.from({ length: 12 }, (_, i) => person(`user${i}`));
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue(many);
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-list')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('discover-people-quiet')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('people-card')).toHaveLength(12);
  });

  it('"view more" appends the next D0 page', async () => {
    // First page: 3 people (< PAGE_SIZE 20, so isExhausted would be true — but
    // we model a non-exhausted node by returning a full page first).
    const page1 = Array.from({ length: 20 }, (_, i) => person(`user${i}`));
    const page2 = Array.from({ length: 5 }, (_, i) => person(`more${i}`));
    let call = 0;
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockImplementation(async (offset: number) => {
      call += 1;
      return offset === 0 ? page1 : page2;
    });
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-list')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('people-card')).toHaveLength(20);
    // "view more" is present (the first page was full, so not exhausted).
    const viewMore = screen.getByTestId('discover-people-view-more');
    fireEvent.click(viewMore);
    await waitFor(() => {
      expect(screen.getAllByTestId('people-card')).toHaveLength(25);
    });
    // The second page was fetched at offset 20.
    expect((data.fetchPeoplePage as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe(20);
    void call;
  });

  it('hides "view more" when the last page was short (exhausted)', async () => {
    // 3 people (< PAGE_SIZE 20) but ≥ 10 is false, so this would be quiet — to
    // test the exhausted logic in isolation, use 10 people (not quiet, but
    // < PAGE_SIZE → exhausted).
    const ten = Array.from({ length: 10 }, (_, i) => person(`user${i}`));
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue(ten);
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-list')).toBeInTheDocument();
    });
    // 10 people = not quiet (≥ 10), but < PAGE_SIZE → exhausted, no "view more".
    expect(screen.queryByTestId('discover-people-view-more')).not.toBeInTheDocument();
  });

  it('following a person flips the card to Following', async () => {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([
      person('alice', { is_following: false }),
      ...filler(9),
    ]);
    await renderTab();
    await waitFor(() => {
      expect(screen.getAllByTestId('people-card')).toHaveLength(10);
    });
    // Target alice's follow button specifically (10 cards, each with a button).
    const followBtn = screen.getByLabelText('Follow alice');
    expect(followBtn.textContent).toContain('Follow');
    fireEvent.click(followBtn);
    await waitFor(() => {
      expect(data.followUser).toHaveBeenCalledWith('alice', 'api.localhost');
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Unfollow alice').textContent).toContain('Following');
    });
  });

  it('shows the error state + retry when the D0 read fails', async () => {
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-error')).toBeInTheDocument();
    });
    // Retry re-fetches.
    (data.fetchPeoplePage as ReturnType<typeof vi.fn>).mockResolvedValue([
      person('alice'),
      ...filler(9),
    ]);
    fireEvent.click(screen.getByTestId('discover-people-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-list')).toBeInTheDocument();
    });
  });
});
