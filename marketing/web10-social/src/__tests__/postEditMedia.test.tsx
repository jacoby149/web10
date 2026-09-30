import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

const { updatePost } = vi.hoisted(() => ({ updatePost: vi.fn().mockResolvedValue({}) }));
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    updatePost,
    deletePost: vi.fn().mockResolvedValue(undefined),
    movePostVisibility: vi.fn().mockResolvedValue({}),
    toggleReaction: vi.fn().mockResolvedValue({}),
    countReactions: vi.fn().mockResolvedValue(0),
    readReactions: vi.fn().mockResolvedValue([]),
    countComments: vi.fn().mockResolvedValue(0),
    recordRepost: vi.fn().mockResolvedValue({}),
  };
});
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
}));

import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord, MediaRecord } from '@/data/types';

// A post with two pieces of media (the owner's — editable).
const mediaA: MediaRecord = { _id: 'media-a', url: 'https://cdn/a.jpg', mime_type: 'image/jpeg', width: 100, height: 100, created_at: new Date().toISOString() };
const mediaB: MediaRecord = { _id: 'media-b', url: 'https://cdn/b.jpg', mime_type: 'image/jpeg', width: 100, height: 100, created_at: new Date().toISOString() };

const post: PostRecord = {
  _id: 'post-1',
  text: 'two pics',
  author_username: 'testuser',
  author_provider: 'test.localhost',
  created_at: new Date().toISOString(),
  visibility: 'public',
  media_refs: ['media-a', 'media-b'],
};

const mediaMap: Record<string, MediaRecord> = { 'media-a': mediaA, 'media-b': mediaB };

function renderLightbox() {
  return render(
    <MemoryRouter>
      <PostLightbox post={post} mediaMap={mediaMap} onClose={vi.fn()} onReload={vi.fn()} isOwner={true} />
    </MemoryRouter>,
  );
}

describe('PostLightbox — the edit flow lets the owner remove media (the bug)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a remove button on each media item while editing', () => {
    renderLightbox();
    fireEvent.click(screen.getByTestId('post-edit-button'));
    // Two media → two remove buttons.
    expect(screen.getByTestId('post-lightbox-edit-remove-media-0')).toBeTruthy();
    expect(screen.getByTestId('post-lightbox-edit-remove-media-1')).toBeTruthy();
  });

  it('removing a media item writes the surviving refs back on save', async () => {
    renderLightbox();
    fireEvent.click(screen.getByTestId('post-edit-button'));
    // Drop the first media.
    fireEvent.click(screen.getByTestId('post-lightbox-edit-remove-media-0'));
    // Only one remove button left (the second media, now index 0).
    expect(screen.queryAllByTestId(/post-lightbox-edit-remove-media-/)).toHaveLength(1);
    // Save → updatePost is called with the surviving ref (media-b) only.
    fireEvent.click(screen.getByTestId('post-edit-save'));
    await waitFor(() => expect(updatePost).toHaveBeenCalled());
    const call = (updatePost as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].media_refs).toEqual(['media-b']);
  });

  it('saving without removing media does not send media_refs (no-op)', async () => {
    renderLightbox();
    fireEvent.click(screen.getByTestId('post-edit-button'));
    // Just edit the text and save — no media removed.
    fireEvent.change(screen.getByTestId('post-edit-input'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByTestId('post-edit-save'));
    await waitFor(() => expect(updatePost).toHaveBeenCalled());
    const call = (updatePost as ReturnType<typeof vi.fn>).mock.calls[0];
    // media_refs is NOT in the update (nothing changed).
    expect(call[1].media_refs).toBeUndefined();
    expect(call[1].text).toBe('edited');
  });
});
