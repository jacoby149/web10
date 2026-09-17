import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy — any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    fetchPeople: vi.fn().mockResolvedValue([]),
    followUser: vi.fn().mockResolvedValue({ status: 'active' }),
    unfollowUser: vi.fn().mockResolvedValue(undefined),
  };
});

import { fetchPeople, followUser, unfollowUser } from '@/data';

const mockPeople = [
  {
    username: 'zeta', provider: 'web10', display_name: 'Zeta',
    mutuals: 2, followers_count: 100, is_following: false,
  },
  {
    username: 'alpha', provider: 'web10', display_name: 'Alpha',
    mutuals: 5, followers_count: 50, is_following: false,
    avatar_url: 'http://x/alpha.png', banner_url: 'http://x/alpha-banner.png',
  },
  {
    username: 'mid', provider: 'web10', display_name: 'Mid',
    mutuals: 2, followers_count: 200, is_following: true,
  },
];

async function renderPeople(initialEntry = '/people') {
  const { default: PeopleScreen } = await import('@/components/People/PeopleScreen');
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PeopleScreen />
    </MemoryRouter>,
  );
}

describe('PeopleScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPeople).mockResolvedValue(mockPeople as never);
  });

  it('renders the people list sorted by mutuals (default)', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    expect(cards.length).toBe(3);
    // alpha (5 mutuals) first, then mid (2, 200 followers) before zeta (2, 100)
    expect(within(cards[0]).getByTestId('people-mutuals')).toHaveTextContent('5 mutuals');
    expect(within(cards[1]).getByTestId('people-mutuals')).toHaveTextContent('2 mutuals');
    expect(within(cards[2]).getByTestId('people-mutuals')).toHaveTextContent('2 mutuals');
  });

  it('shows the mutuals default sort tab as selected', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('people-sort-mutuals')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('people-sort-popular')).toHaveAttribute('aria-selected', 'false');
  });

  it('switching to Popular re-sorts by followers_count', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('people-sort-popular'));
    await waitFor(() => {
      const cards = screen.getAllByTestId('people-card');
      // mid (200) > zeta (100) > alpha (50)
      expect(within(cards[0]).getByText('Mid')).toBeInTheDocument();
    });
    expect(screen.getByTestId('people-sort-popular')).toHaveAttribute('aria-selected', 'true');
  });

  it('restores the Popular sort from ?sort=popular (deep link)', async () => {
    await renderPeople('/people?sort=popular');
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('people-sort-popular')).toHaveAttribute('aria-selected', 'true');
    const cards = screen.getAllByTestId('people-card');
    expect(within(cards[0]).getByText('Mid')).toBeInTheDocument();
  });

  it('switching to A–Z sorts alphabetically', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('people-sort-az'));
    await waitFor(() => {
      const cards = screen.getAllByTestId('people-card');
      expect(within(cards[0]).getByText('Alpha')).toBeInTheDocument();
    });
  });

  it('renders banner image when banner_url present, gradient fallback when absent', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    // alpha has banner_url → img
    const alphaCard = cards.find((c) => within(c).queryByText('Alpha'));
    expect(alphaCard).toBeDefined();
    const img = alphaCard!.querySelector('img[alt=""]');
    expect(img).toHaveAttribute('src', 'http://x/alpha-banner.png');
    // zeta has no banner_url → no img (gradient div instead)
    const zetaCard = cards.find((c) => within(c).queryByText('Zeta'));
    expect(zetaCard!.querySelector('img[alt=""]')).toBeNull();
  });

  it('renders avatar image when avatar_url present, initial fallback when absent', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    // alpha has avatar_url → img with alt
    const alphaCard = cards.find((c) => within(c).queryByText('Alpha'));
    const avatarImg = alphaCard!.querySelector('img[alt="Alpha\'s profile picture"]');
    expect(avatarImg).toHaveAttribute('src', 'http://x/alpha.png');
    // zeta has no avatar_url → initial fallback "Z"
    const zetaCard = cards.find((c) => within(c).queryByText('Zeta'));
    expect(within(zetaCard!).getByText('Z')).toBeInTheDocument();
  });

  it('shows Following state for is_following users', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    const midCard = cards.find((c) => within(c).queryByText('Mid'));
    const followBtn = within(midCard!).getByTestId('people-follow-button');
    expect(followBtn).toHaveTextContent('Following');
  });

  it('clicking Follow calls followUser and flips to Following', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    const zetaCard = cards.find((c) => within(c).queryByText('Zeta'));
    fireEvent.click(within(zetaCard!).getByTestId('people-follow-button'));
    await waitFor(() => {
      expect(followUser).toHaveBeenCalledWith('zeta', 'web10');
    });
    await waitFor(() => {
      expect(within(zetaCard!).getByTestId('people-follow-button')).toHaveTextContent('Following');
    });
  });

  it('clicking Following calls unfollowUser and flips to Follow', async () => {
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('people-card');
    const midCard = cards.find((c) => within(c).queryByText('Mid'));
    fireEvent.click(within(midCard!).getByTestId('people-follow-button'));
    await waitFor(() => {
      expect(unfollowUser).toHaveBeenCalledWith('mid', 'web10');
    });
    await waitFor(() => {
      expect(within(midCard!).getByTestId('people-follow-button')).toHaveTextContent('Follow');
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
    const zetaCard = cards.find((c) => within(c).queryByText('Zeta'));
    fireEvent.click(zetaCard!);
    await waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ username: 'zeta', provider: 'web10' });
    window.removeEventListener('navigate-user-profile', handler);
  });

  it('shows the empty state with a Discover CTA when no people', async () => {
    vi.mocked(fetchPeople).mockResolvedValue([]);
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/no one to show yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('people-empty-cta'));
    // Navigation to /discover (no route in MemoryRouter, but the click fires)
  });

  it('shows the error state with retry when fetchPeople fails', async () => {
    vi.mocked(fetchPeople).mockRejectedValue(new Error('boom'));
    await renderPeople();
    await waitFor(() => {
      expect(screen.getByTestId('people-error')).toBeInTheDocument();
    });
    // Retry re-fires the read
    vi.mocked(fetchPeople).mockResolvedValue(mockPeople as never);
    fireEvent.click(screen.getByTestId('people-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
  });

  it('shows skeleton on initial load', async () => {
    let resolveFetch: (v: unknown[]) => void;
    vi.mocked(fetchPeople).mockImplementation(
      () => new Promise((r) => { resolveFetch = r as (v: unknown[]) => void; })
    );
    await renderPeople();
    expect(screen.getByTestId('people-skeleton')).toBeInTheDocument();
    resolveFetch!(mockPeople as never);
    await waitFor(() => {
      expect(screen.getByTestId('people-list')).toBeInTheDocument();
    });
  });
});
