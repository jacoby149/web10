import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer (same shape as videoEditor.test.tsx)
const uploadMediaMock = vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/clip.mp4' });
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
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

// jsdom has no media decoding — the capture primitives are mocked. The PURE
// candidate-timing math (thumbnailCandidateTimes) stays real: the sheet runs
// the real function over the mocked duration, so the mock's received `times`
// are the sheet's real seam.
const getVideoInfoMock = vi.fn().mockResolvedValue({ duration: 10, width: 640, height: 360 });
const captureVideoPosterMock = vi.fn().mockResolvedValue({ blob: new Blob(['auto-poster']), mimeType: 'image/webp' });
const captureVideoFramesMock = vi.fn();
const generateThumbnailMock = vi.fn().mockResolvedValue({ blob: new Blob(['processed-custom']), mimeType: 'image/webp' });
vi.mock('@/lib/mediaProcessing', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getVideoInfo: (...args: unknown[]) => getVideoInfoMock(...args),
    captureVideoPoster: (...args: unknown[]) => captureVideoPosterMock(...args),
    captureVideoFrames: (...args: unknown[]) => captureVideoFramesMock(...args),
    generateThumbnail: (...args: unknown[]) => generateThumbnailMock(...args),
  };
});

// The re-encode engine is mocked at the composer seam (the editor sheet's
// Apply calls editVideo, which returns the finished file).
const editVideoMock = vi.fn();
vi.mock('@/lib/videoEditing', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    editVideo: (...args: unknown[]) => editVideoMock(...args),
  };
});

// The ffmpeg.wasm engine is mocked too — the editor sheet pre-warms it on open.
vi.mock('@/lib/ffmpegEngine', () => ({
  loadFFmpeg: vi.fn().mockResolvedValue({}),
  transcodeWithFFmpeg: vi.fn(),
}));

// jsdom has no URL.createObjectURL — mint stable fake URLs so the tray's
// poster / the sheet's previews are assertable.
let objectUrlCounter = 0;
URL.createObjectURL = vi.fn(() => `blob:mock-${objectUrlCounter++}`);
URL.revokeObjectURL = vi.fn();

const VIDEO_FILE = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
const IMAGE_FILE = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

function mintedUrls(): string[] {
  return (URL.createObjectURL as unknown as { mock: { results: Array<{ value: string }> } }).mock.results.map(
    (r) => r.value,
  );
}

async function attachVideo() {
  const { default: PostComposer } = await import('@/components/Feed/PostComposer');
  const utils = render(<PostComposer />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [VIDEO_FILE] } });
  await waitFor(() => {
    expect(screen.getByTestId('media-tray')).toBeInTheDocument();
  });
  await waitFor(() => {
    const item = screen.getByTestId('media-tray').firstElementChild as HTMLElement;
    expect(item.querySelector('.animate-spin')).toBeNull();
  });
  return utils;
}

/** Open the picker and wait for the captured frame tiles to land. */
async function openPicker() {
  fireEvent.click(screen.getByTestId('media-thumbnail-button'));
  const sheet = await screen.findByTestId('video-thumbnail-sheet');
  await waitFor(() => {
    expect(screen.getByTestId('video-thumbnail-frame-0')).toBeInTheDocument();
  });
  return sheet;
}

describe('PostComposer video thumbnail pick (creator cover-frame control)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectUrlCounter = 0;
    getVideoInfoMock.mockResolvedValue({ duration: 10, width: 640, height: 360 });
    captureVideoPosterMock.mockResolvedValue({ blob: new Blob(['auto-poster']), mimeType: 'image/webp' });
    // The sheet's real thumbnailCandidateTimes(10) → [2.5, 5, 7.5]; the mock
    // echoes the requested times back with distinct blobs.
    captureVideoFramesMock.mockImplementation(async (_file: unknown, times: number[]) =>
      times.map((time, i) => ({ time, blob: new Blob([`frame-${i}`]), mimeType: 'image/webp' })),
    );
    generateThumbnailMock.mockResolvedValue({ blob: new Blob(['processed-custom']), mimeType: 'image/webp' });
    editVideoMock.mockResolvedValue({
      blob: new Blob(['edited-bytes']),
      mimeType: 'video/webm',
      width: 204,
      height: 360,
      duration: 10,
    });
  });

  it('offers the thumbnail chip on video items only', async () => {
    await attachVideo();
    expect(screen.getByTestId('media-thumbnail-button')).toBeInTheDocument();
    expect(screen.getByTestId('media-thumbnail-button')).toHaveTextContent('Thumbnail');
    expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull();
  });

  it('no thumbnail chip on image items', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [IMAGE_FILE] } });
    await waitFor(() => {
      expect(screen.getByTestId('media-tray')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('media-thumbnail-button')).toBeNull();
  });

  it('the picker captures the candidate frames (the real times math, mocked decode)', async () => {
    await attachVideo();
    const sheet = await openPicker();
    // Three candidates for the 10s clip + the own-image tile.
    expect(screen.getByTestId('video-thumbnail-frame-0')).toBeInTheDocument();
    expect(screen.getByTestId('video-thumbnail-frame-1')).toBeInTheDocument();
    expect(screen.getByTestId('video-thumbnail-frame-2')).toBeInTheDocument();
    expect(screen.getByTestId('video-thumbnail-custom')).toBeInTheDocument();
    expect(captureVideoFramesMock).toHaveBeenCalledWith(VIDEO_FILE, [2.5, 5, 7.5]);
    // The tiles carry their timestamps (the "which moment" the pick names).
    expect(within(sheet).getByTestId('video-thumbnail-frame-0').textContent).toContain('2.5s');
    expect(within(sheet).getByTestId('video-thumbnail-frame-1').textContent).toContain('5.0s');
    expect(within(sheet).getByTestId('video-thumbnail-frame-2').textContent).toContain('7.5s');
    // Default selection: candidate 0 (the auto-poster's own frame).
    expect(within(sheet).getByTestId('video-thumbnail-frame-0')).toHaveAttribute('aria-pressed', 'true');
  });

  it('picking a frame sets the tray poster and ships that frame as the thumbnail', async () => {
    await attachVideo();
    await openPicker();
    fireEvent.click(screen.getByTestId('video-thumbnail-frame-1'));
    fireEvent.click(screen.getByTestId('video-thumbnail-apply'));

    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());
    // The tray's <video> now carries the pick as its poster (the live
    // preview — what the user sees is what ships).
    const video = screen.getByTestId('media-tray').querySelector('video')!;
    expect(video.getAttribute('poster')).toBe(mintedUrls().at(-1));
    // The chip says the pick is in.
    expect(screen.getByTestId('media-thumbnail-button')).toHaveTextContent('Change thumbnail');

    // Post — the upload carries the picked frame (not the auto poster).
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
    expect(captureVideoPosterMock).not.toHaveBeenCalled();
    const req = uploadMediaMock.mock.calls[0][0] as { file: File; thumbnailFile?: File };
    expect(req.file).toBe(VIDEO_FILE);
    expect(req.thumbnailFile).toBeInstanceOf(File);
    expect(await req.thumbnailFile!.text()).toBe('frame-1');
  });

  it('no pick keeps the pre-picker behavior (auto-captured poster)', async () => {
    await attachVideo();
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
    expect(captureVideoFramesMock).not.toHaveBeenCalled(); // the picker never opened
    expect(captureVideoPosterMock).toHaveBeenCalledTimes(1);
    const req = uploadMediaMock.mock.calls[0][0] as { thumbnailFile?: File };
    expect(await req.thumbnailFile!.text()).toBe('auto-poster');
  });

  it('the own-image option: pick → downscaled through generateThumbnail → ships', async () => {
    await attachVideo();
    const sheet = await openPicker();
    const input = within(sheet).getByTestId('video-thumbnail-custom').querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [IMAGE_FILE] } });
    // The image is processed (the album-art idiom) before it previews.
    await waitFor(() => expect(generateThumbnailMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(within(sheet).getByTestId('video-thumbnail-custom').querySelector('img')).not.toBeNull();
    });
    // The custom tile is selected, the frames are not.
    expect(within(sheet).getByTestId('video-thumbnail-frame-0')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('video-thumbnail-apply'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());

    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
    const req = uploadMediaMock.mock.calls[0][0] as { thumbnailFile?: File };
    expect(await req.thumbnailFile!.text()).toBe('processed-custom');
    expect(req.thumbnailFile!.type).toBe('image/webp');
  });

  it('reopening the picker pre-selects the tray\'s current pick', async () => {
    await attachVideo();
    const sheet = await openPicker();
    fireEvent.click(screen.getByTestId('video-thumbnail-frame-2'));
    fireEvent.click(screen.getByTestId('video-thumbnail-apply'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());

    // Re-open: the capture re-runs (fresh candidates) and frame 2 — the
    // tray's pick, matched by time — is pre-selected.
    fireEvent.click(screen.getByTestId('media-thumbnail-button'));
    await waitFor(() => {
      expect(screen.getByTestId('video-thumbnail-frame-2')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('video-thumbnail-frame-2')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByTestId('video-thumbnail-frame-0')).toHaveAttribute('aria-pressed', 'false');
  });

  it('cancel closes the sheet without picking (the auto poster still ships)', async () => {
    await attachVideo();
    await openPicker();
    fireEvent.click(screen.getByTestId('video-thumbnail-frame-1'));
    fireEvent.click(screen.getByTestId('video-thumbnail-cancel'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());
    // The tray shows no poster yet — nothing was applied.
    const video = screen.getByTestId('media-tray').querySelector('video')!;
    expect(video.getAttribute('poster')).toBeNull();

    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
    const req = uploadMediaMock.mock.calls[0][0] as { thumbnailFile?: File };
    expect(await req.thumbnailFile!.text()).toBe('auto-poster');
  });

  it('a capture failure shows the designed error (the own-image path stays open)', async () => {
    await attachVideo();
    captureVideoFramesMock.mockRejectedValueOnce(new Error('Failed to load the video for thumbnail capture.'));
    fireEvent.click(screen.getByTestId('media-thumbnail-button'));
    // The sheet stays up in its error state (frames never landed).
    const sheet = await screen.findByTestId('video-thumbnail-sheet');
    await waitFor(() => {
      expect(within(sheet).getByTestId('video-thumbnail-error')).toBeInTheDocument();
    });
    expect(within(sheet).getByTestId('video-thumbnail-error')).toHaveTextContent('Failed to load the video');
    // Apply is disabled with no pick.
    expect(within(sheet).getByTestId('video-thumbnail-apply')).toBeDisabled();
  });

  it('a frame-capture failure still lets the creator apply their own image', async () => {
    await attachVideo();
    captureVideoFramesMock.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByTestId('media-thumbnail-button'));
    const sheet = await screen.findByTestId('video-thumbnail-sheet');
    await waitFor(() => {
      expect(within(sheet).getByTestId('video-thumbnail-error')).toBeInTheDocument();
    });
    // The own-image tile is the designed escape hatch — the error must not
    // lock it out (the sheet's own copy promises it).
    const input = within(sheet).getByTestId('video-thumbnail-custom').querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [IMAGE_FILE] } });
    await waitFor(() => expect(generateThumbnailMock).toHaveBeenCalled());
    await waitFor(() => expect(within(sheet).getByTestId('video-thumbnail-apply')).not.toBeDisabled());
    fireEvent.click(within(sheet).getByTestId('video-thumbnail-apply'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());
    // The custom pick shipped to the tray poster.
    expect(screen.getByTestId('media-tray').querySelector('video')!.getAttribute('poster')).not.toBeNull();
  });

  it('reopening with a custom pick restores the creator\'s image (not a frame)', async () => {
    await attachVideo();
    await openPicker();
    const input = screen.getByTestId('video-thumbnail-custom').querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [IMAGE_FILE] } });
    await waitFor(() => expect(generateThumbnailMock).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('video-thumbnail-apply'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());

    // Re-open: the capture re-runs, but the pick shown is the creator's
    // image (the "Your image" preview, the custom tile ringed, no frame
    // pre-selected) — the user sees where they left off.
    fireEvent.click(screen.getByTestId('media-thumbnail-button'));
    const sheet = await screen.findByTestId('video-thumbnail-sheet');
    await waitFor(() => {
      expect(within(sheet).getByTestId('video-thumbnail-preview').textContent).toContain('Your image');
    });
    await waitFor(() => {
      expect(within(sheet).getByTestId('video-thumbnail-frame-0')).toBeInTheDocument();
    });
    expect(within(sheet).getByTestId('video-thumbnail-frame-0')).toHaveAttribute('aria-pressed', 'false');
  });

  it('a trim/crop edit drops the frame pick (the re-encode moved the frames)', async () => {
    await attachVideo();
    await openPicker();
    fireEvent.click(screen.getByTestId('video-thumbnail-frame-1'));
    fireEvent.click(screen.getByTestId('video-thumbnail-apply'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());
    const video = screen.getByTestId('media-tray').querySelector('video')!;
    expect(video.getAttribute('poster')).not.toBeNull();

    // Run the video through the editor (a 9:16 crop).
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const editor = await screen.findByTestId('video-editor');
    const preview = within(editor).getByTestId('video-editor-preview') as HTMLVideoElement;
    Object.defineProperty(preview, 'duration', { value: 10, configurable: true });
    fireEvent.loadedMetadata(preview);
    fireEvent.click(within(editor).getByTestId('video-editor-ratio-vertical'));
    const apply = within(editor).getByTestId('video-editor-apply');
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);
    await waitFor(() => expect(editVideoMock).toHaveBeenCalledTimes(1));

    // The pick is gone (the frame no longer matches the edited file) — the
    // post falls back to the auto capture of the FINISHED file.
    await waitFor(() => {
      expect(screen.getByTestId('media-tray').querySelector('video')!.getAttribute('poster')).toBeNull();
    });
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
    const req = uploadMediaMock.mock.calls[0][0] as { file: File; thumbnailFile?: File };
    expect(req.file.name).toBe('clip-edited.mp4'); // the editor's output uploads
    expect(captureVideoPosterMock).toHaveBeenCalledTimes(1);
    expect(await req.thumbnailFile!.text()).toBe('auto-poster');
  });

  it('a custom image pick survives a trim/crop edit (it is the creator\'s art, not a frame)', async () => {
    await attachVideo();
    await openPicker();
    const input = screen.getByTestId('video-thumbnail-custom').querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [IMAGE_FILE] } });
    await waitFor(() => expect(generateThumbnailMock).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('video-thumbnail-apply'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());

    fireEvent.click(screen.getByTestId('media-edit-button'));
    const editor = await screen.findByTestId('video-editor');
    const preview = within(editor).getByTestId('video-editor-preview') as HTMLVideoElement;
    Object.defineProperty(preview, 'duration', { value: 10, configurable: true });
    fireEvent.loadedMetadata(preview);
    fireEvent.click(within(editor).getByTestId('video-editor-ratio-vertical'));
    const apply = within(editor).getByTestId('video-editor-apply');
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);
    await waitFor(() => expect(editVideoMock).toHaveBeenCalledTimes(1));

    // The custom poster survives the edit.
    const video = screen.getByTestId('media-tray').querySelector('video')!;
    expect(video.getAttribute('poster')).not.toBeNull();
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
    const req = uploadMediaMock.mock.calls[0][0] as { thumbnailFile?: File };
    expect(await req.thumbnailFile!.text()).toBe('processed-custom');
  });

  it('the optional queue handoff carries the pick (the draft is frozen at Post)', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    const queue = vi.fn().mockResolvedValue(true);
    render(<PostComposer onQueueMediaPost={queue} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [VIDEO_FILE] } });
    await waitFor(() => expect(screen.getByTestId('media-tray')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('media-tray').querySelector('.animate-spin')).toBeNull());

    await openPicker();
    fireEvent.click(screen.getByTestId('video-thumbnail-frame-2'));
    fireEvent.click(screen.getByTestId('video-thumbnail-apply'));
    await waitFor(() => expect(screen.queryByTestId('video-thumbnail-sheet')).toBeNull());

    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(1));
    const draft = queue.mock.calls[0][0];
    expect(draft.media[0].file).toBe(VIDEO_FILE);
    expect(draft.media[0].thumbnail).toBeInstanceOf(File);
    expect(await draft.media[0].thumbnail!.text()).toBe('frame-2');
    expect(draft.media[0].thumbnail!.type).toBe('image/webp');
    expect(uploadMediaMock).not.toHaveBeenCalled(); // the queue owns the upload
  });
});
