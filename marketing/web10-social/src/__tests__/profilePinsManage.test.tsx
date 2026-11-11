import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';

// The v3 client's token (useMutationAuthority reads it directly — the house
// idiom, postLightboxDelete).
vi.mock('@/data/v3', async (original) => {
  const actual = await original<typeof import('@/data/v3')>();
  return { ...actual, getV3Client: () => ({ ...actual.getV3Client(), readToken: () => ({ username: 'testuser', provider: 'test.localhost' }) }) };
});

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer — the profile screen's reads + the pin seams.
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
    readPostById: vi.fn().mockResolvedValue(null),
    countReactions: vi.fn().mockResolvedValue(0),
    countComments: vi.fn().mockResolvedValue(0),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockResolvedValue(null),
    readProfile: vi.fn().mockResolvedValue({ _id: 'face-1', display_name: 'Me' }),
    saveProfile: vi.fn().mockImplementation(async (p: Record<string, unknown>) => p),
    savePinnedPostIds: vi.fn().mockImplementation(
      async (profile: Record<string, unknown>, ids: string[]) => ({ ...profile, pinned_post_ids: ids }),
    ),
    readMyPosts: vi.fn().mockResolvedValue([]),
    readPinnedPosts: vi.fn().mockResolvedValue([]),
    followUser: vi.fn().mockResolvedValue({ _id: 'follow-1', status: 'active' }),
    unfollowUser: vi.fn().mockResolvedValue(undefined),
    readFollow: vi.fn().mockResolvedValue(null),
    countFollows: vi.fn().mockResolvedValue(0),
    countFollowers: vi.fn().mockResolvedValue(0),
    countUserFollowing: vi.fn().mockResolvedValue(0),
    countUserFollowingReal: vi.fn().mockResolvedValue(0),
    readUserPublicPosts: vi.fn().mockResolvedValue([]),
    readUserPublicProfile: vi.fn().mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined }),
    readUserPublicCollections: vi.fn().mockResolvedValue(null),
    getMyCollections: vi.fn().mockResolvedValue([]),
    readReactions: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    readRepostCounts: vi.fn().mockResolvedValue({}),
    readMyRepostedIds: vi.fn().mockResolvedValue(new Set<string>()),
    readViewCounts: vi.fn().mockResolvedValue({}),
    readThreadComments: vi.fn().mockResolvedValue({ comments: [], nextCursor: null, likeCounts: {}, replyCounts: {} }),
    readThreadReplies: vi.fn().mockResolvedValue({ comments: [], nextCursor: null, likeCounts: {} }),
    createThreadComment: vi.fn().mockResolvedValue({ _id: 'c1' }),
    fetchSuggestedUsers: vi.fn().mockResolvedValue([]),
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
  { _id: 'pp-a', text: 'alpha', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 3600_000).toISOString() },
  { _id: 'pp-b', text: 'bravo', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { _id: 'pp-c', text: 'charlie', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
  { _id: 'pp-d', text: 'delta', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 4 * 3600_000).toISOString() },
];

function UrlProbe() {
  const { pathname } = useLocation();
  return <div data-testid="url-probe">{pathname}</div>;
}

async function renderManage() {
  const { default: ProfilePinsScreen } = await import('@/components/Bio/ProfilePinsScreen');
  return render(
    <MemoryRouter initialEntries={['/u/testuser/pins']}>
      <Routes>
        <Route path="/u/:username/pins" element={<ProfilePinsScreen />} />
        <Route path="/u/:username" element={<div data-testid="profile-fallback">the profile</div>} />
      </Routes>
      <UrlProbe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => [],
  });
  const data = await import('@/data');
  vi.mocked(data.readMyPosts).mockResolvedValue([...OWN_POSTS]);
  vi.mocked(data.readProfile).mockResolvedValue({ _id: 'face-1', display_name: 'Me', pinned_post_ids: ['pp-a', 'pp-c'] });
  vi.mocked(data.readPinnedPosts).mockResolvedValue([]);
  vi.mocked(data.savePinnedPostIds).mockImplementation(
    async (profile: Record<string, unknown>, ids: string[]) => ({ ...profile, pinned_post_ids: ids }),
  );
});

describe('The profile pin chip (the manage screen entry)', () => {
  async function renderProfileWithPins(pinned: string[] = ['pp-a', 'pp-c']) {
    const data = await import('@/data');
    vi.mocked(data.readProfile).mockResolvedValue({ _id: 'face-1', display_name: 'Me', pinned_post_ids: pinned });
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    return render(
      <MemoryRouter initialEntries={['/u/testuser']}>
        <Routes>
          <Route path="/u/:username/pins" element={<div data-testid="pins-screen-fallback">pins screen</div>} />
          <Route path="/u/:username" element={<UserProfileScreen username="testuser" provider="test.localhost" />} />
        </Routes>
        <UrlProbe />
      </MemoryRouter>,
    );
  }

  it('the owner with pins gets the chip + Manage; tapping it deep-links to /pins', async () => {
    await renderProfileWithPins();
    await waitFor(() => {
      expect(screen.getByTestId('profile-pins-chip')).toBeInTheDocument();
    });
    expect(screen.getByTestId('profile-pins-chip')).toHaveTextContent('Pinned · 2');
    fireEvent.click(screen.getByTestId('profile-pins-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('url-probe')).toHaveTextContent('/u/testuser/pins');
    });
  });

  it('the owner with NO pins gets no chip (nothing to manage)', async () => {
    await renderProfileWithPins([]);
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    expect(screen.queryByTestId('profile-pins-chip')).toBeNull();
  });

  it('a visitor never gets the chip (pin management is the owner surface)', async () => {
    const data = await import('@/data');
    vi.mocked(data.readUserProfile).mockResolvedValue({
      _id: 'nova-face',
      display_name: 'Nova',
      pinned_post_ids: ['vp-1'],
    });
    vi.mocked(data.readUserPublicProfile).mockResolvedValue({
      posts: [
        { _id: 'vp-1', text: 'their held-up post', author_username: 'nova', author_provider: 'test.localhost', created_at: new Date().toISOString() },
      ],
      avatarUrl: undefined,
      bannerUrl: undefined,
    });
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    render(
      <MemoryRouter initialEntries={['/u/nova']}>
        <UserProfileScreen username="nova" provider="test.localhost" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(1);
    });
    // The pin renders (the badge) but the manage chip does not.
    expect(screen.getByTestId('profile-post-cell-pin')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-pins-chip')).toBeNull();
  });
});

describe('The pinned posts manage screen (profile-pins.md, the reorder model)', () => {
  it('lists the pins in pin order with the up/down/unpin controls (ends disabled)', async () => {
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(2);
    });
    const items = screen.getAllByTestId('profile-pins-item');
    expect(items[0].textContent).toContain('alpha');
    expect(items[1].textContent).toContain('charlie');

    const ups = screen.getAllByTestId('profile-pins-up');
    const downs = screen.getAllByTestId('profile-pins-down');
    // alpha is the top slot (up disabled), charlie the bottom slot (down disabled).
    expect(ups[0]).toBeDisabled();
    expect(downs[1]).toBeDisabled();
    expect(ups[1]).toBeEnabled();
    expect(downs[0]).toBeEnabled();
  });

  it('moving a pin down reorders optimistically + persists the new pin order', async () => {
    const data = await import('@/data');
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(2);
    });

    // alpha (top) → down → charlie, alpha.
    fireEvent.click(screen.getAllByTestId('profile-pins-down')[0]);

    await waitFor(() => {
      const items = screen.getAllByTestId('profile-pins-item');
      expect(items[0].textContent).toContain('charlie');
      expect(items[1].textContent).toContain('alpha');
    });
    expect(data.savePinnedPostIds).toHaveBeenCalledWith(expect.anything(), ['pp-c', 'pp-a']);
  });

  it('moving a pin up does the same in the other direction', async () => {
    const data = await import('@/data');
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId('profile-pins-up')[1]);
    await waitFor(() => {
      expect(data.savePinnedPostIds).toHaveBeenCalledWith(expect.anything(), ['pp-c', 'pp-a']);
    });
  });

  it('a failed move rolls back (the order does not silently change)', async () => {
    const data = await import('@/data');
    vi.mocked(data.savePinnedPostIds).mockRejectedValueOnce(new Error('write failed'));
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(2);
    });

    fireEvent.click(screen.getAllByTestId('profile-pins-down')[0]);
    // After the rollback: the original order is back.
    await waitFor(() => {
      const items = screen.getAllByTestId('profile-pins-item');
      expect(items[0].textContent).toContain('alpha');
      expect(items[1].textContent).toContain('charlie');
    });
  });

  it('unpin removes the pin + persists (the add section fills in for it)', async () => {
    const data = await import('@/data');
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(2);
    });

    fireEvent.click(screen.getAllByTestId('profile-pins-unpin')[0]);

    await waitFor(() => {
      expect(data.savePinnedPostIds).toHaveBeenCalledWith(expect.anything(), ['pp-c']);
    });
    // One pin left; alpha is back in the add section.
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(1);
      expect(screen.getAllByTestId('profile-pins-addable').some((el) => el.textContent?.includes('alpha'))).toBe(true);
    });
  });

  it('adding a post appends it (the bottom slot) + persists', async () => {
    const data = await import('@/data');
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-add').length).toBe(2); // bravo + delta
    });

    const addButtons = screen.getAllByTestId('profile-pins-add');
    const bravoAdd = addButtons.find((el) => el.closest('[data-testid="profile-pins-addable"]')?.textContent?.includes('bravo'))!;
    fireEvent.click(bravoAdd);

    await waitFor(() => {
      expect(data.savePinnedPostIds).toHaveBeenCalledWith(expect.anything(), ['pp-a', 'pp-c', 'pp-b']);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(3);
      const items = screen.getAllByTestId('profile-pins-item');
      expect(items[2].textContent).toContain('bravo');
    });
  });

  it('the slots are full: the add section turns into the full-state copy (no dead buttons)', async () => {
    const data = await import('@/data');
    vi.mocked(data.readProfile).mockResolvedValue({ _id: 'face-1', display_name: 'Me', pinned_post_ids: ['pp-a', 'pp-c', 'pp-b'] });
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(3);
    });
    expect(screen.getByTestId('profile-pins-screen')).toHaveTextContent('All 3 slots are full');
    expect(screen.getByTestId('profile-pins-screen')).toHaveTextContent('Unpin one to hold up another');
    expect(screen.queryByTestId('profile-pins-add')).toBeNull();
  });

  it('no pins at all: the empty state points at the first pin (a story beat, not a gray void)', async () => {
    const data = await import('@/data');
    vi.mocked(data.readProfile).mockResolvedValue({ _id: 'face-1', display_name: 'Me' });
    await renderManage();
    await waitFor(() => {
      expect(screen.getByTestId('profile-pins-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('profile-pins-empty')).toHaveTextContent('Nothing pinned yet');
    expect(screen.getByTestId('profile-pins-empty')).toHaveTextContent('Pin to profile');
    // The add section is absent with nothing pinned (there is no ordered list to manage yet).
    expect(screen.queryByTestId('profile-pins-add')).toBeNull();
  });

  it('a pin older than the loaded page still lists (the gap read feeds the manage screen)', async () => {
    const data = await import('@/data');
    vi.mocked(data.readMyPosts).mockResolvedValue([OWN_POSTS[0], OWN_POSTS[3]]); // b + c off the page
    vi.mocked(data.readProfile).mockResolvedValue({ _id: 'face-1', display_name: 'Me', pinned_post_ids: ['pp-a', 'pp-b'] });
    vi.mocked(data.readPinnedPosts).mockResolvedValue([
      { _id: 'pp-b', text: 'bravo', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
    ]);
    await renderManage();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-pins-item').length).toBe(2);
    });
    expect(screen.getAllByTestId('profile-pins-item')[1].textContent).toContain('bravo');
    expect(data.readPinnedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ docIds: ['pp-b'], isOwn: true }),
    );
  });

  it('a visitor hitting /u/:username/pins gets bounced to the profile (the manage screen is owner-only)', async () => {
    const { default: ProfilePinsScreen } = await import('@/components/Bio/ProfilePinsScreen');
    render(
      <MemoryRouter initialEntries={['/u/nova/pins']}>
        <Routes>
          <Route path="/u/:username/pins" element={<ProfilePinsScreen />} />
          <Route path="/u/:username" element={<div data-testid="profile-fallback">the profile</div>} />
        </Routes>
        <UrlProbe />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('url-probe')).toHaveTextContent('/u/nova');
      expect(screen.getByTestId('profile-fallback')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('profile-pins-screen')).toBeNull();
  });
});
