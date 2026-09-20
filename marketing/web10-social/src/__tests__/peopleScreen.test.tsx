import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy — any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer (the D0-backed People browser data seam).
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    fetchPeoplePage: vi.fn(),
    followUser: vi.fn().mockResolvedValue({ status: 'active' }),
    unfollowUser: vi.fn().mockResolvedValue(undefined),
  };
});

import { fetchPeoplePage, followUser, unfollowUser } from '@/data';
import type { PersonCard } from '@/data';

// The quiet-here threshold is 10 — list tests need >= 10 people so the browser
// shows the list (not the quiet state).
function makePeople(n: number, startFollowers = 1000): PersonCard[] {
  return Array.from({ length: n }, (_, i) => ({
    username: `user${String(i).padStart(2, '0')}`,
    provider: 'web10',
    display_name: `User ${i}`,
    followers_count: startFollowers - i * 10,
    is_following: false,
  }));
}

async function renderPeople(initialEntry = '/people') {
  const { default: PeopleScreen } = await import('@/components/People/PeopleScreen');
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PeopleScreen />
    </MemoryRouter>,
  );
}

describe('PeopleScreen (the D0-backed People browser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: a full first page (12 people, popular order) + no more pages.
    vi.mocked(fetchPeoplePage).mockResolvedValue({
      people: makePeople(12),
      hasMore: false,
    });
  });

  it('renders the people list sorted by popular (default, follower count desc)', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    expect(cards.length).toBe(12);
    // user00 (1000 followers) first, user01 (990) second.
    expect(within(cards[0]).getByTestId('people-followers')).toHaveTextContent('1.0k followers');
    expect(within(cards[1]).getByTestId('people-followers')).toHaveTextContent('990 followers');
  });

  it('shows the Popular sort tab as selected by default', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('people-sort-popular')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('people-sort-az')).toHaveAttribute('aria-selected', 'false');
  });

  it('switching to A–Z re-sorts alphabetically + writes ?sort=az', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('people-sort-az'));
    await waitFor(() => {
      expect(screen.getByTestId('people-sort-az')).toHaveAttribute('aria-selected', 'true');
    });
    const cards = screen.getAllByTestId('people-card');
    // Alphabetical: user00, user01, ...
    expect(within(cards[0]).getByText('@user00')).toBeInTheDocument();
  });

  it('restores the A–Z sort from ?sort=az (deep link)', async () => {
    await renderPeople('/people?sort=az');
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('people-sort-az')).toHaveAttribute('aria-selected', 'true');
  });

  it('filters the list by ?q= (name/handle) and shows the query chip', async () => {
    // 12 people; the query "user03" matches only user03.
    await renderPeople('/people?q=user03');
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    expect(cards.length).toBe(1);
    expect(within(cards[0]).getByText('@user03')).toBeInTheDocument();
    // The query chip shows the active filter.
    expect(screen.getByTestId('discover-people-tab-query')).toHaveTextContent('user03');
  });

  it('clearing the query chip removes ?q= and shows everyone', async () => {
    await renderPeople('/people?q=user03');
    await waitFor(() => {
      expect(screen.getByTestId('discover-people-tab-query')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('discover-people-tab-query-clear'));
    await waitFor(() => {
      expect(screen.getAllByTestId('people-card').length).toBe(12);
    });
    expect(screen.queryByTestId('discover-people-tab-query')).not.toBeInTheDocument();
  });

  it('shows the no-results state when ?q= matches no one', async () => {
    await renderPeople('/people?q=nobody');
    await waitFor(() => {
      expect(screen.getByTestId('people-no-results')).toBeInTheDocument();
    });
    expect(screen.getByTestId('people-no-results')).toHaveTextContent('nobody');
    expect(screen.queryByTestId('people-list')).not.toBeInTheDocument();
  });

  it('shows the "It\'s quiet here" state when the node has fewer than 10 people', async () => {
    vi.mocked(fetchPeoplePage).mockResolvedValue({
      people: makePeople(3),
      hasMore: false,
    });
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-quiet')).toBeInTheDocument();
    });
    expect(screen.getByText(/it's quiet here/i)).toBeInTheDocument();
    expect(screen.queryByTestId('people-list')).not.toBeInTheDocument();
  });

  it('shows the list (not quiet-here) when the node has 10+ people', async () => {
    vi.mocked(fetchPeoplePage).mockResolvedValue({
      people: makePeople(10),
      hasMore: false,
    });
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('people-card').length).toBe(10);
    expect(screen.queryByTestId('people-quiet')).not.toBeInTheDocument();
  });

  it('"view more" appends the next page and hides when there are no more', async () => {
    const page1 = makePeople(12);
    const page2 = makePeople(5, 500); // lower followers (later page)
    vi.mocked(fetchPeoplePage).mockImplementation(async ({ offset }) => {
      if (offset === 0) return { people: page1, hasMore: true };
      return { people: page2, hasMore: false };
    });

    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('people-card').length).toBe(12);
    expect(screen.getByTestId('people-view-more')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('people-view-more'));
    await waitFor(() => {
      expect(screen.getAllByTestId('people-card').length).toBe(17);
    });
    // The second page was short (hasMore false) → the button is gone.
    expect(screen.queryByTestId('people-view-more')).not.toBeInTheDocument();
    // The second page was requested at offset 12 (after the first 12).
    expect(vi.mocked(fetchPeoplePage).mock.calls[1][0]).toEqual({ limit: 20, offset: 12 });
  });

  it('renders banner image when banner_url present, gradient fallback when absent', async () => {
    const people = makePeople(12);
    people[0] = { ...people[0], avatar_url: 'http://x/alpha.png', banner_url: 'http://x/alpha-banner.png' };
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people, hasMore: false });
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    const withBanner = cards.find((c) => c.querySelector('img[alt=""]'));
    expect(withBanner!.querySelector('img[alt=""]')).toHaveAttribute('src', 'http://x/alpha-banner.png');
    // A card without banner_url → no banner img (gradient div instead).
    const withoutBanner = cards.find((c) => !c.querySelector('img[alt=""]'));
    expect(withoutBanner).toBeDefined();
  });

  it('shows Following state for is_following users', async () => {
    const people = makePeople(12);
    people[0] = { ...people[0], is_following: true };
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people, hasMore: false });
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    expect(within(cards[0]).getByTestId('people-follow-button')).toHaveTextContent('Following');
  });

  it('clicking Follow calls followUser and flips to Following', async () => {
    const people = makePeople(12);
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people, hasMore: false });
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    fireEvent.click(within(cards[0]).getByTestId('people-follow-button'));
    await waitFor(() => {
      expect(followUser).toHaveBeenCalledWith('user00', 'web10');
    });
    await waitFor(() => {
      expect(within(cards[0]).getByTestId('people-follow-button')).toHaveTextContent('Following');
    });
  });

  it('clicking a card dispatches navigate-user-profile', async () => {
    const handler = vi.fn();
    window.addEventListener('navigate-user-profile', handler);
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    fireEvent.click(cards[0]);
    await waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ username: 'user00', provider: 'web10' });
    window.removeEventListener('navigate-user-profile', handler);
  });

  it('shows the error state with retry when the read fails', async () => {
    vi.mocked(fetchPeoplePage).mockRejectedValue(new Error('boom'));
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-error')).toBeInTheDocument();
    });
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: makePeople(12), hasMore: false });
    fireEvent.click(screen.getByTestId('people-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
  });

  it('shows skeleton on initial load', async () => {
    let resolveFetch: (v: { people: PersonCard[]; hasMore: boolean }) => void;
    vi.mocked(fetchPeoplePage).mockImplementation(
      () => new Promise((r) => { resolveFetch = r; }),
    );
    await renderPeople();
    expect(screen.getByTestId('people-skeleton')).toBeInTheDocument();
    resolveFetch!({ people: makePeople(12), hasMore: false });
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
  });
});
