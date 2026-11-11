import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as data from '@/data';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer the way the Music tests do (the transport only needs
// readMusicTrack for the recovery path).
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getWapi: vi.fn(() => ({ readToken: () => ({ provider: 'node.test', username: 'listener' }), isSignedIn: () => true })),
    readMusicPage: vi.fn().mockResolvedValue({ tracks: [], hasMore: false }),
    readMusicTrack: vi.fn(),
    readMusicCollection: vi.fn().mockResolvedValue({ tracks: [], name: '', skipped: 0, visibility: 'public' }),
    getMyCollections: vi.fn().mockResolvedValue([]),
    readSavedPostIds: vi.fn().mockResolvedValue(new Set()),
    toggleSavedMusic: vi.fn(),
    createCollection: vi.fn(),
    setCollectionVisibility: vi.fn(),
    readReactions: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn(),
    readPlaylistBookmarks: vi.fn().mockResolvedValue([]),
  };
});
vi.mock('@/context/SaveContext', () => ({ useSave: () => ({ openSave: vi.fn(), saveOpen: false }) }));

// A fake hls.js (the vendored build attaches window.Hls in the app; the
// harness/tests fake it the same way — isSupported/loadSource/attachMedia/destroy).
// Instances are tracked so a test can assert the exact manifest + element.
const createdHls: FakeHls[] = [];
class FakeHls {
  static Events = { MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched', ERROR: 'error' };
  static isSupported = () => true;
  loadSource = vi.fn();
  attachMedia = vi.fn();
  destroy = vi.fn();
  on = vi.fn();
  off = vi.fn();
  constructor() { createdHls.push(this); }
}
function installFakeHls() { (window as unknown as { Hls: unknown }).Hls = FakeHls as unknown; }
function uninstallFakeHls() { delete (window as unknown as { Hls?: unknown }).Hls; }

import { MusicProvider, useMusic } from '@/context/MusicContext';
import type { MusicTrack } from '@/data';
import type { MediaRecord, PostRecord } from '@/data/types';

function audioPost(): PostRecord {
  return { _id: 'post-a', title: 'Audio cut', text: '', author_username: 'nova', created_at: '2026-01-01T00:00:00Z' };
}
function videoPost(): PostRecord {
  return { _id: 'post-v', title: 'Live set', text: '', author_username: 'nova', created_at: '2026-01-01T00:00:00Z', tags: ['music'] };
}

function audioTrack(): MusicTrack {
  return {
    post: audioPost(),
    media: { _id: 'm-a', url: 'https://cdn/a.mp3?sig=1', mime_type: 'audio/mpeg', duration_seconds: 60, created_at: '' } as MediaRecord,
  } as MusicTrack;
}
function videoTrack(over: { hls?: boolean } = {}): MusicTrack {
  return {
    post: videoPost(),
    media: {
      _id: 'm-v', url: 'https://cdn/v.mp4?sig=2', mime_type: 'video/mp4', duration_seconds: 60, created_at: '',
      ...(over.hls ? { transcoding_settings: { enabled: true, status: 'done', manifest_url: '/v3/media/hls/manifest?doc_id=m-v' } } : {}),
    } as MediaRecord,
  } as MusicTrack;
}

function Probe() {
  const music = useMusic();
  const videoEl = music.videoElement;
  return (
    <div>
      <button data-testid="play-video" onClick={() => music.play(videoTrack(), [videoTrack()])}>video</button>
      <button data-testid="play-video-hls" onClick={() => music.play(videoTrack({ hls: true }), [videoTrack({ hls: true })])}>hls</button>
      <button data-testid="play-audio" onClick={() => music.play(audioTrack(), [audioTrack()])}>audio</button>
      <span data-testid="probe-kind">{music.current?.media.mime_type || 'none'}</span>
      <span data-testid="probe-video-src">{videoEl ? (videoEl.getAttribute('src') ?? '') : 'no-element'}</span>
      <span data-testid="probe-video-parent">{videoEl && videoEl.parentNode ? (videoEl.parentNode as Element).getAttribute?.('data-testid') || 'attached-elsewhere' : 'detached'}</span>
      <button data-testid="attach-stage" onClick={() => music.attachVideoStage(document.getElementById('stage')!)}>attach</button>
      <button data-testid="detach-stage" onClick={() => music.attachVideoStage(null)}>detach</button>
      <div id="stage" data-testid="music-video-stage" />
    </div>
  );
}

describe('MusicProvider — the dual transport (music.md: a video CAN be a track)', () => {
  beforeEach(() => {
    installFakeHls();
    createdHls.length = 0;
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });
  afterEach(() => {
    uninstallFakeHls();
    cleanup();
    vi.restoreAllMocks();
  });

  it('routes a FILE video track to the video transport (the audio element never gets the mp4)', async () => {
    render(<MusicProvider sessionKey="t"><Probe /></MusicProvider>);
    fireEvent.click(screen.getByTestId('play-video'));
    await waitFor(() => expect(screen.getByTestId('probe-kind')).toHaveTextContent('video/mp4'));
    const videoEl = screen.getByTestId('probe-video-src');
    await waitFor(() => expect(videoEl).toHaveTextContent('https://cdn/v.mp4?sig=2'));
    // The session plays through the video element, not Audio.
    expect(HTMLVideoElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByTestId('probe-video-parent')).toHaveTextContent('detached'); // hidden transport: audio-only until a stage borrows it
  });

  it('switching from a video to an audio track releases the video source (the session has one voice)', async () => {
    render(<MusicProvider sessionKey="t"><Probe /></MusicProvider>);
    fireEvent.click(screen.getByTestId('play-video'));
    await waitFor(() => expect(screen.getByTestId('probe-video-src')).toHaveTextContent('https://cdn/v.mp4?sig=2'));
    fireEvent.click(screen.getByTestId('play-audio'));
    await waitFor(() => expect(screen.getByTestId('probe-kind')).toHaveTextContent('audio/mpeg'));
    await waitFor(() => expect(screen.getByTestId('probe-video-src')).toHaveTextContent(''));
  });

  it('routes a TRANSCODED video track through hls.js (the manifest + the context element, never the raw file)', async () => {
    createdHls.length = 0;
    render(<MusicProvider sessionKey="t"><Probe /></MusicProvider>);
    fireEvent.click(screen.getByTestId('play-video-hls'));
    await waitFor(() => expect(screen.getByTestId('probe-kind')).toHaveTextContent('video/mp4'));
    await waitFor(() => expect(createdHls.length).toBe(1));
    // The manifest rides the shared resolution (the app's API origin for a
    // path-only manifest) and attaches to the context's OWN video element.
    const instance = createdHls[0];
    expect(instance.loadSource).toHaveBeenCalledTimes(1);
    expect(String(instance.loadSource.mock.calls[0][0])).toContain('/v3/media/hls/manifest?doc_id=m-v');
    const attached = instance.attachMedia.mock.calls[0][0] as HTMLVideoElement;
    // The element is detached from the document (audio-only state) but IS the
    // element a stage would borrow (attach it and prove the parent swap —
    // read the DOM, not a React render: the borrow is a direct move).
    expect(attached.parentNode).toBeNull();
    expect(attached.getAttribute('src') ?? '').not.toContain('v.mp4'); // hls feeds it — no raw file src
    fireEvent.click(screen.getByTestId('attach-stage'));
    expect(attached.parentNode).toBe(document.getElementById('stage'));
    expect(screen.getByTestId('music-video-stage').querySelector('video')).toBe(attached);
  });

  it('attachVideoStage lends the element to a stage and returns it (same element — position survives)', async () => {
    render(<MusicProvider sessionKey="t"><Probe /></MusicProvider>);
    fireEvent.click(screen.getByTestId('play-video'));
    await waitFor(() => expect(screen.getByTestId('probe-video-src')).toHaveTextContent('https://cdn/v.mp4?sig=2'));
    fireEvent.click(screen.getByTestId('attach-stage'));
    // The borrow is a direct DOM move (no re-render) — read the DOM.
    const el = screen.getByTestId('music-video-stage').querySelector('video') as HTMLVideoElement | null;
    expect(el).not.toBeNull();
    expect(el!.parentNode).toBe(document.getElementById('stage'));
    fireEvent.click(screen.getByTestId('detach-stage'));
    expect(el!.parentNode).toBeNull(); // returned to detached (audio-only)
    // The SAME element (not a replacement) — the src survived the round trip.
    expect(el!.getAttribute('src')).toBe('https://cdn/v.mp4?sig=2');
  });
});
