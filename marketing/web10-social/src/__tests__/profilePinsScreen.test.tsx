import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// The v3 client's token (the useMutationAuthority hook reads it directly — the
// house idiom: patch readToken so the owner menus resolve, postLightboxDelete).
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
    // The pin write (savePinnedPostIds → saveProfile): echo the record back.
    saveProfile: vi.fn().mockImplementation(async (p: Record<string, unknown>) => p),
    savePinnedPostIds: vi.fn().mockImplementation(
      async (profile: Record<string, unknown>, ids: string[]) => ({ ...profile, pinned_post_ids: ids }),
    ),
    readMyPosts: vi.fn().mockResolvedValue([]),
    readPinnedPosts: vi.fn().mockResolvedValue([]),
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
    uploadCommentPhoto: vi.fn().mockResolvedValue({ _id: 'm1' }),
    updateComment: vi.fn().mockResolvedValue({}),
    deleteComment: vi.fn().mockResolvedValue(undefined),
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

// The owner's four posts (newest → oldest): a, b, c, d. The seed pins hold
// c + a up → the display order is c, a, b, d.
const OWN_POSTS = [
  { _id: 'pp-a', text: 'alpha', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 3600_000).toISOString() },
  { _id: 'pp-b', text: 'bravo', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { _id: 'pp-c', text: 'charlie', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
  { _id: 'pp-d', text: 'delta', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 4 * 3600_000).toISOString() },
];

async function renderOwnProfile(pinned: string[] = ['pp-c', 'pp-a'], posts = [...OWN_POSTS]) {
  const data = await import('@/data');
  vi.mocked(data.readProfile).mockResolvedValue({ _id: 'face-1', display_name: 'Me', pinned_post_ids: pinned });
  vi.mocked(data.readMyPosts).mockResolvedValue(posts);
  const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
  return render(
    <MemoryRouter initialEntries={['/u/testuser']}>
      <UserProfileScreen username="testuser" provider="test.localhost" />
    </MemoryRouter>,
  );
}

/** The grid cells' post texts, in DOM order (the wall's display order). */
function gridOrder() {
  return screen.getAllByTestId('profile-post-cell-text-title').map((el) => el.textContent);
}

/** Open the ⋯ menu on the feed card containing `text` (the owner's menu). */
function openCardMenu(text: string) {
  const card = screen.getAllByTestId('post-card').find((el) => el.textContent?.includes(text))!;
  fireEvent.click(card.querySelector('[data-testid="post-options-button"]')!);
}

beforeEach(async () => {
  vi.clearAllMocks();
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: () => [],
  });
  const data = await import('@/data');
  vi.mocked(data.readMyPosts).mockResolvedValue([]);
  vi.mocked(data.readUserPublicPosts).mockResolvedValue([]);
  vi.mocked(data.readReactions).mockResolvedValue([]);
  vi.mocked(data.countComments).mockResolvedValue(0);
  vi.mocked(data.countReactions).mockResolvedValue(0);
  vi.mocked(data.toggleReactionKind).mockResolvedValue('like');
  vi.mocked(data.readPinnedPosts).mockResolvedValue([]);
  vi.mocked(data.savePinnedPostIds).mockImplementation(
    async (profile: Record<string, unknown>, ids: string[]) => ({ ...profile, pinned_post_ids: ids }),
  );
});

describe('Profile pins — the grid (profile-pins.md)', () => {
  it('pinned posts render first (in pin order), each with the pin badge; the rest follow loaded', async () => {
    await renderOwnProfile();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    // c + a held up (pin order), then b + d (the loaded order).
    expect(gridOrder()).toEqual(['charlie', 'alpha', 'bravo', 'delta']);
    // Exactly the two pinned tiles wear the badge.
    expect(screen.getAllByTestId('profile-post-cell-pin').length).toBe(2);
    const cells = screen.getAllByTestId('profile-post-cell');
    expect(cells[0].querySelector('[data-testid="profile-post-cell-pin"]')).not.toBeNull();
    expect(cells[1].querySelector('[data-testid="profile-post-cell-pin"]')).not.toBeNull();
    expect(cells[2].querySelector('[data-testid="profile-post-cell-pin"]')).toBeNull();
    expect(cells[3].querySelector('[data-testid="profile-post-cell-pin"]')).toBeNull();
    // The stats count is the TOTAL (pinned posts are still posts).
    expect(screen.getByTestId('user-profile-stats')).toHaveTextContent('4');
  });

  it('a pin older than the first-50 page is fetched by exact id and held up (the gap read)', async () => {
    // a + c are NOT on the loaded page — the main read returned b + d only;
    // the gap read (seeded before the render) returns them both.
    const data = await import('@/data');
    vi.mocked(data.readPinnedPosts).mockResolvedValue([
      { _id: 'pp-c', text: 'charlie', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
      { _id: 'pp-a', text: 'alpha', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date(Date.now() - 3600_000).toISOString() },
    ]);
    await renderOwnProfile(['pp-c', 'pp-a'], [OWN_POSTS[1], OWN_POSTS[3]]);

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    expect(gridOrder()).toEqual(['charlie', 'alpha', 'bravo', 'delta']);
    // The gap read asked for exactly the missing ids, owner-scoped.
    expect(data.readPinnedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ docIds: ['pp-c', 'pp-a'], isOwn: true, username: 'testuser' }),
    );
  });
});

describe('Profile pins — the feed view', () => {
  it('pinned cards render first with the "Pinned" overline; the rest without', async () => {
    await renderOwnProfile();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    fireEvent.click(screen.getByTestId('profile-view-feed'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed')).toBeInTheDocument();
    });

    // The overline on exactly the two pinned cards.
    expect(screen.getAllByTestId('profile-feed-pinned-label').length).toBe(2);
    expect(screen.getAllByTestId('profile-feed-pinned-label')[0]).toHaveTextContent('Pinned');
    const cards = screen.getAllByTestId('post-card');
    expect(cards.length).toBe(4);
    expect(cards[0].textContent).toContain('charlie');
    expect(cards[1].textContent).toContain('alpha');
    expect(cards[2].textContent).toContain('bravo');
    expect(cards[3].textContent).toContain('delta');
  });

  it('pin from the card ⋯ menu: optimistic re-order + the face-doc write (append = bottom slot)', async () => {
    const data = await import('@/data');
    await renderOwnProfile();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    fireEvent.click(screen.getByTestId('profile-view-feed'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed')).toBeInTheDocument();
    });

    // Pin 'delta' (the last, unpinned post).
    openCardMenu('delta');
    const pinItem = screen.getByTestId('post-option-pin');
    expect(pinItem).toHaveTextContent('Pin to profile');
    fireEvent.click(pinItem);

    // The write lands on the face doc with the appended id (pin order = c, a, d).
    await waitFor(() => {
      expect(data.savePinnedPostIds).toHaveBeenCalledWith(
        expect.anything(),
        ['pp-c', 'pp-a', 'pp-d'],
      );
    });
    // Optimistic re-order: delta jumps to the pinned block (before bravo).
    await waitFor(() => {
      const cards = screen.getAllByTestId('post-card');
      expect(cards[0].textContent).toContain('charlie');
      expect(cards[1].textContent).toContain('alpha');
      expect(cards[2].textContent).toContain('delta');
      expect(cards[3].textContent).toContain('bravo');
    });
    expect(screen.getAllByTestId('profile-feed-pinned-label').length).toBe(3);
    // The item flipped to unpin.
    openCardMenu('delta');
    expect(screen.getByTestId('post-option-unpin')).toHaveTextContent('Unpin from profile');
    fireEvent.click(screen.getByTestId('post-option-unpin'));
    await waitFor(() => {
      expect(data.savePinnedPostIds).toHaveBeenCalledWith(
        expect.anything(),
        ['pp-c', 'pp-a'],
      );
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-feed-pinned-label').length).toBe(2);
    });
  });

  it('a failed pin write rolls back (the wall re-orders back, no silent state)', async () => {
    const data = await import('@/data');
    vi.mocked(data.savePinnedPostIds).mockRejectedValueOnce(new Error('write failed'));
    await renderOwnProfile();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    fireEvent.click(screen.getByTestId('profile-view-feed'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed')).toBeInTheDocument();
    });

    openCardMenu('delta');
    fireEvent.click(screen.getByTestId('post-option-pin'));

    // The write failed — the optimistic pin is rolled back: delta stays last,
    // no overline on it, and the pin item is offered again (not "unpin").
    await waitFor(() => {
      const cards = screen.getAllByTestId('post-card');
      expect(cards[3].textContent).toContain('delta');
      expect(cards[2].textContent).toContain('bravo');
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-feed-pinned-label').length).toBe(2);
    });
    openCardMenu('delta');
    expect(screen.getByTestId('post-option-pin')).toBeInTheDocument();
    expect(screen.queryByTestId('post-option-unpin')).toBeNull();
  });

  it('the slots are full: no pin item on the unpinned post, unpin stays on the pinned ones', async () => {
    await renderOwnProfile(['pp-a', 'pp-b', 'pp-c']);
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    expect(gridOrder()).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    fireEvent.click(screen.getByTestId('profile-view-feed'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-feed')).toBeInTheDocument();
    });

    openCardMenu('delta');
    expect(screen.queryByTestId('post-option-pin')).toBeNull();
    expect(screen.queryByTestId('post-option-unpin')).toBeNull();

    openCardMenu('alpha');
    expect(screen.getByTestId('post-option-unpin')).toBeInTheDocument();
  });
});

describe('Profile pins — the lightbox (the profile grid post-detail menu)', () => {
  it('a pinned post offers "Unpin from profile" in its ⋯ menu; the toggle flips the item', async () => {
    const data = await import('@/data');
    await renderOwnProfile();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    // Open the first tile (charlie — the top pinned post).
    fireEvent.click(screen.getAllByTestId('profile-post-cell')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('post-lightbox')).toBeInTheDocument();
    });

    // The post-detail ⋯ menu (the shared PostIdentityRow's).
    fireEvent.click(screen.getByTestId('post-options-button'));
    const unpin = screen.getByTestId('post-option-unpin');
    expect(unpin).toHaveTextContent('Unpin from profile');
    expect(screen.queryByTestId('post-option-pin')).toBeNull();
    fireEvent.click(unpin);

    await waitFor(() => {
      expect(data.savePinnedPostIds).toHaveBeenCalledWith(
        expect.anything(),
        ['pp-a'],
      );
    });
    // The item flips back to pin (the lightbox stays open on the same post).
    fireEvent.click(screen.getByTestId('post-options-button'));
    expect(screen.getByTestId('post-option-pin')).toHaveTextContent('Pin to profile');
    expect(screen.queryByTestId('post-option-unpin')).toBeNull();
  });
});

describe('Profile pins — the visitor path (I3: pins are pointers, not grants)', () => {
  async function renderVisitorProfile() {
    const data = await import('@/data');
    // The owner's face is public and pins two posts: one public (on the main
    // read) + one private (absent from the main read; the gap read returns
    // nothing for it — I3).
    vi.mocked(data.readUserProfile).mockResolvedValue({
      _id: 'nova-face',
      display_name: 'Nova',
      pinned_post_ids: ['vp-pub', 'vp-private'],
    });
    vi.mocked(data.readUserPublicProfile).mockResolvedValue({
      posts: [
        { _id: 'vp-2', text: 'their other post', author_username: 'nova', author_provider: 'test.localhost', created_at: new Date(Date.now() - 3600_000).toISOString() },
      ],
      avatarUrl: undefined,
      bannerUrl: undefined,
    });
    vi.mocked(data.readPinnedPosts).mockResolvedValue([
      { _id: 'vp-pub', text: 'the held-up post', author_username: 'nova', author_provider: 'test.localhost', created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
    ]);
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    return render(
      <MemoryRouter initialEntries={['/u/nova']}>
        <UserProfileScreen username="nova" provider="test.localhost" />
      </MemoryRouter>,
    );
  }

  it('the readable pin is held up with its badge; the unreadable pin renders nowhere; the visitor never writes', async () => {
    await renderVisitorProfile();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(2);
    });
    // vp-pub (the readable pin) first, with the badge; vp-private is absent.
    expect(gridOrder()).toEqual(['the held-up post', 'their other post']);
    const cells = screen.getAllByTestId('profile-post-cell');
    expect(cells[0].querySelector('[data-testid="profile-post-cell-pin"]')).not.toBeNull();
    expect(cells[1].querySelector('[data-testid="profile-post-cell-pin"]')).toBeNull();
    // The gap read was visitor-scoped (followers + discover, not the owner's
    // groups) and asked for BOTH missing ids (vp-pub wasn't on the main read).
    const data = await import('@/data');
    expect(data.readPinnedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ docIds: ['vp-pub', 'vp-private'], isOwn: false, username: 'nova' }),
    );
    // No self-heal write from a visitor (their missing pin may be private, not dead).
    expect(data.savePinnedPostIds).not.toHaveBeenCalled();
  });
});

describe('Profile pins — the owner self-heal (dead pins leave the face doc)', () => {
  it('a dead pin (the gap read succeeded, the row did not) is cleaned off the doc best-effort', async () => {
    const data = await import('@/data');
    // 'pp-dead' is not on the page and the gap read succeeds with no rows.
    await renderOwnProfile(['pp-c', 'pp-dead']);
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    expect(gridOrder()).toEqual(['charlie', 'alpha', 'bravo', 'delta']);
    await waitFor(() => {
      expect(data.savePinnedPostIds).toHaveBeenCalledWith(
        expect.anything(),
        ['pp-c'],
      );
    });
  });

  it('a FAILED gap read (null) never triggers the heal (unknown ≠ dead)', async () => {
    const data = await import('@/data');
    vi.mocked(data.readPinnedPosts).mockResolvedValue(null as never);
    await renderOwnProfile(['pp-c', 'pp-dead']);
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell').length).toBe(4);
    });
    // The dead id renders nowhere...
    expect(gridOrder()).toEqual(['charlie', 'alpha', 'bravo', 'delta']);
    // ...but the doc is not rewritten (the read was unknown, not a verdict).
    await new Promise((r) => setTimeout(r, 50));
    expect(data.savePinnedPostIds).not.toHaveBeenCalled();
  });
});
