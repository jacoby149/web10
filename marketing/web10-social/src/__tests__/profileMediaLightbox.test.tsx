import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Resolved media refs (the API read path shape — they carry a url to render).
const AVATAR_REF = { doc_id: 'avatar-doc', read_url: 'https://cdn/avatar.png', mime_type: 'image/png', object_key: 'obj/av' };
const BANNER_REF = { doc_id: 'banner-doc', read_url: 'https://cdn/banner.png', mime_type: 'image/png', object_key: 'obj/bn' };
const POST_MEDIA_1 = { doc_id: 'pm1', read_url: 'https://cdn/pm1.png', mime_type: 'image/png', object_key: 'obj/pm1' };
const POST_MEDIA_2 = { doc_id: 'pm2', read_url: 'https://cdn/pm2.png', mime_type: 'image/png', object_key: 'obj/pm2' };

const mockReadProfile = vi.fn().mockResolvedValue({
  _id: 'profile-1',
  display_name: 'Test User',
  bio: 'Hello world',
  avatar_ref: AVATAR_REF.doc_id,
  banner_ref: BANNER_REF.doc_id,
});
const mockReadMyPosts = vi.fn().mockResolvedValue([
  { _id: 'p1', text: 'A photo post', media_refs: [POST_MEDIA_1], created_at: new Date().toISOString() },
  { _id: 'p2', text: 'Another photo', media_refs: [POST_MEDIA_2], created_at: new Date().toISOString() },
]);
const mockCountFollows = vi.fn().mockResolvedValue(0);
const mockCountFollowers = vi.fn().mockResolvedValue(0);
const mockCountStagingPosts = vi.fn().mockResolvedValue(0);
const mockSaveProfile = vi.fn().mockImplementation((p) => Promise.resolve({ _id: 'profile-1', ...p }));
// resolveMediaRefs: map the avatar/banner/post-media doc_ids to MediaRecords.
// Refs arrive in two shapes — resolved objects (the post's media_refs, the API
// read path) and bare doc_id strings (avatar_ref/banner_ref). The mock keys on
// the doc_id either way.
const mockResolveMediaRefs = vi.fn().mockImplementation((refs: (string | { doc_id?: string })[]) =>
  Promise.resolve(
    refs.map((ref) => {
      const id = typeof ref === 'string' ? ref : ref.doc_id || '';
      if (id === AVATAR_REF.doc_id) return { _id: id, url: AVATAR_REF.read_url, created_at: '', mime_type: 'image/png' };
      if (id === BANNER_REF.doc_id) return { _id: id, url: BANNER_REF.read_url, created_at: '', mime_type: 'image/png' };
      if (id === POST_MEDIA_1.doc_id) return { _id: id, url: POST_MEDIA_1.read_url, created_at: '', mime_type: 'image/png' };
      if (id === POST_MEDIA_2.doc_id) return { _id: id, url: POST_MEDIA_2.read_url, created_at: '', mime_type: 'image/png' };
      return { _id: id, url: `https://cdn/${id}.png`, created_at: '', mime_type: 'image/png' };
    }),
  ),
);

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readProfile: mockReadProfile,
    readUserProfile: vi.fn().mockResolvedValue(null),
    readMyPosts: mockReadMyPosts,
    readUserPublicPosts: vi.fn().mockResolvedValue([]),
    countFollows: mockCountFollows,
    countFollowers: mockCountFollowers,
    countUserFollowing: vi.fn().mockResolvedValue(0),
    countStagingPosts: mockCountStagingPosts,
    saveProfile: mockSaveProfile,
    resolveMediaRefs: mockResolveMediaRefs,
    readFollow: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
  createWapiWrapper: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    isSignedIn: vi.fn().mockReturnValue(false),
    signOut: vi.fn(),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
  }),
  resetWapi: vi.fn(),
}));

// The signed-in user is 'testuser', so rendering the profile for 'testuser'
// takes the OWNER path (isOwnProfile = true) — the picker is available.
async function renderOwnProfile() {
  const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
  render(
    <MemoryRouter>
      <UserProfileScreen username="testuser" provider="test.localhost" />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
}

describe('Profile face lightbox — click avatar/banner to view enlarged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking the avatar opens the lightbox showing the enlarged profile picture (no picker for the owner yet — picker is below)', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    const lightbox = await screen.findByTestId('profile-media-lightbox');
    expect(lightbox).toBeInTheDocument();
    // The enlarged avatar image is shown.
    const img = await screen.findByTestId('profile-media-lightbox-image');
    expect(img).toHaveAttribute('src', AVATAR_REF.read_url);
  });

  it('clicking the banner opens the lightbox showing the enlarged banner', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-banner'));
    await screen.findByTestId('profile-media-lightbox');
    const img = await screen.findByTestId('profile-media-lightbox-image');
    expect(img).toHaveAttribute('src', BANNER_REF.read_url);
  });

  it('Escape closes the face lightbox', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-lightbox');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByTestId('profile-media-lightbox')).not.toBeInTheDocument());
  });

  it('the close button closes the face lightbox', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-lightbox');
    fireEvent.click(screen.getByTestId('profile-media-lightbox-close'));
    await waitFor(() => expect(screen.queryByTestId('profile-media-lightbox')).not.toBeInTheDocument());
  });
});

describe('Profile face lightbox — the Facebook-like "your profile picture is a post you selected"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the owner sees a pick-from-your-posts grid with their posts\' media', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-picker');
    const tiles = await screen.findAllByTestId('profile-media-pick');
    // Two posts, one media each → two pickable tiles.
    expect(tiles).toHaveLength(2);
  });

  it('tapping a post\'s media sets it as the profile picture (saveProfile with the media doc_id)', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-picker');
    const tiles = await screen.findAllByTestId('profile-media-pick');
    fireEvent.click(tiles[0]); // the first post's media (pm1)
    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalled());
    const arg = mockSaveProfile.mock.calls[0][0];
    expect(arg.avatar_ref).toBe(POST_MEDIA_1.doc_id);
    // The lightbox closes after the save.
    await waitFor(() => expect(screen.queryByTestId('profile-media-lightbox')).not.toBeInTheDocument());
  });

  it('tapping a post\'s media sets it as the banner (saveProfile with banner_ref)', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-banner'));
    await screen.findByTestId('profile-media-picker');
    const tiles = await screen.findAllByTestId('profile-media-pick');
    fireEvent.click(tiles[1]); // the second post's media (pm2)
    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalled());
    const arg = mockSaveProfile.mock.calls[0][0];
    expect(arg.banner_ref).toBe(POST_MEDIA_2.doc_id);
    // The avatar_ref is untouched by a banner pick.
    expect(arg.avatar_ref).toBe(AVATAR_REF.doc_id);
  });

  it('a non-owner (viewer) sees no picker — view-only', async () => {
    // Render a DIFFERENT user's profile → isOwnProfile = false → no picker.
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    // readUserProfile returns a profile with an avatar for the viewed user.
    vi.mocked(await import('@/data')).readUserProfile.mockResolvedValue({
      _id: 'profile-other',
      display_name: 'Someone Else',
      avatar_ref: AVATAR_REF.doc_id,
    });
    render(
      <MemoryRouter>
        <UserProfileScreen username="someoneelse" provider="test.localhost" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Someone Else')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-lightbox');
    // View-only: the enlarged image is there, but no picker grid.
    expect(await screen.findByTestId('profile-media-lightbox-image')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-media-picker')).not.toBeInTheDocument();
  });

  it('with no posts, the picker shows the empty state', async () => {
    mockReadMyPosts.mockResolvedValueOnce([]);
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-picker');
    expect(screen.queryByTestId('profile-media-pick')).not.toBeInTheDocument();
    expect(screen.getByText(/Post a photo or video first/i)).toBeInTheDocument();
  });
});
