import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommentThread } from '@web10/discover';

describe('Acting comment draft ownership', () => {
  it.each([undefined, 'node/groups/users/alice/team'])('retains the originating identity %s when switching with text', async (origin) => {
    const createComment = vi.fn().mockResolvedValue({ _id: 'comment', text: 'draft', created_at: '2026-11-01' });
    const readComments = vi.fn().mockResolvedValue({ comments: [], nextCursor: null });
    const props = { postId: 'post', isOpen: true, count: 0, onCountChange: vi.fn(), readComments, createComment };
    const { rerender } = render(<CommentThread {...props} actionIdentity={origin} />);
    await waitFor(() => expect(readComments).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'draft' } });
    rerender(<CommentThread {...props} actionIdentity="node/groups/users/alice/other" />);
    fireEvent.submit(screen.getByTestId('comment-input').closest('form')!);
    await waitFor(() => expect(createComment).toHaveBeenCalled());
    expect(createComment.mock.calls[0][0].identity).toBe(origin || null);
  });
});
