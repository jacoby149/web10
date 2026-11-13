import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';
import { getWapi } from '@/data/wapi';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer — both the Discover board read (the Discover tab) and the
// feed read (the Following tab) are mocked so the two tabs render deterministically.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readDiscoverFeed: vi.fn().mockResolvedValue([]),
    readFeedPage: vi.fn().mockResolvedValue({ posts: [], has_more: false, next_cursor: null }),
    readFeedReactions: vi.fn().mockResolvedValue({ liked: {}, disliked: {}, reposted: {} }),
    readProfile: vi.fn().mockResolvedValue(null),
    readUserProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    getV3Client: vi.fn(),
    getDiscoverGroupId: vi.fn().mockReturnValue('web10/groups/web10/discover'),
    readRepostCounts: vi.fn().mockResolvedValue({}),
    readMyRepostedIds: vi.fn().mockResolvedValue(new Set()),
  };
});

// Mock wapi — a token by default (signed-in); a test flips it to null for anon.
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
  resetWapi: vi.fn(),
}));

// A probe that captures the router location (MemoryRouter keeps its own
// history — window.location never moves).
let lastPath = '';
let lastSearch = '';
function LocationProbe() {
  const location = useLocation();
  lastPath = location.pathname;
  lastSearch = location.search;
  return null;
}

// A seeded discover post so the board (discover-grid) renders — an empty
// board shows the empty state instead, which doesn't carry the grid testid.
const SEED_DISCOVER_POST = {
  _id: 'dp-1',
  author: 'nova',
  author_username: 'nova',
  author_provider: 'web10',
  text: 'Late night synth session',
  created_at: new Date(Date.now() - 38 * 60000).toISOString(),
  tags: ['music'],
  likes: 128,
  comments: 24,
  reposts: 3,
  score: 250,
};

async function renderPosts(path = '/feed', onLogin = vi.fn()) {
  const { default: PostsScreen } = await import('@/components/Feed/PostsScreen');
  lastPath = '';
  lastSearch = '';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <PostsScreen onLogin={onLogin} />
    </MemoryRouter>,
  );
}

describe('PostsScreen (the merged Feed + Hot Gossip surface)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWapi).mockReturnValue({ readToken: () => ({ provider: 'test.localhost', username: 'testuser' }) } as ReturnType<typeof getWapi>);
    (data.getV3Client as ReturnType<typeof vi.fn>).mockReturnValue({
      read: vi.fn().mockResolvedValue([]),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    });
    // Seed one discover post so the board (discover-grid) renders — an empty
    // board shows the empty state instead, which doesn't carry the grid testid.
    (data.readDiscoverFeed as ReturnType<typeof vi.fn>).mockResolvedValue([SEED_DISCOVER_POST]);
  });

  it('signed-in /feed shows the Discover | Following tab row (Discover active by default)', async () => {
    await renderPosts('/feed');
    const tabRow = await screen.findByTestId('posts-tab-row');
    expect(tabRow).toBeInTheDocument();
    expect(screen.getByTestId('posts-tab-discover')).toBeInTheDocument();
    expect(screen.getByTestId('posts-tab-following')).toBeInTheDocument();
    // Discover is the default tab (the bare URL) — it's selected.
    expect(screen.getByTestId('posts-tab-discover')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('posts-tab-following')).toHaveAttribute('aria-selected', 'false');
  });

  it('the Discover tab (default) renders the ranked board, not the feed', async () => {
    await renderPosts('/feed');
    // The board (the Hot Gossip content) renders on the default Discover tab.
    await screen.findByTestId('discover-grid');
    // The Following feed is NOT rendered on the Discover tab.
    expect(screen.queryByTestId('feed-empty')).not.toBeInTheDocument();
  });

  it('clicking Following navigates to ?tab=following and shows the feed', async () => {
    await renderPosts('/feed');
    const followingTab = await screen.findByTestId('posts-tab-following');
    fireEvent.click(followingTab);
    // The URL gains ?tab=following (the tab is screen state the URL holds).
    await waitFor(() => {
      expect(lastSearch).toBe('?tab=following');
    });
    // The Following tab is now active.
    expect(screen.getByTestId('posts-tab-following')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('posts-tab-discover')).toHaveAttribute('aria-selected', 'false');
    // The feed renders on the Following tab (the mock feed is empty → the
    // feed's empty state), and the board is gone.
    await screen.findByTestId('feed-empty');
    expect(screen.queryByTestId('discover-grid')).not.toBeInTheDocument();
  });

  it('clicking Discover (from Following) navigates back to the bare /feed', async () => {
    await renderPosts('/feed?tab=following');
    // Start on Following (the feed renders).
    await screen.findByTestId('feed-empty');
    const discoverTab = screen.getByTestId('posts-tab-discover');
    fireEvent.click(discoverTab);
    // The ?tab= param is removed (Discover is the default, the bare URL).
    await waitFor(() => {
      expect(lastSearch).toBe('');
    });
    // The board renders again, the feed is gone.
    await screen.findByTestId('discover-grid');
    expect(screen.queryByTestId('feed-empty')).not.toBeInTheDocument();
  });

  it('a deep link to /feed?tab=following restores the Following tab', async () => {
    await renderPosts('/feed?tab=following');
    await screen.findByTestId('posts-tab-row');
    expect(screen.getByTestId('posts-tab-following')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('posts-tab-discover')).toHaveAttribute('aria-selected', 'false');
    // The feed renders on the restored Following tab.
    await screen.findByTestId('feed-empty');
  });

  it('anon /feed keeps public content with a benefits invitation and a working sign-in action', async () => {
    (getWapi as ReturnType<typeof vi.fn>).mockReturnValue({
      readToken: vi.fn().mockReturnValue(null),
    });
    const onLogin = vi.fn();
    await renderPosts('/feed', onLogin);
    // The tab row is present (a tabbed surface, not a single board).
    expect(screen.getByTestId('posts-tab-row')).toBeInTheDocument();
    expect(screen.getByTestId('posts-tab-following')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('sign-in-prompt-feed')).toHaveTextContent('Follow creators');
    expect(screen.getByTestId('sign-in-learn-feed')).toHaveAttribute('href', '/join');
    expect(onLogin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sign-in-button-feed'));
    expect(onLogin).toHaveBeenCalledTimes(1);
    // The Discover tab is active (the default).
    expect(screen.getByTestId('posts-tab-discover')).toHaveAttribute('aria-selected', 'true');
    // No composer (anon can't post).
    expect(screen.queryByTestId('post-composer')).not.toBeInTheDocument();
    // The board renders (the public ledger).
    await screen.findByTestId('discover-grid');
  });

  it('anon Following is URL-owned, explains sign-in, preserves filters and never reads the personal feed', async () => {
    vi.mocked(getWapi).mockReturnValue({ readToken: () => null } as ReturnType<typeof getWapi>);
    const onLogin = vi.fn();
    await renderPosts('/feed?q=music', onLogin);
    fireEvent.click(screen.getByTestId('posts-tab-following'));
    await screen.findByTestId('sign-in-prompt-following');
    expect(lastSearch).toBe('?q=music&tab=following');
    expect(screen.getByTestId('posts-tab-following')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('sign-in-prompt-feed')).not.toBeInTheDocument();
    expect(screen.getByText('Keep up with your people')).toBeInTheDocument();
    expect(data.readFeedPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sign-in-button-following'));
    expect(onLogin).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('posts-tab-discover'));
    expect(lastSearch).toBe('?q=music');
    expect(screen.queryByTestId('sign-in-prompt-following')).not.toBeInTheDocument();
  });

  it('a signed-out Following deep link restores its invitation, not a private feed or forced Discover', async () => {
    vi.mocked(getWapi).mockReturnValue({ readToken: () => null } as ReturnType<typeof getWapi>);
    await renderPosts('/feed?tab=following');
    expect(await screen.findByTestId('sign-in-prompt-following')).toBeInTheDocument();
    expect(data.readFeedPage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('discover-grid')).not.toBeInTheDocument();
  });

  it('signed-in visitors see no sign-in invitation on either tab', async () => {
    await renderPosts('/feed');
    expect(screen.queryByTestId('sign-in-prompt-feed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('posts-tab-following'));
    await screen.findByTestId('feed-empty');
    expect(screen.queryByTestId('sign-in-prompt-following')).not.toBeInTheDocument();
  });

  it('a new session replaces the Following invitation in place without dropping its URL', async () => {
    vi.mocked(getWapi).mockReturnValue({ readToken: () => null } as ReturnType<typeof getWapi>);
    const view = await renderPosts('/feed?tab=following');
    expect(await screen.findByTestId('sign-in-prompt-following')).toBeInTheDocument();
    expect(data.readFeedPage).not.toHaveBeenCalled();
    vi.mocked(getWapi).mockReturnValue({ readToken: () => ({ provider: 'test.localhost', username: 'testuser' }) } as ReturnType<typeof getWapi>);
    const { default: PostsScreen } = await import('@/components/Feed/PostsScreen');
    view.rerender(<MemoryRouter initialEntries={['/feed?tab=following']}><LocationProbe /><PostsScreen onLogin={() => {}} /></MemoryRouter>);
    await screen.findByTestId('feed-empty');
    expect(lastSearch).toBe('?tab=following');
    expect(screen.queryByTestId('sign-in-prompt-following')).not.toBeInTheDocument();
  });
});
