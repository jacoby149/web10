import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';

// Mock lucide-react icons as simple span elements (any icon, no manual list).
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// The shared repost seam (reposts.md): the repeat icon on ANY surface calls
// setRepostingTo(post) to open the app-level composer in repost mode. A spy
// captures the called post so a test asserts the surface reports the right one.
const { setRepostingToSpy } = vi.hoisted(() => ({ setRepostingToSpy: vi.fn() }));
vi.mock('@/context/RepostContext', () => ({
  RepostProvider: ({ children }: { children: React.ReactNode }) => children,
  useRepost: () => ({
    repostingTo: null,
    setRepostingTo: setRepostingToSpy,
    clearReposting: vi.fn(),
  }),
}));

// Mock the data layer. The post-based repost reads (readRepostCounts — the
// count is the number of `repost_of` posts; readMyRepostedIds — the "I
// reposted this" fill is the reader's own repost post) are the new seam every
// surface uses instead of the legacy `type:'repost'` reaction.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readReactions: vi.fn().mockResolvedValue([]),
    countComments: vi.fn().mockResolvedValue(0),
    readRepostCounts: vi.fn().mockResolvedValue({}),
    readMyRepostedIds: vi.fn().mockResolvedValue(new Set<string>()),
    getDiscoverGroupId: vi.fn().mockReturnValue('web10.app/groups/web10/discover'),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    readDiscoverFeed: vi.fn().mockResolvedValue([]),
    readGroupDetail: vi.fn().mockResolvedValue(null),
    readProfile: vi.fn().mockResolvedValue(null),
    readUserProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    getV3Client: vi.fn(),
    readThreadComments: vi.fn().mockResolvedValue({ comments: [], nextCursor: null, likeCounts: {}, replyCounts: {} }),
    readThreadReplies: vi.fn().mockResolvedValue({ comments: [], nextCursor: null, likeCounts: {} }),
    createThreadComment: vi.fn().mockResolvedValue({ _id: 'c1' }),
    createComment: vi.fn().mockResolvedValue({ _id: 'c1' }),
    createRepost: vi.fn().mockResolvedValue({ _id: 'rp1' }),
    createPost: vi.fn().mockResolvedValue({ _id: 'p1' }),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'm1' }),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
    readSettings: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn().mockResolvedValue({}),
    updatePost: vi.fn().mockResolvedValue({}),
    deletePost: vi.fn().mockResolvedValue(undefined),
    movePostVisibility: vi.fn().mockResolvedValue({}),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock wapi (a signed-in reader — the repeat icon is interactive).
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
}));

// The post a surface's repeat icon is tapped on.
const POST = {
  _id: 'post-1',
  text: 'A post worth amplifying',
  created_at: new Date().toISOString(),
  author_username: 'alice',
  author_provider: 'test.localhost',
  visibility: 'public',
};

describe('Repost: the repeat icon opens the composer in repost mode on EVERY surface (reposts.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(data.readReactions).mockResolvedValue([]);
    vi.mocked(data.countComments).mockResolvedValue(0);
    vi.mocked(data.readRepostCounts).mockResolvedValue({});
    vi.mocked(data.readMyRepostedIds).mockResolvedValue(new Set<string>());
    vi.mocked(data.readDiscoverFeed).mockResolvedValue([]);
    vi.mocked(data.readGroupDetail).mockResolvedValue(null);
    vi.mocked(data.getV3Client).mockReturnValue({
      read: vi.fn().mockResolvedValue([]),
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    } as never);
  });

  describe('PostLightbox (the lightbox repeat icon)', () => {
    it('tapping the repeat icon opens the composer in repost mode (setRepostingTo), never a silent toggle', async () => {
      const { PostLightbox } = await import('@/components/Bio/PostLightbox');
      render(
        <MemoryRouter>
          <PostLightbox post={POST as any} mediaMap={{}} onClose={vi.fn()} />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      fireEvent.click(btn);
      expect(setRepostingToSpy).toHaveBeenCalledWith(POST);
    });

    it('the repost count is the number of repost_of posts (readRepostCounts), not type=repost reactions', async () => {
      vi.mocked(data.readRepostCounts).mockResolvedValue({ 'post-1': 5 });
      const { PostLightbox } = await import('@/components/Bio/PostLightbox');
      render(
        <MemoryRouter>
          <PostLightbox post={POST as any} mediaMap={{}} onClose={vi.fn()} />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      await waitFor(() => expect(btn).toHaveTextContent('5'));
    });

    it('the "I reposted this" fill comes from the reader\'s own repost post (readMyRepostedIds)', async () => {
      vi.mocked(data.readMyRepostedIds).mockResolvedValue(new Set(['post-1']));
      const { PostLightbox } = await import('@/components/Bio/PostLightbox');
      render(
        <MemoryRouter>
          <PostLightbox post={POST as any} mediaMap={{}} onClose={vi.fn()} />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'));
    });
  });

  describe('ProfileFeed (the profile feed repeat icon)', () => {
    it('tapping the repeat icon opens the composer in repost mode (setRepostingTo)', async () => {
      const { ProfileFeed } = await import('@/components/Bio/ProfileFeed');
      render(
        <MemoryRouter>
          <ProfileFeed posts={[POST as any]} mediaMap={{}} authorName="Alice" authorUsername="alice" />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      fireEvent.click(btn);
      expect(setRepostingToSpy).toHaveBeenCalledWith(POST);
    });

    it('the repost count is the number of repost_of posts (readRepostCounts)', async () => {
      vi.mocked(data.readRepostCounts).mockResolvedValue({ 'post-1': 4 });
      const { ProfileFeed } = await import('@/components/Bio/ProfileFeed');
      render(
        <MemoryRouter>
          <ProfileFeed posts={[POST as any]} mediaMap={{}} authorName="Alice" authorUsername="alice" />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      await waitFor(() => expect(btn).toHaveTextContent('4'));
    });
  });

  describe('DiscoverScreen (the discover repeat icon)', () => {
    it('tapping the repeat icon opens the composer in repost mode (setRepostingTo)', async () => {
      vi.mocked(data.readDiscoverFeed).mockResolvedValueOnce([POST as any]);
      const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
      render(
        <MemoryRouter initialEntries={['/discover?view=grid']}>
          <DiscoverScreen />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      fireEvent.click(btn);
      expect(setRepostingToSpy).toHaveBeenCalledWith(expect.objectContaining({ _id: 'post-1' }));
    });

    it('the repost count is the number of repost_of posts (readRepostCounts)', async () => {
      vi.mocked(data.readDiscoverFeed).mockResolvedValueOnce([POST as any]);
      vi.mocked(data.readRepostCounts).mockResolvedValue({ 'post-1': 7 });
      const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
      render(
        <MemoryRouter initialEntries={['/discover?view=grid']}>
          <DiscoverScreen />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      await waitFor(() => expect(btn).toHaveTextContent('7'));
    });
  });

  describe('GroupDetailScreen (the group feed repeat icon)', () => {
    it('tapping the repeat icon opens the composer in repost mode (setRepostingTo)', async () => {
      vi.mocked(data.readGroupDetail).mockResolvedValue({
        group_id: 'g1',
        name: 'Gaming Night',
        owner: 'carol',
        is_member: true,
        posts_state: 'ok',
        posts: [{ doc_id: 'post-1', author_key: 'carol', collection_name: 'posts', body: { text: 'Who is in for Friday?' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
      } as never);
      const { default: GroupDetailScreen } = await import('@/components/Groups/GroupDetailScreen');
      render(
        <MemoryRouter initialEntries={['/groups/g1']}>
          <GroupDetailScreen groupId="g1" />
        </MemoryRouter>,
      );
      const btn = await screen.findByTestId('repost-button');
      fireEvent.click(btn);
      expect(setRepostingToSpy).toHaveBeenCalledWith(expect.objectContaining({ _id: 'post-1' }));
    });
  });
});
