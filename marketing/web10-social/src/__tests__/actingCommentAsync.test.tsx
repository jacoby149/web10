import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommentThread } from '@web10/discover';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const comment = { _id: 'one', text: 'First', created_at: '2026-11-01', likedByMe: false, likeCount: 0 };
const page = { comments: [comment], nextCursor: 'next' };

describe('acting comment async generations', () => {
  it('does not roll back a failed like after A -> B -> A', async () => {
    const write = deferred<void>();
    const readComments = vi.fn().mockResolvedValue(page);
    const props = { postId: 'post', isOpen: true, count: 1, onCountChange: vi.fn(), readComments,
      onToggleCommentLike: vi.fn(() => write.promise), onError: vi.fn() };
    const { rerender } = render(<CommentThread {...props} actionIdentity="A" />);
    await screen.findByTestId('comment-like-one');
    fireEvent.click(screen.getByTestId('comment-like-one'));
    rerender(<CommentThread {...props} actionIdentity="B" />);
    await screen.findByTestId('comment-like-one');
    readComments.mockResolvedValue({ ...page, comments: [{ ...comment, likedByMe: true, likeCount: 3 }] });
    rerender(<CommentThread {...props} actionIdentity="A" />);
    await waitFor(() => expect(screen.getByTestId('comment-like-one')).toHaveAttribute('aria-pressed', 'true'));
    await act(async () => write.reject(new Error('revoked')));
    expect(screen.getByTestId('comment-like-one')).toHaveAttribute('aria-pressed', 'true');
    expect(props.onError).not.toHaveBeenCalled();
  });

  it('discards a stale top-level page and keeps the new pager usable', async () => {
    const pending = deferred<{ comments: typeof comment[]; nextCursor: string | null }>();
    const readComments = vi.fn().mockResolvedValue(page);
    const props = { postId: 'post', isOpen: true, count: 1, onCountChange: vi.fn(), readComments };
    const { rerender } = render(<CommentThread {...props} actionIdentity="A" />);
    await screen.findByTestId('view-more-comments');
    readComments.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByTestId('view-more-comments'));
    rerender(<CommentThread {...props} actionIdentity="B" />);
    await waitFor(() => expect(screen.getByTestId('view-more-comments')).not.toBeDisabled());
    const countCalls = props.onCountChange.mock.calls.length;
    await act(async () => pending.resolve({ comments: [{ ...comment, _id: 'stale', text: 'Stale' }], nextCursor: 'stale-cursor' }));
    expect(screen.queryByTestId('comment-stale')).not.toBeInTheDocument();
    expect(props.onCountChange).toHaveBeenCalledTimes(countCalls);
    fireEvent.click(screen.getByTestId('view-more-comments'));
    expect(readComments).toHaveBeenLastCalledWith('post', undefined, { cursor: 'next' });
  });

  it('discards a stale reply page after switching identity', async () => {
    const pending = deferred<{ comments: typeof comment[]; nextCursor: string | null }>();
    const readReplies = vi.fn().mockResolvedValue({ comments: [], nextCursor: 'replies' });
    const props = { postId: 'post', isOpen: true, count: 1, onCountChange: vi.fn(), readReplies,
      readComments: vi.fn().mockResolvedValue({ ...page, replyCounts: { one: 2 } }) };
    const { rerender } = render(<CommentThread {...props} actionIdentity="A" />);
    const more = await screen.findByText(/View more replies/);
    readReplies.mockReturnValueOnce(pending.promise);
    fireEvent.click(more);
    rerender(<CommentThread {...props} actionIdentity="B" />);
    await screen.findByText(/View more replies/);
    await act(async () => pending.resolve({ comments: [{ ...comment, _id: 'stale-reply', text: 'Stale reply' }], nextCursor: null }));
    expect(screen.queryByTestId('comment-stale-reply')).not.toBeInTheDocument();
  });
});
