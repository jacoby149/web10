import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ComposerProvider } from '@/context/ComposerContext';
import { UploadProvider, useUploads } from '@/context/UploadContext';
import type { MediaPostDraft } from '@/components/Uploads/uploadState';

// The queue guard (UploadContext.queue): a draft whose video carries the
// creator's thumbnail pick is DECLINED — the multipart confirm does not carry
// the pick yet, and the pick must never be silently dropped: the composer's
// standard upload path runs instead. The control (no pick) PASSES the guard
// and reaches the upload API — proving the guard is the discriminator, not
// the API failing.
const createUploadApiMock = vi.fn();
vi.mock('@/data/uploadApi', () => ({
  currentUploadIdentity: vi.fn(() => ({ node: 'web10', provider: 'test.localhost', username: 'testuser' })),
  identityKey: (o: { node: string; provider: string; username: string }) => `${o.node}/${o.provider}/${o.username}`,
  createUploadApi: (...args: unknown[]) => createUploadApiMock(...args),
  UploadRequestError: class UploadRequestError extends Error {
    status = 0;
  },
}));
vi.mock('@/data/uploadDraftStore', () => ({
  loadUploads: vi.fn().mockResolvedValue([]),
  saveUpload: vi.fn(),
  uploadKey: vi.fn(() => 'key-1'),
  videoDraft: vi.fn(() => ({ groups: [] })),
  StaleUploadRecord: class StaleUploadRecord extends Error {},
}));
vi.mock('@/data/groups', () => ({
  ensureCloseFriends: vi.fn().mockResolvedValue(undefined),
  ensureFollowers: vi.fn().mockResolvedValue(undefined),
  getDiscoverGroupId: vi.fn(() => 'g-discover'),
}));
vi.mock('@/data/actingIdentity', () => ({ actingPostGroups: vi.fn() }));
vi.mock('@/data/posts', () => ({ determinePostGroups: vi.fn(() => ['g-followers']) }));

function draftWithPick(): MediaPostDraft {
  const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
  return {
    title: '',
    text: '',
    visibility: 'private',
    authorLabel: 'You',
    markAsMusic: false,
    media: [{ file, width: 640, height: 360, duration: 10, altText: '', thumbnail: new File([`frame-1`], 'poster.webp', { type: 'image/webp' }) }],
  };
}
function draftWithoutPick(): MediaPostDraft {
  const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
  return {
    title: '',
    text: '',
    visibility: 'private',
    authorLabel: 'You',
    markAsMusic: false,
    media: [{ file, width: 640, height: 360, duration: 10, altText: '' }],
  };
}

function Probe({ draft }: { draft: MediaPostDraft }) {
  const uploads = useUploads();
  const [state, setState] = useState('idle');
  return (
    <div data-testid="probe">
      <p>{state}</p>
      <button
        data-testid="probe-run"
        disabled={!uploads || uploads.loading || !uploads.enabled}
        onClick={() =>
          uploads!
            .queue(draft)
            .then((accepted) => setState(accepted ? 'queued' : 'declined'))
            .catch((e: unknown) => setState(`proceeded: ${e instanceof Error ? e.message : e}`))
        }
      >
        run
      </button>
    </div>
  );
}

describe('UploadContext.queue thumbnail guard', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createUploadApiMock.mockReturnValue({
      check: () => {},
      validate: vi.fn(async () => {
        throw new Error('control-reached'); // only the no-pick draft should get here
      }),
    });
    fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes('capabilities')
        ? new Response(JSON.stringify({ enabled: true, deferred_creates: true, part_size: 1, max_size: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('declines a draft whose video carries a thumbnail pick (the pick takes the standard path)', async () => {
    render(
      <MemoryRouter>
        <ComposerProvider>
          <UploadProvider sessionKey="test">
            <Probe draft={draftWithPick()} />
          </UploadProvider>
        </ComposerProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('probe-run')).toBeEnabled());
    screen.getByTestId('probe-run').click();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('declined'));
    // The decline is the guard, not a failure: the upload API was never
    // reached, nothing was saved, no capability beyond discovery was called.
    expect(createUploadApiMock).not.toHaveBeenCalled();
  });

  it('control: a draft without a pick passes the guard to the upload API', async () => {
    render(
      <MemoryRouter>
        <ComposerProvider>
          <UploadProvider sessionKey="test">
            <Probe draft={draftWithoutPick()} />
          </UploadProvider>
        </ComposerProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('probe-run')).toBeEnabled());
    screen.getByTestId('probe-run').click();
    // The control reaches the (mocked, rejecting) upload API — the guard let
    // it through; had the guard rejected it, the probe would say "declined".
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('proceeded: control-reached'));
    expect(createUploadApiMock).toHaveBeenCalled();
  });
});
