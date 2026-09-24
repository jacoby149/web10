import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom';

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
    readPullFeed: vi.fn().mockResolvedValue([]),
    getFeedGroups: vi.fn().mockResolvedValue([]),
    readFeedEngagement: vi.fn().mockResolvedValue({ likes: {}, comments: {} }),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readPost: vi.fn().mockResolvedValue(null),
    countReactions: vi.fn().mockResolvedValue(0),
    countComments: vi.fn().mockResolvedValue(0),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockResolvedValue(null),
    lookupUserProfile: vi.fn().mockResolvedValue(null),
    readProfile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue({}),
    readMyPosts: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/img.png' }),
    createPost: vi.fn().mockResolvedValue({ _id: 'post-1' }),
    listConversations: vi.fn().mockResolvedValue([]),
    readDms: vi.fn().mockResolvedValue([]),
    sendDm: vi.fn().mockResolvedValue({}),
    getLastDm: vi.fn().mockResolvedValue(null),
    readContacts: vi.fn().mockResolvedValue([]),
    readFollows: vi.fn().mockResolvedValue([]),
    startConversation: vi.fn().mockResolvedValue({ conversation: 'test.localhost/testuser--test.localhost/other', message: {} }),
    addContact: vi.fn().mockResolvedValue({}),
    conversationKey: vi.fn().mockReturnValue('test.localhost/testuser--test.localhost/other'),
    countStagingPosts: vi.fn().mockResolvedValue(0),
    // Group chat (group-chat.md, D77)
    getMyGroupChats: vi.fn().mockResolvedValue([]),
    readGroupChatFace: vi.fn().mockResolvedValue({ name: 'The Crew' }),
    readGroupChatMessages: vi.fn().mockResolvedValue([]),
    sendGroupChatMessage: vi.fn().mockResolvedValue({ _id: 'gm-1', message: '', sent_at: new Date().toISOString(), sender_username: 'testuser', sender_provider: 'test.localhost', recipient_username: '', recipient_provider: '' }),
    createGroupChat: vi.fn().mockResolvedValue('test.localhost/groups/users/testuser/chat-crew'),
    getGroupMembers: vi.fn().mockResolvedValue([]),
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

// (The old `vi.mock('web10-npm', ...)` block is gone with the v1 adapter —
// the screens' graph no longer imports the npm package at runtime. The D42
// auth seam lives in src/interfaces/auth and reads window.web10, which only
// App-level tests need to install.)

// Mock the ads-catalog data layer (the seam useNodeAdmin talks to) so the
// Layout's node-admin gate is controllable in tests.
const { checkNodeAdmin } = vi.hoisted(() => ({
  checkNodeAdmin: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/data/ads-catalog', () => ({
  checkNodeAdmin: (...a: unknown[]) => checkNodeAdmin(...a),
}));

describe('FeedScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state with subtle import link', async () => {
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Your feed will appear here/)).toBeInTheDocument();
    });
    expect(screen.getByText('import your existing posts')).toBeInTheDocument();
  });

  it('renders feed media at the natural aspect ratio (not a forced 1:1 crop)', async () => {
    const { readFeedPage } = await import('@/data');
    // The feed read carries the resolved media (with the real 16:9 dims) inline.
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        {
          _id: 'p1', text: 'a clip', author_username: 'testuser', author_provider: 'test.localhost',
          created_at: new Date().toISOString(),
          media_refs: [{ doc_id: 'm1', read_url: 'http://test.com/clip.mp4', mime_type: 'video/mp4', width: 1920, height: 1080 }],
        },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('media-video')).toBeInTheDocument();
    });
    // The container reserves the media's natural ratio (16:9 ≈ 1.7778),
    // not the old 1:1 fallback that cropped the clip into a square.
    const ar = parseFloat(screen.getByTestId('media-video').style.aspectRatio);
    expect(ar).toBeCloseTo(1920 / 1080, 5);
    // …and it never crops (object-contain, not object-cover).
    expect(screen.getByTestId('media-video').querySelector('video')?.className).toContain('object-contain');
  });

  it('falls back to a default ratio for legacy media with no stored dimensions', async () => {
    const { readFeedPage } = await import('@/data');
    // Legacy media: no width/height (jsdom won't fire onLoad, so the measure
    // fallback can't run — the default ratio is what's reserved).
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        {
          _id: 'p2', text: 'old pic', author_username: 'testuser', author_provider: 'test.localhost',
          created_at: new Date().toISOString(),
          media_refs: [{ doc_id: 'm2', read_url: 'http://test.com/old.png', mime_type: 'image/png' }],
        },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('media-image')).toBeInTheDocument();
    });
    const ar = parseFloat(screen.getByTestId('media-image').style.aspectRatio);
    expect(ar).toBeCloseTo(4 / 3, 5);
  });

  it('multi-media posts render an inline carousel with a position indicator (all items reachable)', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        {
          _id: 'p3', text: 'three pics', author_username: 'testuser', author_provider: 'test.localhost',
          created_at: new Date().toISOString(),
          media_refs: [
            { doc_id: 'a', read_url: 'http://test.com/a.png', mime_type: 'image/png', width: 800, height: 600 },
            { doc_id: 'b', read_url: 'http://test.com/b.png', mime_type: 'image/png', width: 800, height: 600 },
            { doc_id: 'c', read_url: 'http://test.com/c.png', mime_type: 'image/png', width: 800, height: 600 },
          ],
        },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    // All three items render in the carousel (the old dead count badge is gone).
    await waitFor(() => {
      expect(screen.getByTestId('media-carousel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('media-carousel-image-0')).toBeInTheDocument();
    expect(screen.getByTestId('media-carousel-image-1')).toBeInTheDocument();
    expect(screen.getByTestId('media-carousel-image-2')).toBeInTheDocument();
    // The position indicator shows 1/3 where the old "3" badge was.
    expect(screen.getByTestId('media-carousel-position')).toHaveTextContent('1/3');
  });

  it('tapping a video in the feed plays it inline and does NOT open the lightbox', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        {
          _id: 'pv1', text: 'a clip', author_username: 'someone', author_provider: 'test.localhost',
          created_at: new Date().toISOString(),
          media_refs: [{ doc_id: 'mv1', read_url: 'http://test.com/clip.mp4', mime_type: 'video/mp4', width: 1080, height: 1920 }],
        },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    const video = await screen.findByTestId('media-video');
    // The feed is a flat, inline surface — tapping the video toggles play/pause
    // in place and must never pop the lightbox modal (the old bug: the video
    // started playing behind the modal).
    expect(screen.queryByTestId('post-lightbox')).not.toBeInTheDocument();
    fireEvent.click(video);
    await waitFor(() => {
      expect(video).toHaveAttribute('aria-label', 'Pause video');
    });
    expect(screen.queryByTestId('post-lightbox')).not.toBeInTheDocument();
  });

  it('own posts expose an owner menu (share / edit / visibility / delete) instead of a lightbox', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        { _id: 'own1', text: 'my post', author_username: 'testuser', author_provider: 'test.localhost', visibility: 'public', created_at: new Date().toISOString() },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    const options = await screen.findByTestId('post-options-button');
    expect(screen.queryByTestId('post-lightbox')).not.toBeInTheDocument();
    fireEvent.click(options);
    await waitFor(() => {
      expect(screen.getByTestId('post-options-menu')).toBeInTheDocument();
    });
    expect(screen.getByTestId('post-option-share')).toBeInTheDocument();
    expect(screen.getByTestId('post-option-edit')).toBeInTheDocument();
    expect(screen.getByTestId('post-option-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('post-option-delete')).toBeInTheDocument();
    // The menu is a popover, not the lightbox modal.
    expect(screen.queryByTestId('post-lightbox')).not.toBeInTheDocument();
  });

  it('own posts expose the owner menu when author_provider is the v2 fallback (v3 author_key is a bare username)', async () => {
    // v3 writes author_key = the bare username, so extractProvider returns the
    // 'web10' fallback — which never equals the token's real provider. The
    // owner menu must key off the username alone (the regression: the provider
    // check hid the menu on every own post in the feed).
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        { _id: 'own2', text: 'my post (v3 author_key)', author_username: 'testuser', author_provider: 'web10', visibility: 'public', created_at: new Date().toISOString() },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    const options = await screen.findByTestId('post-options-button');
    fireEvent.click(options);
    await waitFor(() => {
      expect(screen.getByTestId('post-options-menu')).toBeInTheDocument();
    });
    expect(screen.getByTestId('post-option-edit')).toBeInTheDocument();
    expect(screen.getByTestId('post-option-delete')).toBeInTheDocument();
  });

  it('non-own posts have no owner menu (no lightbox, no options)', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        { _id: 'other1', text: 'their post', author_username: 'someone', author_provider: 'test.localhost', created_at: new Date().toISOString() },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('post-card')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('post-options-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-lightbox')).not.toBeInTheDocument();
  });

  it('the feed post card renders the reaction pair (like + dislike) and taps report to the data layer', async () => {
    const { readFeedPage, toggleReactionKind } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        { _id: 'p1', text: 'a post', author_username: 'someone', author_provider: 'test.localhost', created_at: new Date().toISOString(), likes: 3, comments: 1 },
      ],
      has_more: false, next_cursor: null,
    });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('post-card')).toBeInTheDocument();
    });
    // The reaction pair (post-actions.md): both the heart and the thumb render.
    expect(screen.getByTestId('like-button')).toBeInTheDocument();
    expect(screen.getByTestId('dislike-button')).toBeInTheDocument();
    // Tapping the thumb reports 'dislike' to the data layer (the mutual-exclusion
    // swap lives there, not in the surface).
    fireEvent.click(screen.getByTestId('dislike-button'));
    await waitFor(() => {
      expect(toggleReactionKind).toHaveBeenCalledWith('p1', 'dislike');
    });
  });

  it('infinite scroll: the sentinel loads the next page and appends (D69)', async () => {
    const { readFeedPage } = await import('@/data');
    // Page 1: two posts, has_more true + a cursor.
    vi.mocked(readFeedPage)
      .mockResolvedValueOnce({
        posts: [
          { _id: 'pg1-a', text: 'page one a', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date().toISOString() },
          { _id: 'pg1-b', text: 'page one b', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date().toISOString() },
        ],
        has_more: true,
        next_cursor: { created_at: '2026-09-07T09:00:00.000' },
      })
      // Page 2: two more posts, has_more false.
      .mockResolvedValueOnce({
        posts: [
          { _id: 'pg2-a', text: 'page two a', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date().toISOString() },
          { _id: 'pg2-b', text: 'page two b', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date().toISOString() },
        ],
        has_more: false,
        next_cursor: null,
      });
    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card')).toHaveLength(2);
    });

    // The sentinel is visible → the observer fires → loadMore appends page 2.
    (globalThis as unknown as Record<string, () => void>).fireIntersectionObservers();
    await waitFor(() => {
      expect(screen.getAllByTestId('post-card')).toHaveLength(4);
    });
    // The second page was fetched with page 1's cursor.
    expect(readFeedPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { created_at: '2026-09-07T09:00:00.000' } }),
    );
  });
});

describe('ProfileScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders full profile UI even when empty', async () => {
    const { default: ProfileScreen } = await import('@/components/Bio/ProfileScreen');
    render(
      <MemoryRouter>
        <ProfileScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Edit profile')).toBeInTheDocument();
    });
    expect(screen.getByTestId('profile-tab-posts')).toBeInTheDocument();
    expect(screen.getByTestId('profile-tab-media')).toBeInTheDocument();
  });
});

describe('DmsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement scrollIntoView (the thread's auto-scroll effect).
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders empty state with subtle import link', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
    });
    expect(screen.getByText('import your contacts')).toBeInTheDocument();
  });

  it('shows new message button in empty state', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dm-new-message-btn')).toBeInTheDocument();
    });
  });

  it('shows a debounced profile preview card when typing a recipient username', async () => {
    const { lookupUserProfile } = await import('@/data');
    vi.mocked(lookupUserProfile).mockResolvedValue({
      username: 'coolguy',
      provider: 'test.localhost',
      display_name: 'Cool Guy',
      bio: 'streamer',
      avatar_url: 'http://test.com/coolguy.png',
    });

    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );

    // Open the new-message picker, then the compose-by-username mode.
    await waitFor(() => {
      expect(screen.getByTestId('dm-new-message-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('dm-new-message-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dm-contact-picker')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('dm-compose-username-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dm-compose-username')).toBeInTheDocument();
    });

    // Type the username; the debounced lookup (400ms) fires and resolves the face.
    fireEvent.change(screen.getByTestId('dm-compose-username'), {
      target: { value: 'coolguy' },
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('dm-compose-profile-name')).toHaveTextContent('Cool Guy');
      },
      { timeout: 2000 },
    );
    expect(screen.getByTestId('dm-compose-profile-avatar')).toBeInTheDocument();
    expect(screen.getByTestId('dm-compose-profile-handle')).toHaveTextContent('@coolguy');
    expect(screen.getByTestId('dm-compose-profile-bio')).toHaveTextContent('streamer');
    expect(lookupUserProfile).toHaveBeenCalledWith('coolguy', undefined);
  });

  it('shows a "no profile found" card when the typed username has no profile', async () => {
    const { lookupUserProfile } = await import('@/data');
    vi.mocked(lookupUserProfile).mockResolvedValue(null);

    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dm-new-message-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('dm-new-message-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dm-contact-picker')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('dm-compose-username-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dm-compose-username')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('dm-compose-username'), {
      target: { value: 'ghost' },
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('dm-compose-profile-notfound')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('renders the conversation list at /messages (no view toggle)', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dms-empty')).toBeInTheDocument();
    });
    // The Mail/CRM views were deleted (3.144.0) — the toggle is gone with them.
    expect(screen.queryByTestId('messages-view-toggle')).not.toBeInTheDocument();
  });

  it('shows a group chat in the conversation list (group-chat.md)', async () => {
    const { getMyGroupChats, readGroupChatMessages } = await import('@/data');
    vi.mocked(getMyGroupChats).mockResolvedValue([
      { groupId: 'test.localhost/groups/users/testuser/chat-crew', name: 'The Crew', avatarRef: undefined },
    ]);
    vi.mocked(readGroupChatMessages).mockResolvedValue([
      { _id: 'gm-1', message: 'hey crew', sent_at: new Date().toISOString(), sender_username: 'alice', sender_provider: 'test.localhost', recipient_username: '', recipient_provider: '' },
    ]);

    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('group-chat-item')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-chat-item')).toHaveTextContent('The Crew');
    // A group row carries the group badge (not a presence dot).
    expect(screen.getByTestId('group-chat-badge')).toBeInTheDocument();
    // An explicit "Group" type badge makes it clear this is a group message.
    expect(screen.getByTestId('group-chat-type-badge')).toHaveTextContent('Group');
  });

  it('DM conversation rows do not carry a Group badge', async () => {
    const { listConversations, getMyGroupChats } = await import('@/data');
    vi.mocked(listConversations).mockResolvedValueOnce([
      'test.localhost/testuser--test.localhost/alice',
    ]);
    vi.mocked(getMyGroupChats).mockResolvedValueOnce([]);

    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dm-conversation-item')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('group-chat-type-badge')).not.toBeInTheDocument();
  });

  it('renders the group thread view — name header, member count, per-sender attribution (group-chat.md)', async () => {
    const { readGroupChatMessages, readGroupChatFace, getGroupMembers } = await import('@/data');
    vi.mocked(readGroupChatFace).mockResolvedValue({ name: 'The Crew' });
    vi.mocked(getGroupMembers).mockResolvedValue([
      { member_key: 'testuser', role: 'owner' },
      { member_key: 'alice', role: 'member' },
      { member_key: 'bob', role: 'member' },
    ]);
    vi.mocked(readGroupChatMessages).mockResolvedValue([
      { _id: 'gm-1', message: 'first', sent_at: '2026-01-01T01:00:00Z', sender_username: 'alice', sender_provider: 'test.localhost', recipient_username: '', recipient_provider: '' },
      { _id: 'gm-2', message: 'second', sent_at: '2026-01-01T02:00:00Z', sender_username: 'testuser', sender_provider: 'test.localhost', recipient_username: '', recipient_provider: '' },
    ]);

    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages/group/test.localhost/groups/users/testuser/chat-crew']}>
        <Routes>
          <Route path="/messages/*" element={<DmsScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('group-chat-name')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-chat-name')).toHaveTextContent('The Crew');
    expect(screen.getByTestId('group-chat-members')).toHaveTextContent('3 members');
    // The header carries an explicit "Group" badge next to the name.
    expect(screen.getByTestId('group-chat-header-badge')).toHaveTextContent('Group');
    // Per-sender attribution: the inbound message (alice) shows the sender name;
    // my own message (testuser) does not (isMe). Exactly one sender label.
    expect(screen.getByTestId('dm-message-sender')).toHaveTextContent('alice');
  });

  it('a profile ?to=+?provider= deep link goes straight to the DM thread (no compose picker)', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages?to=otheruser&provider=test.localhost']}>
        <Routes>
          <Route path="/messages/*" element={<DmsScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    // The provider is present, so the handler derives the conversation key and
    // navigates straight to the DM thread — the compose picker never opens.
    await waitFor(() => {
      expect(screen.getByTestId('dm-conversation')).toBeInTheDocument();
    }, { timeout: 2000 });
    expect(screen.queryByTestId('dm-contact-picker')).not.toBeInTheDocument();
  });
});

describe('PostComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders textarea with placeholder', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument();
  });

  it('shows image upload button', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    expect(document.querySelector('[data-testid="icon-image"]')).toBeInTheDocument();
  });

  it('disables post button when empty', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    expect(screen.getByRole('button', { name: /post/i })).toBeDisabled();
  });

  it('enables post button when text is entered', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const textarea = screen.getByPlaceholderText("What's on your mind?");
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    expect(screen.getByRole('button', { name: /post/i })).not.toBeDisabled();
  });

  it('compact mode rests collapsed (no action row) until focused, then expands', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer compact />);
    const textarea = screen.getByPlaceholderText("What's on your mind?");
    // Collapsed: the action row (attach button) is hidden…
    expect(screen.queryByTestId('attach-media-button')).not.toBeInTheDocument();
    // …focusing expands the full form.
    fireEvent.focus(textarea);
    await waitFor(() => {
      expect(screen.getByTestId('attach-media-button')).toBeInTheDocument();
    });
  });
});

describe('Layout', () => {
  it('renders sidebar nav items', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // Nav items render in both the desktop sidebar and the mobile bottom
    // nav (CSS breakpoints hide one in a real browser; both exist in the
    // DOM in jsdom) — assert via the stable data-testid hooks instead.
    // The operator's reorder (23.09.2026): Profile (your name), Shorts,
    // Discover, Feed, Messages, Monetization. Groups is NOT a nav item
    // (your communities live in Discover → Explore).
    expect(screen.getByTestId('nav-profile')).toBeInTheDocument();
    expect(screen.getByTestId('nav-shorts')).toBeInTheDocument();
    expect(screen.getByTestId('nav-discover')).toBeInTheDocument();
    expect(screen.getByTestId('nav-feed')).toBeInTheDocument();
    expect(screen.getByTestId('nav-messages')).toBeInTheDocument();
    expect(screen.getByTestId('nav-monetization')).toBeInTheDocument();
    // The profile item shows the user's own name (the mock token's username),
    // not the word "Profile" — it tells you you're visiting your own profile.
    expect(screen.getByTestId('nav-profile')).toHaveTextContent('testuser');
    // Groups is not a nav item (it lives in Discover → Explore).
    expect(screen.queryByTestId('nav-groups')).not.toBeInTheDocument();
    expect(screen.getAllByText('Feed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Discover').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Groups')).not.toBeInTheDocument();
    expect(screen.getAllByText('Messages').length).toBeGreaterThanOrEqual(1);
  });

  it('sidebar profile row shows the profile pic (not the generic icon)', async () => {
    const { readProfile, resolveMediaRefs } = await import('@/data');
    vi.mocked(readProfile).mockResolvedValueOnce({
      display_name: 'Test User',
      avatar_ref: 'avatar-1',
    });
    vi.mocked(resolveMediaRefs).mockResolvedValueOnce([
      { _id: 'avatar-1', url: 'http://test.com/avatar.png', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // The profile row's leading element is the avatar image (the profile pic),
    // not the generic User icon.
    const profileRow = await screen.findByTestId('nav-profile');
    const img = profileRow.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'http://test.com/avatar.png');
  });

  it('mobile bottom nav holds 4 core tabs + a More tab; coming-soon live in the More sheet, not the bar', async () => {
    // Operator, 30.08.2026: the mobile bottom bar was too crammed — a "More"
    // tab (the 5th icon) opens a sheet with Settings + the coming-soon
    // surfaces, so the bar never exceeds five icons and has room to grow.
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // Desktop sidebar: Shorts is a real destination (a nav row). The
    // coming-soon surfaces (Stories, …) live in the "More" popover — they're
    // not permanent nav rows, so they don't hold sidebar space.
    expect(screen.getByTestId('nav-shorts')).toBeInTheDocument();
    expect(screen.getByTestId('nav-more-desktop')).toBeInTheDocument();
    // The popover is closed by default — the coming-soon items aren't in the doc.
    expect(screen.queryByTestId('nav-stories')).not.toBeInTheDocument();
    // Opening More reveals the coming-soon list.
    fireEvent.click(screen.getByTestId('nav-more-desktop'));
    expect(screen.getByTestId('nav-stories')).toBeInTheDocument();
    expect(screen.getByTestId('nav-livestream')).toBeInTheDocument();
    expect(screen.getByTestId('nav-games')).toBeInTheDocument();
    expect(screen.getByTestId('nav-marketplace')).toBeInTheDocument();

    // The mobile bottom bar is exactly four core tabs + the More tab.
    const mobileNav = screen.getByLabelText('Primary mobile');
    expect(within(mobileNav).getByTestId('nav-feed-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-discover-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-messages-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-profile-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-more-mobile')).toBeInTheDocument();
    // Settings is NOT in the bar (it lives in the More sheet). Groups is
    // retired from the nav entirely (it lives in the Explorer/Groups subtab).
    expect(within(mobileNav).queryByTestId('nav-settings-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-groups-mobile')).not.toBeInTheDocument();
    // …and none of the coming-soon icons are crammed into the bar.
    expect(within(mobileNav).queryByTestId('nav-stories-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-shorts-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-livestream-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-games-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-marketplace-mobile')).not.toBeInTheDocument();

    // The More sheet is closed by default.
    expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument();

    // Tapping More opens the sheet: Shorts + Settings (real destinations) +
    // the coming-soon list (Stories, Livestream, Games, Marketplace). Shorts
    // is a real surface (shorts.md), not coming-soon. Groups is retired from
    // the nav (it lives in the Explorer/Groups subtab), so it's not here.
    fireEvent.click(screen.getByTestId('nav-more-mobile'));
    const sheet = screen.getByTestId('more-sheet');
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-shorts-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-settings-mobile')).toBeInTheDocument();
    expect(within(sheet).queryByTestId('nav-groups-mobile')).not.toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-stories-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-livestream-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-games-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-marketplace-mobile')).toBeInTheDocument();
  });

  it('People is retired from the nav (D4) — the Discover/People subtab is the home now', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // The People nav item is gone from the desktop sidebar…
    expect(screen.queryByTestId('nav-people')).not.toBeInTheDocument();
    // …and the mobile More sheet.
    fireEvent.click(screen.getByTestId('nav-more-mobile'));
    const sheet = screen.getByTestId('more-sheet');
    expect(within(sheet).queryByTestId('nav-people-mobile')).not.toBeInTheDocument();
    // Discover (the People subtab's home) is still in the nav.
    expect(screen.getByTestId('nav-discover')).toBeInTheDocument();
  });

  it('Monetization nav renders for every user; Node Monetization only for the node admin', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    // Non-admin: the "Monetization" entry (the creator's ad catalog +
    // affiliate onboarding) is a permanent desktop sidebar row; "Node
    // Monetization" is not.
    checkNodeAdmin.mockResolvedValue(false);
    const first = render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // Monetization is a permanent sidebar row (no popover needed).
    expect(await screen.findByTestId('nav-monetization')).toBeInTheDocument();
    // The admin check has settled — the node entry never appears.
    await waitFor(() => expect(checkNodeAdmin).toHaveBeenCalled());
    expect(screen.queryByTestId('nav-node-monetization')).not.toBeInTheDocument();
    // The More popover no longer carries a Monetization row.
    fireEvent.click(screen.getByTestId('nav-more-desktop'));
    const moreMenu = screen.getByTestId('more-menu');
    expect(within(moreMenu).queryByTestId('nav-monetization')).not.toBeInTheDocument();
    first.unmount();

    // Node admin: Monetization in the sidebar + Node Monetization in the More popover.
    checkNodeAdmin.mockResolvedValue(true);
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('nav-monetization')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nav-more-desktop'));
    expect(await screen.findByTestId('nav-node-monetization')).toBeInTheDocument();
  });

  it('Monetization nav: only the matching row highlights (never both)', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    checkNodeAdmin.mockResolvedValue(true);

    // On /monetize (Creator): only Monetization is highlighted.
    render(
      <MemoryRouter initialEntries={['/monetize']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // Monetization is a permanent sidebar row; open the More popover for the Node row.
    fireEvent.click(screen.getByTestId('nav-more-desktop'));
    // The Node row appears only once the async admin check resolves.
    const nodeRow = await screen.findByTestId('nav-node-monetization');
    expect(screen.getByTestId('nav-monetization')).toHaveAttribute('aria-current', 'page');
    expect(nodeRow).not.toHaveAttribute('aria-current');
  });

  it('Monetization nav: on /monetize?tab=node only Node Monetization highlights', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    checkNodeAdmin.mockResolvedValue(true);
    render(
      <MemoryRouter initialEntries={['/monetize?tab=node']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // Open the More popover for the Node row (Monetization is a sidebar row).
    fireEvent.click(screen.getByTestId('nav-more-desktop'));
    expect(await screen.findByTestId('nav-node-monetization')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-monetization')).not.toHaveAttribute('aria-current');
  });

  it('mobile More sheet: only the matching monetization row highlights', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    checkNodeAdmin.mockResolvedValue(true);
    render(
      <MemoryRouter initialEntries={['/monetize?tab=node']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('nav-more-mobile'));
    const sheet = screen.getByTestId('more-sheet');
    // The mobile rows use a class-based highlight, not aria-current; assert the
    // active styling (bg-brand-muted) is on the Node row only.
    const nodeRow = await within(sheet).findByTestId('nav-node-monetization-mobile');
    const creatorRow = within(sheet).getByTestId('nav-monetization-mobile');
    expect(nodeRow.className).toContain('bg-brand-muted');
    expect(creatorRow.className).not.toContain('bg-brand-muted');
  });

  it('mobile More sheet: Monetization for every user, Node Monetization only for the node admin', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    checkNodeAdmin.mockResolvedValue(false);
    const first = render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('nav-more-mobile'));
    const sheet = screen.getByTestId('more-sheet');
    expect(await within(sheet).findByTestId('nav-monetization-mobile')).toBeInTheDocument();
    await waitFor(() => expect(checkNodeAdmin).toHaveBeenCalled());
    expect(within(sheet).queryByTestId('nav-node-monetization-mobile')).not.toBeInTheDocument();
    first.unmount();

    // Node admin: the sheet carries both.
    checkNodeAdmin.mockResolvedValue(true);
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('nav-more-mobile'));
    const adminSheet = screen.getByTestId('more-sheet');
    expect(await within(adminSheet).findByTestId('nav-monetization-mobile')).toBeInTheDocument();
    expect(await within(adminSheet).findByTestId('nav-node-monetization-mobile')).toBeInTheDocument();
  });

  it('Help (report a bug) moves to the mobile top header, not the bottom bar', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // The header's report-a-bug icon button is present…
    expect(screen.getByTestId('report-bug-button-mobile')).toBeInTheDocument();
    // …and the bottom bar no longer carries a "Help" tab.
    const mobileNav = screen.getByLabelText('Primary mobile');
    expect(within(mobileNav).queryByTestId('report-bug-button-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByText('Help')).not.toBeInTheDocument();
  });

  it('renders logout button in the user menu', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onLogout = vi.fn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={onLogout} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // The avatar row is the account entry point; the menu is closed by default.
    const trigger = screen.getByTestId('user-menu-trigger');
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    expect(screen.getByText('Log out')).toBeInTheDocument();
  });

  it('user menu: Log out fires onLogout', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onLogout = vi.fn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={onLogout} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    fireEvent.click(screen.getByTestId('logout-button'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('user menu: Profile / Settings / Report a bug are reachable', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onReportBug = vi.fn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={onReportBug}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    const menu = screen.getByTestId('user-menu');
    expect(within(menu).getByTestId('user-menu-profile')).toBeInTheDocument();
    expect(within(menu).getByTestId('user-menu-settings')).toBeInTheDocument();
    expect(within(menu).getByTestId('user-menu-report-bug')).toBeInTheDocument();
    fireEvent.click(within(menu).getByTestId('user-menu-report-bug'));
    expect(onReportBug).toHaveBeenCalledTimes(1);
    // The menu closes after an action.
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });

  it('user menu: closes on outside click', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });

  it('renders report a bug button in the user menu', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onReportBug = vi.fn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={onReportBug}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('user-menu-trigger'));
    expect(screen.getByText('Report a bug')).toBeInTheDocument();
  });

  it('renders web10 branding', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.getAllByText('web').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('10').length).toBeGreaterThanOrEqual(1);
  });

  it('notifications bell is in the desktop top bar (not the sidebar)', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // The notifications bell is in the top bar.
    const bell = await screen.findByTestId('nav-notifications');
    expect(bell).toBeInTheDocument();
    // It's inside the top bar (the desktop top bar testid).
    const topbar = screen.getByTestId('topbar-desktop');
    expect(topbar.contains(bell)).toBe(true);
  });

  it('the "New post" button is NOT in the sidebar or the mobile top bar', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    await screen.findByTestId('topbar-desktop');
    // The sidebar "New post" row is gone.
    expect(screen.queryByTestId('nav-new-post')).not.toBeInTheDocument();
    // The mobile top bar "New post" button is gone.
    expect(screen.queryByTestId('new-post-button-mobile')).not.toBeInTheDocument();
  });
});

describe('LoginScreen', () => {
  it('renders login button', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Log in or create your account')).toBeInTheDocument();
    });
  });

  it('renders branding', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('web')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });
});