import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import '@testing-library/jest-dom';
import { MusicProvider, useMusic, type MusicContextValue, type MusicTrack } from '@/context/MusicContext';
import MusicPlayer from '@/components/Music/MusicPlayer';
import { readMusicTrack } from '@/data/music';

vi.mock('@/data/music', () => ({ readMusicTrack: vi.fn() }));

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];
  src = ''; currentTime = 0; duration = 180; volume = 1; preload = ''; paused = true;
  play = vi.fn((): Promise<void> => { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event('pause')); });
  load = vi.fn();
  removeAttribute = vi.fn(() => { this.src = ''; });
  constructor() { super(); MockAudio.instances.push(this); }
}
const tracks = ['a', 'b', 'c'].map(id => ({ post: { _id: id, title: `Track ${id}`, author_username: 'artist' }, media: { url: `https://media/${id}`, duration_seconds: 180 } }) as MusicTrack);
let music: MusicContextValue;
function Probe() { music = useMusic(); return <Link to="/other">Browse elsewhere</Link>; }
function tree(sessionKey = 'one') {
  return <MemoryRouter initialEntries={['/music']}><MusicProvider sessionKey={sessionKey}><Probe /><Routes><Route path="*" element={<p>Route content</p>} /></Routes><MusicPlayer /></MusicProvider></MemoryRouter>;
}
const audio = () => MockAudio.instances[MockAudio.instances.length - 1]!;
beforeEach(() => { MockAudio.instances = []; vi.stubGlobal('Audio', MockAudio); vi.mocked(readMusicTrack).mockReset(); vi.mocked(readMusicTrack).mockResolvedValue(tracks[0]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('persistent music playback', () => {
  it('uses caption titles consistently in the mini-player and Media Session', () => {
    const session = { setActionHandler: vi.fn(), playbackState: 'none', metadata: null as MediaMetadata | null };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
    vi.stubGlobal('MediaMetadata', class { constructor(public metadata: MediaMetadataInit) { Object.assign(this, metadata); } });
    try {
      render(tree());
      act(() => music.select({ ...tracks[0], post: { ...tracks[0].post, title: undefined, text: 'Hello! I am Century Club Music' } }));
      expect(screen.getByLabelText('Open player: Hello! I am Century Club Music')).toBeInTheDocument();
      expect(screen.queryByText('Untitled track')).not.toBeInTheDocument();
      expect(session.metadata?.title).toBe('Hello! I am Century Club Music');
    } finally { cleanup(); Reflect.deleteProperty(navigator, 'mediaSession'); }
  });

  it('recovers a failed playing URL once through the original post and resumes its position', async () => {
    render(tree());
    await act(async () => music.play(tracks[1], tracks));
    act(() => { audio().currentTime = 42; audio().dispatchEvent(new Event('timeupdate')); });
    const refreshed = { ...tracks[1], media: { ...tracks[1].media, url: 'https://fresh/b' } };
    vi.mocked(readMusicTrack).mockResolvedValueOnce(refreshed);
    await act(async () => audio().dispatchEvent(new Event('error')));
    await waitFor(() => expect(readMusicTrack).toHaveBeenCalledWith('b'));
    expect(audio().src).toBe('https://fresh/b');
    act(() => audio().dispatchEvent(new Event('loadedmetadata')));
    expect(audio().currentTime).toBe(42);
    expect(music.isPlaying).toBe(true);
    act(() => audio().dispatchEvent(new Event('error')));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(readMusicTrack).toHaveBeenCalledTimes(1);
  });

  it('keeps failed automatic recovery visible and ignores completion after a new selection', async () => {
    render(tree());
    await act(async () => music.play(tracks[0], tracks));
    vi.mocked(readMusicTrack).mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => audio().dispatchEvent(new Event('error')));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be refreshed');
    expect(music.isPlaying).toBe(false);
    await act(async () => music.play(tracks[1], tracks));
    let resolve!: (track: MusicTrack) => void;
    vi.mocked(readMusicTrack).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => audio().dispatchEvent(new Event('error')));
    act(() => music.select(tracks[2]));
    await act(async () => resolve(tracks[0]));
    expect(music.current).toBe(tracks[2]);
    expect(audio().src).toBe(tracks[2].media.url);
    expect(music.isPlaying).toBe(false);
  });

  it('does not autoplay a preload failure and refreshes when the listener presses play', async () => {
    render(tree());
    act(() => music.select(tracks[0]));
    act(() => audio().dispatchEvent(new Event('error')));
    expect(readMusicTrack).not.toHaveBeenCalled();
    expect(audio().play).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByLabelText('Play music')));
    expect(readMusicTrack).toHaveBeenCalledWith('a');
    expect(music.isPlaying).toBe(true);
  });

  it('cancels automatic recovery on pause or session replacement', async () => {
    const view = render(tree());
    await act(async () => music.play(tracks[0], tracks));
    let resolve!: (track: MusicTrack) => void;
    vi.mocked(readMusicTrack).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => audio().dispatchEvent(new Event('error')));
    act(() => music.toggle());
    await act(async () => resolve(tracks[0]));
    expect(music.current).toBe(tracks[0]);
    expect(music.isPlaying).toBe(false);
    expect(audio().src).toBe(tracks[0].media.url);
    await act(async () => music.play(tracks[1], tracks));
    vi.mocked(readMusicTrack).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => audio().dispatchEvent(new Event('error')));
    view.rerender(tree('replacement'));
    await act(async () => resolve(tracks[1]));
    expect(music.current).toBeNull();
    expect(audio().src).toBe('');
  });

  it('selects without autoplay, plays via real events, seeks and sets volume', async () => {
    render(tree());
    act(() => music.select(tracks[0], tracks));
    expect(audio().play).not.toHaveBeenCalled();
    await act(async () => music.toggle());
    expect(music.isPlaying).toBe(true);
    act(() => audio().dispatchEvent(new Event('loadedmetadata')));
    fireEvent.change(screen.getByLabelText('Seek music'), { target: { value: '45' } });
    expect(audio().currentTime).toBe(45);
    act(() => music.setVolume(0.4));
    expect(audio().volume).toBe(0.4);
    act(() => { audio().currentTime = 50; audio().dispatchEvent(new Event('timeupdate')); });
    expect(music.currentTime).toBe(50);
    fireEvent.click(screen.getByLabelText('Pause music'));
    expect(music.isPlaying).toBe(false);
  });

  it('advances on end, stops at the end, and supports repeat all and one', async () => {
    render(tree());
    await act(async () => music.play(tracks[1], tracks));
    await act(async () => audio().dispatchEvent(new Event('ended')));
    expect(music.current).toBe(tracks[2]);
    act(() => audio().dispatchEvent(new Event('ended')));
    expect(music.isPlaying).toBe(false);
    act(() => music.cycleRepeat());
    await act(async () => audio().dispatchEvent(new Event('ended')));
    expect(music.current).toBe(tracks[0]);
    act(() => music.cycleRepeat());
    await act(async () => audio().dispatchEvent(new Event('ended')));
    expect(music.current).toBe(tracks[0]);
    expect(audio().currentTime).toBe(0);
  });

  it('edits a copied session queue and shuffles without selecting itself or reordering source', async () => {
    render(tree());
    const source = [...tracks];
    await act(async () => music.play(tracks[0], source));
    act(() => music.enqueue(tracks[2], true));
    expect(music.queue.map(t => t.post._id)).toEqual(['a', 'c', 'b', 'c']);
    act(() => music.remove(1));
    expect(music.queue).toEqual(tracks);
    act(() => music.toggleShuffle());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await act(async () => music.next());
    expect(music.current).toBe(tracks[1]);
    expect(source).toEqual(tracks);
    expect(music.queue).toEqual(tracks);
    await act(async () => music.remove(1));
    expect(music.current).toBe(tracks[2]);
    act(() => music.clear());
    expect(music.queue).toEqual([]);
    expect(audio().src).toBe('');
  });

  it('persists through route changes and exposes URL-addressed panels', async () => {
    render(tree());
    await act(async () => music.play(tracks[0], tracks));
    const original = audio();
    fireEvent.click(screen.getByText('Browse elsewhere'));
    expect(screen.getByTestId('music-player')).toBeInTheDocument();
    expect(audio()).toBe(original);
    expect(music.isPlaying).toBe(true);
    expect(screen.getByLabelText('Open player: Track a')).toHaveAttribute('href', '/music?track=a&panel=player');
    expect(screen.getByText('Queue')).toHaveAttribute('href', '/music?track=a&panel=queue');
  });

  it('shows retryable errors and ignores stale play rejection after another selection', async () => {
    render(tree());
    audio().play.mockRejectedValueOnce(new Error('private URL must not be logged'));
    await act(async () => music.play(tracks[0], tracks));
    expect(screen.getByRole('alert')).toHaveTextContent('Playback failed');
    await act(async () => fireEvent.click(screen.getByText('Retry playback')));
    expect(music.error).toBeNull();
    let reject!: (error: Error) => void;
    audio().play.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    act(() => music.play(tracks[0]));
    act(() => music.select(tracks[1]));
    await act(async () => reject(new Error('stale')));
    expect(music.error).toBeNull();
    expect(music.current).toBe(tracks[1]);
    expect(music.isPlaying).toBe(false);
  });

  it('resets on session change and disposes audio/listeners on unmount', async () => {
    const view = render(tree());
    let resolve!: () => void;
    audio().play.mockImplementationOnce(() => new Promise<void>(yes => { resolve = yes; }));
    act(() => music.play(tracks[0], tracks));
    const old = audio();
    view.rerender(tree('two'));
    await act(async () => resolve());
    expect(music.current).toBeNull();
    expect(music.queue).toEqual([]);
    expect(old.src).toBe('');
    act(() => old.dispatchEvent(new Event('play')));
    expect(music.isPlaying).toBe(false);
    const latest = audio();
    view.unmount();
    expect(latest.pause).toHaveBeenCalled();
    expect(latest.src).toBe('');
  });

  it('ignores muted previews, pauses for audible video, and pauses video on deliberate music play', async () => {
    render(tree());
    const video = document.createElement('video');
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    Object.defineProperty(video, 'paused', { value: false });
    document.body.append(video);
    await act(async () => music.play(tracks[0], tracks));
    expect(pause).toHaveBeenCalled();
    video.muted = true;
    act(() => video.dispatchEvent(new Event('play')));
    expect(music.isPlaying).toBe(true);
    video.muted = false;
    act(() => video.dispatchEvent(new Event('play')));
    expect(music.isPlaying).toBe(false);
    video.remove();
  });

  it('restarts with previous after three seconds and otherwise selects the prior track', async () => {
    render(tree());
    await act(async () => music.play(tracks[1], tracks));
    act(() => { audio().dispatchEvent(new Event('loadedmetadata')); music.seek(20); });
    act(() => music.previous());
    expect(music.current).toBe(tracks[1]);
    expect(music.currentTime).toBe(0);
    await act(async () => music.previous());
    expect(music.current).toBe(tracks[0]);
  });

  it('registers supported Media Session actions and clears them on disposal', async () => {
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const session = { setActionHandler: vi.fn((name: string, handler: MediaSessionActionHandler | null) => handlers.set(name, handler)), playbackState: 'none', metadata: null };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
    const view = render(tree());
    await act(async () => music.play(tracks[0], tracks));
    expect(session.playbackState).toBe('playing');
    act(() => handlers.get('pause')?.({ action: 'pause' }));
    expect(music.isPlaying).toBe(false);
    await act(async () => handlers.get('nexttrack')?.({ action: 'nexttrack' }));
    expect(music.current).toBe(tracks[1]);
    view.unmount();
    expect([...handlers.values()].every(handler => handler === null)).toBe(true);
    expect(session.metadata).toBeNull();
    Reflect.deleteProperty(navigator, 'mediaSession');
  });

  it('advances exact duplicate occurrences and removes only the chosen occurrence', async () => {
    render(tree());
    const queue = [tracks[0], tracks[1], tracks[0], tracks[2]];
    await act(async () => music.play(tracks[0], queue));
    for (const index of [1, 2, 3]) {
      await act(async () => audio().dispatchEvent(new Event('ended')));
      expect(music.currentIndex).toBe(index);
      expect(music.current).toBe(queue[index]);
    }
    act(() => audio().dispatchEvent(new Event('ended')));
    expect(music.isPlaying).toBe(false);
    await act(async () => music.playQueue(2));
    expect(music.currentIndex).toBe(2);
    act(() => music.remove(0));
    expect(music.currentIndex).toBe(1);
    expect(music.current).toBe(tracks[0]);
    await act(async () => music.remove(1));
    expect(music.currentIndex).toBe(1);
    expect(music.current).toBe(tracks[2]);
    expect(music.queue).toEqual([tracks[1], tracks[2]]);
  });

  it('plays every shuffled occurrence once and stops with repeat off, with previous history', async () => {
    render(tree());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await act(async () => music.play(tracks[0], tracks));
    act(() => music.toggleShuffle());
    await act(async () => music.next());
    expect(music.currentIndex).toBe(1);
    await act(async () => music.previous());
    expect(music.currentIndex).toBe(0);
    await act(async () => music.next());
    expect(music.currentIndex).toBe(1);
    await act(async () => audio().dispatchEvent(new Event('ended')));
    expect(music.currentIndex).toBe(2);
    act(() => audio().dispatchEvent(new Event('ended')));
    expect(music.isPlaying).toBe(false);
    expect(music.queue).toEqual(tracks);
    act(() => music.cycleRepeat());
    await act(async () => music.next());
    expect(music.currentIndex).not.toBe(2);
    expect(music.isPlaying).toBe(true);
  });

  it('refreshes canonical media on retry and reloads the same queue occurrence', async () => {
    render(tree());
    await act(async () => music.play(tracks[0], [tracks[0], tracks[1], tracks[0], tracks[2]]));
    await act(async () => music.playQueue(2));
    // Exhaust the automatic recovery before exercising the explicit retry fork.
    await act(async () => audio().dispatchEvent(new Event('error')));
    act(() => audio().dispatchEvent(new Event('error')));
    const refreshed = { ...tracks[0], media: { ...tracks[0].media, url: 'https://fresh/audio' } };
    vi.mocked(readMusicTrack).mockResolvedValueOnce(refreshed);
    const loads = audio().load.mock.calls.length;
    await act(async () => fireEvent.click(screen.getByText('Retry playback')));
    expect(readMusicTrack).toHaveBeenCalledWith('a');
    expect(audio().src).toBe('https://fresh/audio');
    expect(audio().load.mock.calls.length).toBe(loads + 1);
    expect(music.currentIndex).toBe(2);
    expect(music.queue[0]).toBe(tracks[0]);
    expect(music.queue[2]).toBe(refreshed);
    expect(music.isPlaying).toBe(true);
    await act(async () => audio().dispatchEvent(new Event('ended')));
    expect(music.current).toBe(tracks[2]);
  });

  it('denies delayed retry completion after selection or session replacement', async () => {
    const view = render(tree());
    await act(async () => music.play(tracks[0], tracks));
    let resolve!: (value: MusicTrack | null) => void;
    vi.mocked(readMusicTrack).mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    let pending!: Promise<void>;
    act(() => { pending = music.retry(); });
    act(() => music.select(tracks[1]));
    await act(async () => { resolve(tracks[0]); await pending; });
    expect(music.current).toBe(tracks[1]);
    expect(music.isPlaying).toBe(false);
    vi.mocked(readMusicTrack).mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    act(() => { music.setVolume(0.2); pending = music.retry(); });
    view.rerender(tree('new-session'));
    await act(async () => { resolve(tracks[1]); await pending; });
    expect(music.current).toBeNull();
    expect(audio().src).toBe('');
    expect(music.volume).toBe(1);
    expect(audio().volume).toBe(1);
    await act(async () => music.play(tracks[0]));
    act(() => { music.setVolume(0.3); music.clear(); });
    expect(audio().volume).toBe(music.volume);
  });

  it('includes duplicate occurrences exactly once in a finite shuffle traversal', async () => {
    render(tree());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await act(async () => music.play(tracks[0], [tracks[0], tracks[0], tracks[1], tracks[2]]));
    act(() => music.toggleShuffle());
    const visited = [music.currentIndex];
    for (let i = 0; i < 3; i++) {
      await act(async () => audio().dispatchEvent(new Event('ended')));
      visited.push(music.currentIndex);
    }
    expect(visited[1]).toBe(2);
    expect([...visited].sort()).toEqual([0, 1, 2, 3]);
    act(() => audio().dispatchEvent(new Event('ended')));
    expect(music.isPlaying).toBe(false);
  });

  it('keeps refresh failures retryable without playing the expired source', async () => {
    render(tree());
    act(() => music.select(tracks[0], tracks));
    vi.mocked(readMusicTrack).mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => music.retry());
    expect(screen.getByRole('alert')).toHaveTextContent('could not be refreshed');
    expect(audio().play).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByText('Retry playback')));
    expect(music.error).toBeNull();
    expect(music.isPlaying).toBe(true);
  });

  it.each(['next', 'ended'])('prioritizes explicit play next over shuffle on %s', async action => {
    render(tree());
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const extra = { ...tracks[0], post: { ...tracks[0].post, _id: 'd', title: 'Track d' } };
    await act(async () => music.play(tracks[0], tracks));
    act(() => { music.toggleShuffle(); music.enqueue(extra, true); });
    await act(async () => {
      if (action === 'next') music.next();
      else audio().dispatchEvent(new Event('ended'));
    });
    expect(music.current).toBe(extra);
    const visited = [music.currentIndex];
    for (let i = 0; i < 2; i++) {
      await act(async () => music.next());
      visited.push(music.currentIndex);
    }
    expect(new Set(visited).size).toBe(3);
    act(() => audio().dispatchEvent(new Event('ended')));
    expect(music.isPlaying).toBe(false);
  });

  it('keeps latest play-next first and remaps duplicate priorities through removals', async () => {
    render(tree());
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await act(async () => music.play(tracks[0], tracks));
    act(() => {
      music.toggleShuffle();
      music.enqueue(tracks[1], true);
      music.enqueue(tracks[2], true);
      music.remove(4);
    });
    expect(music.queue).toEqual([tracks[0], tracks[2], tracks[1], tracks[1]]);
    await act(async () => music.next());
    expect(music.currentIndex).toBe(1);
    act(() => music.remove(0));
    await act(async () => music.next());
    expect(music.currentIndex).toBe(1);
    expect(music.current).toBe(tracks[1]);
    await act(async () => music.next());
    expect(music.currentIndex).toBe(2);
    act(() => audio().dispatchEvent(new Event('ended')));
    expect(music.isPlaying).toBe(false);
  });

  it('selects the first enqueued occurrence and exposes the player without autoplay', () => {
    render(tree());
    act(() => music.enqueue(tracks[1]));
    expect(music.currentIndex).toBe(0);
    expect(music.current).toBe(tracks[1]);
    expect(screen.getByTestId('music-player')).toBeVisible();
    expect(music.isPlaying).toBe(false);
    expect(audio().play).not.toHaveBeenCalled();
  });

  it('clears playback when only safe session expiry metadata changes', async () => {
    const view = render(tree(JSON.stringify(['provider', 'human', '2026-11-03T12:00:00Z'])));
    await act(async () => music.play(tracks[0], tracks));
    const previous = audio();
    view.rerender(tree(JSON.stringify(['provider', 'human', '2026-11-04T12:00:00Z'])));
    expect(music.current).toBeNull();
    expect(music.queue).toEqual([]);
    expect(previous.src).toBe('');
    expect(previous.pause).toHaveBeenCalled();
  });
});
