import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer — PostLightbox imports these from '@/data'.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    deletePost: vi.fn().mockResolvedValue(undefined),
    movePostVisibility: vi.fn().mockResolvedValue({}),
    updatePost: vi.fn().mockResolvedValue({}),
    toggleReaction: vi.fn().mockResolvedValue({}),
    toggleReactionKind: vi.fn().mockResolvedValue({}),
    toggleRepost: vi.fn().mockResolvedValue({}),
    countReactions: vi.fn().mockResolvedValue(0),
    readReactions: vi.fn().mockResolvedValue([]),
    countComments: vi.fn().mockResolvedValue(0),
    recordRepost: vi.fn().mockResolvedValue({}),
  };
});

// Signed out — the pane sizing is reader-agnostic.
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({ readToken: vi.fn().mockReturnValue(null) }),
}));

import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord, MediaRecord } from '@/data/types';

function renderPhotoPost(media: MediaRecord) {
  const post: PostRecord = {
    _id: 'post-photo',
    title: 'Staaabucks',
    text: 'Waking up at 5AM, going to staaabucks.',
    author_username: 'nova',
    created_at: '2026-01-01T00:00:00Z',
    visibility: 'public',
    media_refs: ['m-photo'],
  };
  return render(
    <MemoryRouter>
      <PostLightbox post={post} mediaMap={{ 'm-photo': media }} onClose={vi.fn()} postAuthor="nova" />
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

// The portrait "photobox" cap (grainy-feed + dominant-lightbox reports,
// 25.11.2026): a tall photo in the lightbox wore the 88vh desktop cap and
// dominated the panel — the caption + engagement row scrolled out of view.
// The feed's portrait photos cap at 60vh (MediaItem's maxHeight) with black
// side bars; the lightbox must match. Landscape photos keep the 88vh cap.
describe('PostLightbox — the media pane caps portrait frames (the feed\'s photobox, not 88vh)', () => {
  it('a portrait photo (720x1280) wears the 60vh desktop cap', () => {
    renderPhotoPost({
      _id: 'm-photo', url: 'https://cdn.example.com/photo.jpg?sig=1',
      created_at: '2026-01-01T00:00:00Z', mime_type: 'image/jpeg', width: 720, height: 1280,
    });
    const pane = screen.getByTestId('post-lightbox-media-pane');
    expect(pane.className).toContain('sm:max-h-[60vh]');
    expect(pane.className).not.toContain('sm:max-h-[88vh]');
    // The pane keeps the mobile cap + the black letterbox background.
    expect(pane.className).toContain('max-h-[50vh]');
    expect(pane.className).toContain('bg-black');
    // The frame ratio is still reserved (no layout shift) — the browser
    // serializes a bare number as "N / 1".
    expect(pane.style.aspectRatio).toContain('0.5625');
  });

  it('a landscape photo (1920x1080) keeps the 88vh desktop cap (unchanged)', () => {
    renderPhotoPost({
      _id: 'm-photo', url: 'https://cdn.example.com/photo.jpg?sig=1',
      created_at: '2026-01-01T00:00:00Z', mime_type: 'image/jpeg', width: 1920, height: 1080,
    });
    const pane = screen.getByTestId('post-lightbox-media-pane');
    expect(pane.className).toContain('sm:max-h-[88vh]');
    expect(pane.className).not.toContain('sm:max-h-[60vh]');
  });

  it('legacy media without stored dimensions keeps the default 4:3 (landscape) cap', () => {
    renderPhotoPost({
      _id: 'm-photo', url: 'https://cdn.example.com/photo.jpg?sig=1',
      created_at: '2026-01-01T00:00:00Z', mime_type: 'image/jpeg',
    });
    const pane = screen.getByTestId('post-lightbox-media-pane');
    expect(pane.className).toContain('sm:max-h-[88vh]');
    expect(pane.style.aspectRatio).toContain('1.3333333333333333');
  });
});
