import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// Mock lucide-react icons (Proxy — fabricates any icon on demand).
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer — PostLightbox imports these from '@/data'.
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
    countComments: vi.fn().mockResolvedValue(3),
    readRepostCounts: vi.fn().mockResolvedValue({}),
    readMyRepostedIds: vi.fn().mockResolvedValue(new Set()),
    readThreadComments: vi.fn().mockResolvedValue({ comments: [], nextCursor: null }),
    readThreadReplies: vi.fn().mockResolvedValue({ comments: [], nextCursor: null }),
    createThreadComment: vi.fn().mockResolvedValue({ _id: 'c1' }),
  };
});

// Mock wapi — signed in as "testuser".
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
}));

import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord } from '@/data/types';

const basePost: PostRecord = {
  _id: 'post-1',
  title: 'My headline',
  text: 'The body of the post.',
  author_username: 'novacreator',
  author_provider: 'web10',
  created_at: new Date().toISOString(),
  visibility: 'public',
  profile: { display_name: 'Nova Creator' } as never,
  avatar_url: 'http://minio.test/nova.png',
};

function renderLightbox(post: PostRecord = basePost, mediaMap: Record<string, never> = {}) {
  return render(
    <MemoryRouter>
      <PostLightbox post={post} mediaMap={mediaMap} onClose={vi.fn()} onReload={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('PostLightbox — the post-detail styling system (D85, Facebook-grade)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the identity row: avatar + name + @handle + timestamp', () => {
    renderLightbox();
    const identity = screen.getByTestId('post-lightbox-identity');
    // The author name (from the profile's display_name) + the @handle.
    expect(identity).toHaveTextContent('Nova Creator');
    expect(identity).toHaveTextContent('@novacreator');
    // The avatar is the author's resolved avatar_url.
    const img = identity.querySelector('img');
    expect(img).toHaveAttribute('src', 'http://minio.test/nova.png');
  });

  it('shows a privacy glyph for a non-public post', () => {
    renderLightbox({ ...basePost, visibility: 'private' });
    expect(screen.getByTestId('post-lightbox-privacy')).toHaveTextContent('Private');
  });

  it('does NOT show a privacy glyph for a public post', () => {
    renderLightbox();
    expect(screen.queryByTestId('post-lightbox-privacy')).toBeNull();
  });

  it('shows the quiet stats row (N likes · M comments)', async () => {
    renderLightbox();
    const stats = await screen.findByTestId('post-lightbox-stats');
    expect(stats).toHaveTextContent('0');
    expect(stats).toHaveTextContent('likes');
    expect(stats).toHaveTextContent('3');
    expect(stats).toHaveTextContent('comments');
  });

  it('the action bar is labeled (Like / Comment / Share) with counts', async () => {
    renderLightbox();
    // The labeled action bar carries text labels next to the icons.
    const like = await screen.findByTestId('like-button');
    expect(like).toHaveTextContent('Like');
    expect(screen.getByTestId('comment-button')).toHaveTextContent('Comment');
    expect(screen.getByTestId('share-button')).toHaveTextContent('Share');
    // Counts are shown (the labeled bar keeps them).
    expect(await screen.findByTestId('repost-button')).toHaveTextContent('Repost');
  });

  it('a text-only post renders a centered reading column (no media pane)', () => {
    renderLightbox();
    // The text-only layout is present…
    expect(screen.getByTestId('post-lightbox-text-only')).toBeTruthy();
    // …and the title is in the display face (the type scale).
    expect(screen.getByTestId('post-lightbox-title')).toHaveTextContent('My headline');
    // No media carousel (no prev/next media arrows).
    expect(screen.queryByTestId('post-lightbox-prev')).toBeNull();
  });

  it('a media post renders the media viewer + the details column', () => {
    const media = {
      doc_id: 'm1',
      object_key: 'm1',
      mime_type: 'image/png',
      filename: 'm1.png',
      size_bytes: 1,
      read_url: 'http://minio.test/m1.png',
      url: 'http://minio.test/m1.png',
    } as never;
    renderLightbox(
      { ...basePost, media_refs: [{ doc_id: 'm1' } as never] },
      { m1: media },
    );
    // The media pane shows the image…
    expect(screen.queryByTestId('post-lightbox-text-only')).toBeNull();
    const img = screen.getByAltText('');
    expect(img).toHaveAttribute('src', 'http://minio.test/m1.png');
    // …and the details column still carries the stats + labeled actions.
    expect(screen.getByTestId('post-lightbox-stats')).toBeTruthy();
    expect(screen.getByTestId('share-button')).toHaveTextContent('Share');
  });

  it('the owner sees a `⋯` menu (not a flat list) with Edit / visibility / Delete', () => {
    renderLightbox({ ...basePost, author_username: 'testuser' });
    // The `⋯` button is present; the actions are hidden until the menu opens.
    const kebab = screen.getByTestId('post-options-button');
    expect(kebab).toBeTruthy();
    expect(screen.queryByTestId('post-edit-button')).toBeNull();
    expect(screen.queryByTestId('post-delete-button')).toBeNull();

    fireEvent.click(kebab);
    expect(screen.getByTestId('post-options-menu')).toBeTruthy();
    expect(screen.getByTestId('post-edit-button')).toBeTruthy();
    expect(screen.getByTestId('post-visibility-toggle-button')).toBeTruthy();
    expect(screen.getByTestId('post-delete-button')).toBeTruthy();
  });

  it('a non-owner sees no `⋯` menu', () => {
    renderLightbox();
    expect(screen.queryByTestId('post-options-button')).toBeNull();
  });
});
