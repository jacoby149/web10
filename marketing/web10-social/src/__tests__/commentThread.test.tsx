import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// The thread seams are the app's job — stub the paged read (top-level +
// replyCounts), the paged reply read, the write, the photo uploader, + the
// like writer.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readThreadComments: vi.fn(),
    readThreadReplies: vi.fn(),
    createThreadComment: vi.fn().mockResolvedValue(null),
    uploadCommentPhoto: vi.fn(),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
  };
});

// jsdom has no object-URL API (the compose tray previews picked photos with
// URL.createObjectURL). Mock it to return a stable fake URL.
let objectUrlCounter = 0;
URL.createObjectURL = vi.fn(() => `blob:mock-${objectUrlCounter++}`);
URL.revokeObjectURL = vi.fn();

// The conversation: two top-level comments. c1 has 7 replies (the first page
// of 5 loads, "view more replies" loads the rest); c2 has none.
const C1 = { _id: 'c1', post_id: 'p1', text: 'first', author_username: 'alice', created_at: '2026-01-01T00:00:00Z', likeCount: 2, likedByMe: false };
const C2 = { _id: 'c2', post_id: 'p1', text: 'second', author_username: 'bob', created_at: '2026-01-01T01:00:00Z', likeCount: 0, likedByMe: true };
const C3 = { _id: 'c3', post_id: 'p1', text: 'third (page 2)', author_username: 'carol', created_at: '2026-01-01T06:00:00Z', likeCount: 0, likedByMe: false };
const reply = (id: string, n: number) => ({
  _id: id,
  post_id: 'p1',
  text: `reply ${n}`,
  author_username: 'dave',
  created_at: `2026-01-01T0${n}:00:00Z`,
  parent_id: 'c1',
  likeCount: 0,
  likedByMe: false,
});
const C1_REPLIES_PAGE1 = [reply('r1', 1), reply('r2', 2), reply('r3', 3), reply('r4', 4), reply('r5', 5)];
const C1_REPLIES_PAGE2 = [reply('r6', 6), reply('r7', 7)];

describe('CommentThread — paged threaded replies (comments.md, the Facebook model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderThread() {
    const { CommentThread } = await import('@/components/Feed/CommentThread');
    const { readThreadComments, readThreadReplies } = await import('@/data');
    // top-level: page 1 (c1 + c2), more available (nextCursor set)
    vi.mocked(readThreadComments).mockImplementation(async (_postId, _groups, opts) => {
      if (opts?.cursor) {
        return { comments: [C3], nextCursor: null, replyCounts: { c3: 0 } };
      }
      return { comments: [C1, C2], nextCursor: 'top-2', replyCounts: { c1: 7, c2: 0 } };
    });
    // c1's replies: first page (5) then the rest (2)
    vi.mocked(readThreadReplies).mockImplementation(async (id, _groups, opts) => {
      if (id !== 'c1') return { comments: [], nextCursor: null };
      if (opts?.cursor) return { comments: C1_REPLIES_PAGE2, nextCursor: null };
      return { comments: C1_REPLIES_PAGE1, nextCursor: 'r-5' };
    });
    render(<CommentThread postId="p1" isOpen count={0} onCountChange={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('comment-list')).toBeInTheDocument());
  }

  it('loads the first top-level page + pre-fetches each comment first reply page', async () => {
    await renderThread();
    // both top-level comments render
    expect(screen.getByTestId('comment-c1')).toBeInTheDocument();
    expect(screen.getByTestId('comment-c2')).toBeInTheDocument();
    // c1's first reply page (5) is nested under it
    expect(screen.getByTestId('comment-r1')).toBeInTheDocument();
    expect(screen.getByTestId('comment-r5')).toBeInTheDocument();
    // c1 has 7 replies, 5 loaded → "view more replies" shows
    expect(screen.getByTestId('view-more-replies-c1')).toBeInTheDocument();
    // c2 has no replies → no pager
    expect(screen.queryByTestId('view-more-replies-c2')).not.toBeInTheDocument();
    // the live count = 2 top-level + 5 loaded replies = 7
    // (asserted via the comment button in a separate test; here assert the tree)
    expect(screen.getByTestId('comment-c1').contains(screen.getByTestId('comment-r1'))).toBe(true);
  });

  it('"View more comments" loads the next top-level page + appends', async () => {
    await renderThread();
    expect(screen.queryByTestId('comment-c3')).not.toBeInTheDocument();
    expect(screen.getByTestId('view-more-comments')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('view-more-comments'));
    await waitFor(() => expect(screen.getByTestId('comment-c3')).toBeInTheDocument());
    // exhausted → the pager disappears
    await waitFor(() => expect(screen.queryByTestId('view-more-comments')).not.toBeInTheDocument());
  });

  it('"View more replies" loads the next reply page for that comment', async () => {
    await renderThread();
    expect(screen.queryByTestId('comment-r6')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('view-more-replies-c1'));
    await waitFor(() => expect(screen.getByTestId('comment-r6')).toBeInTheDocument());
    expect(screen.getByTestId('comment-r7')).toBeInTheDocument();
    // exhausted (7/7) → the pager disappears
    await waitFor(() => expect(screen.queryByTestId('view-more-replies-c1')).not.toBeInTheDocument());
  });

  it('each comment shows its like count + a tappable like (filled when likedByMe)', async () => {
    await renderThread();
    const likeC1 = screen.getByTestId('comment-like-c1');
    expect(likeC1).toHaveTextContent('2');
    expect(likeC1).toHaveAttribute('aria-pressed', 'false');
    const likeC2 = screen.getByTestId('comment-like-c2');
    expect(likeC2).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping a comment like calls toggleReactionKind(id, like, groups, comments)', async () => {
    const { toggleReactionKind } = await import('@/data');
    await renderThread();
    fireEvent.click(screen.getByTestId('comment-like-c1'));
    expect(vi.mocked(toggleReactionKind)).toHaveBeenCalledWith('c1', 'like', undefined, 'comments');
  });

  it('Reply retargets the single compose box (shows who it replies to)', async () => {
    await renderThread();
    expect(screen.queryByTestId('comment-reply-target')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('comment-reply-c1'));
    expect(screen.getByTestId('comment-reply-target')).toHaveTextContent('alice');
    expect(screen.getByTestId('comment-input')).toHaveAttribute('placeholder', 'Write a reply…');
    fireEvent.click(screen.getByTestId('comment-reply-cancel'));
    expect(screen.queryByTestId('comment-reply-target')).not.toBeInTheDocument();
    expect(screen.getByTestId('comment-input')).toHaveAttribute('placeholder', 'Add a comment…');
  });

  it('sending a reply writes parentId + nests under the parent', async () => {
    const { createThreadComment } = await import('@/data');
    vi.mocked(createThreadComment).mockResolvedValueOnce({
      _id: 'r8',
      text: 'my reply',
      author_username: 'me',
      created_at: '2026-01-01T09:00:00Z',
      parent_id: 'c1',
    } as never);
    await renderThread();
    fireEvent.click(screen.getByTestId('comment-reply-c1'));
    fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'my reply' } });
    fireEvent.click(screen.getByTestId('comment-send'));
    await waitFor(() => {
      expect(vi.mocked(createThreadComment)).toHaveBeenCalledWith(
        expect.objectContaining({ postId: 'p1', text: 'my reply', parentId: 'c1' }),
      );
    });
    // the new reply nests under c1
    expect(screen.getByTestId('comment-c1').contains(screen.getByTestId('comment-r8'))).toBe(true);
  });

  it('sending a top-level comment omits parentId', async () => {
    const { createThreadComment } = await import('@/data');
    vi.mocked(createThreadComment).mockResolvedValueOnce({
      _id: 'c9',
      text: 'top',
      author_username: 'me',
      created_at: '2026-01-01T10:00:00Z',
    } as never);
    await renderThread();
    fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'top' } });
    fireEvent.click(screen.getByTestId('comment-send'));
    await waitFor(() => {
      expect(vi.mocked(createThreadComment)).toHaveBeenCalledWith(
        expect.objectContaining({ postId: 'p1', text: 'top' }),
      );
    });
    expect(vi.mocked(createThreadComment).mock.calls[0][0].parentId).toBeUndefined();
  });

  it('remote mode (shared thread, no writer): compose is a link-out, the like is display-only', async () => {
    const { CommentThread: SharedThread } = await import('@web10/discover');
    render(
      <SharedThread
        postId="p1"
        isOpen
        count={0}
        onCountChange={() => {}}
        readComments={async () => ({ comments: [C1, C2], nextCursor: null })}
        remote
        remoteHref="https://web10.app/u/alice/p/p1"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('comment-list')).toBeInTheDocument());
    expect(screen.getByTestId('comment-remote-link')).toHaveAttribute('href', 'https://web10.app/u/alice/p/p1');
    expect(screen.queryByTestId('comment-input')).not.toBeInTheDocument();
    // the like renders (likeCount present) but is not a tap target (no writer)
    expect(screen.getByTestId('comment-like-c1')).toBeDisabled();
    // no Reply action in remote mode (can't write)
    expect(screen.queryByTestId('comment-reply-c1')).not.toBeInTheDocument();
  });

  describe('photos in comments (comments.md "Photos in comments")', () => {
    it('shows the photo-attach control when the uploader seam is wired', async () => {
      await renderThread();
      expect(screen.getByTestId('comment-attach-photo')).toBeInTheDocument();
    });

    it('picking a photo adds a removable preview + enables a photo-only send', async () => {
      await renderThread();
      const file = new File(['x'], 'a.png', { type: 'image/png' });
      fireEvent.change(screen.getByTestId('comment-photo-input'), { target: { files: [file] } });
      expect(screen.getByTestId('comment-photo-tray')).toBeInTheDocument();
      expect(screen.getByTestId('comment-photo-preview')).toBeInTheDocument();
      // a photo-only comment is sendable (no text required)
      expect(screen.getByTestId('comment-send')).not.toBeDisabled();
      // removing the photo drops the preview
      fireEvent.click(screen.getByTestId('comment-photo-remove'));
      await waitFor(() => expect(screen.queryByTestId('comment-photo-tray')).not.toBeInTheDocument());
    });

    it('sending a comment with a photo uploads it + writes the doc_id', async () => {
      const { createThreadComment, uploadCommentPhoto } = await import('@/data');
      vi.mocked(uploadCommentPhoto).mockResolvedValueOnce({ docId: 'm1', url: 'blob:mock-0' });
      vi.mocked(createThreadComment).mockResolvedValueOnce({
        _id: 'c9',
        text: 'with photo',
        author_username: 'me',
        created_at: '2026-01-01T10:00:00Z',
      } as never);
      await renderThread();
      const file = new File(['x'], 'a.png', { type: 'image/png' });
      fireEvent.change(screen.getByTestId('comment-photo-input'), { target: { files: [file] } });
      fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'with photo' } });
      fireEvent.click(screen.getByTestId('comment-send'));
      await waitFor(() => {
        expect(vi.mocked(uploadCommentPhoto)).toHaveBeenCalledWith(file);
      });
      await waitFor(() => {
        expect(vi.mocked(createThreadComment)).toHaveBeenCalledWith(
          expect.objectContaining({ postId: 'p1', text: 'with photo', mediaRefs: ['m1'] }),
        );
      });
    });

    it('a comment with photos renders its image grid', async () => {
      const { readThreadComments } = await import('@/data');
      const C_WITH_MEDIA = {
        _id: 'cm1',
        post_id: 'p1',
        text: 'look',
        author_username: 'alice',
        created_at: '2026-01-01T00:00:00Z',
        media: [
          { url: 'https://cdn/m1', mime_type: 'image/png', created_at: '' },
          { url: 'https://cdn/m2', mime_type: 'image/jpeg', created_at: '' },
        ],
      };
      vi.mocked(readThreadComments).mockResolvedValueOnce({
        comments: [C_WITH_MEDIA],
        nextCursor: null,
        replyCounts: { cm1: 0 },
      });
      const { CommentThread } = await import('@/components/Feed/CommentThread');
      render(<CommentThread postId="p1" isOpen count={0} onCountChange={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('comment-cm1')).toBeInTheDocument());
      expect(screen.getByTestId('comment-media-cm1')).toBeInTheDocument();
      const imgs = screen.getAllByTestId(/^comment-media-item-cm1-/);
      expect(imgs).toHaveLength(2);
      expect(imgs[0]).toHaveAttribute('src', 'https://cdn/m1');
      expect(imgs[1]).toHaveAttribute('src', 'https://cdn/m2');
    });

    it('a comment with no photos renders no media grid', async () => {
      await renderThread();
      expect(screen.queryByTestId(/^comment-media-/)).not.toBeInTheDocument();
    });
  });
});
