import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer (same shape as videoEditor.test.tsx)
const uploadMediaMock = vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/photo.webp' });
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

// The image pipeline is mocked (jsdom has no createImageBitmap / canvas
// encoding): processImage resolves a fixed processed blob. validateMedia runs
// FOR REAL — the paste path must go through the same validation gate as the
// picker and drag-drop.
const processImageMock = vi.fn().mockResolvedValue({
  blob: new Blob(['processed-image']),
  width: 800,
  height: 600,
  mimeType: 'image/webp',
});
vi.mock('@/lib/mediaProcessing', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    processImage: (...args: unknown[]) => processImageMock(...args),
  };
});

// The ffmpeg engine is mocked (jsdom has no Web Worker / WebAssembly) — the
// composer imports editVideo/isNoopEdit; image paste never reaches it, but
// the module graph loads it.
vi.mock('@/lib/ffmpegEngine', () => ({
  loadFFmpeg: vi.fn().mockResolvedValue({}),
  transcodeWithFFmpeg: vi.fn(),
}));

// jsdom has no URL.createObjectURL (the tray mints a preview object URL for
// every attached file).
let objectUrlCounter = 0;
beforeEach(() => {
  processImageMock.mockClear();
  uploadMediaMock.mockClear();
  URL.createObjectURL = vi.fn(() => `blob:mock-${++objectUrlCounter}`);
  URL.revokeObjectURL = vi.fn();
});

interface PasteItemStub {
  kind: 'file' | 'string';
  type: string;
  file?: File | null;
}

/**
 * Drive a native `paste` event with a synthetic clipboard: jsdom's ClipboardEvent
 * carries no clipboardData, so the items list is defined on the event the way
 * a browser delivers it. Returns the event so tests can assert on
 * `defaultPrevented` (did the composer claim the paste?).
 */
function firePaste(target: HTMLElement, items: PasteItemStub[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: items.map((i) => ({
        kind: i.kind,
        type: i.type,
        getAsFile: () => i.file ?? null,
      })),
      files: [],
      types: items.map((i) => i.type).filter(Boolean),
      getData: () => '',
      setData: () => {},
      clearData: () => {},
    },
  });
  target.dispatchEvent(event);
  return event;
}

async function renderComposer(props?: Record<string, unknown>) {
  const { default: PostComposer } = await import('@/components/Feed/PostComposer');
  return render(<PostComposer {...props} />);
}

describe('composer paste-to-attach (the third attach path)', () => {
  it('pasting a screenshot attaches it to the tray and gives it a stable name', async () => {
    await renderComposer();
    const root = screen.getByTestId('post-composer');
    // The OS screenshot idiom: the clipboard file is named "image.png".
    firePaste(root, [
      { kind: 'file', type: 'image/png', file: new File(['png-bytes'], 'image.png', { type: 'image/png' }) },
    ]);

    const tray = await screen.findByTestId('media-tray');
    await waitFor(() => expect(tray.querySelector('.animate-spin')).toBeNull());
    expect(tray.firstElementChild).not.toBeNull();
    expect(processImageMock).toHaveBeenCalledTimes(1);
    const pastedFile = processImageMock.mock.calls[0][0] as File;
    // "image.png" is the generic name the OS hands back — the composer mints
    // its own, so ten pasted screenshots in one session never collide.
    expect(pastedFile.name).toMatch(/^pasted-image-\d+-1\.png$/);
    expect(pastedFile.type).toBe('image/png');
  });

  it('keeps a meaningful clipboard file name instead of overwriting it', async () => {
    await renderComposer();
    firePaste(screen.getByTestId('post-composer'), [
      { kind: 'file', type: 'image/jpeg', file: new File(['jpg-bytes'], 'screenshot-1234.jpg', { type: 'image/jpeg' }) },
    ]);

    await screen.findByTestId('media-tray');
    const pastedFile = processImageMock.mock.calls[0][0] as File;
    expect(pastedFile.name).toBe('screenshot-1234.jpg');
  });

  it('pasting several images at once attaches every one (distinct names)', async () => {
    await renderComposer();
    firePaste(screen.getByTestId('post-composer'), [
      { kind: 'file', type: 'image/png', file: new File(['a'], 'image.png', { type: 'image/png' }) },
      { kind: 'file', type: 'image/jpeg', file: new File(['b'], 'image.png', { type: 'image/jpeg' }) },
      { kind: 'string', type: 'text/plain' },
    ]);

    const tray = await screen.findByTestId('media-tray');
    await waitFor(() => expect(tray.querySelector('.animate-spin')).toBeNull());
    expect(Array.from(tray.children)).toHaveLength(2);
    const names = processImageMock.mock.calls.map(([f]) => (f as File).name);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toMatch(/^pasted-image-\d+-1\.png$/);
    expect(names[1]).toMatch(/^pasted-image-\d+-2\.jpg$/);
  });

  it('treats an empty-typed clipboard file item as an image (the browser quirk)', async () => {
    await renderComposer();
    firePaste(screen.getByTestId('post-composer'), [
      { kind: 'file', type: '', file: new File(['pixels'], '', { type: '' }) },
    ]);

    await screen.findByTestId('media-tray');
    const pastedFile = processImageMock.mock.calls[0][0] as File;
    expect(pastedFile.type).toBe('image/png');
    expect(pastedFile.name).toMatch(/^pasted-image-\d+-1\.png$/);
  });

  it('plain-text paste is left alone — the editor owns it', async () => {
    await renderComposer();
    const event = firePaste(screen.getByTestId('post-composer'), [
      { kind: 'string', type: 'text/plain' },
    ]);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('media-tray')).not.toBeInTheDocument();
    expect(processImageMock).not.toHaveBeenCalled();
  });

  it('a non-image file on the clipboard is ignored (no error-card spam)', async () => {
    await renderComposer();
    const event = firePaste(screen.getByTestId('post-composer'), [
      { kind: 'file', type: 'application/pdf', file: new File(['pdf'], 'doc.pdf', { type: 'application/pdf' }) },
    ]);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('media-tray')).not.toBeInTheDocument();
    expect(processImageMock).not.toHaveBeenCalled();
  });

  it('edit mode does not attach pasted images (media is remove-only there)', async () => {
    type PostRecord = import('@/data').PostRecord;
    const editingPost = { _id: 'post-edit', text: 'hello', media_refs: [] } as unknown as PostRecord;
    await renderComposer({ editingPost });
    const event = firePaste(screen.getByTestId('post-composer'), [
      { kind: 'file', type: 'image/png', file: new File(['png-bytes'], 'image.png', { type: 'image/png' }) },
    ]);

    // No preventDefault: the editor's default handling runs (the schema has no
    // image node, so the image drops — the pre-fix behavior, preserved).
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('media-tray')).not.toBeInTheDocument();
    expect(processImageMock).not.toHaveBeenCalled();
  });
});
