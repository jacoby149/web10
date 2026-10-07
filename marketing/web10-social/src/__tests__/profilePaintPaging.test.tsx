import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer (the profile's reads + the paging seam).
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readProfile: vi.fn().mockResolvedValue({ display_name: 'Me' }),
    saveProfile: vi.fn().mockResolvedValue({}),
    readMyPosts: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockImplementation((username: string) =>
      Promise.resolve({ display_name: 'Test User', username }),
    ),
    readUserPublicProfile: vi.fn().mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined }),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/img.png' }),
    refreshMediaUrls: vi.fn().mockImplementation(async (records: unknown[]) => records),
    createPost: vi.fn().mockResolvedValue({ _id: 'post-1' }),
    followUser: vi.fn().mockResolvedValue({ _id: 'follow-1', status: 'active' }),
    unfollowUser: vi.fn().mockResolvedValue(undefined),
    readFollow: vi.fn().mockResolvedValue(null),
    countFollows: vi.fn().mockResolvedValue(0),
    countFollowers: vi.fn().mockResolvedValue(0),
    countUserFollowingReal: vi.fn().mockResolvedValue(0),
    countStagingPosts: vi.fn().mockResolvedValue(0),
    getMyCollections: vi.fn().mockResolvedValue([]),
    readUserPublicCollections: vi.fn().mockResolvedValue([]),
  };
});

// Mock wapi (the owner's token — username `testuser` matches the profile route).
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
}));

globalThis.fetch = vi.fn();

const { readMyPosts, readUserPublicProfile, resolveMediaRefs, readProfile, readUserProfile } =
  await import('@/data');

// A post whose media is INLINE-RESOLVED on the read (the node's `/v3/read`
// shape — presigned read_url + thumbnail_url on the ref object, not a bare
// doc_id string). This is what the profile paints from on the ONE read.
const INLINE_IMAGE_POST = {
  _id: 'p1',
  text: 'a post with a photo',
  created_at: new Date().toISOString(),
  media_refs: [
    {
      doc_id: 'm1',
      read_url: 'https://cdn.example/photo.jpg?sig=x',
      thumbnail_url: 'https://cdn.example/thumb.jpg',
      mime_type: 'image/jpeg',
      width: 1080,
      height: 1080,
    },
  ],
};

async function renderOwnProfile() {
  const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
  return render(
    <MemoryRouter initialEntries={['/u/testuser']}>
      <UserProfileScreen username="testuser" provider="test.localhost" />
    </MemoryRouter>,
  );
}

describe('Profile paints on the ONE read + pages its wall', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => [],
    });
    // Re-assert the module-level mock defaults (clearAllMocks clears calls, not
    // implementations — a leaked override persists across tests).
    vi.mocked(readProfile).mockResolvedValue({ display_name: 'Me' });
    vi.mocked(readUserProfile).mockImplementation((username: string) =>
      Promise.resolve({ display_name: 'Test User', username }),
    );
    vi.mocked(readMyPosts).mockResolvedValue([]);
    vi.mocked(readUserPublicProfile).mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined });
    vi.mocked(resolveMediaRefs).mockResolvedValue([]);
  });

  it('the owner profile paints its grid from the ONE read — inline media, no second media round-trip holding the first paint', async () => {
    // Regression: the old owner path gated `setLoading(false)` behind a
    // SEQUENTIAL `await resolveMediaRefs(allRefs)` (every post's media + the
    // avatar + the banner) AFTER the Promise.all — so the whole-screen skeleton
    // held until a redundant media re-read landed (the node's read already
    // returned the media inline). The grid must paint from the inline-resolved
    // refs after the ONE read; the face fallback (the avatar, a bare doc_id)
    // runs in the background and never holds the paint.
    // Gate the media round-trip behind a promise that is NEVER released: if
    // the grid still paints, the paint is not waiting on a round-trip it
    // never needs.
    let releaseMedia: () => void;
    const mediaGate = new Promise<void>((resolve) => { releaseMedia = resolve; });
    vi.mocked(resolveMediaRefs).mockImplementation(async () => {
      await mediaGate;
      return [];
    });
    // The profile carries a bare avatar_ref (a write-path string, NOT inline
    // on the posts) — so the face fallback WOULD call resolveMediaRefs. The
    // grid must paint anyway (from the posts' inline media), not wait on it.
    vi.mocked(readProfile).mockResolvedValue({ display_name: 'Me', avatar_ref: 'avatar-1' });
    vi.mocked(readMyPosts).mockResolvedValue([INLINE_IMAGE_POST]);

    await renderOwnProfile();

    // The posts read has resolved — the grid paints IMMEDIATELY, and the tile
    // already carries the inline-resolved thumbnail (no grey fallback, no
    // second render swap).
    await waitFor(() => {
      expect(screen.getByTestId('profile-post-cell')).toBeInTheDocument();
    });
    // The tile's image is the INLINE read_url (from the one read) — not a
    // URL the gated resolveMediaRefs would have minted.
    const img = screen.getByTestId('profile-post-cell').querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example/photo.jpg?sig=x');
    // The face fallback IS in flight (the avatar is a bare doc_id) — but the
    // paint did not wait on it (the grid is already up while it's gated).
    expect(resolveMediaRefs).toHaveBeenCalledWith(['avatar-1']);
    void releaseMedia; // the gate is never released — the paint must not need it
  });

  it('the visitor profile paints its grid from the ONE read — inline media + the face, no second media round-trip', async () => {
    // The visitor path reads through the D73 query engine (readUserPublicProfile)
    // — the posts' media is inline + the face URLs are minted by the prepare
    // pass. The grid + the face must paint after the ONE read (no sequential
    // collections / counts fan-out holding the skeleton).
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    vi.mocked(readUserPublicProfile).mockResolvedValue({
      posts: [INLINE_IMAGE_POST],
      avatarUrl: 'https://cdn.example/avatar.jpg',
      bannerUrl: 'https://cdn.example/banner.jpg',
    });
    // The visitor path reads the face via readUserProfile (not readProfile).
    vi.mocked(readUserProfile).mockResolvedValue({ display_name: 'Nova', avatar_ref: 'avatar-1', banner_ref: 'banner-1' });

    render(
      <MemoryRouter initialEntries={['/u/nova']}>
        <UserProfileScreen username="nova" provider="test.localhost" />
      </MemoryRouter>,
    );

    // The grid paints from the inline-resolved media after the one read.
    await waitFor(() => {
      expect(screen.getByTestId('profile-post-cell')).toBeInTheDocument();
    });
    const img = screen.getByTestId('profile-post-cell').querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example/photo.jpg?sig=x');
    // The face (avatar) paints from the query engine's minted URL — no
    // resolveMediaRefs round-trip (the visitor path never calls it).
    expect(screen.getByTestId('avatar-image')).toHaveAttribute('src', 'https://cdn.example/avatar.jpg');
    expect(resolveMediaRefs).not.toHaveBeenCalled();
  });

  it('the wall pages: a full first page shows the sentinel, firing it appends the next page (offset 50)', async () => {
    // The operator: "if paging here, lets page on all surfaces" — the profile
    // was the one surface that never paged (a creator with N > 50 posts only
    // ever saw the first page). The Video wall's pattern (3.222.0): a paged
    // read + a sentinel that appends the next page, advancing the offset.
    // Page 1: a FULL page (50 posts → hasMore true). Page 2: a short page
    // (2 posts → hasMore false, the last one).
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      _id: `p-${i}`,
      text: `post ${i}`,
      created_at: new Date().toISOString(),
    }));
    const page2 = [
      { _id: 'p-100', text: 'post 100', created_at: new Date().toISOString() },
      { _id: 'p-101', text: 'post 101', created_at: new Date().toISOString() },
    ];
    vi.mocked(readMyPosts).mockImplementation(async (opts?: { limit?: number; offset?: number }) => {
      const offset = opts?.offset ?? 0;
      return offset === 0 ? page1 : page2;
    });

    await renderOwnProfile();

    // Page 1 lands — the grid has all 50 posts.
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell')).toHaveLength(50);
    });
    // The sentinel is present (hasMore true — a full page).
    expect(screen.getByTestId('profile-wall-sentinel')).toBeInTheDocument();

    // The sentinel is visible → the observer fires → loadMore appends page 2
    // (offset 50).
    (globalThis as unknown as Record<string, () => void>).fireIntersectionObservers();
    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell')).toHaveLength(52);
    });
    // The second page was fetched with the next offset (PAGE_SIZE = 50).
    expect(readMyPosts).toHaveBeenLastCalledWith({ limit: 50, offset: 50 });
    // hasMore is now false (page 2 was short) → the sentinel is gone.
    expect(screen.queryByTestId('profile-wall-sentinel')).toBeNull();
  });

  it('no wall sentinel when the first page is the last (hasMore false)', async () => {
    // The first page is short (2 posts < 50) → hasMore false → no sentinel,
    // no "load more" (the wall is exhausted on page one).
    vi.mocked(readMyPosts).mockResolvedValue([
      { _id: 'p-0', text: 'post 0', created_at: new Date().toISOString() },
      { _id: 'p-1', text: 'post 1', created_at: new Date().toISOString() },
    ]);

    await renderOwnProfile();

    await waitFor(() => {
      expect(screen.getAllByTestId('profile-post-cell')).toHaveLength(2);
    });
    expect(screen.queryByTestId('profile-wall-sentinel')).toBeNull();
  });
});
