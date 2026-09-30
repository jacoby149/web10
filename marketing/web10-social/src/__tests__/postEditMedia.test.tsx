import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// The composer's edit mode resolves the post's media via resolveMediaRefs and
// saves via updatePost. Mock both (plus the profile/ads/settings reads the
// composer does on mount).
const { updatePost, resolveMediaRefs } = vi.hoisted(() => ({
  updatePost: vi.fn().mockResolvedValue({}),
  resolveMediaRefs: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    updatePost,
    resolveMediaRefs,
    createPost: vi.fn().mockResolvedValue({ _id: 'p' }),
    createRepost: vi.fn().mockResolvedValue({ _id: 'r' }),
    uploadMedia: vi.fn(),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
    readProfile: vi.fn().mockResolvedValue({ display_name: 'Test User' }),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
  };
});
vi.mock('@/data/settings', () => ({ readSettings: vi.fn().mockResolvedValue({}) }));
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
}));

import PostComposer from '@/components/Feed/PostComposer';
import type { PostRecord, MediaRecord } from '@/data/types';

const mediaA: MediaRecord = { _id: 'media-a', url: 'https://cdn/a.jpg', thumbnail_url: 'https://cdn/a.jpg', mime_type: 'image/jpeg', width: 100, height: 100, created_at: new Date().toISOString() };
const mediaB: MediaRecord = { _id: 'media-b', url: 'https://cdn/b.jpg', thumbnail_url: 'https://cdn/b.jpg', mime_type: 'image/jpeg', width: 100, height: 100, created_at: new Date().toISOString() };

// A post with a title + two pieces of media (the owner's — editable).
const post: PostRecord = {
  _id: 'post-1',
  title: 'My headline',
  text: 'two pics',
  author_username: 'testuser',
  author_provider: 'test.localhost',
  created_at: new Date().toISOString(),
  visibility: 'public',
  media_refs: ['media-a', 'media-b'],
};

function renderEdit() {
  return render(<PostComposer editingPost={post} onPostCreated={vi.fn()} />);
}

describe('PostComposer edit mode — the ONE edit path (title + body + media remove)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMediaRefs.mockResolvedValue([mediaA, mediaB]);
  });

  it('pre-fills the title (editable) and shows the media with a remove button each', async () => {
    renderEdit();
    // The title is pre-filled from the post (and is an editable input).
    const title = await screen.findByTestId('composer-title');
    expect(title).toHaveValue('My headline');
    // The media grid renders once the refs resolve, with a remove button each.
    await waitFor(() => expect(screen.getByTestId('composer-edit-remove-media-0')).toBeTruthy());
    expect(screen.getByTestId('composer-edit-remove-media-1')).toBeTruthy();
    // The submit button reads "Save" (not "Post").
    expect(screen.getByTestId('post-submit')).toHaveTextContent('Save');
  });

  it('removing a media item writes the surviving refs back on save (with the title)', async () => {
    renderEdit();
    await waitFor(() => expect(screen.getByTestId('composer-edit-remove-media-0')).toBeTruthy());
    // Drop the first media.
    fireEvent.click(screen.getByTestId('composer-edit-remove-media-0'));
    await waitFor(() => expect(screen.queryAllByTestId(/composer-edit-remove-media-/)).toHaveLength(1));
    // Save → updatePost is called with the surviving ref (media-b) + the title.
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(updatePost).toHaveBeenCalled());
    const call = (updatePost as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('post-1');
    expect(call[1].title).toBe('My headline');
    expect(call[1].media_refs).toEqual(['media-b']);
  });

  it('saving without removing media does not send media_refs (no-op)', async () => {
    renderEdit();
    await waitFor(() => expect(screen.getByTestId('composer-edit-remove-media-0')).toBeTruthy());
    // Just save — no media removed.
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(updatePost).toHaveBeenCalled());
    const call = (updatePost as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].media_refs).toBeUndefined();
    expect(call[1].title).toBe('My headline');
  });

  it('clearing the title saves it as undefined (the title is optional)', async () => {
    renderEdit();
    await waitFor(() => expect(screen.getByTestId('composer-edit-remove-media-0')).toBeTruthy());
    // Clear the title → the save should drop it (title is optional).
    fireEvent.change(screen.getByTestId('composer-title'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(updatePost).toHaveBeenCalled());
    const call = (updatePost as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].title).toBeUndefined();
  });
});
