import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    readUserPublicProfile: vi.fn().mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined }),
    readReactions: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    readFollows: vi.fn().mockResolvedValue([]),
    fetchSuggestedUsers: vi.fn().mockResolvedValue([]),
    fetchDiscoveryPost: vi.fn().mockResolvedValue(null),
    countStagingPosts: vi.fn().mockResolvedValue(0),
    readRepostCounts: vi.fn().mockResolvedValue({}),
    readMyRepostedIds: vi.fn().mockResolvedValue(new Set<string>()),
    getDiscoverGroupId: vi.fn().mockResolvedValue('discover-group'),
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
  { _id: 'pn-1', text: 'alpha post', created_at: new Date(Date.now() - 7200_000).toISOString() },
  { _id: 'pn-2', text: 'beta post', created_at: new Date(Date.now() - 3600_000).toISOString() },
  { _id: 'pn-3', text: 'gamma post', created_at: new Date().toISOString() },
];

async function renderOwnProfile() {
  const { readMyPosts } = await import('@/data');
  vi.mocked(readMyPosts).mockResolvedValue([...OWN_POSTS]);
  const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
  return render(
    <MemoryRouter initialEntries={['/u/testuser']}>
      <UserProfileScreen username="testuser" provider="test.localhost" />
    </MemoryRouter>,
  );
}

describe('Profile lightbox — Instagram-style post navigation (the side arrows step through the profile\'s posts)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => [],
    });
    const data = await import('@/data');
    vi.mocked(data.readMyPosts).mockResolvedValue([]);
    vi.mocked(data.readReactions).mockResolvedValue([]);
    vi.mocked(data.countComments).mockResolvedValue(0);
    vi.mocked(data.countReactions).mockResolvedValue(0);
    vi.mocked(data.toggleReactionKind).mockResolvedValue('like');
    vi.mocked(data.readRepostCounts).mockResolvedValue({});
    vi.mocked(data.readMyRepostedIds).mockResolvedValue(new Set<string>());
  });

  it('the lightbox shows prev/next post arrows when the profile has more than one post', async () => {
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(3);
    });
    fireEvent.click(screen.getAllByTestId('profile-post-cell')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });
    // The Instagram-style backdrop arrows render (outside the panel).
    expect(screen.getByTestId('post-lightbox-prev-post')).toBeInTheDocument();
    expect(screen.getByTestId('post-lightbox-next-post')).toBeInTheDocument();
    // The media-carousel arrows do NOT (this post has no media).
    expect(screen.queryByTestId('post-lightbox-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-lightbox-next')).not.toBeInTheDocument();
  });

  it('next steps to the next post; prev steps back (the modal swaps the post in place)', async () => {
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(3);
    });
    // Open the MIDDLE post.
    fireEvent.click(screen.getAllByTestId('profile-post-cell')[1]);
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('post-lightbox')).getByText('beta post')).toBeInTheDocument();

    // Next → the third post.
    fireEvent.click(screen.getByTestId('post-lightbox-next-post'));
    await waitFor(() => {
      expect(within(screen.getByTestId('post-lightbox')).getByText('gamma post')).toBeInTheDocument();
    });

    // Prev → back to the second.
    fireEvent.click(screen.getByTestId('post-lightbox-prev-post'));
    await waitFor(() => {
      expect(within(screen.getByTestId('post-lightbox')).getByText('beta post')).toBeInTheDocument();
    });
  });

  it('navigation wraps around (last → first, first → last)', async () => {
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(3);
    });
    // Open the LAST post.
    fireEvent.click(screen.getAllByTestId('profile-post-cell')[2]);
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('post-lightbox')).getByText('gamma post')).toBeInTheDocument();

    // Next wraps to the FIRST post.
    fireEvent.click(screen.getByTestId('post-lightbox-next-post'));
    await waitFor(() => {
      expect(within(screen.getByTestId('post-lightbox')).getByText('alpha post')).toBeInTheDocument();
    });

    // Prev wraps back to the LAST post.
    fireEvent.click(screen.getByTestId('post-lightbox-prev-post'));
    await waitFor(() => {
      expect(within(screen.getByTestId('post-lightbox')).getByText('gamma post')).toBeInTheDocument();
    });
  });

  it('a single-post profile shows no post-nav arrows (nothing to step through)', async () => {
    const { readMyPosts } = await import('@/data');
    vi.mocked(readMyPosts).mockResolvedValue([OWN_POSTS[0]]);
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    render(
      <MemoryRouter initialEntries={['/u/testuser']}>
        <UserProfileScreen username="testuser" provider="test.localhost" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(1);
    });
    fireEvent.click(screen.getByTestId('profile-post-cell'));
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('post-lightbox-prev-post')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-lightbox-next-post')).not.toBeInTheDocument();
  });

  it('ArrowRight / ArrowLeft step through the profile\'s posts (post nav owns the arrows)', async () => {
    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(3);
    });
    fireEvent.click(screen.getAllByTestId('profile-post-cell')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('post-lightbox')).getByText('alpha post')).toBeInTheDocument();

    // ArrowRight → the next post (not a media frame — this post has none).
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(within(screen.getByTestId('post-lightbox')).getByText('beta post')).toBeInTheDocument();
    });

    // ArrowLeft → back to the first.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(within(screen.getByTestId('post-lightbox')).getByText('alpha post')).toBeInTheDocument();
    });
  });

  it('the in-pane media carousel still pages a post\'s own frames (the post arrows are separate)', async () => {
    const { readMyPosts, resolveMediaRefs } = await import('@/data');
    const multiMediaPost = {
      _id: 'pn-multi',
      text: 'multi frame post',
      media_refs: [
        { doc_id: 'm-1' },
        { doc_id: 'm-2' },
      ],
      created_at: new Date().toISOString(),
    };
    vi.mocked(readMyPosts).mockResolvedValue([multiMediaPost]);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'm-1', url: 'http://test.com/1.png', mime_type: 'image/png', created_at: new Date().toISOString() },
      { _id: 'm-2', url: 'http://test.com/2.png', mime_type: 'image/png', created_at: new Date().toISOString() },
    ]);
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    render(
      <MemoryRouter initialEntries={['/u/testuser']}>
        <UserProfileScreen username="testuser" provider="test.localhost" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(1);
    });
    fireEvent.click(screen.getByTestId('profile-post-cell'));
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });

    // One post → no post-nav arrows; two frames → the in-pane carousel arrows.
    expect(screen.queryByTestId('post-lightbox-next-post')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-lightbox-next')).toBeInTheDocument();

    // The in-pane next pages to frame 2 of the SAME post.
    fireEvent.click(screen.getByTestId('post-lightbox-next'));
    await waitFor(() => {
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });
  });

  it('a multi-frame post on a multi-post profile shows ONLY the post-nav arrows (no double chevrons)', async () => {
    // The regression: a post with 2 frames opened from a profile with 2 posts
    // used to render BOTH the in-pane media arrows AND the backdrop post-nav
    // arrows — two chevrons per side at different heights. Post nav owns the
    // side arrows, so the in-pane media arrows must be suppressed (the frame
    // counter stays).
    const { readMyPosts, resolveMediaRefs } = await import('@/data');
    vi.mocked(readMyPosts).mockResolvedValue([
      {
        _id: 'pn-multi',
        text: 'multi frame post',
        media_refs: [{ doc_id: 'm-1' }, { doc_id: 'm-2' }],
        created_at: new Date().toISOString(),
      },
      { _id: 'pn-other', text: 'another post', created_at: new Date().toISOString() },
    ]);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'm-1', url: 'http://test.com/1.png', mime_type: 'image/png', created_at: new Date().toISOString() },
      { _id: 'm-2', url: 'http://test.com/2.png', mime_type: 'image/png', created_at: new Date().toISOString() },
    ]);
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    render(
      <MemoryRouter initialEntries={['/u/testuser']}>
        <UserProfileScreen username="testuser" provider="test.localhost" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId('profile-post-cell')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });

    // Two posts → post-nav arrows present (they own the side arrows).
    expect(screen.getByTestId('post-lightbox-prev-post')).toBeInTheDocument();
    expect(screen.getByTestId('post-lightbox-next-post')).toBeInTheDocument();
    // Two frames, but post nav is active → the in-pane media arrows are GONE
    // (no double chevrons). The frame counter still shows.
    expect(screen.queryByTestId('post-lightbox-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-lightbox-next')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('the media pane is a swipeable scroll-snap strip — swiping (scrolling the strip) pages the carousel', async () => {
    const { readMyPosts, resolveMediaRefs } = await import('@/data');
    const multiMediaPost = {
      _id: 'pn-swipe',
      text: 'swipe post',
      media_refs: [
        { doc_id: 's-1' },
        { doc_id: 's-2' },
        { doc_id: 's-3' },
      ],
      created_at: new Date().toISOString(),
    };
    vi.mocked(readMyPosts).mockResolvedValue([multiMediaPost]);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 's-1', url: 'http://test.com/1.png', mime_type: 'image/png', created_at: new Date().toISOString() },
      { _id: 's-2', url: 'http://test.com/2.png', mime_type: 'image/png', created_at: new Date().toISOString() },
      { _id: 's-3', url: 'http://test.com/3.png', mime_type: 'image/png', created_at: new Date().toISOString() },
    ]);
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    render(
      <MemoryRouter initialEntries={['/u/testuser']}>
        <UserProfileScreen username="testuser" provider="test.localhost" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(1);
    });
    fireEvent.click(screen.getByTestId('profile-post-cell'));
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });

    // The media pane is a scroll-snap strip carrying every frame (the swipe
    // mechanism — native scroll-snap, no dep).
    const strip = screen.getByTestId('post-lightbox-strip') as HTMLElement;
    expect(strip.className).toMatch(/snap-x/);
    expect(strip.className).toMatch(/snap-mandatory/);
    expect(strip.className).toMatch(/overflow-x-auto/);
    expect(screen.getByTestId('post-lightbox-media-0')).toBeInTheDocument();
    expect(screen.getByTestId('post-lightbox-media-1')).toBeInTheDocument();
    expect(screen.getByTestId('post-lightbox-media-2')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    // A swipe scrolls the strip; the onScroll handler keeps the indicator in
    // sync (the source of truth for the swipe). Simulate the strip settling on
    // frame 2 (scrollLeft = 1 frame wide).
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, value: 300 });
    fireEvent.scroll(strip);
    await waitFor(() => {
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    // Swipe back to frame 1.
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, value: 0 });
    fireEvent.scroll(strip);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });
});
