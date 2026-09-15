import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// The crop encoder is mocked (jsdom has no createImageBitmap / canvas.toBlob)
// — the math (clampFaceCrop / faceCropRect) is unit-tested in faceCrop.test.ts.
// The real functions stay live so the component's pan/zoom clamping is tested
// against the real math.
vi.mock('@/lib/faceCrop', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/faceCrop')>();
  return {
    ...original,
    cropFaceImage: vi.fn().mockResolvedValue({
      blob: new Blob(['cropped'], { type: 'image/jpeg' }),
      width: 512,
      height: 512,
      mimeType: 'image/jpeg',
    }),
  };
});

// Resolved media refs (the API read path shape — they carry a url to render).
const AVATAR_REF = { doc_id: 'avatar-doc', read_url: 'https://cdn/avatar.png', mime_type: 'image/png', object_key: 'obj/av' };
const BANNER_REF = { doc_id: 'banner-doc', read_url: 'https://cdn/banner.png', mime_type: 'image/png', object_key: 'obj/bn' };
const POST_MEDIA_1 = { doc_id: 'pm1', read_url: 'https://cdn/pm1.png', mime_type: 'image/png', object_key: 'obj/pm1' };
const POST_MEDIA_2 = { doc_id: 'pm2', read_url: 'https://cdn/pm2.png', mime_type: 'image/png', object_key: 'obj/pm2' };
const VIDEO_REF = { doc_id: 'vid1', read_url: 'https://cdn/vid1.mp4', mime_type: 'video/mp4', thumbnail_url: 'https://cdn/vid1-thumb.jpg' };

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
// The crop upload — returns a fresh media doc (the crop ships as its own doc).
const mockUploadMedia = vi.fn().mockResolvedValue({ _id: 'crop-doc-1', object_key: 'obj/crop1' });
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
      if (id === VIDEO_REF.doc_id) return { _id: id, url: VIDEO_REF.read_url, created_at: '', mime_type: 'video/mp4', thumbnail_url: VIDEO_REF.thumbnail_url };
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
    uploadMedia: mockUploadMedia,
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

// Open the face lightbox, tap the first pickable tile, and wait for the crop
// view. The crop image needs a load event (jsdom fires it for <img>) so the
// natural dims are known — the confirm button enables on that.
async function openCropView(field: 'profile-avatar' | 'profile-banner') {
  fireEvent.click(screen.getByTestId(field));
  await screen.findByTestId('profile-media-picker');
  const tiles = await screen.findAllByTestId('profile-media-pick');
  fireEvent.click(tiles[0]);
  const view = await screen.findByTestId('face-crop-view');
  // The preview image loads (jsdom fires load synchronously on src set).
  await waitFor(() => {
    const img = screen.getByTestId('face-crop-image');
    expect(img).toHaveAttribute('src');
  });
  return view;
}

describe('Profile face lightbox — click avatar/banner to view enlarged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking the avatar opens the lightbox showing the enlarged profile picture (picker below)', async () => {
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

  it('Escape closes the face lightbox (from the picker view)', async () => {
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
    expect(screen.getByText(/Post a photo first/i)).toBeInTheDocument();
  });

  it('pick tiles render the actual image src (not undefined / greyed out)', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-picker');
    const tiles = await screen.findAllByTestId('profile-media-pick');
    // Each image tile must have an <img> with a real src (read_url mapped to url)
    for (const tile of tiles) {
      const img = tile.querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBeTruthy();
      expect(img!.getAttribute('src')).not.toBe('');
    }
  });

  it('video media is NOT offered as a pickable face option', async () => {
    mockReadMyPosts.mockResolvedValueOnce([
      { _id: 'p1', text: 'A photo post', media_refs: [POST_MEDIA_1], created_at: new Date().toISOString() },
      { _id: 'p3', text: 'A video post', media_refs: [VIDEO_REF], created_at: new Date().toISOString() },
    ]);
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-avatar'));
    await screen.findByTestId('profile-media-picker');
    const tiles = await screen.findAllByTestId('profile-media-pick');
    // Only the image post is pickable; the video is excluded.
    expect(tiles).toHaveLength(1);
    const img = tiles[0].querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(POST_MEDIA_1.read_url);
  });
});

describe('Profile face lightbox — the crop step (Facebook-style "how it displays")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tapping a tile opens the crop view (no save yet — the crop is a sub-step)', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    // The crop view is open, the picker grid is gone (the modal is one step at a time).
    expect(screen.getByTestId('face-crop-view')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-media-picker')).not.toBeInTheDocument();
    // Nothing is saved until the crop is confirmed.
    expect(mockSaveProfile).not.toHaveBeenCalled();
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('the avatar crop frame is a circle (the display mask)', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    const frame = screen.getByTestId('face-crop-frame');
    expect(frame.className).toContain('rounded-full');
  });

  it('the banner crop frame is the wide band (not a circle)', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-banner'));
    await screen.findByTestId('profile-media-picker');
    const tiles = await screen.findAllByTestId('profile-media-pick');
    fireEvent.click(tiles[0]);
    const frame = await screen.findByTestId('face-crop-frame');
    expect(frame.className).not.toContain('rounded-full');
    expect(frame.className).toContain('rounded-md');
  });

  it('the crop preview shows the picked image', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    const img = screen.getByTestId('face-crop-image');
    expect(img).toHaveAttribute('src', POST_MEDIA_1.read_url);
  });

  it('confirming the crop uploads it and saves the NEW media doc as the face', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    // The confirm is disabled until the preview image loads its natural dims.
    const confirm = screen.getByTestId('face-crop-confirm');
    expect(confirm).toBeDisabled();
    // jsdom: fire the load event so the natural dims are known.
    act(() => {
      fireEvent.load(screen.getByTestId('face-crop-image'));
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(mockUploadMedia).toHaveBeenCalled());
    // The upload is the crop (a File from the cropped blob, public_media).
    const uploadArg = mockUploadMedia.mock.calls[0][0];
    expect(uploadArg.file).toBeInstanceOf(File);
    expect(uploadArg.service).toBe('public_media');
    expect(uploadArg.width).toBe(512);
    expect(uploadArg.height).toBe(512);
    // The profile points at the NEW crop doc (not the post's media doc).
    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalled());
    const arg = mockSaveProfile.mock.calls[0][0];
    expect(arg.avatar_ref).toBe('crop-doc-1');
    expect(arg.avatar_ref).not.toBe(POST_MEDIA_1.doc_id);
    // The lightbox closes after the save.
    await waitFor(() => expect(screen.queryByTestId('profile-media-lightbox')).not.toBeInTheDocument());
  });

  it('confirming a banner crop saves the new doc as banner_ref (avatar untouched)', async () => {
    await renderOwnProfile();
    fireEvent.click(screen.getByTestId('profile-banner'));
    await screen.findByTestId('profile-media-picker');
    const tiles = await screen.findAllByTestId('profile-media-pick');
    fireEvent.click(tiles[1]); // the second post's media (pm2)
    await screen.findByTestId('face-crop-view');
    act(() => {
      fireEvent.load(screen.getByTestId('face-crop-image'));
    });
    await waitFor(() => expect(screen.getByTestId('face-crop-confirm')).toBeEnabled());
    fireEvent.click(screen.getByTestId('face-crop-confirm'));
    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalled());
    const arg = mockSaveProfile.mock.calls[0][0];
    expect(arg.banner_ref).toBe('crop-doc-1');
    expect(arg.avatar_ref).toBe(AVATAR_REF.doc_id);
  });

  it('back from the crop returns to the picker (the modal stays open)', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    fireEvent.click(screen.getByTestId('face-crop-back'));
    await waitFor(() => expect(screen.queryByTestId('face-crop-view')).not.toBeInTheDocument());
    // The picker is back, the modal is still open.
    expect(await screen.findByTestId('profile-media-picker')).toBeInTheDocument();
    expect(screen.getByTestId('profile-media-lightbox')).toBeInTheDocument();
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });

  it('Escape in the crop view goes back to the picker, not out of the modal', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByTestId('face-crop-view')).not.toBeInTheDocument());
    // The modal is still open (the picker is back).
    expect(await screen.findByTestId('profile-media-picker')).toBeInTheDocument();
    // A second Escape closes the modal.
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByTestId('profile-media-lightbox')).not.toBeInTheDocument());
  });

  it('the zoom controls adjust the zoom (and the readout tracks it)', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    act(() => {
      fireEvent.load(screen.getByTestId('face-crop-image'));
    });
    const readout = screen.getByTestId('face-crop-view').textContent;
    expect(readout).toContain('100%');
    fireEvent.click(screen.getByTestId('face-crop-zoom-in'));
    await waitFor(() => expect(screen.getByTestId('face-crop-view').textContent).toContain('130%'));
    fireEvent.click(screen.getByTestId('face-crop-zoom-out'));
    await waitFor(() => expect(screen.getByTestId('face-crop-view').textContent).toContain('100%'));
  });

  it('zoom-out is disabled at the cover baseline (scale 1)', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    act(() => {
      fireEvent.load(screen.getByTestId('face-crop-image'));
    });
    await waitFor(() => expect(screen.getByTestId('face-crop-confirm')).toBeEnabled());
    expect(screen.getByTestId('face-crop-zoom-out')).toBeDisabled();
    expect(screen.getByTestId('face-crop-zoom-in')).toBeEnabled();
  });

  it('reset returns the crop to the cover baseline', async () => {
    await renderOwnProfile();
    await openCropView('profile-avatar');
    act(() => {
      fireEvent.load(screen.getByTestId('face-crop-image'));
    });
    await waitFor(() => expect(screen.getByTestId('face-crop-confirm')).toBeEnabled());
    // Reset is disabled at the baseline…
    expect(screen.getByTestId('face-crop-reset')).toBeDisabled();
    // …zoom in, then it is enabled, and clicking it returns to 100%.
    fireEvent.click(screen.getByTestId('face-crop-zoom-in'));
    await waitFor(() => expect(screen.getByTestId('face-crop-view').textContent).toContain('130%'));
    expect(screen.getByTestId('face-crop-reset')).toBeEnabled();
    fireEvent.click(screen.getByTestId('face-crop-reset'));
    await waitFor(() => expect(screen.getByTestId('face-crop-view').textContent).toContain('100%'));
  });

  it('a crop failure shows the error state (the lightbox stays open)', async () => {
    const { cropFaceImage } = await import('@/lib/faceCrop');
    vi.mocked(cropFaceImage).mockRejectedValueOnce(new Error('boom'));
    await renderOwnProfile();
    await openCropView('profile-avatar');
    act(() => {
      fireEvent.load(screen.getByTestId('face-crop-image'));
    });
    await waitFor(() => expect(screen.getByTestId('face-crop-confirm')).toBeEnabled());
    fireEvent.click(screen.getByTestId('face-crop-confirm'));
    expect(await screen.findByTestId('face-crop-error')).toHaveTextContent('boom');
    // The lightbox is still open (the user can retry or back out).
    expect(screen.getByTestId('profile-media-lightbox')).toBeInTheDocument();
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });
});
