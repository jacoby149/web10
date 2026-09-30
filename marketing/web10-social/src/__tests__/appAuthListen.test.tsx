import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// App renders without crashing. The D42 auth seam (src/interfaces/auth)
// reads the SDK browser global (window.web10) — the same surface the real
// /wapi.js IIFE attaches — so the mock installs that global instead of
// mocking the old v1 wapiInit.

import { lucideMock } from './helpers/lucideMock';
import { installWeb10Mock } from './helpers/web10Mock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    getFeedGroups: vi.fn().mockResolvedValue([]),
    readFeedEngagement: vi.fn().mockResolvedValue({ likes: {}, comments: {} }),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readPullFeed: vi.fn().mockResolvedValue([]),
    readProfile: vi.fn().mockResolvedValue(null),
    readMyPosts: vi.fn().mockResolvedValue([]),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
  createWapiWrapper: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    isSignedIn: vi.fn().mockReturnValue(false),
    signOut: vi.fn(),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
    setToken: vi.fn(),
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

describe('App renders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh module registry per test — the auth seam is a per-module
    // singleton (getSocialAuth), so each render sees the mock installed
    // below, not a stale one from a previous test.
    vi.resetModules();
    installWeb10Mock();
  });

  it('renders the anon shell (not the login wall) when signed-out', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    // Anon mode: a signed-out visitor gets the app shell with a clear Sign in
    // affordance (both the desktop + mobile variants render in jsdom), not the
    // old full-screen login wall.
    await waitFor(() =>
      expect(screen.getAllByTestId(/sign-in-button/).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('Log in or create your account')).not.toBeInTheDocument();
  });

  it('renders without crashing when signed-in', async () => {
    const { default: App } = await import('@/App');
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    // App renders without throwing — container has children
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('a signed-in user at /feed renders the Posts screen, not a bounce to /video (no anon mount race)', async () => {
    // Regression: `signedIn` used to start `false`, so the FIRST render was
    // anon even for a signed-in user — the `isAnon ? <Navigate to="/video">`
    // on /feed fired before the mount effect could flip signedIn to true,
    // bouncing a hard-refresh / deep-link to /video. `signedIn` now
    // initializes from the synchronous cookie check, so the first render is
    // correct. A signed-in user at /feed must render the Posts screen (the
    // Discover | Following tab row), never the video wall.
    installWeb10Mock({
      token: 'signed-in-token',
      payload: { username: 'testuser', provider: 'test.localhost', site: 'web10' },
    });
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <App />
      </MemoryRouter>
    );
    // The Posts screen's tab row renders (PostsScreen mounted, not redirected).
    await waitFor(() => {
      expect(screen.getByTestId('posts-tab-row')).toBeInTheDocument();
    });
    // The compose affordance is the app-level FAB (the inline composer boxes
    // are retired — the full composer pops up in the New Post sheet on tap).
    expect(screen.getByTestId('new-post-fab')).toBeInTheDocument();
  });

  it('a signed-in user at the root lands on /feed (the default — Posts, the content)', async () => {
    // The content pyramid (the operator, 29.09.2026): People → Posts → Video →
    // Shorts. Posts is the default landing (the content, not the profiles —
    // "the people tab is kind of boring just a bunch of profiles not actual
    // content, so by default have that second tab selected"). A bare "/" (or
    // any unknown path) lands on Posts (/feed).
    installWeb10Mock({
      token: 'signed-in-token',
      payload: { username: 'testuser', provider: 'test.localhost', site: 'web10' },
    });
    const { default: App } = await import('@/App');
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    // The Posts destination (PostsScreen) renders — the nav-feed item is
    // active (the sidebar highlights the current destination).
    await waitFor(() => {
      const feedNav = container.querySelector('[data-testid="nav-feed"]');
      expect(feedNav).not.toBeNull();
      expect(feedNav).toHaveAttribute('aria-current', 'page');
    });
  });
});
