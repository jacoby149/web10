import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// The data layer is the surface's job (the component is controlled) — but the
// thread it mounts reads comments, so stub the read.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readComments: vi.fn().mockResolvedValue([]),
    createComment: vi.fn().mockResolvedValue({ _id: 'c1', text: 'hi' }),
  };
});

const base = {
  postId: 'p1',
  liked: false,
  disliked: false,
  reactionCount: 3,
  commentCount: 2,
};

describe('PostActions — the shared engagement bar (post-actions.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('default: interactive like + inline comments, no dislike slot', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} />);
    expect(screen.getByTestId('like-button')).toBeInTheDocument();
    expect(screen.queryByTestId('dislike-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('comment-button')).toBeInTheDocument();
    // the thread is closed by default
    expect(screen.queryByTestId('comment-thread')).not.toBeInTheDocument();
  });

  it('like="display": the like is a non-interactive span with the count (the Discover case)', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} like="display" />);
    expect(screen.queryByTestId('like-button')).not.toBeInTheDocument();
    const span = screen.getByLabelText('3 likes');
    expect(span.tagName).toBe('SPAN');
    expect(screen.getByTestId('comment-button')).toBeInTheDocument();
  });

  it('like="none": no like slot at all', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} like="none" />);
    expect(screen.queryByTestId('like-button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/likes/)).not.toBeInTheDocument();
  });

  it('dislike="interactive": the thumb is a real button, aria-pressed tracks state', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    const { rerender } = render(<PostActions {...base} dislike="interactive" />);
    const btn = screen.getByTestId('dislike-button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    rerender(<PostActions {...base} disliked dislike="interactive" />);
    expect(screen.getByTestId('dislike-button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('dislike="display": no dislike slot (a thumb with no count would be a dead affordance)', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} like="display" dislike="display" />);
    expect(screen.queryByTestId('dislike-button')).not.toBeInTheDocument();
  });

  it('comments="none": no comment button, no thread', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} comments="none" />);
    expect(screen.queryByTestId('comment-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('comment-thread')).not.toBeInTheDocument();
  });

  it('layout="bar": the row gets the border-t engagement-bar chrome, padded to the card edges', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} layout="bar" />);
    const bar = screen.getByTestId('post-actions').firstElementChild as HTMLElement;
    expect(bar.className).toMatch(/border-t/);
    // the bar spans the card edge-to-edge (border-t) but its content is
    // padded — flush icons against the card border are the 3.86.0 regression
    expect(bar.className).toMatch(/px-4/);
    expect(bar.className).toMatch(/pb-3/);
  });

  it('tapping the heart reports onToggleReaction("like")', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    const onToggleReaction = vi.fn();
    render(<PostActions {...base} onToggleReaction={onToggleReaction} />);
    fireEvent.click(screen.getByTestId('like-button'));
    expect(onToggleReaction).toHaveBeenCalledWith('like');
  });

  it('tapping the thumb reports onToggleReaction("dislike")', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    const onToggleReaction = vi.fn();
    render(
      <PostActions {...base} dislike="interactive" onToggleReaction={onToggleReaction} />,
    );
    fireEvent.click(screen.getByTestId('dislike-button'));
    expect(onToggleReaction).toHaveBeenCalledWith('dislike');
  });

  it('the like count renders on the heart; the dislike count never does', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} reactionCount={42} dislike="interactive" />);
    expect(screen.getByTestId('like-button')).toHaveTextContent('42');
    // the thumb has no number — the tally stays off the bar (post-actions.md)
    expect(screen.getByTestId('dislike-button').textContent).not.toMatch(/\d/);
  });

  it('the comment button toggles the thread open/closed', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    render(<PostActions {...base} />);
    const btn = screen.getByTestId('comment-button');
    fireEvent.click(btn);
    expect(screen.getByTestId('comment-thread')).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(screen.queryByTestId('comment-thread')).not.toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('a posted comment bumps the live count + reports onCommentCountChange', async () => {
    const { createComment } = await import('@/data');
    vi.mocked(createComment).mockResolvedValueOnce({
      _id: 'c1',
      post_id: 'p1',
      text: 'first!',
      created_at: new Date().toISOString(),
      author_username: 'me',
    } as never);
    const { PostActions } = await import('@/components/Feed/PostActions');
    const onCommentCountChange = vi.fn();
    render(<PostActions {...base} commentCount={0} onCommentCountChange={onCommentCountChange} />);
    fireEvent.click(screen.getByTestId('comment-button'));
    const input = screen.getByTestId('comment-input');
    fireEvent.change(input, { target: { value: 'first!' } });
    fireEvent.click(screen.getByTestId('comment-send'));
    await vi.waitFor(() => {
      expect(onCommentCountChange).toHaveBeenCalledWith(1);
    });
    expect(screen.getByTestId('comment-button')).toHaveTextContent('1');
  });

  it('the heart-burst fires when the surface flips liked (the optimistic add)', async () => {
    const { PostActions } = await import('@/components/Feed/PostActions');
    const { rerender } = render(<PostActions {...base} liked={false} />);
    rerender(<PostActions {...base} liked={true} />);
    // the button re-keyed (burst) and is now pressed
    const btn = screen.getByTestId('like-button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.className).toMatch(/animate-heart-burst/);
  });
});
