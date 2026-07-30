import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    readPost: vi.fn().mockResolvedValue(null),
    countReactions: vi.fn().mockResolvedValue(0),
    countComments: vi.fn().mockResolvedValue(0),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockImplementation((username: string) =>
      Promise.resolve({
        display_name: username === 'noodle-empress' ? 'Noodle Empress' : 'Test User',
        username,
      }),
    ),
    readProfile: vi.fn().mockResolvedValue({
      display_name: 'Me',
    }),
    saveProfile: vi.fn().mockResolvedValue({}),
    readMyPosts: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/img.png' }),
    createPost: vi.fn().mockResolvedValue({ _id: 'post-1' }),
    listConversations: vi.fn().mockResolvedValue([]),
    readDms: vi.fn().mockResolvedValue([]),
    sendDm: vi.fn().mockResolvedValue({}),
    getLastDm: vi.fn().mockResolvedValue(null),
    readContacts: vi.fn().mockResolvedValue([]),
    followUser: vi.fn().mockResolvedValue({
      _id: 'follow-1',
      username: 'noodle-empress',
      provider: 'test.localhost',
      status: 'active',
    }),
    unfollowUser: vi.fn().mockResolvedValue(undefined),
    readFollow: vi.fn().mockResolvedValue(null),
    countFollows: vi.fn().mockResolvedValue(0),
    readFollows: vi.fn().mockResolvedValue([]),
    fetchSuggestedUsers: vi.fn().mockResolvedValue([
      {
        username: 'noodle-empress',
        provider: 'test.localhost',
        display_name: 'Noodle Empress',
        bio: 'Food blogger and recipe creator',
        followers_count: 1234,
        posts_count: 56,
      },
      {
        username: 'solar-flare-69',
        provider: 'test.localhost',
        display_name: 'Solar Flare',
        bio: 'Space enthusiast',
        followers_count: 567,
        posts_count: 23,
      },
    ]),
    fetchDiscoveryPost: vi.fn().mockResolvedValue(null),
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
  createWapiWrapper: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
    isSignedIn: vi.fn().mockReturnValue(false),
    signOut: vi.fn(),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
  }),
  resetWapi: vi.fn(),
}));

// Mock web10-npm
vi.mock('web10-npm', () => ({
  wapiInit: vi.fn().mockReturnValue({
    isSignedIn: vi.fn().mockReturnValue(false),
    authListen: vi.fn(),
    openAuthPortal: vi.fn(),
    signOut: vi.fn(),
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
    SMROnReady: vi.fn(),
  }),
}));

// Mock fetch for discovery API calls
globalThis.fetch = vi.fn();

describe('Follow button -> followUser call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => [],
    });
  });

  it('clicking follow button on user profile calls followUser', async () => {
    const { followUser } = await import('@/data');
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');

    render(
      <MemoryRouter>
        <UserProfileScreen
          username="noodle-empress"
          provider="test.localhost"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('follow-button')).toBeInTheDocument();
    });

    // Button should show "Follow" when not following
    const followBtn = screen.getByTestId('follow-button');
    expect(followBtn.textContent).toContain('Follow');

    fireEvent.click(followBtn);

    await waitFor(() => {
      expect(followUser).toHaveBeenCalledWith('noodle-empress', 'test.localhost');
    });

    // After following, button should show "Following"
    await waitFor(() => {
      const btn = screen.getByTestId('follow-button');
      expect(btn.textContent).toContain('Following');
    });
  });

  it('clicking unfollow button on user profile calls unfollowUser', async () => {
    const { unfollowUser, readFollow } = await import('@/data');
    vi.mocked(readFollow).mockResolvedValueOnce({
      _id: 'follow-1',
      username: 'noodle-empress',
      provider: 'test.localhost',
      status: 'active',
    });

    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');

    render(
      <MemoryRouter>
        <UserProfileScreen
          username="noodle-empress"
          provider="test.localhost"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('follow-button')).toBeInTheDocument();
    });

    // Button should show "Following" when already following
    const unfollowBtn = screen.getByTestId('follow-button');
    expect(unfollowBtn.textContent).toContain('Following');

    fireEvent.click(unfollowBtn);

    await waitFor(() => {
      expect(unfollowUser).toHaveBeenCalledWith('noodle-empress', 'test.localhost');
    });

    // After unfollowing, button should show "Follow"
    await waitFor(() => {
      const btn = screen.getByTestId('follow-button');
      expect(btn.textContent).toContain('Follow');
    });
  });

  it('discover screen follow button calls followUser', async () => {
    const { followUser } = await import('@/data');
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');

    render(
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('discover-user-card').length).toBeGreaterThan(0);
    });

    // Find the follow button for the first user
    const followButtons = screen.getAllByTestId('discover-follow-button');
    expect(followButtons.length).toBeGreaterThan(0);

    fireEvent.click(followButtons[0]);

    await waitFor(() => {
      expect(followUser).toHaveBeenCalled();
    });
  });

  it('discover screen shows suggested users', async () => {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');

    render(
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const cards = screen.getAllByTestId('discover-user-card');
      expect(cards.length).toBeGreaterThan(0);
    });

    // Should show discover title
    expect(screen.getByText('Discover')).toBeInTheDocument();
  });
});

describe('UserProfileScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => [],
    });
  });

  it('renders user profile with follow button for other users', async () => {
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');

    render(
      <MemoryRouter>
        <UserProfileScreen
          username="noodle-empress"
          provider="test.localhost"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Noodle Empress')).toBeInTheDocument();
    });

    // Should show follow button for other users
    expect(screen.getByTestId('follow-button')).toBeInTheDocument();
  });

  it('renders profile tabs', async () => {
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');

    render(
      <MemoryRouter>
        <UserProfileScreen
          username="noodle-empress"
          provider="test.localhost"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-tab-posts')).toBeInTheDocument();
      expect(screen.getByTestId('profile-tab-media')).toBeInTheDocument();
    });
  });
});

describe('DiscoverScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => [],
    });
  });

  it('renders discover header', async () => {
    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');

    render(
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Discover')).toBeInTheDocument();
    });
  });

  it('renders empty state when no suggestions', async () => {
    const { fetchSuggestedUsers } = await import('@/data');
    vi.mocked(fetchSuggestedUsers).mockResolvedValueOnce([]);

    const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');

    render(
      <MemoryRouter initialEntries={['/discover']}>
        <DiscoverScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('discover-empty')).toBeInTheDocument();
    });
  });
});

describe('FeedScreen author navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes onAuthorClick to PostCard and calls it on author click', async () => {
    const { readFeed, readProfile, readUserProfile, readMyPosts, resolveMediaRefs, countReactions, countComments } = await import('@/data');

    vi.mocked(readFeed).mockResolvedValueOnce([{
      _id: 'inbox-1',
      author_username: 'noodle-empress',
      author_provider: 'test.localhost',
      post_id: 'post-1',
      delivered_at: new Date().toISOString(),
      post_body: {
        _id: 'post-1',
        text: 'Hello world',
        created_at: new Date().toISOString(),
      },
    }]);
    vi.mocked(readProfile).mockResolvedValueOnce({ display_name: 'Me' });
    vi.mocked(readUserProfile).mockResolvedValueOnce({ display_name: 'Noodle Empress' });
    vi.mocked(readMyPosts).mockResolvedValueOnce([]);
    vi.mocked(resolveMediaRefs).mockResolvedValueOnce([]);
    vi.mocked(countReactions).mockResolvedValueOnce(0);
    vi.mocked(countComments).mockResolvedValueOnce(0);

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    const onAuthorClick = vi.fn();

    render(<FeedScreen onAuthorClick={onAuthorClick} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-author-link')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('post-author-link'));

    expect(onAuthorClick).toHaveBeenCalledWith('noodle-empress', 'test.localhost');
  });
});
