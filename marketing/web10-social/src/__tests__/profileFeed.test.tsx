import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
    getFeedGroups: vi.fn().mockResolvedValue([]),
    readFeedPage: vi.fn().mockResolvedValue({ posts: [], has_more: false, next_cursor: null }),
    readFeedEngagement: vi.fn().mockResolvedValue({ likes: {}, comments: {} }),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readPost: vi.fn().mockResolvedValue(null),
    countReactions: vi.fn().mockResolvedValue(0),
    countComments: vi.fn().mockResolvedValue(0),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockImplementation((username: string) =>
      Promise.resolve({ display_name: 'Test User', username }),
    ),
    readProfile: vi.fn().mockResolvedValue({ display_name: 'Me' }),
    saveProfile: vi.fn().mockResolvedValue({}),
    readMyPosts: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/img.png' }),
    createPost: vi.fn().mockResolvedValue({ _id: 'post-1' }),
    listConversations: vi.fn().mockResolvedValue([]),
    readDms: vi.fn().mockResolvedValue([]),
    sendDm: vi.fn().mockResolvedValue({}),
    getLastDm: vi.fn().mockResolvedValue(null),
    readContacts: vi.fn().mockResolvedValue([]),
    followUser: vi.fn().mockResolvedValue({ _id: 'follow-1', status: 'active' }),
    unfollowUser: vi.fn().mockResolvedValue(undefined),
    readFollow: vi.fn().mockResolvedValue(null),
    countFollows: vi.fn().mockResolvedValue(0),
    countFollowers: vi.fn().mockResolvedValue(0),
    countUserFollowing: vi.fn().mockResolvedValue(0),
    readUserPublicPosts: vi.fn().mockResolvedValue([]),
    readReactions: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    readFollows: vi.fn().mockResolvedValue([]),
    fetchSuggestedUsers: vi.fn().mockResolvedValue([]),
    fetchDiscoveryPost: vi.fn().mockResolvedValue(null),
    countStagingPosts: vi.fn().mockResolvedValue(0),
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
  buildSocialServiceSirs: vi.fn().mockReturnValue([]),
  clearReadUrlCache: vi.fn(),
  deriveObjectKey: vi.fn().mockReturnValue(''),
  buildReactionTarget: vi.fn(),
  buildCommentTarget: vi.fn(),
  recordRepost: vi.fn(),
  fanOutToFollowers: vi.fn(),
  readPullFeed: vi.fn().mockResolvedValue([]),
  readUserPostsFromDiscovery: vi.fn().mockResolvedValue([]),
  updateFollowNotify: vi.fn(),
}));

globalThis.fetch = vi.fn();

const OWN_POSTS = [
  { _id: 'pf-1', text: 'first post', created_at: new Date(Date.now() - 3600_000).toISOString() },
  { _id: 'pf-2', text: 'second post', created_at: new Date().toISOString() },
];

function UrlProbe() {
  const { search } = useLocation();
  return <div data-testid="url-probe">{search}</div>;
}

async function renderOwnProfile(entry = '/u/testuser') {
  const { readMyPosts } = await import('@/data');
  vi.mocked(readMyPosts).mockResolvedValue([...OWN_POSTS]);
  const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <UserProfileScreen username="testuser" provider="test.localhost" />
      <UrlProbe />
    </MemoryRouter>,
  );
}

describe('Profile posts view lens (grid | feed)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => [],
    });
    // Re-assert the module-level mock defaults: a test's mockResolvedValue
    // override persists across tests (clearAllMocks clears calls, not
    // implementations), and a leaked readReactions seed (an already-liked
    // post) flips the next test's like-toggle expectation.
    const data = await import('@/data');
    vi.mocked(data.readMyPosts).mockResolvedValue([]);
    vi.mocked(data.readUserPublicPosts).mockResolvedValue([]);
    vi.mocked(data.readReactions).mockResolvedValue([]);
    vi.mocked(data.countComments).mockResolvedValue(0);
    vi.mocked(data.countReactions).mockResolvedValue(0);
    vi.mocked(data.toggleReactionKind).mockResolvedValue('like');
  });

  it('defaults to the insta-shaped grid (the toggle is on the posts tab)', async () => {
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });
    // The toggle renders on the posts tab; grid is the selected lens.
    expect(screen.getByTestId('profile-view-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('profile-view-grid')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('profile-view-feed')).toHaveAttribute('aria-selected', 'false');
    // No feed cards in the default view.
    expect(screen.queryByTestId('profile-feed')).not.toBeInTheDocument();
  });

  it('switching to the feed view renders the facebook-shaped card stream', async () => {
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });

    fireEvent.click(screen.getByTestId('profile-view-feed'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-feed')).toBeInTheDocument();
    });
    // Both posts render as full cards (text visible, not a 3-col grid).
    const cards = screen.getAllByTestId('post-card');
    expect(cards.length).toBe(2);
    expect(screen.getByText('first post')).toBeInTheDocument();
    expect(screen.getByText('second post')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-post-cell')).not.toBeInTheDocument();
    // The feed lens is now selected.
    expect(screen.getByTestId('profile-view-feed')).toHaveAttribute('aria-selected', 'true');
    // Flush the per-post engagement reads (they land async).
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed-engagement-ready')).toBeVisible();
    });
  });

  it('deep-links the view (?view=feed restores the feed view; switching back cleans the URL)', async () => {
    await renderOwnProfile('/u/testuser?view=feed');

    // ?view=feed restores the feed view on load (refresh-safe, shareable).
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed')).toBeInTheDocument();
    });
    expect(screen.getByTestId('url-probe')).toHaveTextContent('view=feed');
    expect(screen.getByTestId('profile-view-feed')).toHaveAttribute('aria-selected', 'true');

    // Switching back to the grid drops the param (the default is the bare URL).
    fireEvent.click(screen.getByTestId('profile-view-grid'));
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('url-probe')).not.toHaveTextContent('view=');
    });

    // And the feed lens puts it back.
    fireEvent.click(screen.getByTestId('profile-view-feed'));
    await waitFor(() => {
      expect(screen.getByTestId('url-probe')).toHaveTextContent('view=feed');
    });
    // Flush the per-post engagement reads (they land async).
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed-engagement-ready')).toBeVisible();
    });
  });

  it('the media tab hides the view toggle (the lens is a posts-tab concept)', async () => {
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getByTestId('profile-view-toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('profile-tab-media'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-tab-media')).toHaveAttribute('aria-current', 'true');
    });
    expect(screen.queryByTestId('profile-view-toggle')).not.toBeInTheDocument();
  });

  it('a feed card shows the post author, timestamp, and the shared engagement bar', async () => {
    const { readReactions, countComments } = await import('@/data');
    vi.mocked(readReactions).mockResolvedValue([
      { _id: 'r-1', type: 'like', author_username: 'someone', author_provider: 'test.localhost', target_service: 'posts', target_id: 'pf-1', created_at: new Date().toISOString() },
      { _id: 'r-2', type: 'like', author_username: 'testuser', author_provider: 'test.localhost', target_service: 'posts', target_id: 'pf-1', created_at: new Date().toISOString() },
    ]);
    vi.mocked(countComments).mockResolvedValue(3);

    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });
    fireEvent.click(screen.getByTestId('profile-view-feed'));

    // The engagement read lands: the like count (2) + the reader's own like
    // (filled heart) render on the card. The like count rides the prop
    // directly (no local state), so it is stable once the read lands.
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed-engagement-ready')).toBeVisible();
    });
    const card = screen.getAllByTestId('post-card')[0];
    const likeButton = card.querySelector('[data-testid="like-button"]');
    expect(likeButton).not.toBeNull();
    expect(likeButton).toHaveAttribute('aria-pressed', 'true');
    expect(likeButton).toHaveTextContent('2');
    // The comment count re-seeds through PostActions' local state (a passive
    // effect) — wait for that flush, it lands a tick after the read.
    const commentButton = card.querySelector('[data-testid="comment-button"]');
    await waitFor(() => {
      expect(commentButton).toHaveTextContent('3');
    });
  });

  it('liking from the profile feed calls toggleReactionKind optimistically', async () => {
    const { toggleReactionKind } = await import('@/data');
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });
    fireEvent.click(screen.getByTestId('profile-view-feed'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-feed-engagement-ready')).toBeVisible();
    });
    const card = screen.getAllByTestId('post-card')[0];
    const likeButton = card.querySelector('[data-testid="like-button"]')!;
    fireEvent.click(likeButton);

    await waitFor(() => {
      expect(toggleReactionKind).toHaveBeenCalledWith('pf-1', 'like');
    });
    // Optimistic: the heart fills + the count bumps before the write resolves.
    // Re-query each poll — the heart-burst re-keys the button when the like
    // lands, which detaches any captured reference.
    await waitFor(() => {
      expect(card.querySelector('[data-testid="like-button"]')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('a reaction-read failure degrades that card to zero, never the view', async () => {
    const { readReactions } = await import('@/data');
    vi.mocked(readReactions).mockImplementation((id: string) =>
      id === 'pf-1' ? Promise.reject(new Error('boom')) : Promise.resolve([]),
    );

    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });
    fireEvent.click(screen.getByTestId('profile-view-feed'));

    // Both cards still render (the failed read degrades pf-1's counts only).
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed-engagement-ready')).toBeVisible();
    });
    expect(screen.getAllByTestId('post-card').length).toBe(2);
  });

  it('the feed view on someone else\'s profile shows no owner menu (not their posts to edit)', async () => {
    const { readUserPublicPosts } = await import('@/data');
    vi.mocked(readUserPublicPosts).mockResolvedValue([
      { _id: 'vp-1', text: 'their post', author_username: 'nova', author_provider: 'test.localhost', created_at: new Date().toISOString() },
    ]);

    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    render(
      <MemoryRouter initialEntries={['/u/nova?view=feed']}>
        <UserProfileScreen username="nova" provider="test.localhost" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-feed')).toBeInTheDocument();
    });
    const card = screen.getByTestId('post-card');
    expect(card).toHaveTextContent('their post');
    // Not the owner's profile → no kebab menu on the card.
    expect(card.querySelector('[data-testid="post-options-button"]')).toBeNull();
    // Flush the per-post engagement reads (they land async).
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed-engagement-ready')).toBeVisible();
    });
  });
});
