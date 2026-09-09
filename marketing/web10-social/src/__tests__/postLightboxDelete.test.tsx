import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer — PostLightbox imports these from '@/data'.
// vi.hoisted: the mock factory is hoisted above imports, so shared fns must be
// created there (not as top-level consts).
const { deletePost, movePostVisibility } = vi.hoisted(() => ({
  deletePost: vi.fn().mockResolvedValue(undefined),
  movePostVisibility: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    deletePost,
    movePostVisibility,
    updatePost: vi.fn().mockResolvedValue({}),
    toggleReaction: vi.fn().mockResolvedValue({}),
    countReactions: vi.fn().mockResolvedValue(0),
    readReactions: vi.fn().mockResolvedValue([]),
    countComments: vi.fn().mockResolvedValue(0),
    recordRepost: vi.fn().mockResolvedValue({}),
  };
});

// Mock wapi
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
}));

import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord } from '@/data/types';

const post: PostRecord = {
  _id: 'post-1',
  text: 'my video post',
  author_username: 'testuser',
  author_provider: 'test.localhost',
  created_at: new Date().toISOString(),
  visibility: 'public',
};

function renderLightbox() {
  return render(
    <PostLightbox
      post={post}
      mediaMap={{}}
      onClose={vi.fn()}
      onReload={vi.fn()}
      isOwner={true}
    />,
  );
}

describe('PostLightbox — delete flow (type "delete" to confirm)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the confirm UI when "Delete post" is clicked (not a dead button)', () => {
    renderLightbox();
    // Initially the plain "Delete post" button is shown, no confirm input.
    expect(screen.getByTestId('post-delete-button')).toBeTruthy();
    expect(screen.queryByTestId('post-delete-confirm-input')).toBeNull();

    // Clicking it ARMS the confirm UI (the bug: it used to do nothing).
    fireEvent.click(screen.getByTestId('post-delete-button'));
    expect(screen.getByTestId('post-delete-confirm-input')).toBeTruthy();
    expect(screen.getByTestId('post-delete-confirm-button')).toBeTruthy();
  });

  it('the confirm button is disabled until "delete" is typed', () => {
    renderLightbox();
    fireEvent.click(screen.getByTestId('post-delete-button'));
    const confirm = screen.getByTestId('post-delete-confirm-button') as HTMLButtonElement;
    expect(confirm).toBeDisabled();

    // Typing anything-but-"delete" keeps it disabled.
    fireEvent.change(screen.getByTestId('post-delete-confirm-input'), { target: { value: 'del' } });
    expect(confirm).toBeDisabled();

    // Typing "delete" enables it.
    fireEvent.change(screen.getByTestId('post-delete-confirm-input'), { target: { value: 'delete' } });
    expect(confirm).toBeEnabled();
  });

  it('confirming calls deletePost with the post id', async () => {
    const onClose = vi.fn();
    render(
      <PostLightbox post={post} mediaMap={{}} onClose={onClose} onReload={vi.fn()} isOwner={true} />,
    );
    fireEvent.click(screen.getByTestId('post-delete-button'));
    fireEvent.change(screen.getByTestId('post-delete-confirm-input'), { target: { value: 'delete' } });
    fireEvent.click(screen.getByTestId('post-delete-confirm-button'));
    await waitFor(() => expect(deletePost).toHaveBeenCalledWith('post-1'));
    expect(onClose).toHaveBeenCalled();
  });

  it('cancel disarms the confirm UI', () => {
    renderLightbox();
    fireEvent.click(screen.getByTestId('post-delete-button'));
    expect(screen.getByTestId('post-delete-confirm-input')).toBeTruthy();
    // The Cancel button is the ghost button next to Confirm Delete.
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);
    expect(screen.queryByTestId('post-delete-confirm-input')).toBeNull();
    expect(screen.getByTestId('post-delete-button')).toBeTruthy();
    expect(deletePost).not.toHaveBeenCalled();
  });
});
