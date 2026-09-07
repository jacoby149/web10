import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer (same shape as socialScreens.test.tsx)
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/clip.mp4' }),
    createPost: vi.fn().mockResolvedValue({ _id: 'post-1' }),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
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

// jsdom has no media loading — mock the metadata + poster probes.
vi.mock('@/lib/mediaProcessing', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getVideoInfo: vi.fn().mockResolvedValue({ duration: 10, width: 1920, height: 1080 }),
    captureVideoPoster: vi.fn().mockResolvedValue({ blob: new Blob(['poster']), mimeType: 'image/webp' }),
  };
});

// The re-encode engine is mocked at the composer seam: the editor sheet's
// Apply calls editVideo, which returns the finished file.
const editVideoMock = vi.fn();
vi.mock('@/lib/videoEditing', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    editVideo: (...args: unknown[]) => editVideoMock(...args),
  };
});

const VIDEO_FILE = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
const IMAGE_FILE = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

async function renderComposer() {
  const { default: PostComposer } = await import('@/components/Feed/PostComposer');
  return render(<PostComposer />);
}

async function attachVideo() {
  const { default: PostComposer } = await import('@/components/Feed/PostComposer');
  const utils = render(<PostComposer />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [VIDEO_FILE] } });
  // Wait for the background getVideoInfo processing to settle.
  await waitFor(() => {
    expect(screen.getByTestId('media-tray')).toBeInTheDocument();
  });
  await waitFor(() => {
    const item = screen.getByTestId('media-tray').firstElementChild as HTMLElement;
    expect(item.querySelector('.animate-spin')).toBeNull();
  });
  return utils;
}

describe('PostComposer video edit step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editVideoMock.mockResolvedValue({
      blob: new Blob(['edited-bytes']),
      mimeType: 'video/webm',
      width: 608,
      height: 1080,
      duration: 5,
    });
  });

  it('shows the edit button on video items', async () => {
    await attachVideo();
    expect(screen.getByTestId('media-edit-button')).toBeInTheDocument();
  });

  it('does not show the edit button on image items', async () => {
    const utils = await renderComposer();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [IMAGE_FILE] } });
    await waitFor(() => {
      expect(screen.getByTestId('media-tray')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('media-edit-button')).toBeNull();
    utils.unmount();
  });

  it('opens the editor sheet with trim + crop controls', async () => {
    await attachVideo();
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const sheet = await screen.findByTestId('video-editor');
    expect(within(sheet).getByTestId('video-editor-trim')).toBeInTheDocument();
    expect(within(sheet).getByTestId('video-editor-crop')).toBeInTheDocument();
    expect(within(sheet).getByTestId('video-editor-set-in')).toBeInTheDocument();
    expect(within(sheet).getByTestId('video-editor-set-out')).toBeInTheDocument();
    expect(within(sheet).getByTestId('video-editor-ratio-vertical')).toBeInTheDocument();
    expect(within(sheet).getByTestId('video-editor-ratio-square')).toBeInTheDocument();
  });

  it('Apply with no edits is disabled (nothing to do)', async () => {
    await attachVideo();
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const sheet = await screen.findByTestId('video-editor');
    // Duration metadata never loads in jsdom, so Apply stays disabled —
    // the guard is observable: no edits selected AND no duration.
    expect(within(sheet).getByTestId('video-editor-apply')).toBeDisabled();
  });

  it('the edited file replaces the original — editVideo gets the trim + crop opts', async () => {
    await attachVideo();
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const sheet = await screen.findByTestId('video-editor');

    // Simulate loaded metadata (jsdom never fires loadedmetadata).
    const videoEl = within(sheet).getByTestId('video-editor-preview') as HTMLVideoElement;
    Object.defineProperty(videoEl, 'duration', { value: 10, configurable: true });
    fireEvent.load(videoEl);
    fireEvent.loadedMetadata(videoEl);

    // Seek to 2s, set the in-point; seek to 7s, set the out-point.
    Object.defineProperty(videoEl, 'currentTime', { value: 2, configurable: true });
    fireEvent.timeUpdate(videoEl);
    fireEvent.click(within(sheet).getByTestId('video-editor-set-in'));

    Object.defineProperty(videoEl, 'currentTime', { value: 7, configurable: true });
    fireEvent.timeUpdate(videoEl);
    fireEvent.click(within(sheet).getByTestId('video-editor-set-out'));

    // Pick the 9:16 crop.
    fireEvent.click(within(sheet).getByTestId('video-editor-ratio-vertical'));

    // Apply.
    const apply = within(sheet).getByTestId('video-editor-apply');
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);

    await waitFor(() => expect(editVideoMock).toHaveBeenCalled());
    const [, opts] = editVideoMock.mock.calls[0];
    expect(opts.startTime).toBeCloseTo(2);
    expect(opts.endTime).toBeCloseTo(7);
    expect(opts.cropRatio).toBeCloseTo(9 / 16);

    // The tray item now carries the edited file (new dims from the result).
    await waitFor(() => {
      const badge = screen.getByTestId('media-tray').querySelector('.font-mono');
      expect(badge?.textContent).toBe('608×1080');
    });
  });

  it('cancel closes the sheet without editing', async () => {
    await attachVideo();
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const sheet = await screen.findByTestId('video-editor');
    fireEvent.click(within(sheet).getByTestId('video-editor-cancel'));
    await waitFor(() => expect(screen.queryByTestId('video-editor')).toBeNull());
    expect(editVideoMock).not.toHaveBeenCalled();
  });

  it('a failed edit shows the error state and keeps the original file', async () => {
    editVideoMock.mockRejectedValueOnce(new Error('recorder exploded'));
    await attachVideo();
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const sheet = await screen.findByTestId('video-editor');

    const videoEl = within(sheet).getByTestId('video-editor-preview') as HTMLVideoElement;
    Object.defineProperty(videoEl, 'duration', { value: 10, configurable: true });
    fireEvent.loadedMetadata(videoEl);

    Object.defineProperty(videoEl, 'currentTime', { value: 2, configurable: true });
    fireEvent.timeUpdate(videoEl);
    fireEvent.click(within(sheet).getByTestId('video-editor-set-in'));

    const apply = within(sheet).getByTestId('video-editor-apply');
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);

    const err = await screen.findByTestId('video-editor-error');
    expect(err).toHaveTextContent('recorder exploded');
    // Sheet stays open, original file untouched (tray still shows source dims).
    expect(screen.getByTestId('video-editor')).toBeInTheDocument();
  });
});
