import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// The thread seams are the app's job — stub the read (the whole conversation)
// + write + like writer. The shared thread is presentational.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readThreadComments: vi.fn().mockResolvedValue([]),
    createThreadComment: vi.fn().mockResolvedValue(null),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
  };
});

// A conversation: two top-level comments, one of which has two replies, and
// one orphan reply (its parent is not in the read — it must render
// top-level, not vanish).
const CONVERSATION = [
  { _id: 'c1', text: 'first', author_username: 'alice', created_at: '2026-01-01T00:00:00Z', likeCount: 2, likedByMe: false },
  { _id: 'c2', text: 'second', author_username: 'bob', created_at: '2026-01-01T01:00:00Z', likeCount: 0, likedByMe: true },
  { _id: 'c3', text: 'reply to first', author_username: 'carol', created_at: '2026-01-01T02:00:00Z', parent_id: 'c1', likeCount: 1, likedByMe: false },
  { _id: 'c4', text: 'nested reply', author_username: 'dave', created_at: '2026-01-01T03:00:00Z', parent_id: 'c3', likeCount: 0, likedByMe: false },
  { _id: 'c5', text: 'orphan reply', author_username: 'erin', created_at: '2026-01-01T04:00:00Z', parent_id: 'ghost', likeCount: 0, likedByMe: false },
];

describe('CommentThread — threaded replies + comment likes (comments.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderThread(props: Record<string, unknown> = {}) {
    const { CommentThread } = await import('@/components/Feed/CommentThread');
    const { readThreadComments } = await import('@/data');
    vi.mocked(readThreadComments).mockResolvedValue(CONVERSATION as never);
    render(
      <CommentThread
        postId="p1"
        isOpen
        count={CONVERSATION.length}
        onCountChange={() => {}}
        {...props}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('comment-list')).toBeInTheDocument());
  }

  it('renders the conversation as a tree (top-level + nested replies)', async () => {
    await renderThread();
    // every comment renders
    for (const c of CONVERSATION) {
      expect(screen.getByTestId(`comment-${c._id}`)).toBeInTheDocument();
    }
    // the orphan reply (parent not in the read) still renders
    expect(screen.getByTestId('comment-c5')).toBeInTheDocument();
  });

  it('a reply nests under its parent (the parent renders before its replies)', async () => {
    await renderThread();
    const c1 = screen.getByTestId('comment-c1');
    const c3 = screen.getByTestId('comment-c3');
    // c3 (a reply to c1) is a DOM descendant of c1's <li>
    expect(c1.contains(c3)).toBe(true);
    // c4 (a reply to c3) nests under c3
    expect(c3.contains(screen.getByTestId('comment-c4'))).toBe(true);
  });

  it('top-level comments sort by created_at (oldest first)', async () => {
    await renderThread();
    const list = screen.getByTestId('comment-list');
    const children = Array.from(list.children).map((el) => el.getAttribute('data-testid'));
    // c1 (00:00) before c2 (01:00) before the orphan c5 (04:00)
    expect(children).toEqual(['comment-c1', 'comment-c2', 'comment-c5']);
  });

  it('each comment shows its like count + a tappable like (filled when likedByMe)', async () => {
    await renderThread();
    const likeC1 = screen.getByTestId('comment-like-c1');
    expect(likeC1).toHaveTextContent('2');
    expect(likeC1).toHaveAttribute('aria-pressed', 'false');
    const likeC2 = screen.getByTestId('comment-like-c2');
    expect(likeC2).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping a comment like calls onToggleCommentLike with the comment id', async () => {
    const { toggleReactionKind } = await import('@/data');
    await renderThread();
    fireEvent.click(screen.getByTestId('comment-like-c1'));
    // the social wrapper wires the like to toggleReactionKind(id, 'like', groups, 'comments')
    expect(vi.mocked(toggleReactionKind)).toHaveBeenCalledWith('c1', 'like', undefined, 'comments');
  });

  it('Reply retargets the single compose box (shows who it replies to)', async () => {
    await renderThread();
    expect(screen.queryByTestId('comment-reply-target')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('comment-reply-c1'));
    const target = screen.getByTestId('comment-reply-target');
    expect(target).toHaveTextContent('alice');
    // the input placeholder flips to the reply state
    expect(screen.getByTestId('comment-input')).toHaveAttribute('placeholder', 'Write a reply…');
    // cancel returns to the post-level compose
    fireEvent.click(screen.getByTestId('comment-reply-cancel'));
    expect(screen.queryByTestId('comment-reply-target')).not.toBeInTheDocument();
    expect(screen.getByTestId('comment-input')).toHaveAttribute('placeholder', 'Add a comment…');
  });

  it('sending a reply writes parent_id + bumps the live count', async () => {
    const { createThreadComment } = await import('@/data');
    vi.mocked(createThreadComment).mockResolvedValueOnce({
      _id: 'c6',
      text: 'my reply',
      author_username: 'me',
      created_at: '2026-01-01T05:00:00Z',
      parent_id: 'c1',
    } as never);
    const onCountChange = vi.fn();
    await renderThread({ onCountChange });
    fireEvent.click(screen.getByTestId('comment-reply-c1'));
    const input = screen.getByTestId('comment-input');
    fireEvent.change(input, { target: { value: 'my reply' } });
    fireEvent.click(screen.getByTestId('comment-send'));
    await waitFor(() => {
      expect(vi.mocked(createThreadComment)).toHaveBeenCalledWith(
        expect.objectContaining({ postId: 'p1', text: 'my reply', parentId: 'c1' }),
      );
    });
    // the live count ticks (5 → 6) and the reply target clears
    expect(onCountChange).toHaveBeenCalledWith(6);
    expect(screen.queryByTestId('comment-reply-target')).not.toBeInTheDocument();
    // the new reply renders nested under c1
    expect(screen.getByTestId('comment-c1').contains(screen.getByTestId('comment-c6'))).toBe(true);
  });

  it('sending a top-level comment omits parentId', async () => {
    const { createThreadComment } = await import('@/data');
    vi.mocked(createThreadComment).mockResolvedValueOnce({
      _id: 'c7',
      text: 'top',
      author_username: 'me',
      created_at: '2026-01-01T06:00:00Z',
    } as never);
    await renderThread();
    const input = screen.getByTestId('comment-input');
    fireEvent.change(input, { target: { value: 'top' } });
    fireEvent.click(screen.getByTestId('comment-send'));
    await waitFor(() => {
      expect(vi.mocked(createThreadComment)).toHaveBeenCalledWith(
        expect.objectContaining({ postId: 'p1', text: 'top' }),
      );
    });
    const arg = vi.mocked(createThreadComment).mock.calls[0][0];
    expect(arg.parentId).toBeUndefined();
  });

  it('remote mode (shared thread, no like writer): compose is a link-out, the like is display-only', async () => {
    const { CommentThread: SharedThread } = await import('@web10/discover');
    render(
      <SharedThread
        postId="p1"
        isOpen
        count={5}
        onCountChange={() => {}}
        readComments={async () => CONVERSATION}
        remote
        remoteHref="https://web10.app/u/alice/p/p1"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('comment-list')).toBeInTheDocument());
    expect(screen.getByTestId('comment-remote-link')).toHaveAttribute('href', 'https://web10.app/u/alice/p/p1');
    // no compose input in remote mode
    expect(screen.queryByTestId('comment-input')).not.toBeInTheDocument();
    // the like renders (likeCount present) but is not a tap target (no writer)
    const likeC1 = screen.getByTestId('comment-like-c1');
    expect(likeC1).toBeDisabled();
    // no Reply action in remote mode (can't write)
    expect(screen.queryByTestId('comment-reply-c1')).not.toBeInTheDocument();
  });
});
