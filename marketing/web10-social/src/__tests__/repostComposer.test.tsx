import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as data from '@/data';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    createPost: vi.fn().mockResolvedValue({ _id: 'p1' }),
    createRepost: vi.fn().mockResolvedValue({ _id: 'rp1' }),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
    readProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn(),
  };
});

vi.mock('@/data/settings', () => ({
  readSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
  resetWapi: vi.fn(),
}));

// The original post being reposted (the feed passes resolved media refs).
const ORIGINAL: data.PostRecord = {
  _id: 'orig-1',
  text: 'Just shipped a new feature and it feels great.',
  created_at: '2026-09-17T10:00:00Z',
  author_username: 'alice',
  author_provider: 'test.localhost',
  profile: { display_name: 'Alice' },
  media_refs: [
    { doc_id: 'm1', mime_type: 'image/png', read_url: 'https://cdn/x.png', thumbnail_url: 'https://cdn/x.png' },
  ],
};

describe('PostComposer — repost mode (reposts.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the repost context block with the original author + text when repostingTo is set', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={ORIGINAL} onRepostCancel={() => {}} />);
    const ctx = await screen.findByTestId('repost-context');
    expect(ctx).toBeTruthy();
    // The original author + text are shown so the user knows what they're amplifying.
    expect(ctx).toHaveTextContent('Alice');
    expect(ctx).toHaveTextContent('Just shipped a new feature and it feels great.');
    expect(ctx).toHaveTextContent('Reposting');
  });

  it('does not show the repost context in normal (non-repost) mode', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    // Give async profile/settings reads a tick, then assert absence.
    await waitFor(() => expect(screen.queryByTestId('repost-context')).toBeNull());
  });

  it('the textarea placeholder becomes "Add a comment…" in repost mode', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={ORIGINAL} onRepostCancel={() => {}} />);
    expect(await screen.findByPlaceholderText('Add a comment…')).toBeInTheDocument();
  });

  it('the submit button reads "Repost" in repost mode', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={ORIGINAL} onRepostCancel={() => {}} />);
    const btn = await screen.findByTestId('post-submit');
    expect(btn).toHaveTextContent('Repost');
  });

  it('a plain repost (no comment) is postable — the button is enabled with empty text', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={ORIGINAL} onRepostCancel={() => {}} />);
    const btn = await screen.findByTestId('post-submit');
    expect(btn).not.toBeDisabled();
  });

  it('canceling the repost (X) calls onRepostCancel', async () => {
    const onRepostCancel = vi.fn();
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={ORIGINAL} onRepostCancel={onRepostCancel} />);
    fireEvent.click(await screen.findByTestId('repost-cancel'));
    expect(onRepostCancel).toHaveBeenCalledTimes(1);
  });

  it('submitting a repost calls createRepost with the original + the comment', async () => {
    const onPostCreated = vi.fn();
    const onRepostCancel = vi.fn();
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={ORIGINAL} onRepostCancel={onRepostCancel} onPostCreated={onPostCreated} />);
    fireEvent.change(await screen.findByPlaceholderText('Add a comment…'), { target: { value: 'love this' } });
    fireEvent.click(await screen.findByTestId('post-submit'));
    await waitFor(() => {
      expect(data.createRepost).toHaveBeenCalledWith(ORIGINAL, 'love this');
    });
    // A successful repost clears the repost state + fires onPostCreated.
    expect(onRepostCancel).toHaveBeenCalled();
    expect(onPostCreated).toHaveBeenCalled();
    // A repost never uploads the user's own media.
    expect(data.uploadMedia).not.toHaveBeenCalled();
  });

  it('a repost failure surfaces an error and keeps the composer open', async () => {
    (data.createRepost as any).mockRejectedValueOnce(new Error('boom'));
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={ORIGINAL} onRepostCancel={() => {}} />);
    fireEvent.change(await screen.findByPlaceholderText('Add a comment…'), { target: { value: 'hi' } });
    fireEvent.click(await screen.findByTestId('post-submit'));
    expect(await screen.findByTestId('composer-error')).toHaveTextContent('boom');
    // The repost context is still present (not cleared on failure).
    expect(screen.getByTestId('repost-context')).toBeInTheDocument();
  });
});
