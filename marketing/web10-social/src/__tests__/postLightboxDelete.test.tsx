import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

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
    <MemoryRouter>
      <PostLightbox
        post={post}
        mediaMap={{}}
        onClose={vi.fn()}
        onReload={vi.fn()}
        isOwner={true}
      />
    </MemoryRouter>,
  );
}

describe('PostLightbox — delete flow (two-tap confirm in the `⋯` menu)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('arming delete from the `⋯` menu reveals the confirm action (not a dead button)', () => {
    renderLightbox();
    // The owner's `⋯` menu is present; the delete confirm is hidden until armed.
    expect(screen.getByTestId('post-options-button')).toBeTruthy();
    expect(screen.queryByTestId('post-delete-confirm-button')).toBeNull();

    // Open the menu, click "Delete post" — it ARMS the confirm (the old flow
    // required typing "delete"; this is a two-tap confirm).
    fireEvent.click(screen.getByTestId('post-options-button'));
    fireEvent.click(screen.getByTestId('post-delete-button'));
    expect(screen.getByTestId('post-delete-confirm-button')).toBeTruthy();
  });

  it('confirming calls deletePost with the post id', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <PostLightbox post={post} mediaMap={{}} onClose={onClose} onReload={vi.fn()} isOwner={true} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('post-options-button'));
    fireEvent.click(screen.getByTestId('post-delete-button'));
    fireEvent.click(screen.getByTestId('post-delete-confirm-button'));
    await waitFor(() => expect(deletePost).toHaveBeenCalledWith('post-1'));
    expect(onClose).toHaveBeenCalled();
  });

  it('the delete action is absent for a non-owner', () => {
    render(
      <MemoryRouter>
        <PostLightbox
          post={{ _id: 'theirs', text: 'theirs', author_username: 'someone', author_provider: 'web10', created_at: new Date().toISOString(), visibility: 'public' }}
          mediaMap={{}}
          onClose={vi.fn()}
          onReload={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('post-options-button')).toBeNull();
    expect(screen.queryByTestId('post-delete-button')).toBeNull();
  });
});

describe('PostLightbox — ownership fallback (no isOwner prop)', () => {
  // The token is { provider: 'test.localhost', username: 'testuser' }. When a
  // call site omits isOwner (the discover lightbox), ownership must be derived
  // from the post's author — not from "a token exists" (the old fallback that
  // showed the owner menu on every post while signed in).
  it('shows owner actions for a post authored by the signed-in user', () => {
    render(
      <MemoryRouter>
        <PostLightbox
          post={{ _id: 'own', text: 'mine', author_username: 'testuser', author_provider: 'web10', created_at: new Date().toISOString(), visibility: 'public' }}
          mediaMap={{}}
          onClose={vi.fn()}
          onReload={vi.fn()}
        />
      </MemoryRouter>,
    );
    // The owner's actions live in the `⋯` menu (the post-detail's owner menu,
    // not a flat list). Opening it reveals them.
    expect(screen.getByTestId('post-options-button')).toBeTruthy();
    fireEvent.click(screen.getByTestId('post-options-button'));
    expect(screen.getByTestId('post-edit-button')).toBeTruthy();
    expect(screen.getByTestId('post-delete-button')).toBeTruthy();
    expect(screen.getByTestId('post-visibility-toggle-button')).toBeTruthy();
  });

  it('hides owner actions for a post authored by someone else', () => {
    render(
      <MemoryRouter>
        <PostLightbox
          post={{ _id: 'theirs', text: 'theirs', author_username: 'someone', author_provider: 'web10', created_at: new Date().toISOString(), visibility: 'public' }}
          mediaMap={{}}
          onClose={vi.fn()}
          onReload={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('post-edit-button')).toBeNull();
    expect(screen.queryByTestId('post-delete-button')).toBeNull();
    expect(screen.queryByTestId('post-visibility-toggle-button')).toBeNull();
  });
});
