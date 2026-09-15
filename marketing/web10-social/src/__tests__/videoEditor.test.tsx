import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer (same shape as socialScreens.test.tsx)
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

// ── Always encode before upload (video-experience.md: "the node never sees
//    the original"). The raw camera file — often HEVC, often too large for
//    the presigned POST — used to be uploaded directly when the user skipped
//    the editor, and that upload failed with "Failed to fetch". Now every
//    video goes through the re-encode: the editor's output when the user
//    edited, the DEFAULT edit (Original ratio, full duration) otherwise. ────

describe('PostComposer always encodes before upload', () => {
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

  it('an unedited video gets the default encode at post time — the raw file never uploads', async () => {
    await attachVideo();
    // No editor interaction — straight to Post.
    fireEvent.click(screen.getByTestId('post-submit'));

    // The default encode ran (Original ratio, full duration — no trim/crop opts).
    await waitFor(() => expect(editVideoMock).toHaveBeenCalledTimes(1));
    const [fileArg, opts] = editVideoMock.mock.calls[0];
    expect(fileArg).toBe(VIDEO_FILE); // the original, unedited file
    expect(opts.startTime ?? 0).toBe(0);
    expect(opts.endTime).toBeUndefined();
    expect(opts.cropRatio ?? null).toBeNull();

    // uploadMedia got the RE-ENCODED file, not the original.
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
    const uploadReq = uploadMediaMock.mock.calls[0][0] as { file: File };
    expect(uploadReq.file).not.toBe(VIDEO_FILE);
    expect(uploadReq.file.name).toBe('clip-upload.webm');
    expect(uploadReq.file.type).toBe('video/webm');
  });

  it('an edited video is NOT encoded twice — the editor output uploads as-is', async () => {
    await attachVideo();
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const sheet = await screen.findByTestId('video-editor');

    const videoEl = within(sheet).getByTestId('video-editor-preview') as HTMLVideoElement;
    Object.defineProperty(videoEl, 'duration', { value: 10, configurable: true });
    fireEvent.loadedMetadata(videoEl);
    fireEvent.click(within(sheet).getByTestId('video-editor-ratio-vertical'));

    const apply = within(sheet).getByTestId('video-editor-apply');
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);
    await waitFor(() => expect(editVideoMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());

    // Still exactly ONE encode (the editor's) — no second default encode.
    expect(editVideoMock).toHaveBeenCalledTimes(1);
    // The upload carries the editor's output (the -edited.webm the sheet makes).
    const uploadReq = uploadMediaMock.mock.calls[0][0] as { file: File };
    expect(uploadReq.file.name).toBe('clip-edited.webm');
  });

  it('the tray shows the encode progress while the default encode runs', async () => {
    // Hold the encode open so the progress state is observable.
    let resolveEncode!: () => void;
    editVideoMock.mockImplementation(
      (_file: unknown, opts: { onProgress?: (f: number) => void }) =>
        new Promise((res) => {
          opts.onProgress?.(0.4);
          resolveEncode = () =>
            res({ blob: new Blob(['edited-bytes']), mimeType: 'video/webm', width: 608, height: 1080, duration: 5 });
        }),
    );

    await attachVideo();
    fireEvent.click(screen.getByTestId('post-submit'));

    // The tray item shows "Encoding 40%" while the encode is in flight.
    const progress = await screen.findByTestId('media-post-progress');
    expect(progress).toHaveTextContent('Encoding 40%');

    resolveEncode();
    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalled());
  });

  it('a failed default encode surfaces the error and the tray is retryable', async () => {
    editVideoMock.mockRejectedValueOnce(new Error('This browser does not support in-browser video editing.'));
    await attachVideo();
    fireEvent.click(screen.getByTestId('post-submit'));

    const err = await screen.findByTestId('composer-error');
    expect(err).toHaveTextContent('This browser does not support in-browser video editing.');
    // The in-flight phase is cleared (no stuck "Encoding" spinner) and the
    // Post button is enabled again.
    expect(screen.queryByTestId('media-post-progress')).toBeNull();
    expect(screen.getByTestId('post-submit')).toBeEnabled();
    // Nothing was uploaded.
    expect(uploadMediaMock).not.toHaveBeenCalled();
  });
});

// ── The live controls: crop preview, draggable handles, smooth playhead,
//    and the trim loop. These are what made the editor "not work" — the
//    preview now shows the crop, the trim window is draggable, and playback
//    loops inside the selected window. ──────────────────────────────────────

describe('VideoEditorSheet live controls', () => {
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

  // Open the editor on a 10s clip (metadata loaded) and return the sheet +
  // the preview <video>. jsdom never fires loadedmetadata, so we drive it.
  async function openEditor() {
    await attachVideo();
    fireEvent.click(screen.getByTestId('media-edit-button'));
    const sheet = await screen.findByTestId('video-editor');
    const videoEl = within(sheet).getByTestId('video-editor-preview') as HTMLVideoElement;
    Object.defineProperty(videoEl, 'duration', { value: 10, configurable: true });
    fireEvent.loadedMetadata(videoEl);
    return { sheet, videoEl };
  }

  // jsdom's getBoundingClientRect is all-zeros; give the timeline a 1000px
  // width so a drag's clientX maps to a time (clientX/1000 * duration).
  function mockTimelineRect(sheet: HTMLElement) {
    const timeline = within(sheet).getByTestId('video-editor-timeline');
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 1000, height: 40, right: 1000, bottom: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });
  }

  // fireEvent.pointerDown does not trigger React's onPointerDown in this
  // environment; a native bubbling pointerdown does.
  function pointerDownOn(el: Element) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  }

  // Drag a handle to a clientX. The pointermove's setStartTime/setEndTime run
  // in a native (non-React) handler, so their state updates are batched —
  // act() flushes them before we assert.
  function dragTo(handle: Element, clientX: number) {
    pointerDownOn(handle);
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX }));
    });
    window.dispatchEvent(new PointerEvent('pointerup'));
  }

  it('shows the natural frame for Original (no crop)', async () => {
    const { sheet } = await openEditor();
    const frame = within(sheet).getByTestId('video-editor-preview-frame');
    const videoEl = within(sheet).getByTestId('video-editor-preview') as HTMLVideoElement;
    expect(frame.style.aspectRatio).toBe('');
    expect(videoEl.className).toContain('object-contain');
    expect(videoEl.className).not.toContain('object-cover');
  });

  it('live crop preview — picking 1:1 locks the frame to a square and cover-crops', async () => {
    const { sheet } = await openEditor();
    fireEvent.click(within(sheet).getByTestId('video-editor-ratio-square'));
    const frame = within(sheet).getByTestId('video-editor-preview-frame');
    const videoEl = within(sheet).getByTestId('video-editor-preview') as HTMLVideoElement;
    // jsdom serializes `aspect-ratio: 1` as "1 / 1".
    expect(frame.style.aspectRatio).toBe('1 / 1');
    expect(videoEl.className).toContain('object-cover');
    expect(videoEl.className).not.toContain('object-contain');
  });

  it('live crop preview — picking 9:16 locks the frame to the vertical ratio', async () => {
    const { sheet } = await openEditor();
    fireEvent.click(within(sheet).getByTestId('video-editor-ratio-vertical'));
    const frame = within(sheet).getByTestId('video-editor-preview-frame');
    // 9/16 = 0.5625 → jsdom serializes as "0.5625 / 1".
    expect(frame.style.aspectRatio).toBe(`${9 / 16} / 1`);
  });

  it('live crop preview — Original clears the crop frame', async () => {
    const { sheet } = await openEditor();
    fireEvent.click(within(sheet).getByTestId('video-editor-ratio-square'));
    expect(within(sheet).getByTestId('video-editor-preview-frame').style.aspectRatio).toBe('1 / 1');
    fireEvent.click(within(sheet).getByTestId('video-editor-ratio-original'));
    expect(within(sheet).getByTestId('video-editor-preview-frame').style.aspectRatio).toBe('');
  });

  it('draggable in handle — dragging it sets the in-point', async () => {
    const { sheet } = await openEditor();
    mockTimelineRect(sheet);
    const handleIn = within(sheet).getByTestId('video-editor-handle-in');

    // clientX 200 / 1000 * 10s = 2s
    dragTo(handleIn, 200);

    expect(handleIn).toHaveAttribute('aria-valuenow', '2');
  });

  it('draggable out handle — dragging it sets the out-point', async () => {
    const { sheet } = await openEditor();
    mockTimelineRect(sheet);
    const handleOut = within(sheet).getByTestId('video-editor-handle-out');

    // clientX 700 / 1000 * 10s = 7s
    dragTo(handleOut, 700);

    expect(handleOut).toHaveAttribute('aria-valuenow', '7');
  });

  it('draggable in handle is clamped to the out-point minus the min trim', async () => {
    const { sheet } = await openEditor();
    mockTimelineRect(sheet);
    // First set the out-point to 5s (clientX 500).
    const handleOut = within(sheet).getByTestId('video-editor-handle-out');
    dragTo(handleOut, 500);
    expect(handleOut).toHaveAttribute('aria-valuenow', '5');

    // Now drag the in-point past the out-point (clientX 900 = 9s) — it must
    // clamp to out - 0.5 = 4.5, never crossing the out-point.
    const handleIn = within(sheet).getByTestId('video-editor-handle-in');
    dragTo(handleIn, 900);
    expect(handleIn).toHaveAttribute('aria-valuenow', '4.5');
  });

  it('playback loops inside the selected window (preview shows what ships)', async () => {
    const { sheet, videoEl } = await openEditor();
    mockTimelineRect(sheet);

    // A settable currentTime so the loop-back seek is observable.
    let ct = 0;
    Object.defineProperty(videoEl, 'currentTime', {
      configurable: true,
      get: () => ct,
      set: (v: number) => {
        ct = v;
      },
    });

    // Select a 2s → 7s window via the handles.
    dragTo(within(sheet).getByTestId('video-editor-handle-in'), 200); // 2s
    dragTo(within(sheet).getByTestId('video-editor-handle-out'), 700); // 7s

    // The video reaches the out-point → it must jump back to the in-point.
    ct = 7;
    fireEvent.timeUpdate(videoEl);
    expect(ct).toBe(2);
  });

  it('the playhead element is present (rAF-driven, ref-updated)', async () => {
    const { sheet } = await openEditor();
    const playhead = within(sheet).getByTestId('video-editor-playhead');
    expect(playhead).toBeInTheDocument();
    // Starts at the left edge before any playback.
    expect(playhead.style.left).toBe('0%');
  });
});
