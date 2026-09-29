import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// The app-level New Post sheet + the floating "+" FAB (the operator,
// 29.09.2026: "with a + New Post on the screen you hit that, then the full
// thing pops up for you to post"). The inline composer boxes are retired;
// these tests pin the new seam: the FAB opens the sheet, the sheet holds the
// one composer, a group feed scopes it, and a successful post closes the
// sheet + fires `post-created`.

import { lucideMock } from './helpers/lucideMock';
import { installWeb10Mock } from './helpers/web10Mock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    readFeedPage: vi.fn().mockResolvedValue({ posts: [], has_more: false, next_cursor: null }),
    readFeedReactions: vi.fn().mockResolvedValue({ liked: {}, disliked: {}, reposted: {} }),
    readDiscoverFeed: vi.fn().mockResolvedValue([]),
    getFeedGroups: vi.fn().mockResolvedValue([]),
    readFeedEngagement: vi.fn().mockResolvedValue({ likes: {}, comments: {} }),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readPullFeed: vi.fn().mockResolvedValue([]),
    readProfile: vi.fn().mockResolvedValue(null),
    readMyPosts: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    createPost: vi.fn().mockResolvedValue({ _id: 'new-post-1' }),
    createRepost: vi.fn().mockResolvedValue({ _id: 'new-repost-1' }),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'm1' }),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
    readGroupDetail: vi.fn().mockResolvedValue(null),
    readGroupIdentity: vi.fn().mockResolvedValue({}),
    getGroupsManages: vi.fn().mockResolvedValue([]),
    getV3Client: vi.fn().mockReturnValue({
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
      read: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([]),
    }),
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

describe('The app-level New Post sheet + FAB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('a signed-in user sees the floating "+" FAB (the only resting compose chrome)', async () => {
    installWeb10Mock({
      token: 'signed-in-token',
      payload: { username: 'testuser', provider: 'test.localhost', site: 'web10' },
    });
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <App />
      </MemoryRouter>,
    );
    // The FAB renders (the inline composer boxes are retired).
    await waitFor(() => {
      expect(screen.getByTestId('new-post-fab')).toBeInTheDocument();
    });
    // The sheet is closed by default (the composer is NOT inline).
    expect(screen.queryByTestId('new-post-sheet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-composer')).not.toBeInTheDocument();
  });

  it('the FAB is hidden on the Messages surface (it would cover the send button)', async () => {
    installWeb10Mock({
      token: 'signed-in-token',
      payload: { username: 'testuser', provider: 'test.localhost', site: 'web10' },
    });
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <App />
      </MemoryRouter>,
    );
    // The messages surface is up (the conversation list / empty state).
    await waitFor(() => {
      expect(
        screen.queryByTestId('dms-empty') ?? screen.queryByTestId('dms-screen'),
      ).toBeInTheDocument();
    });
    // The FAB is NOT there — a chat has its own bottom-right send button.
    expect(screen.queryByTestId('new-post-fab')).not.toBeInTheDocument();
  });

  it('tapping the FAB opens the sheet with the full composer', async () => {
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
    const fab = await screen.findByTestId('new-post-fab');
    fireEvent.click(fab);
    // The sheet pops up with the composer (the "full thing").
    await waitFor(() => {
      expect(screen.getByTestId('new-post-sheet')).toBeInTheDocument();
    });
    expect(screen.getByTestId('post-composer')).toBeInTheDocument();
    expect(screen.getByTestId('composer-textarea')).toBeInTheDocument();
  });

  it('the sheet closes on the X (and the composer is gone)', async () => {
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
    const fab = await screen.findByTestId('new-post-fab');
    fireEvent.click(fab);
    await waitFor(() => {
      expect(screen.getByTestId('new-post-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('new-post-sheet-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('new-post-sheet')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('post-composer')).not.toBeInTheDocument();
  });

  it('a group feed "Post to this group" opens the sheet scoped to the group', async () => {
    const { readGroupDetail, createPost } = await import('@/data');
    vi.mocked(readGroupDetail).mockResolvedValue({
      group_id: 'g1',
      name: 'Gaming Night',
      owner: 'carol',
      is_member: true,
      posts_state: 'ok',
      posts: [],
    } as never);
    const { ComposerProvider } = await import('@/context/ComposerContext');
    const { NewPostSheet } = await import('@/components/Feed/NewPostSheet');
    const { default: GroupDetailScreen } = await import('@/components/Groups/GroupDetailScreen');
    render(
      <MemoryRouter initialEntries={['/groups/g1']}>
        <ComposerProvider>
          <GroupDetailScreen groupId="g1" />
          <NewPostSheet />
        </ComposerProvider>
      </MemoryRouter>,
    );
    // The member sees the button (not an inline composer).
    const btn = await screen.findByTestId('group-post-button');
    expect(screen.queryByTestId('post-composer')).not.toBeInTheDocument();
    fireEvent.click(btn);
    // The sheet opens with the composer.
    await waitFor(() => {
      expect(screen.getByTestId('new-post-sheet')).toBeInTheDocument();
    });
    // Type + post → createPost is called scoped to the group.
    fireEvent.change(screen.getByTestId('composer-textarea'), { target: { value: 'Hello group' } });
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => {
      expect(createPost).toHaveBeenCalled();
    });
    // The post is created in the group (the group-scoped write).
    const call = (createPost as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.stringify(call)).toContain('g1');
  });

  it('a successful post closes the sheet + fires `post-created` (the screens reload)', async () => {
    installWeb10Mock({
      token: 'signed-in-token',
      payload: { username: 'testuser', provider: 'test.localhost', site: 'web10' },
    });
    const { default: App } = await import('@/App');
    const onPostCreated = vi.fn();
    window.addEventListener('post-created', onPostCreated);
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <App />
      </MemoryRouter>
    );
    const fab = await screen.findByTestId('new-post-fab');
    fireEvent.click(fab);
    await waitFor(() => {
      expect(screen.getByTestId('new-post-sheet')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('composer-textarea'), { target: { value: 'a post' } });
    fireEvent.click(screen.getByTestId('post-submit'));
    // The post lands → the sheet closes + the event fires.
    await waitFor(() => {
      expect(onPostCreated).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('new-post-sheet')).not.toBeInTheDocument();
    });
    window.removeEventListener('post-created', onPostCreated);
  });
});
