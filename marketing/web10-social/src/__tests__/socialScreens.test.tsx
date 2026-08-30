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
    readPullFeed: vi.fn().mockResolvedValue([]),
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
    render(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Your feed will appear here/)).toBeInTheDocument();
    });
    expect(screen.getByText('import your existing posts')).toBeInTheDocument();
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

  it('coming-soon items render on the desktop sidebar but NOT in the mobile bottom nav', async () => {
    // Operator, 31.07.2026: "for the greyed out tabs, just dont even show
    // them! … coming soon on desktop i actually really like, just dont like
    // seeing them on mobile."
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
    // Mobile bottom nav (aria-label="Primary mobile") renders none of them.
    const mobileNav = screen.getByLabelText('Primary mobile');
    expect(within(mobileNav).queryByTestId('nav-flares-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-takes-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-livestream-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-games-mobile')).not.toBeInTheDocument();
    expect(within(mobileNav).queryByTestId('nav-marketplace-mobile')).not.toBeInTheDocument();
    // …and the real destinations are all still there (Groups graduated from
    // coming-soon to a real nav destination).
    expect(within(mobileNav).getByTestId('nav-feed-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-discover-mobile')).toBeInTheDocument();
    expect(within(mobileNav).getByTestId('nav-groups-mobile')).toBeInTheDocument();
  });

  it('renders logout button', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onLogout = vi.fn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={onLogout} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.getByText('Log out')).toBeInTheDocument();
  });

  it('renders report a bug button', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onReportBug = vi.fn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={onReportBug}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
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