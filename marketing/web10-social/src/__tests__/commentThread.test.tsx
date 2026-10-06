import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    updateComment: vi.fn().mockResolvedValue({}),
    deleteComment: vi.fn().mockResolvedValue(undefined),
  };
});

// jsdom has no object-URL API (the compose tray previews picked photos with
// URL.createObjectURL). Mock it to return a stable fake URL.
let objectUrlCounter = 0;
URL.createObjectURL = vi.fn(() => `blob:mock-${objectUrlCounter++}`);
URL.revokeObjectURL = vi.fn();

// The conversation: two top-level comments. c1 has 7 replies (the first page
// of 5 loads, "view more replies" loads the rest); c2 has none. c1 is the
// reader's OWN comment (isOwn → Edit/Delete show); c2 is someone else's.
const C1 = { _id: 'c1', post_id: 'p1', text: 'first', author_username: 'me', created_at: '2026-01-01T00:00:00Z', likeCount: 2, likedByMe: false, isOwn: true };
const C2 = { _id: 'c2', post_id: 'p1', text: 'second', author_username: 'bob', created_at: '2026-01-01T01:00:00Z', likeCount: 0, likedByMe: true, isOwn: false };
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

  it('tapping a comment like flips the heart + bumps the count optimistically', async () => {
    await renderThread();
    const likeC1 = screen.getByTestId('comment-like-c1');
    // c1 starts unliked, count 2
    expect(likeC1).toHaveAttribute('aria-pressed', 'false');
    expect(likeC1).toHaveTextContent('2');
    fireEvent.click(likeC1);
    // the flip is synchronous — no waiting on the write
    expect(likeC1).toHaveAttribute('aria-pressed', 'true');
    expect(likeC1).toHaveTextContent('3');
    // tap again → un-likes, count back to 2
    fireEvent.click(likeC1);
    expect(likeC1).toHaveAttribute('aria-pressed', 'false');
    expect(likeC1).toHaveTextContent('2');
  });

  it('rolls the comment like back when the write rejects', async () => {
    const { toggleReactionKind } = await import('@/data');
    vi.mocked(toggleReactionKind).mockRejectedValueOnce(new Error('boom'));
    await renderThread();
    const likeC1 = screen.getByTestId('comment-like-c1');
    expect(likeC1).toHaveAttribute('aria-pressed', 'false');
    expect(likeC1).toHaveTextContent('2');
    fireEvent.click(likeC1);
    // optimistic flip lands first…
    expect(likeC1).toHaveAttribute('aria-pressed', 'true');
    expect(likeC1).toHaveTextContent('3');
    // …then the rejected write rolls it back
    await waitFor(() => expect(likeC1).toHaveAttribute('aria-pressed', 'false'));
    expect(likeC1).toHaveTextContent('2');
  });

  it('Reply retargets the single compose box (shows who it replies to)', async () => {
    await renderThread();
    expect(screen.queryByTestId('comment-reply-target')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('comment-reply-c2'));
    expect(screen.getByTestId('comment-reply-target')).toHaveTextContent('bob');
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

  describe('edit / delete your own comments (the owner controls, comments.md)', () => {
    it('shows Edit + Delete only on the reader\'s OWN comments (isOwn), never on others\'', async () => {
      await renderThread();
      // c1 is isOwn → both controls present
      expect(screen.getByTestId('comment-edit-c1')).toBeInTheDocument();
      expect(screen.getByTestId('comment-delete-c1')).toBeInTheDocument();
      // c2 is not isOwn → no controls (a dead tap target is worse than none)
      expect(screen.queryByTestId('comment-edit-c2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('comment-delete-c2')).not.toBeInTheDocument();
    });

    it('Edit retargets the compose box pre-filled; Save writes updateComment(id, text) + swaps the text', async () => {
      const { updateComment } = await import('@/data');
      await renderThread();
      fireEvent.click(screen.getByTestId('comment-edit-c1'));
      // the compose box is retargeted to edit mode, pre-filled with c1's text
      expect(screen.getByTestId('comment-edit-target')).toBeInTheDocument();
      expect(screen.getByTestId('comment-input')).toHaveValue('first');
      expect(screen.getByTestId('comment-save')).toBeInTheDocument();
      // the row's Edit/Delete hide while editing
      expect(screen.queryByTestId('comment-edit-c1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('comment-delete-c1')).not.toBeInTheDocument();
      // save with no change is a no-op (the Save button is disabled)
      expect(screen.getByTestId('comment-save')).toBeDisabled();
      // change the text + save
      fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'first (edited)' } });
      expect(screen.getByTestId('comment-save')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('comment-save'));
      await waitFor(() =>
        expect(vi.mocked(updateComment)).toHaveBeenCalledWith('c1', { text: 'first (edited)' }),
      );
      // the text swaps optimistically (the write resolves)
      await waitFor(() =>
        expect(screen.getByTestId('comment-c1')).toHaveTextContent('first (edited)'),
      );
      // edit mode exits
      await waitFor(() =>
        expect(screen.queryByTestId('comment-edit-target')).not.toBeInTheDocument(),
      );
    });

    it('rolls the edit back + keeps the old text when updateComment rejects', async () => {
      const { updateComment } = await import('@/data');
      vi.mocked(updateComment).mockRejectedValueOnce(new Error('boom'));
      await renderThread();
      fireEvent.click(screen.getByTestId('comment-edit-c1'));
      fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'first (edited)' } });
      fireEvent.click(screen.getByTestId('comment-save'));
      // optimistic swap lands first…
      expect(screen.getByTestId('comment-c1')).toHaveTextContent('first (edited)');
      // …then the rejected write restores the original text (the "(edited)"
      // suffix is gone — an unambiguous discriminator, since "first" alone is
      // a substring of "first (edited)").
      await waitFor(() =>
        expect(screen.getByTestId('comment-c1')).not.toHaveTextContent('(edited)'),
      );
    });

    it('Delete is two-tap: arm → confirm writes deleteComment(id) + removes the node', async () => {
      const { deleteComment } = await import('@/data');
      await renderThread();
      // first tap arms the confirm (no write yet)
      fireEvent.click(screen.getByTestId('comment-delete-c1'));
      expect(screen.getByTestId('comment-delete-confirm-c1')).toBeInTheDocument();
      expect(vi.mocked(deleteComment)).not.toHaveBeenCalled();
      // confirm → the write fires + the node is removed from the tree
      fireEvent.click(screen.getByTestId('comment-delete-confirm-btn-c1'));
      await waitFor(() =>
        expect(vi.mocked(deleteComment)).toHaveBeenCalledWith('c1'),
      );
      await waitFor(() =>
        expect(screen.queryByTestId('comment-c1')).not.toBeInTheDocument(),
      );
    });

    it('Delete cancel (the "No" tap) disarms without a write', async () => {
      const { deleteComment } = await import('@/data');
      await renderThread();
      fireEvent.click(screen.getByTestId('comment-delete-c1'));
      expect(screen.getByTestId('comment-delete-confirm-c1')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('comment-delete-cancel-c1'));
      expect(vi.mocked(deleteComment)).not.toHaveBeenCalled();
      expect(screen.queryByTestId('comment-delete-confirm-c1')).not.toBeInTheDocument();
      // the node is still there
      expect(screen.getByTestId('comment-c1')).toBeInTheDocument();
    });

    it('rolls the delete back (re-inserts the subtree) when deleteComment rejects', async () => {
      const { deleteComment } = await import('@/data');
      vi.mocked(deleteComment).mockRejectedValueOnce(new Error('boom'));
      await renderThread();
      fireEvent.click(screen.getByTestId('comment-delete-c1'));
      fireEvent.click(screen.getByTestId('comment-delete-confirm-btn-c1'));
      // optimistic removal lands first…
      await waitFor(() =>
        expect(screen.queryByTestId('comment-c1')).not.toBeInTheDocument(),
      );
      // …then the rejected write re-inserts the node (with its replies)
      await waitFor(() =>
        expect(screen.getByTestId('comment-c1')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('comment-r1')).toBeInTheDocument();
    });
  });

  describe('the reload loop (the "comments keep reloading" bug)', () => {
    it('does NOT re-fetch when the caller re-renders with a fresh `groups` array (same value)', async () => {
      // The regression: WatchScreen passes `groups={[getDiscoverGroupId()]}` —
      // a fresh array literal every render — and re-renders every ~5s (the ?t=
      // write-back). The old effect keyed on the array's IDENTITY, so each
      // re-render tore down + refetched the whole thread (the skeleton flash).
      // Keying on the joined value (groupsKey) makes a same-value fresh array
      // a no-op.
      const { readThreadComments } = await import('@/data');
      vi.mocked(readThreadComments).mockImplementation(async () => ({
        comments: [C1, C2],
        nextCursor: null,
        replyCounts: { c1: 0, c2: 0 },
      }));
      const { CommentThread } = await import('@/components/Feed/CommentThread');
      const { rerender } = render(
        <CommentThread
          postId="p1"
          isOpen
          count={0}
          onCountChange={() => {}}
          groups={['web10/groups/web10/discover']}
        />,
      );
      await waitFor(() => expect(screen.getByTestId('comment-list')).toBeInTheDocument());
      expect(vi.mocked(readThreadComments)).toHaveBeenCalledTimes(1);

      // Simulate the parent re-rendering with a NEW array of the SAME value —
      // exactly what `groups={[getDiscoverGroupId()]}` does each render.
      act(() => {
        rerender(
          <CommentThread
            postId="p1"
            isOpen
            count={0}
            onCountChange={() => {}}
            groups={['web10/groups/web10/discover']}
          />,
        );
      });
      // give any (buggy) effect a tick to fire
      await new Promise((r) => setTimeout(r, 0));
      // still exactly one fetch — the fresh array did NOT re-trigger the load
      expect(vi.mocked(readThreadComments)).toHaveBeenCalledTimes(1);
    });

    it('DOES re-fetch when the groups VALUE actually changes', async () => {
      // The guard in the other direction: a real group change (a group post vs
      // the discover board) must still reload the thread from the new group.
      const { readThreadComments } = await import('@/data');
      vi.mocked(readThreadComments).mockImplementation(async (_postId, groups) => ({
        comments: [
          {
            _id: `c-${(groups as string[])[0]}`,
            post_id: 'p1',
            text: `from ${(groups as string[])[0]}`,
            author_username: 'me',
            created_at: '2026-01-01T00:00:00Z',
            isOwn: true,
          },
        ],
        nextCursor: null,
        replyCounts: {},
      }));
      const { CommentThread } = await import('@/components/Feed/CommentThread');
      const { rerender } = render(
        <CommentThread postId="p1" isOpen count={0} onCountChange={() => {}} groups={['group-a']} />,
      );
      await waitFor(() => expect(screen.getByTestId('comment-c-group-a')).toBeInTheDocument());
      expect(vi.mocked(readThreadComments)).toHaveBeenCalledTimes(1);

      act(() => {
        rerender(
          <CommentThread postId="p1" isOpen count={0} onCountChange={() => {}} groups={['group-b']} />,
        );
      });
      // the value changed → a fresh fetch from the new group
      await waitFor(() => expect(screen.getByTestId('comment-c-group-b')).toBeInTheDocument());
      expect(vi.mocked(readThreadComments)).toHaveBeenCalledTimes(2);
    });
  });
});
