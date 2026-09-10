import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer (the same shape as socialScreens.test.tsx — the feed
// screen's imports). readFeed/resolveMediaRefs are re-mocked per test.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    readFeedPage: vi.fn().mockResolvedValue({ posts: [], has_more: false, next_cursor: null }),
    readPullFeed: vi.fn().mockResolvedValue([]),
    getFeedGroups: vi.fn().mockResolvedValue([]),
    readFeedEngagement: vi.fn().mockResolvedValue({ likes: {}, comments: {} }),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readPost: vi.fn().mockResolvedValue(null),
    countReactions: vi.fn().mockResolvedValue(0),
    countComments: vi.fn().mockResolvedValue(0),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockResolvedValue(null),
    readProfile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue({}),
    readMyPosts: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/img.png' }),
    createPost: vi.fn().mockResolvedValue({ _id: 'post-1' }),
    listConversations: vi.fn().mockResolvedValue([]),
    readDms: vi.fn().mockResolvedValue([]),
    sendDm: vi.fn().mockResolvedValue({}),
    getLastDm: vi.fn().mockResolvedValue(null),
    readContacts: vi.fn().mockResolvedValue([]),
    readFollows: vi.fn().mockResolvedValue([]),
    startConversation: vi.fn().mockResolvedValue({ conversation: 'test.localhost/testuser--test.localhost/other', message: {} }),
    addContact: vi.fn().mockResolvedValue({}),
    conversationKey: vi.fn().mockReturnValue('test.localhost/testuser--test.localhost/other'),
    countStagingPosts: vi.fn().mockResolvedValue(0),
  };
});

// Mock wapi
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
}));

// Fake hls.js — the vendored script attaches window.Hls; the feed test
// needs the hls.js path active (isSupported + loadSource/attachMedia).
class FakeHls {
  static Events = {
    MANIFEST_PARSED: 'manifestParsed',
    LEVEL_SWITCHED: 'levelSwitched',
    ERROR: 'error',
  };
  static isSupported = vi.fn(() => true);
  static instances: FakeHls[] = [];
  loadSource = vi.fn();
  attachMedia = vi.fn();
  destroy = vi.fn();
  on = vi.fn();
  off = vi.fn();
  levels: { height: number }[] = [];
  currentLevel = -1;
  constructor() {
    FakeHls.instances.push(this);
  }
}

beforeEach(() => {
  FakeHls.instances = [];
  vi.clearAllMocks();
  window.Hls = FakeHls as any;
});

describe('FeedScreen — HLS in the feed (D44)', () => {
  it('a transcoded video post renders the hls.js player (not a plain <video>); a direct MP4 post renders native', async () => {
    const { readFeedPage } = await import('@/data');
    // The feed read carries the resolved refs inline: the transcoded one
    // carries transcoding_settings + the read-minted manifest_url; the raw one
    // has none (the Phase-2 import path plays native MP4s with no transcode).
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        {
          _id: 'p-hls', text: 'transcoded clip', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date().toISOString(),
          media_refs: [{
            doc_id: 'm-hls', read_url: 'http://test.com/raw.mp4', mime_type: 'video/mp4',
            width: 720, height: 1280, thumbnail_url: 'http://test.com/poster.jpg',
            transcoding_settings: {
              enabled: true, status: 'done',
              variants: [{ width: 360, height: 640 }, { width: 720, height: 1280 }],
              manifest_url: '/v3/media/hls/manifest?doc_id=m-hls&sig=abc',
            },
          }],
        },
        {
          _id: 'p-raw', text: 'raw clip', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date().toISOString(),
          media_refs: [{ doc_id: 'm-raw', read_url: 'http://test.com/raw.mp4', mime_type: 'video/mp4', width: 1920, height: 1080 }],
        },
      ],
      has_more: false, next_cursor: null,
    });

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    // The transcoded post: the hls.js player (hls.js feeds the video — no
    // src attribute — NOT the plain <video src={read_url}> path).
    await waitFor(() => {
      expect(screen.getByTestId('hls-video-player')).toBeInTheDocument();
    });
    const hlsVideo = screen.getByTestId('hls-video');
    expect(hlsVideo.getAttribute('src')).toBeNull();
    // The player's controls are present (the player spec).
    expect(screen.getByTestId('quality-select')).toBeInTheDocument();
    expect(screen.getByTestId('speed-select')).toBeInTheDocument();
    expect(screen.getByTestId('fullscreen-button')).toBeInTheDocument();
    // The hls.js instance was wired to the minted manifest (API origin +
    // the path-only manifest_url from the read). The `new Hls()` runs in the
    // player's effect (after the element commits), so wait for the instance —
    // under CI load the element can be in the DOM before the effect runs.
    await waitFor(() => {
      expect(FakeHls.instances.length).toBeGreaterThan(0);
    });
    const hls = FakeHls.instances[0];
    expect(hls.loadSource).toHaveBeenCalledWith(expect.stringContaining('/v3/media/hls/manifest?doc_id=m-hls&sig=abc'));

    // The raw MP4 post: the native <video> path (unchanged).
    const native = screen.getByTestId('media-video');
    expect(native).toBeInTheDocument();
    expect(native.querySelector('video')?.getAttribute('src')).toBe('http://test.com/raw.mp4');

    // Exactly one hls player + one native video in the feed.
    expect(screen.getAllByTestId('hls-video-player')).toHaveLength(1);
    expect(screen.getAllByTestId('media-video')).toHaveLength(1);
  }, 20000);

  it('a processing transcode (status !== done) falls back to the native <video> path', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        {
          _id: 'p-proc', text: 'processing clip', author_username: 'testuser', author_provider: 'test.localhost', created_at: new Date().toISOString(),
          media_refs: [{
            doc_id: 'm-proc', read_url: 'http://test.com/raw.mp4', mime_type: 'video/mp4',
            width: 720, height: 1280,
            transcoding_settings: { enabled: false, status: 'processing' },
          }],
        },
      ],
      has_more: false, next_cursor: null,
    });

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('media-video')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('hls-video-player')).toBeNull();
  }, 20000);
});
