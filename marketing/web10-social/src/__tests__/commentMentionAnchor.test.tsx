import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommentThread } from '@web10/discover';
import { readCommentAnchor } from '@/data/comments';
const { readById } = vi.hoisted(() => ({ readById: vi.fn() }));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ readById }) }));

describe('off-page tagged comment destinations', () => {
  it('loads the authorized ancestor path and highlights a reply outside the first page', async () => {
    readById.mockImplementation(async (id: string) => ({ doc_id: id, author_key: 'bob', ref_value: id === 'reply' ? 'parent' : 'post', body: { post_id: 'post', text: id === 'reply' ? 'Hey @alice' : 'Off-page parent', parent_id: id === 'reply' ? 'parent' : undefined }, created_at: '2026-11-05' }));
    render(<CommentThread postId="post" isOpen count={100} onCountChange={() => {}} highlightedCommentId="reply" readComments={async () => ({ comments: [], nextCursor: 'more' })} readAnchor={readCommentAnchor} readOnly />);
    expect(await screen.findByText('Off-page parent')).toBeVisible();
    expect(screen.getByText('Hey', { exact: false })).toBeVisible();
    expect(screen.getByTestId('comment-reply')).toHaveClass('bg-brand-muted');
    expect(readById).toHaveBeenCalledTimes(2);
  });

  it('denies cross-post, cyclic and unreadable paths without fabricating a thread', async () => {
    readById.mockResolvedValue({ doc_id: 'reply', ref_value: 'post', author_key: 'bob', body: { post_id: 'other', text: 'secret' } });
    await expect(readCommentAnchor('post', 'reply')).rejects.toThrow('another post');
    readById.mockResolvedValue({ doc_id: 'reply', ref_value: 'reply', author_key: 'bob', body: { post_id: 'post', text: 'cycle' } });
    await expect(readCommentAnchor('post', 'reply')).rejects.toThrow('unavailable');
    readById.mockRejectedValue(new Error('403'));
    await expect(readCommentAnchor('post', 'reply')).rejects.toThrow('403');
  });
});
