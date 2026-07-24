import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements
vi.mock('lucide-react', () => {
  const iconFactory = (name: string) => {
    const Comp = (props: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { className, ...rest } = props;
      return <span data-testid={`icon-${name.toLowerCase()}`} {...rest} />;
    };
    Comp.displayName = name;
    return Comp;
  };
  const icons: Record<string, ReturnType<typeof iconFactory>> = {};
  [
    'Heart', 'MessageCircle', 'ArrowUp', 'ArrowDown', 'Flame', 'Clock',
    'ClockArrowDown', 'Sparkles', 'Send', 'Image', 'ImagePlus', 'X', 'Loader2',
    'User', 'MapPin', 'Globe', 'Link', 'Camera', 'Edit3', 'Check',
    'ChevronLeft', 'MessageSquare', 'Home', 'PlusCircle', 'LogOut', 'Bug',
    'AlertTriangle', 'CheckCircle', 'Compass',
  ].forEach(name => { icons[name] = iconFactory(name); });
  return icons;
});

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
    render(<ProfileScreen />);
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
    render(<DmsScreen />);
    await waitFor(() => {
      expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
    });
    expect(screen.getByText('import your contacts')).toBeInTheDocument();
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
      <Layout mode="feed" setMode={() => {}} onLogout={() => {}} onReportBug={() => {}}>
        <div>Content</div>
      </Layout>,
    );
    // Nav items render in both the desktop sidebar and the mobile bottom
    // nav (CSS breakpoints hide one in a real browser; both exist in the
    // DOM in jsdom) — assert via the stable data-testid hooks instead.
    expect(screen.getByTestId('nav-feed')).toBeInTheDocument();
    expect(screen.getByTestId('nav-profile')).toBeInTheDocument();
    expect(screen.getByTestId('nav-messages')).toBeInTheDocument();
    expect(screen.getAllByText('Feed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Profile').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Messages').length).toBeGreaterThanOrEqual(1);
  });

  it('renders logout button', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onLogout = vi.fn();
    render(
      <Layout mode="feed" setMode={() => {}} onLogout={onLogout} onReportBug={() => {}}>
        <div>Content</div>
      </Layout>,
    );
    expect(screen.getByText('Log out')).toBeInTheDocument();
  });

  it('renders report a bug button', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const onReportBug = vi.fn();
    render(
      <Layout mode="feed" setMode={() => {}} onLogout={() => {}} onReportBug={onReportBug}>
        <div>Content</div>
      </Layout>,
    );
    expect(screen.getByText('Report a bug')).toBeInTheDocument();
  });

  it('renders web10 branding', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <Layout mode="feed" setMode={() => {}} onLogout={() => {}} onReportBug={() => {}}>
        <div>Content</div>
      </Layout>,
    );
    expect(screen.getAllByText('web').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('10').length).toBeGreaterThanOrEqual(1);
  });
});

describe('LoginScreen', () => {
  it('renders login button', async () => {
    const { default: App } = await import('@/App');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Log in')).toBeInTheDocument();
    });
  });

  it('renders branding', async () => {
    const { default: App } = await import('@/App');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('web')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });
});