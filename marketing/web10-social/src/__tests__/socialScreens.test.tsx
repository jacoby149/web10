import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockResolvedValue(null),
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

  it('renders view toggle with all three views', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('messages-view-toggle')).toBeInTheDocument();
    });
    expect(screen.getByTestId('view-toggle-chat')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle-mail')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle-crm')).toBeInTheDocument();
  });

  it('switches to mail view on toggle click', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('messages-view-toggle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('view-toggle-mail'));
    await waitFor(() => {
      expect(screen.getByTestId('mail-view')).toBeInTheDocument();
    });
  });

  it('switches to crm view on toggle click', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('messages-view-toggle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('view-toggle-crm'));
    await waitFor(() => {
      expect(screen.getByTestId('crm-view')).toBeInTheDocument();
    });
  });

  it('switches back to chat view from mail', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('messages-view-toggle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('view-toggle-mail'));
    await waitFor(() => {
      expect(screen.getByTestId('mail-view')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('view-toggle-chat'));
    // After switching back, the chat view shows the empty state or conversation list
    expect(screen.getByTestId('dms-empty')).toBeInTheDocument();
  });

  it('restores mail view from ?view=mail on mount', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages?view=mail']}>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('mail-view')).toBeInTheDocument();
    });
  });

  it('restores crm view from ?view=crm on mount', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages?view=crm']}>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('crm-view')).toBeInTheDocument();
    });
  });

  it('defaults to chat view when ?view is missing', async () => {
    const { default: DmsScreen } = await import('@/components/Chat/DmsScreen');
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <DmsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dms-empty')).toBeInTheDocument();
    });
  });
});

describe('MailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders mail view with heading', async () => {
    const { default: MailView } = await import('@/components/Chat/MailView');
    render(<MailView />);
    await waitFor(() => {
      expect(screen.getByText('Mail')).toBeInTheDocument();
    });
  });

  it('renders search input', async () => {
    const { default: MailView } = await import('@/components/Chat/MailView');
    render(<MailView />);
    await waitFor(() => {
      expect(screen.getByTestId('mail-search')).toBeInTheDocument();
    });
  });

  it('renders empty state when no threads', async () => {
    const { default: MailView } = await import('@/components/Chat/MailView');
    render(<MailView />);
    await waitFor(() => {
      expect(screen.getByTestId('mail-view')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Inbox is empty/).length).toBeGreaterThanOrEqual(1);
  });
});

describe('CrmView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders crm view with heading', async () => {
    const { default: CrmView } = await import('@/components/Chat/CrmView');
    render(<CrmView />);
    await waitFor(() => {
      expect(screen.getByText('Contacts')).toBeInTheDocument();
    });
  });

  it('renders search input', async () => {
    const { default: CrmView } = await import('@/components/Chat/CrmView');
    render(<CrmView />);
    await waitFor(() => {
      expect(screen.getByTestId('crm-search')).toBeInTheDocument();
    });
  });

  it('renders empty state when no contacts', async () => {
    const { default: CrmView } = await import('@/components/Chat/CrmView');
    render(<CrmView />);
    await waitFor(() => {
      expect(screen.getByTestId('crm-view')).toBeInTheDocument();
    });
    expect(screen.getByText(/No contacts/)).toBeInTheDocument();
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
    expect(screen.getByTestId('nav-feed')).toBeInTheDocument();
    expect(screen.getByTestId('nav-discover')).toBeInTheDocument();
    expect(screen.getByTestId('nav-groups')).toBeInTheDocument();
    expect(screen.getByTestId('nav-profile')).toBeInTheDocument();
    expect(screen.getByTestId('nav-messages')).toBeInTheDocument();
    expect(screen.getAllByText('Feed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Discover').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Groups').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Profile').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Messages').length).toBeGreaterThanOrEqual(1);
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
    // Desktop sidebar keeps the coming-soon section.
    expect(screen.getByTestId('nav-flares')).toBeInTheDocument();
    expect(screen.getByTestId('nav-takes')).toBeInTheDocument();

    // The mobile bottom bar is exactly four core tabs + the More tab.
    const mobileNav = screen.getByLabelText('Primary mobile');
    expect(within(mobileNav).getByTestId('nav-feed-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-discover-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-messages-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-profile-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-more-mobile')).toBeInTheDocument();
    // Settings and Groups are NOT in the bar (they live in the More sheet).
    expect(within(mobileNav).queryByTestId('nav-settings-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-groups-mobile')).not.toBeInTheDocument();
    // …and none of the coming-soon icons are crammed into the bar.
    expect(within(mobileNav).queryByTestId('nav-flares-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-takes-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-livestream-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-games-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-marketplace-mobile')).not.toBeInTheDocument();

    // The More sheet is closed by default.
    expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument();

    // Tapping More opens the sheet: Settings + Groups (real destinations) +
    // the coming-soon list.
    fireEvent.click(screen.getByTestId('nav-more-mobile'));
    const sheet = screen.getByTestId('more-sheet');
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-settings-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-groups-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-flares-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-takes-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-livestream-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-games-mobile')).toBeInTheDocument();
    expect(within(sheet).getByTestId('nav-marketplace-mobile')).toBeInTheDocument();
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