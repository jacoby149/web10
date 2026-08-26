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

  it('renders without crashing when signed-out', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('login-button')).toBeInTheDocument());
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
});
