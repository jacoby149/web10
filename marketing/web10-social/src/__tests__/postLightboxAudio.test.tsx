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

// Signed out — the audio seam is reader-agnostic (no owner menu needed).
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({ readToken: vi.fn().mockReturnValue(null) }),
}));

import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord, MediaRecord } from '@/data/types';

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

// A music post: the `music` tag + exactly one audio media (the shared gate) +
// the optional supporting album-art image. The lightbox must collapse it to a
// SINGLE slide — the shared AudioPlayer with the artwork — never an `<img>`
// pointed at the recording (the pre-fix "profile mp3 posts don't play" break).
function renderAudioPost(over: { art?: boolean; tag?: boolean }) {
  const audio: MediaRecord = {
    _id: 'm-audio',
    url: 'https://cdn.example.com/track.mp3?sig=1',
    created_at: '2026-01-01T00:00:00Z',
    mime_type: 'audio/mpeg',
    duration_seconds: 210,
    thumbnail_url: over.art ? 'https://cdn.example.com/art.webp?sig=2' : undefined,
  };
  const art: MediaRecord | undefined = over.art
    ? { _id: 'm-art', url: 'https://cdn.example.com/art-full.png?sig=3', created_at: '2026-01-01T00:00:00Z', mime_type: 'image/png' }
    : undefined;
  const post: PostRecord = {
    _id: 'post-music',
    title: 'Late Night Loop',
    text: 'an mp3 post',
    author_username: 'nova',
    created_at: '2026-01-01T00:00:00Z',
    visibility: 'public',
    tags: over.tag === false ? [] : ['music'],
    media_refs: over.art ? ['m-audio', 'm-art'] : ['m-audio'],
  };
  const mediaMap: Record<string, MediaRecord> = { 'm-audio': audio, ...(art ? { 'm-art': art } : {}) };
  return render(
    <MemoryRouter>
      <PostLightbox post={post} mediaMap={mediaMap} onClose={vi.fn()} postAuthor="nova" />
    </MemoryRouter>,
  );
}

describe('PostLightbox — audio posts play (the shared AudioPlayer, not an <img> of an mp3)', () => {
  it('a music track renders one audio slide with the album art (the recording never renders as an image)', () => {
    renderAudioPost({ art: true, tag: true });
    // The strip collapses the [recording, album art] frames to ONE slide
    // (the audio player + the art as its artwork) — no frame paging.
    expect(screen.getByTestId('post-lightbox-strip')).toHaveAttribute('aria-label', '1 media items');
    const audio = screen.getByTestId('post-lightbox-audio');
    expect(audio).toBeInTheDocument();
    expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    // The shared player's chrome: the track title + the seek control.
    expect(screen.getByTestId('audio-track-title')).toHaveTextContent('Late Night Loop');
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeEnabled();
    // The pre-fix break: an `<img>` with the mp3 URL as its src. Never.
    screen.getAllByRole('img').forEach((img) => {
      expect(img.getAttribute('src')).not.toMatch(/\.mp3/);
    });
    // The artwork is the audio's own thumbnail (the album-art precedence).
    const artwork = screen.getByTestId('audio-artwork');
    expect(artwork).toBeInTheDocument();
  });

  it('a music track without album art keeps a playable single slide', () => {
    renderAudioPost({ art: false, tag: true });
    expect(screen.getByTestId('post-lightbox-strip')).toHaveAttribute('aria-label', '1 media items');
    expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeEnabled();
  });

  it('an untagged audio post (a voice note) still renders the audio player, frame by frame', () => {
    // No `music` tag → the music gate declines → the per-frame strip keeps the
    // audio slide (the shared player) instead of an `<img>` of an mp3.
    renderAudioPost({ art: false, tag: false });
    expect(screen.getByTestId('post-lightbox-strip')).toHaveAttribute('aria-label', '1 media items');
    expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeEnabled();
  });

  it('a music-VIDEO track keeps the video player (the gate passes a video playable through)', () => {
    const video: MediaRecord = {
      _id: 'm-video',
      url: 'https://cdn.example.com/track.mp4?sig=1',
      created_at: '2026-01-01T00:00:00Z',
      mime_type: 'video/mp4',
      width: 1280,
      height: 720,
      thumbnail_url: 'https://cdn.example.com/poster.webp?sig=2',
    };
    const post: PostRecord = {
      _id: 'post-music-video',
      title: 'Live Set',
      text: 'a music video',
      author_username: 'nova',
      created_at: '2026-01-01T00:00:00Z',
      visibility: 'public',
      tags: ['music'],
      media_refs: ['m-video'],
    };
    render(
      <MemoryRouter>
        <PostLightbox post={post} mediaMap={{ 'm-video': video }} onClose={vi.fn()} postAuthor="nova" />
      </MemoryRouter>,
    );
    // The video slide (the file-source testid on the player), not the audio player.
    expect(screen.getByTestId('post-lightbox-media-0')).toBeInTheDocument();
    expect(screen.queryByTestId('post-lightbox-audio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('audio-player')).not.toBeInTheDocument();
  });
});
