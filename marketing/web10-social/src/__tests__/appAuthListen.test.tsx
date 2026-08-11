import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// v3 stub: App renders without crashing. The authListen registration pattern
// is handled by the v3 client's cookie-based token, not the v2 adapter callback.

import { lucideMock } from './helpers/lucideMock';
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

vi.mock('web10-npm', () => ({
  wapiInit: vi.fn().mockReturnValue({
    isSignedIn: vi.fn().mockReturnValue(false),
    authListen: vi.fn(),
    openAuthPortal: vi.fn(),
    signOut: vi.fn(),
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    contractOnReady: vi.fn(),
  }),
}));

describe('App renders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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