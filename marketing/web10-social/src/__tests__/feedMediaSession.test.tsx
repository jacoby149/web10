import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom';
import { MusicProvider, useMusic, type MusicContextValue } from '@/context/MusicContext';
import MusicPlayer from '@/components/Music/MusicPlayer';
import MusicFeedMedia from '@/components/Music/MusicFeedMedia';
import { FeedMusicQueue } from '@/context/FeedMusicContext';
import type { MusicTrack } from '@/data/musicTrack';
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
  return <><output data-testid="route">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Back to feed</button><button onClick={() => navigate('/music')}>Visit Music</button></>;
}
function tree(source = false, tags = ['music'], route = '/feed?tab=following&q=night', mime = 'audio/mpeg', queue?: MusicTrack[]) {
  return <MemoryRouter initialEntries={['/feed?tab=discover', route]} initialIndex={1}><MusicProvider sessionKey="listener"><Probe /><FeedMusicQueue.Provider value={queue}><Routes>
    <Route path="/feed" element={<MusicFeedMedia post={{ ...post, tags, ...(source ? { source_origin: 'https://foreign.example', source_key: 'foreign/song' } : {}) }} media={media.map(item => ({ ...item, mime_type: mime }))} readOnlySource={source}><span>Ordinary inline audio</span></MusicFeedMedia>} />
    <Route path="/music" element={<h1>Expanded player route</h1>} />
  </Routes></FeedMusicQueue.Provider><MusicPlayer /></MusicProvider></MemoryRouter>;
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
  it('snapshots the loaded board queue and skips in place without rewriting it on board updates', async () => {
    const first = { post, media: media[0] };
    const second = { post: { ...post, _id: 'song-2', title: 'Second song' }, media: { ...media[0], url: 'https://media.example/second.mp3' } };
    const view = render(tree(false, ['music'], '/feed', 'audio/mpeg', [first, second]));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play music' })));
    expect(music.queue).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Next track' })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next track' })));
    expect(music.current?.post._id).toBe('song-2');
    expect(screen.getByRole('button', { name: 'Next track' })).toBeDisabled();
    expect(screen.getByTestId('route')).toHaveTextContent('/feed');
    view.rerender(tree(false, ['music'], '/feed', 'audio/mpeg', [second]));
    expect(music.queue).toHaveLength(2);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Previous track' })));
    expect(music.current?.post._id).toBe('song');
    expect(screen.getByTestId('route')).toHaveTextContent('/feed');
  });

  it.each(['Play music', 'Open player: Night drive'])('hands %s to persistent playback in place and system pause/resume', async label => {
    render(tree());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: label })));
    expect(screen.getByTestId('route')).toHaveTextContent('/feed?tab=following&q=night');
    expect(screen.getByTestId('music-feed-media')).toBeInTheDocument();
    expect(screen.getByTestId('music-player')).toBeInTheDocument();
    expect(music.isPlaying).toBe(true);
    expect(session.metadata?.title).toBe('Night drive');
    await action('pause');
    expect(music.isPlaying).toBe(false);
    expect(session.playbackState).toBe('paused');
    await action('play');
    expect(music.isPlaying).toBe(true);
    expect(music.queue).toHaveLength(1);
    // Reopening the same song does not reload/restart it.
    const loadCount = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open player: Night drive' })));
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loadCount);
    expect(screen.getByTestId('route')).toHaveTextContent('/feed?tab=following&q=night');
    // Playback adds no history entry: Back reaches the preceding feed state.
    fireEvent.click(screen.getByText('Back to feed'));
    expect(screen.getByTestId('route')).toHaveTextContent('/feed?tab=discover');
    expect(music.isPlaying).toBe(true);
  });

  it('retains foreign source in the player/queue URLs and never uses home recovery', async () => {
    render(tree(true));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play music' })));
    expect(music.current?.readOnlySource).toBe(true);
    expect(screen.getByTestId('route')).toHaveTextContent('/feed?tab=following&q=night');
    expect(screen.getByTestId('music-player').querySelector('a')).toBeNull();
    fireEvent.click(screen.getByText('Visit Music'));
    expect(screen.getByRole('link', { name: 'Open player: Night drive' })).toHaveAttribute('href', '/music?track=song&panel=player&source=https%3A%2F%2Fforeign.example');
    await act(async () => music.retry());
    const { readMusicTrack } = await import('@/data/music');
    expect(readMusicTrack).not.toHaveBeenCalled();
  });

  it('pauses and resumes without restarting and cannot navigate from mini-player metadata or queue', async () => {
    render(tree(false, ['music'], '/feed?tab=discover&q=night'));
    const feed = within(screen.getByTestId('music-feed-media'));
    await act(async () => fireEvent.click(feed.getByRole('button', { name: 'Play music' })));
    const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    await act(async () => fireEvent.click(feed.getByRole('button', { name: 'Pause music' })));
    expect(music.isPlaying).toBe(false);
    await act(async () => fireEvent.click(feed.getByRole('button', { name: 'Play music' })));
    expect(music.isPlaying).toBe(true);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loads);
    expect(screen.getByTestId('route')).toHaveTextContent('/feed?tab=discover&q=night');
    const player = within(screen.getByTestId('music-player'));
    fireEvent.click(player.getByText('Night drive'));
    fireEvent.click(screen.getByTestId('music-player-details'));
    expect(player.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('route')).toHaveTextContent('/feed?tab=discover&q=night');
    fireEvent.click(screen.getByText('Visit Music'));
    fireEvent.click(screen.getByRole('link', { name: 'Open player: Night drive' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/music?track=song&panel=player');
    expect(music.isPlaying).toBe(true);
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
    if (kind === 'video') {
      expect(music.current).toBeNull();
      expect(music.queue).toHaveLength(0);
      expect(screen.queryByTestId('music-player')).not.toBeInTheDocument();
    } else {
      expect(screen.getByTestId('music-player')).toBeInTheDocument();
    }
    expect(session.metadata?.title).toBe('Feed clip');
    expect(session.playbackState).toBe('playing');
    await action('pause'); expect(clip.paused).toBe(true);
    await action('play'); expect(clip.paused).toBe(false);
    expect(music.isPlaying).toBe(false);
    await action('seekto', { seekTime: 35 }); expect(clip.currentTime).toBe(35);
    await action('seekforward', { seekOffset: 200 }); expect(clip.currentTime).toBe(120);
    await action('nexttrack'); expect(music.current?.post._id).toBe(kind === 'video' ? undefined : 'song');
    await act(async () => card.remove());
    expect(session.playbackState).toBe('none'); expect(session.metadata).toBeNull();
    await action('play');
    expect(music.isPlaying).toBe(false);
  });

  it('keeps a music-tagged video in the persistent music transport, including its attached stage', async () => {
    render(tree(false, ['music'], '/feed', 'video/mp4'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play music' })));
    expect(music.current?.media.mime_type).toBe('video/mp4');
    expect(music.isPlaying).toBe(true);
    const stage = document.createElement('div'); document.body.append(stage);
    await act(async () => music.attachVideoStage(stage));
    await act(async () => music.videoElement!.dispatchEvent(new Event('play')));
    expect(music.current?.post._id).toBe('song');
    expect(music.queue).toHaveLength(1);
    expect(screen.getByTestId('music-player')).toBeInTheDocument();
  });

  it('X stops and dismisses music rather than hiding ongoing playback', async () => {
    render(tree());
    await act(async () => music.play({ post, media: media[0] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Close music player' })));
    expect(music.current).toBeNull();
    expect(music.queue).toHaveLength(0);
    expect(music.isPlaying).toBe(false);
    expect(session.playbackState).toBe('none');
    expect(screen.queryByTestId('music-player')).not.toBeInTheDocument();
    await action('play');
    expect(music.isPlaying).toBe(false);
  });

  it('muted previews never acquire the system controls and music can reclaim them', async () => {
    render(tree());
    await act(async () => music.play({ post, media: media[0] }));
    const card = document.createElement('div'); card.dataset.mediaSessionTitle = 'Preview';
    const clip = document.createElement('video'); clip.muted = true;
    card.append(clip); document.body.append(card);
    await act(async () => clip.play());
    expect(session.metadata?.title).toBe('Night drive');
    expect(music.current?.post._id).toBe('song');
    expect(music.isPlaying).toBe(true);
    clip.muted = false;
    await act(async () => clip.dispatchEvent(new Event('volumechange')));
    expect(session.metadata?.title).toBe('Preview');
    expect(music.current).toBeNull();
    await act(async () => music.play({ post, media: media[0] }));
    expect(session.metadata?.title).toBe('Night drive');
    await action('pause'); expect(music.isPlaying).toBe(false);
  });
});
