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

// Mock wapi (signed out — no owner menu, keeps the test focused on the video).
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({ readToken: vi.fn().mockReturnValue(null) }),
}));

// Fake hls.js (the vendored script attaches window.Hls) — the HlsVideoPlayer
// needs it to render the player (not the "can't play" error state).
class FakeHls {
  static Events = { MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched', ERROR: 'error' };
  static isSupported = () => true;
  loadSource = vi.fn();
  attachMedia = vi.fn();
  destroy = vi.fn();
  on = vi.fn();
  off = vi.fn();
  levels = [];
  currentLevel = -1;
  autoStartLoad = true;
  startLoad = vi.fn();
}
function installFakeHls() { (window as unknown as { Hls: unknown }).Hls = FakeHls as unknown; }
function uninstallHls() { delete (window as unknown as { Hls?: unknown }).Hls; }

import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { PostRecord, MediaRecord } from '@/data/types';

beforeEach(() => { installFakeHls(); vi.clearAllMocks(); });
afterEach(() => { uninstallHls(); cleanup(); });

describe('PostLightbox — portrait (9:16) video frame cap', () => {
  function renderWithVideo(media: MediaRecord) {
    const post: PostRecord = {
      _id: 'post-vid',
      text: 'a vertical clip',
      author_username: 'someone',
      author_provider: 'web10',
      created_at: new Date().toISOString(),
      visibility: 'public',
      media_refs: ['ref-1'],
    };
    return render(
      <MemoryRouter>
        <PostLightbox post={post} mediaMap={{ 'ref-1': media }} onClose={vi.fn()} onReload={vi.fn()} />
      </MemoryRouter>,
    );
  }

  const portraitMedia: MediaRecord = {
    _id: 'ref-1',
    url: 'https://cdn.example.com/a.mp4?sig=x',
    created_at: new Date().toISOString(),
    mime_type: 'video/mp4',
    width: 720,
    height: 1280,
    thumbnail_url: 'https://cdn.example.com/a-poster.jpg?sig=y',
    transcoding_settings: {
      enabled: true,
      status: 'done',
      manifest_url: '/v3/media/hls/manifest?doc_id=ref-1&sig=z',
      variants: [{ width: 720, height: 1280 }],
    },
  };

  const landscapeMedia: MediaRecord = {
    ...portraitMedia,
    width: 1280,
    height: 720,
    transcoding_settings: {
      ...portraitMedia.transcoding_settings,
      variants: [{ width: 1280, height: 720 }],
    },
  };

  it('caps a portrait (9:16) clip to a square-ish frame, centered in a black letterbox', () => {
    renderWithVideo(portraitMedia);
    // The hls player renders (transcoded → hls.js path).
    const player = screen.getByTestId('hls-video-player');
    expect(player).toBeInTheDocument();
    // The frame (the aspect-ratio box) is capped to the maxWidth + centered —
    // the full-width 9:16 box would be ~1.78× the viewport tall (clipped by the
    // modal, the rack stranded off-screen). The cap keeps the whole clip + rack
    // in view (the operator liked the square frame).
    const frame = player.querySelector(':scope > div') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.style.maxWidth).toBe('min(50vh, 100%)');
    expect(frame.className).toMatch(/mx-auto/);
    // The source ratio is still reserved (9:16).
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(720 / 1280, 5);
  });

  it('leaves a landscape clip full-width (no cap — only portrait is too tall)', () => {
    renderWithVideo(landscapeMedia);
    const player = screen.getByTestId('hls-video-player');
    expect(player).toBeInTheDocument();
    const frame = player.querySelector(':scope > div') as HTMLElement;
    expect(frame.style.maxWidth).toBe('');
    expect(frame.className).not.toMatch(/mx-auto/);
  });
});
