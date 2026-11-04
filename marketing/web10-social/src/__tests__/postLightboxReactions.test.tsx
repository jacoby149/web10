import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import type { PostRecord, ReactionRecord } from '@/data/types';

const mocks = vi.hoisted(() => ({
  username: 'reader', identity: undefined as string | undefined,
  readReactions: vi.fn(), toggleReactionKind: vi.fn(),
  countComments: vi.fn(), readRepostCounts: vi.fn(),
  readMyRepostedIds: vi.fn(), readViewCount: vi.fn(),
}));
vi.mock('@/data', () => ({
  ...mocks, getDiscoverGroupId: () => 'discover',
}));
vi.mock('@/data/wapi', () => ({
  // Match the real SDK: decodeJwt returns a NEW object on every read.
  getWapi: () => ({ readToken: () => ({ username: mocks.username, provider: 'node.test', expires: '2099-01-01' }) }),
}));
vi.mock('@/data/actingIdentity', async (original) => ({
  ...await original<typeof import('@/data/actingIdentity')>(),
  useActingAuthor: () => mocks.identity,
}));
vi.mock('@/data/mutationAuthority', () => ({ useMutationAuthority: () => ({ canEdit: false, canDelete: false }) }));
vi.mock('@/context/RepostContext', () => ({ useRepost: () => ({ setRepostingTo: vi.fn() }) }));
vi.mock('@/context/ComposerContext', () => ({ useComposer: () => ({ openComposer: vi.fn() }) }));
vi.mock('@/components/Feed/AttachedAd', () => ({ AttachedAd: () => null }));
vi.mock('@/components/Feed/CommentThread', () => ({ CommentThread: () => null }));
vi.mock('@/components/shared/Toast', () => ({ toast: { error: vi.fn() }, errorMessage: () => 'Failed' }));

import { PostLightbox } from '@/components/Bio/PostLightbox';

const post: PostRecord = { _id: 'post-a', text: 'A profile post', author_username: 'creator', groups: ['discover'], visibility: 'public', created_at: '2026-11-04T00:00:00Z' };
const like = (author = 'reader'): ReactionRecord => ({ _id: 'like-a', author_key: author, author_username: author, type: 'like', target_service: 'posts', target_id: 'post-a', created_at: '2026-11-04T00:00:00Z' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function view(value = post) {
  return <MemoryRouter><PostLightbox post={value} mediaMap={{}} onClose={() => {}} /></MemoryRouter>;
}
const heart = () => screen.getByTestId('like-button');

describe('Profile lightbox reaction lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.username = 'reader';
    mocks.identity = undefined;
    // Bound the broken render/refetch loop so the pre-fix test fails cleanly.
    mocks.readReactions.mockReset().mockReturnValue(new Promise(() => {})).mockResolvedValueOnce([like()]);
    mocks.toggleReactionKind.mockReset().mockResolvedValue('like');
    mocks.countComments.mockResolvedValue(0);
    mocks.readRepostCounts.mockResolvedValue({});
    mocks.readMyRepostedIds.mockResolvedValue(new Set());
    mocks.readViewCount.mockResolvedValue({ impressions: 5, reach: 2 });
  });

  it('keeps an existing like filled across fresh token decodes and unrelated renders', async () => {
    const rendered = render(view());
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
    rendered.rerender(view({ ...post, groups: [...post.groups!] }));
    await act(async () => {});
    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.readReactions).toHaveBeenCalledTimes(1);
    expect(mocks.readViewCount).toHaveBeenCalledTimes(1);
  });

  it('does not let a pending initial read undo a newly liked post', async () => {
    const pending = deferred<ReactionRecord[]>();
    mocks.readReactions.mockReset().mockReturnValue(pending.promise);
    render(view());
    fireEvent.click(heart());
    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { pending.resolve([]); });
    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    expect(heart()).toHaveAttribute('aria-label', 'Like, 1');
    expect(mocks.toggleReactionKind).toHaveBeenCalledWith('post-a', 'like', ['discover']);
  });

  it('ignores a previous post read after navigation', async () => {
    const pending = deferred<ReactionRecord[]>();
    mocks.readReactions.mockReset().mockReturnValueOnce(pending.promise).mockResolvedValue([]);
    const rendered = render(view());
    rendered.rerender(view({ ...post, _id: 'post-b' }));
    await waitFor(() => expect(mocks.readReactions).toHaveBeenCalledWith('posts', 'post-b', ['discover']));
    await act(async () => { pending.resolve([like()]); });
    expect(heart()).toHaveAttribute('aria-pressed', 'false');
    expect(heart()).toHaveAttribute('aria-label', 'Like, 0');
  });

  it('reloads for a different acting identity without borrowing the personal like', async () => {
    mocks.readReactions.mockReset().mockResolvedValue([like()]);
    const rendered = render(view());
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
    mocks.identity = 'node.test/groups/users/reader/team';
    rendered.rerender(view());
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'false'));
    expect(mocks.readReactions).toHaveBeenCalledTimes(2);
  });

  it('reloads when the reader or post group scope changes', async () => {
    mocks.readReactions.mockReset().mockResolvedValue([like()]);
    const rendered = render(view());
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
    mocks.username = 'another-reader';
    rendered.rerender(view());
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'false'));
    rendered.rerender(view({ ...post, groups: ['private-group'] }));
    await waitFor(() => expect(mocks.readReactions).toHaveBeenLastCalledWith('posts', 'post-a', ['private-group']));
    expect(mocks.readReactions).toHaveBeenCalledTimes(3);
  });

  it('preserves like/dislike mutual exclusion and rolls back a current failed write', async () => {
    const write = deferred<string>();
    mocks.toggleReactionKind.mockReturnValueOnce(write.promise);
    render(view());
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(screen.getByTestId('dislike-button'));
    expect(heart()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('dislike-button')).toHaveAttribute('aria-pressed', 'true');
    expect(heart()).toHaveAttribute('aria-label', 'Like, 0');
    await act(async () => { write.reject(new Error('current write failed')); });
    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dislike-button')).toHaveAttribute('aria-pressed', 'false');
    expect(heart()).toHaveAttribute('aria-label', 'Like, 1');
    fireEvent.click(heart());
    await act(async () => {});
    expect(heart()).toHaveAttribute('aria-pressed', 'false');
    expect(heart()).toHaveAttribute('aria-label', 'Like, 0');
  });

  it('does not roll an old failed write back into the next post', async () => {
    const write = deferred<string>();
    mocks.readReactions.mockReset().mockResolvedValueOnce([]).mockResolvedValue([like()]);
    mocks.toggleReactionKind.mockReturnValue(write.promise);
    const rendered = render(view());
    await act(async () => {});
    fireEvent.click(heart());
    rendered.rerender(view({ ...post, _id: 'post-b' }));
    await waitFor(() => expect(heart()).toHaveAttribute('aria-pressed', 'true'));
    await act(async () => { write.reject(new Error('old write failed')); });
    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    expect(heart()).toHaveAttribute('aria-label', 'Like, 1');
  });
});
