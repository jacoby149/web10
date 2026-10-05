import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list).
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer (the comment thread's reads + the reaction writer).
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readThreadComments: vi.fn().mockResolvedValue({ comments: [], nextCursor: null, likeCounts: {}, replyCounts: {} }),
    readThreadReplies: vi.fn().mockResolvedValue({ comments: [], nextCursor: null, likeCounts: {} }),
    createThreadComment: vi.fn().mockResolvedValue({ _id: 'c1' }),
    uploadCommentPhoto: vi.fn().mockResolvedValue({ _id: 'm1' }),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
  };
});

// Mock wapi (signed-in reader).
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'me' }),
  }),
}));

import { PostDetail } from '@/components/Feed/PostDetail';

const POST = {
  _id: 'post-1',
  title: 'The North Face, free solo',
  text: 'A story of the climb, **told** in one take.',
  created_at: new Date().toISOString(),
  visibility: 'public',
  author_username: 'alex',
  author_provider: 'web10',
};

function renderDetail(props: Record<string, unknown> = {}) {
  return render(
    <PostDetail
      post={POST}
      authorName="Alex Honnold"
      liked={false}
      disliked={false}
      likeCount={12}
      dislikeCount={0}
      commentCount={3}
      reposted={false}
      repostCount={5}
      onToggleReaction={vi.fn()}
      onToggleRepost={vi.fn()}
      onShare={vi.fn()}
      onCommentCountChange={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PostDetail — the post-detail system (rich-text.md)', () => {
  it('renders the identity row (avatar + name + @handle + timestamp + privacy glyph)', () => {
    renderDetail({ onAuthorClick: vi.fn() });
    const row = screen.getByTestId('post-detail-identity');
    expect(row).toBeInTheDocument();
    // The display name (a tappable profile link when onAuthorClick is wired).
    expect(screen.getByTestId('post-detail-author')).toHaveTextContent('Alex Honnold');
    expect(row).toHaveTextContent('@alex');
    // The privacy glyph (public → the globe).
    expect(screen.getByTestId('post-detail-privacy')).toBeInTheDocument();
  });

  it('shows the lock glyph for a private post', () => {
    renderDetail({ post: { ...POST, visibility: 'private' } });
    expect(screen.getByTestId('post-detail-privacy')).toBeInTheDocument();
  });

  it('renders the title (the display-font anchor) when present', () => {
    renderDetail();
    expect(screen.getByTestId('post-detail-title')).toHaveTextContent('The North Face, free solo');
  });

  it('omits the title when the post has none (caption-only)', () => {
    renderDetail({ post: { ...POST, title: undefined } });
    expect(screen.queryByTestId('post-detail-title')).toBeNull();
  });

  it('renders the body via <PostBody> (full markdown)', () => {
    renderDetail();
    expect(screen.getByTestId('post-body')).toBeInTheDocument();
  });

  it('sets the body at a reading measure (max-w-prose) — the content-sized column', () => {
    renderDetail();
    // The body wrapper carries the reading measure (a text-only post gets a
    // centered reading column, not 320px-in-896px dead space).
    const body = screen.getByTestId('post-body');
    expect(body.parentElement?.className).toMatch(/max-w-prose/);
  });

  it('renders the quiet stats row ("N likes · M comments")', () => {
    renderDetail();
    const stats = screen.getByTestId('post-detail-stats');
    expect(stats).toHaveTextContent('12');
    expect(stats).toHaveTextContent('likes');
    expect(stats).toHaveTextContent('3');
    expect(stats).toHaveTextContent('comments');
  });

  it('renders the LABELED action bar (Like / Not for me / Comment / Repost / Share)', () => {
    renderDetail();
    expect(screen.getByTestId('like-button')).toHaveTextContent('Like');
    expect(screen.getByTestId('dislike-button')).toHaveTextContent('Not for me');
    expect(screen.getByTestId('comment-button')).toHaveTextContent('Comment');
    expect(screen.getByTestId('repost-button')).toHaveTextContent('Repost');
    expect(screen.getByTestId('share-button')).toHaveTextContent('Share');
    // The counts ride along (tabular).
    expect(screen.getByTestId('like-button')).toHaveTextContent('12');
    expect(screen.getByTestId('repost-button')).toHaveTextContent('5');
  });

  it('the like button reports the like reaction on tap', () => {
    const onToggleReaction = vi.fn();
    renderDetail({ onToggleReaction });
    fireEvent.click(screen.getByTestId('like-button'));
    expect(onToggleReaction).toHaveBeenCalledWith('like');
  });

  it('the comment button opens the comment thread', async () => {
    renderDetail();
    expect(screen.queryByTestId('comment-thread')).toBeNull();
    fireEvent.click(screen.getByTestId('comment-button'));
    await waitFor(() => expect(screen.getByTestId('comment-thread')).toBeInTheDocument());
  });

  it('hides the ⋯ owner menu for a non-owner', () => {
    renderDetail({ isOwner: false });
    expect(screen.queryByTestId('post-options-button')).toBeNull();
  });

  it('shows the ⋯ owner menu for the owner, with the owner actions inside', () => {
    renderDetail({ isOwner: true, onEdit: vi.fn(), onToggleVisibility: vi.fn(), onDelete: vi.fn() });
    expect(screen.getByTestId('post-options-button')).toBeInTheDocument();
    // Closed by default.
    expect(screen.queryByTestId('post-options-menu')).toBeNull();
    // Opening reveals the owner actions (a menu, not a flat list).
    fireEvent.click(screen.getByTestId('post-options-button'));
    expect(screen.getByTestId('post-options-menu')).toBeInTheDocument();
    expect(screen.getByTestId('post-option-edit')).toBeInTheDocument();
    expect(screen.getByTestId('post-option-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('post-delete-button')).toBeInTheDocument();
  });

  it('the ⋯ menu is a menu (not a flat list) — the actions are hidden until opened', () => {
    renderDetail({ isOwner: true, onEdit: vi.fn(), onDelete: vi.fn() });
    // The owner actions are NOT rendered as a flat list at rest.
    expect(screen.queryByTestId('post-option-edit')).toBeNull();
    expect(screen.queryByTestId('post-delete-button')).toBeNull();
  });
});
