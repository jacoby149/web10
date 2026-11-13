import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom';
import { MusicProvider, useMusic, type MusicContextValue } from '@/context/MusicContext';
import MusicPlayer from '@/components/Music/MusicPlayer';
import MusicFeedMedia from '@/components/Music/MusicFeedMedia';
import type { PostRecord, MediaRecord } from '@/data/types';

vi.mock('@/data/music', () => ({ readMusicTrack: vi.fn() }));
const post: PostRecord = { _id: 'song', title: 'Night drive', author_username: 'artist', tags: ['music'], media_refs: ['audio'], created_at: '' };
const media: MediaRecord[] = [{ _id: 'audio', url: 'https://media.example/song.mp3', mime_type: 'audio/mpeg', created_at: '' }];
let music: MusicContextValue;
const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
let session: { setActionHandler: ReturnType<typeof vi.fn>; playbackState: string; metadata: MediaMetadata | null };
function Probe() {
  music = useMusic();
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="route">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Back to feed</button></>;
}
function tree(source = false, tags = ['music']) {
  return <MemoryRouter initialEntries={['/feed']}><MusicProvider sessionKey="listener"><Probe /><Routes>
    <Route path="/feed" element={<MusicFeedMedia post={{ ...post, tags, ...(source ? { source_origin: 'https://foreign.example', source_key: 'foreign/song' } : {}) }} media={media} readOnlySource={source}><span>Ordinary inline audio</span></MusicFeedMedia>} />
    <Route path="/music" element={<h1>Expanded player route</h1>} />
  </Routes><MusicPlayer /></MusicProvider></MemoryRouter>;
}
beforeEach(() => {
  handlers.clear();
  session = { setActionHandler: vi.fn((name, handler) => handlers.set(name, handler)), playbackState: 'none', metadata: null };
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
  vi.stubGlobal('MediaMetadata', class { constructor(metadata: MediaMetadataInit) { Object.assign(this, metadata); } });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play')); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'mediaSession'); document.body.innerHTML = ''; });
const action = (name: MediaSessionAction, extra = {}) => act(async () => handlers.get(name)?.({ action: name, ...extra }));

describe('feed media and the one browser Media Session', () => {
  it.each(['Play music', 'Open player: Night drive'])('hands %s to persistent playback, URL panel and system pause/resume', async label => {
    render(tree());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: label })));
    expect(screen.getByTestId('route')).toHaveTextContent('/music?track=song&panel=player');
    expect(screen.getByTestId('music-player')).toBeInTheDocument();
    expect(music.isPlaying).toBe(true);
    expect(session.metadata?.title).toBe('Night drive');
    await action('pause');
    expect(music.isPlaying).toBe(false);
    expect(session.playbackState).toBe('paused');
    await action('play');
    expect(music.isPlaying).toBe(true);
    fireEvent.click(screen.getByText('Back to feed'));
    expect(music.isPlaying).toBe(true);
    expect(music.queue).toHaveLength(1);
    // Reopening the same song does not reload/restart it.
    const loadCount = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open player: Night drive' })));
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loadCount);
  });

  it('retains foreign source in the player/queue URLs and never uses home recovery', async () => {
    render(tree(true));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play music' })));
    expect(music.current?.readOnlySource).toBe(true);
    expect(screen.getByTestId('route')).toHaveTextContent('source=https%3A%2F%2Fforeign.example');
    expect(screen.getByRole('link', { name: 'Open player: Night drive' })).toHaveAttribute('href', '/music?track=song&panel=player&source=https%3A%2F%2Fforeign.example');
    await act(async () => music.retry());
    const { readMusicTrack } = await import('@/data/music');
    expect(readMusicTrack).not.toHaveBeenCalled();
  });

  it('leaves ordinary audio inline', () => {
    render(tree(false, []));
    expect(screen.getByText('Ordinary inline audio')).toBeInTheDocument();
    expect(screen.queryByTestId('music-feed-media')).not.toBeInTheDocument();
  });

  it.each(['video', 'audio'] as const)('routes system controls to the active mounted %s, not the paused music queue', async kind => {
    render(tree());
    await act(async () => music.play({ post, media: media[0] }));
    const card = document.createElement('div');
    card.dataset.mediaSessionTitle = 'Feed clip'; card.dataset.mediaSessionArtist = 'Clip artist';
    const clip = document.createElement(kind);
    Object.defineProperty(clip, 'duration', { configurable: true, value: 120 });
    card.append(clip); document.body.append(card);
    await act(async () => clip.play());
    expect(music.isPlaying).toBe(false);
    expect(session.metadata?.title).toBe('Feed clip');
    expect(session.playbackState).toBe('playing');
    await action('pause'); expect(clip.paused).toBe(true);
    await action('play'); expect(clip.paused).toBe(false);
    expect(music.isPlaying).toBe(false);
    await action('seekto', { seekTime: 35 }); expect(clip.currentTime).toBe(35);
    await action('seekforward', { seekOffset: 200 }); expect(clip.currentTime).toBe(120);
    await action('nexttrack'); expect(music.current?.post._id).toBe('song');
    await act(async () => card.remove());
    expect(session.playbackState).toBe('none'); expect(session.metadata).toBeNull();
    await action('play');
    expect(music.isPlaying).toBe(false);
  });

  it('muted previews never acquire the system controls and music can reclaim them', async () => {
    render(tree());
    const card = document.createElement('div'); card.dataset.mediaSessionTitle = 'Preview';
    const clip = document.createElement('video'); clip.muted = true;
    card.append(clip); document.body.append(card);
    await act(async () => clip.play());
    expect(session.metadata).toBeNull();
    clip.muted = false;
    await act(async () => clip.dispatchEvent(new Event('volumechange')));
    expect(session.metadata?.title).toBe('Preview');
    await act(async () => music.play({ post, media: media[0] }));
    expect(session.metadata?.title).toBe('Night drive');
    await action('pause'); expect(music.isPlaying).toBe(false);
  });
});
