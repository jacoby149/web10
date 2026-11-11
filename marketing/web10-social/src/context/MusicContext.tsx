import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { claimMediaPlayback } from '@web10/discover/media-recovery';
import { sourceFromMedia, resolveManifestHref } from '@web10/discover/video-source';
import type { MusicTrack } from '@/data/feed';
import type { MediaRecord } from '@/data/types';
import { readMusicTrack } from '@/data/music';
import { musicTitle, musicArtist, musicTrackKey } from '@/data/musicTrack';

export type { MusicTrack } from '@/data/feed';
type Repeat = 'off' | 'all' | 'one';
interface Playback {
  queue: MusicTrack[];
  current: MusicTrack | null;
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: Repeat;
  error: string | null;
}
export interface MusicContextValue extends Playback {
  play(track: MusicTrack, queue?: MusicTrack[]): void;
  playQueue(index: number): void;
  retry(): Promise<void>;
  select(track: MusicTrack, queue?: MusicTrack[]): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  enqueue(track: MusicTrack, next?: boolean): void;
  remove(index: number): void;
  clear(): void;
  /**
   * The session's hidden VIDEO transport (music.md: a video CAN be a track —
   * a music video marked as music). A detached element: the player panel
   * attaches it into its visible stage while open (playback survives the
   * move — same element, same position), and it plays audio-only while
   * detached (the mini-player state). Null until the provider mounts.
   */
  videoElement: HTMLVideoElement | null;
  /**
   * Borrow the video transport into a visible stage (the expanded player
   * panel's video frame) or return it to detached (audio-only) state. The
   * provider owns the element — the surface only lends it a parent. Reparent
   * while playing is safe (the element keeps its position; hls.js keeps its
   * attachment).
   */
  attachVideoStage(stage: HTMLElement | null): void;
}
const initial: Playback = { queue: [], current: null, currentIndex: -1, isPlaying: false, currentTime: 0, duration: 0, volume: 1, shuffle: false, repeat: 'off', error: null };
const MusicContext = createContext<MusicContextValue | null>(null);
const log = (event: string) => console.log('[music-player]', event);

export function MusicProvider({ children, sessionKey }: { children: ReactNode; sessionKey?: string }) {
  const [state, setState] = useState<Playback>(initial);
  const snapshot = useRef(state);
  const audio = useRef<HTMLAudioElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const hls = useRef<{ destroy: () => void } | null>(null);
  const attempt = useRef(0);
  const requested = useRef(false);
  const recovered = useRef(false);
  const recovering = useRef(false);
  const resumeAt = useRef<number | null>(null);
  const remaining = useRef<number[]>([]);
  const history = useRef<number[]>([]);
  const priority = useRef<number[]>([]);
  const actions = useRef<MusicContextValue | null>(null);
  // The session has ONE voice: the active transport is the element of the
  // CURRENT track's kind (music.md: a video CAN be a track — a music video
  // marked as music rides the same queue/transport as an mp3).
  const isVideoTrack = (track?: MusicTrack | null) => !!track?.media.mime_type?.startsWith('video/');
  function activeElement(): HTMLMediaElement | null {
    return isVideoTrack(snapshot.current.current) ? video.current : audio.current;
  }
  function update(patch: Partial<Playback>) {
    snapshot.current = { ...snapshot.current, ...patch };
    setState(snapshot.current);
  }
  function detachVideoSource() {
    if (hls.current) {
      try { hls.current.destroy(); } catch { /* the element is already gone */ }
      hls.current = null;
    }
  }
  // Attach a track's source to the hidden video element: a transcoded video
  // (status done + minted manifest) rides hls.js (the app's vendored build —
  // the same source seam every other video surface uses); anything else is a
  // direct file. A dead element (no Hls + no native HLS) surfaces the
  // existing load-error state instead of hanging silent.
  function attachVideoSource(element: HTMLVideoElement, media: MediaRecord) {
    detachVideoSource();
    const source = sourceFromMedia(media);
    if (source.type === 'hls') {
      const Hls = (window as unknown as { Hls?: { isSupported: () => boolean; new (): { loadSource: (u: string) => void; attachMedia: (el: HTMLVideoElement) => void; destroy: () => void } } }).Hls;
      const manifest = resolveManifestHref(source.manifestUrl);
      if (Hls && Hls.isSupported()) {
        const instance = new Hls();
        hls.current = { destroy: () => instance.destroy() };
        instance.loadSource(manifest);
        instance.attachMedia(element);
        log('video source attached (hls)');
        return;
      }
      if (element.canPlayType('application/vnd.apple.mpegurl')) {
        element.src = manifest;
        element.load();
        log('video source attached (native hls)');
        return;
      }
      update({ error: 'This track could not be loaded. Try again.' });
      log('video source unavailable (no hls support)');
      return;
    }
    element.src = source.type === 'file' ? source.url : media.url || '';
    element.load();
    log('video source attached (file)');
  }
  function pause() {
    attempt.current++;
    requested.current = false;
    recovering.current = false;
    activeElement()?.pause();
    update({ isPlaying: false });
  }
  function clear() {
    pause();
    resumeAt.current = null;
    remaining.current = [];
    history.current = [];
    priority.current = [];
    if (audio.current) audio.current.volume = initial.volume;
    audio.current?.removeAttribute('src');
    audio.current?.load();
    detachVideoSource();
    video.current?.removeAttribute('src');
    video.current?.load();
    update({ ...initial });
    log('cleared');
  }
  function start() {
    const element = activeElement();
    if (!element || !snapshot.current.current) return;
    const generation = ++attempt.current;
    requested.current = true;
    update({ error: null });
    document.querySelectorAll('video').forEach(video => {
      if (!video.muted && video.volume > 0 && !video.paused) video.pause();
    });
    log('play requested');
    try {
      Promise.resolve(element.play()).then(() => {
        if (generation !== attempt.current) {
          if (element !== audio.current) element.pause();
          return;
        }
        log('play accepted');
      }).catch(() => {
        if (generation !== attempt.current) return;
        requested.current = false;
        update({ isPlaying: false, error: 'Playback failed. Try again.' });
        log('play rejected');
      });
    } catch {
      if (generation === attempt.current) {
        requested.current = false;
        update({ isPlaying: false, error: 'Playback failed. Try again.' });
      }
    }
  }
  function loadOccurrence(index: number, queue = snapshot.current.queue, recovery = false) {
    pause();
    if (!recovery) recovered.current = false;
    resumeAt.current = null;
    const track = queue[index];
    update({ queue, current: track, currentIndex: index, currentTime: 0, duration: 0, error: null });
    if (isVideoTrack(track) && video.current) {
      // The video kind owns the session now: release the audio transport and
      // attach the track's source to the (detached) video element. The
      // element's volume follows the session's (it was created at the
      // session default; setVolume keeps both in step).
      if (audio.current) { audio.current.removeAttribute('src'); audio.current.load(); }
      video.current.volume = snapshot.current.volume;
      attachVideoSource(video.current, track.media);
    } else if (audio.current) {
      if (video.current) { detachVideoSource(); video.current.removeAttribute('src'); video.current.load(); }
      audio.current.src = track.media.url || '';
      audio.current.load();
    }
    log('track selected');
  }
  function resetTraversal(index: number, queue = snapshot.current.queue) {
    history.current = [];
    priority.current = [];
    remaining.current = queue.map((_, i) => i).filter(i => i !== index);
  }
  function select(track: MusicTrack, source?: MusicTrack[]) {
    const queue = source ? [...source] : [...snapshot.current.queue];
    let index = queue.indexOf(track);
    if (index < 0) index = queue.findIndex(item => musicTrackKey(item) === musicTrackKey(track));
    if (index < 0) { index = queue.length; queue.push(track); }
    else queue[index] = track;
    resetTraversal(index, queue);
    loadOccurrence(index, queue);
  }
  function playQueue(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= snapshot.current.queue.length) return;
    resetTraversal(index);
    loadOccurrence(index);
    start();
  }
  async function retry() {
    const s = snapshot.current;
    if (!s.current?.post._id) return;
    if (s.current.readOnlySource) {
      pause();
      update({ error: 'This source cannot refresh playback yet. Reopen Music to load a fresh source URL.' });
      return;
    }
    pause();
    const generation = attempt.current;
    const element = activeElement();
    const position = s.currentTime;
    recovering.current = true;
    recovered.current = true;
    requested.current = true;
    update({ error: null });
    log('refresh requested');
    try {
      const track = await readMusicTrack(s.current.post._id);
      if (attempt.current !== generation || activeElement() !== element) return;
      if (!track?.media.url) throw new Error('Unavailable track');
      const queue = [...snapshot.current.queue];
      queue[s.currentIndex] = track;
      loadOccurrence(s.currentIndex, queue, true);
      resumeAt.current = position;
      start();
      log('refresh accepted');
    } catch {
      if (attempt.current !== generation || activeElement() !== element) return;
      recovering.current = false;
      requested.current = false;
      update({ error: 'This track could not be refreshed. Try again.', isPlaying: false });
      log('refresh rejected');
    }
  }
  function play(track: MusicTrack, source?: MusicTrack[]) { select(track, source); start(); }
  function seek(seconds: number) {
    const element = activeElement();
    if (!element || !Number.isFinite(seconds)) return;
    const time = Math.max(0, Math.min(seconds, snapshot.current.duration || 0));
    element.currentTime = time;
    update({ currentTime: time });
  }
  function advance(back = false, ended = false) {
    const s = snapshot.current;
    if (!s.current || !s.queue.length) return;
    if (ended && s.repeat === 'one') { seek(0); start(); return; }
    if (back && s.currentTime > 3) { seek(0); return; }
    const index = s.currentIndex;
    let target = index + (back ? -1 : 1);
    if (s.shuffle) {
      if (back) {
        const prior = history.current.pop();
        if (prior === undefined) return;
        remaining.current = [index, ...remaining.current.filter(i => i !== index)];
        target = prior;
      } else {
        if (!remaining.current.length && s.repeat === 'all') {
          remaining.current = s.queue.map((_, i) => i).filter(i => i !== index);
          if (!remaining.current.length) remaining.current = [index];
        }
        if (!remaining.current.length) { pause(); return; }
        // Preserve duplicate occurrences, but prefer a different track when available.
        const alternatives = remaining.current.filter(i => musicTrackKey(s.queue[i]) !== musicTrackKey(s.current!));
        const choices = alternatives.length ? alternatives : remaining.current;
        target = priority.current.shift() ?? choices[Math.floor(Math.random() * choices.length)];
        remaining.current.splice(remaining.current.indexOf(target), 1);
        history.current.push(index);
      }
    } else if (target < 0 || target >= s.queue.length) {
      if (s.repeat === 'all') target = (target + s.queue.length) % s.queue.length;
      else { if (ended) pause(); return; }
    }
    priority.current = priority.current.filter(i => i !== target);
    loadOccurrence(target);
    start();
  }
  // The video stage seam (music.md): the expanded player panel lends its
  // frame to the session's video element; leaving the panel returns it to
  // detached audio-only. The provider owns the element — the surface never
  // renders it through React (it is NOT in the React tree).
  function attachVideoStage(stage: HTMLElement | null) {
    const el = video.current;
    if (!el) return;
    if (stage && el.parentNode !== stage) {
      el.className = 'h-full w-full object-contain bg-black';
      stage.appendChild(el);
      log('video attached to stage');
    } else if (!stage && el.parentNode) {
      el.remove();
      log('video returned to detached (audio-only)');
    }
  }

  const value: MusicContextValue = {
    ...state, play, playQueue, retry, select, clear, seek, attachVideoStage,
    videoElement: video.current,
    toggle() { if (requested.current || snapshot.current.isPlaying) pause(); else if (snapshot.current.error) void retry(); else start(); },
    next() { advance(); }, previous() { advance(true); },
    setVolume(volume) {
      if (!Number.isFinite(volume)) return;
      const clamped = Math.max(0, Math.min(1, volume));
      if (audio.current) audio.current.volume = clamped;
      if (video.current) video.current.volume = clamped;
      update({ volume: clamped });
    },
    toggleShuffle() {
      history.current = [];
      remaining.current = snapshot.current.queue.map((_, i) => i).filter(i => i !== snapshot.current.currentIndex);
      update({ shuffle: !snapshot.current.shuffle });
    },
    cycleRepeat() { update({ repeat: snapshot.current.repeat === 'off' ? 'all' : snapshot.current.repeat === 'all' ? 'one' : 'off' }); },
    enqueue(track, next = false) {
      const s = snapshot.current;
      const queue = [...s.queue];
      const index = next ? s.currentIndex + 1 : queue.length;
      queue.splice(index, 0, track);
      remaining.current = remaining.current.map(i => i >= index ? i + 1 : i);
      remaining.current.push(index);
      history.current = history.current.map(i => i >= index ? i + 1 : i);
      priority.current = priority.current.map(i => i >= index ? i + 1 : i);
      if (next) priority.current.unshift(index);
      if (!s.current) { resetTraversal(0, queue); loadOccurrence(0, queue); }
      else update({ queue });
    },
    remove(index) {
      const s = snapshot.current;
      if (!Number.isInteger(index) || index < 0 || index >= s.queue.length) return;
      const queue = s.queue.filter((_, i) => i !== index);
      const remap = (indices: number[]) => indices.filter(i => i !== index).map(i => i > index ? i - 1 : i);
      remaining.current = remap(remaining.current);
      history.current = remap(history.current);
      priority.current = remap(priority.current);
      if (index === s.currentIndex) {
        const target = Math.min(index, queue.length - 1);
        const track = queue[target];
        if (!track) clear();
        else {
          const autoplay = requested.current || s.isPlaying;
          remaining.current = remaining.current.filter(i => i !== target);
          priority.current = priority.current.filter(i => i !== target);
          loadOccurrence(target, queue);
          if (autoplay) start();
        }
      } else {
        // A pending refresh captured an occurrence index before this edit.
        attempt.current++;
        recovering.current = false;
        update({ queue, currentIndex: s.currentIndex > index ? s.currentIndex - 1 : s.currentIndex });
      }
    },
  };
  actions.current = value;

  useEffect(() => {
    const element = new Audio();
    element.preload = 'none';
    element.volume = initial.volume;
    audio.current = element;
    // The video transport (music.md: a video CAN be a track). DETACHED by
    // default — it plays audio-only while the mini-player is the surface; the
    // expanded player panel reparents it into its visible stage (same element,
    // so position + hls state survive the move). It never lives in the React
    // tree (the context owns it, the panel just borrows it).
    const videoElement = document.createElement('video');
    videoElement.preload = 'none';
    videoElement.playsInline = true;
    videoElement.volume = initial.volume;
    videoElement.setAttribute('aria-hidden', 'true');
    video.current = videoElement;
    remaining.current = [];
    history.current = [];
    priority.current = [];
    recovered.current = false;
    recovering.current = false;
    resumeAt.current = null;
    update({ ...initial });
    // One handler set per element: the two transports report into the SAME
    // session state — but only the ACTIVE one ever has a source attached, so
    // the inactive element's events never fire.
    const bind = (el: HTMLMediaElement) => {
      const onPlay = () => {
        if (!requested.current) { el.pause(); return; }
        claimMediaPlayback(el);
        update({ isPlaying: true, error: null });
      };
      const onPause = () => update({ isPlaying: false });
      const onTime = () => update({ currentTime: Number.isFinite(el.currentTime) ? el.currentTime : 0 });
      const onDuration = () => {
        const duration = Number.isFinite(el.duration) ? el.duration : 0;
        if (resumeAt.current !== null && duration > 0) {
          el.currentTime = Math.min(resumeAt.current, duration);
          resumeAt.current = null;
          update({ currentTime: el.currentTime });
        }
        update({ duration });
      };
      const onEnd = () => { log('ended'); advance(false, true); };
      const onError = () => {
        if (!snapshot.current.current) return;
        // Re-read through the existing authorized post path, never the owner-only
        // media URL endpoint. One attempt per selection prevents broken-file loops.
        console.log('[music-player] media error', { kind: el instanceof HTMLVideoElement ? 'video' : 'audio', code: el.error?.code ?? 0, automaticRefresh: requested.current && !recovered.current });
        if (recovering.current) return;
        if (requested.current && !recovered.current) { void actions.current?.retry(); return; }
        pause();
        update({ error: 'This track could not be loaded. Try again.' });
        log('media error');
      };
      const listeners: Record<string, EventListener> = { play: onPlay, playing: onPlay, pause: onPause, timeupdate: onTime, durationchange: onDuration, loadedmetadata: onDuration, ended: onEnd, error: onError };
      Object.entries(listeners).forEach(([name, handler]) => el.addEventListener(name, handler));
      return () => { Object.entries(listeners).forEach(([name, handler]) => el.removeEventListener(name, handler)); };
    };
    const unbindAudio = bind(element);
    const unbindVideo = bind(videoElement);
    const onOtherPlay = (event: Event) => {
      const target = event.target;
      // The session's OWN two transports never count as "other media".
      if (target instanceof HTMLMediaElement && target !== element && target !== videoElement && !target.muted && target.volume > 0) {
        pause(); log('paused for other media');
      }
    };
    document.addEventListener('play', onOtherPlay, true);
    const mediaSession = navigator.mediaSession;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => start(), pause: () => pause(),
      nexttrack: () => actions.current?.next(), previoustrack: () => actions.current?.previous(),
      seekto: details => { if (details.seekTime !== undefined) actions.current?.seek(details.seekTime); },
      seekbackward: details => actions.current?.seek(snapshot.current.currentTime - (details.seekOffset || 10)),
      seekforward: details => actions.current?.seek(snapshot.current.currentTime + (details.seekOffset || 10)),
    };
    const registered: MediaSessionAction[] = [];
    if (mediaSession) Object.entries(handlers).forEach(([name, handler]) => {
      try { mediaSession.setActionHandler(name as MediaSessionAction, handler!); registered.push(name as MediaSessionAction); } catch { /* Browser does not support this action. */ }
    });
    log('audio mounted');
    return () => {
      attempt.current++;
      requested.current = false;
      unbindAudio();
      unbindVideo();
      document.removeEventListener('play', onOtherPlay, true);
      element.pause(); element.removeAttribute('src'); element.load();
      detachVideoSource();
      videoElement.pause(); videoElement.removeAttribute('src'); videoElement.load();
      audio.current = null;
      video.current = null;
      registered.forEach(name => { try { mediaSession.setActionHandler(name, null); } catch { /* Unsupported action. */ } });
      if (mediaSession) { mediaSession.metadata = null; mediaSession.playbackState = 'none'; }
      log('audio disposed');
    };
  }, [sessionKey]);

  useEffect(() => {
    const mediaSession = navigator.mediaSession;
    if (!mediaSession) return;
    const track = state.current;
    mediaSession.playbackState = track ? state.isPlaying ? 'playing' : 'paused' : 'none';
    console.log('[music-player] media session metadata', { track: Boolean(track), playing: state.isPlaying, artwork: Boolean(track?.artworkUrl) });
    if (!track || typeof MediaMetadata === 'undefined') { mediaSession.metadata = null; return; }
    const metadata: MediaMetadataInit = { title: musicTitle(track), artist: musicArtist(track) };
    // The resolved cover so the phone's system media controls (previous/next,
    // pause, scrubber) show the artwork. A refreshed track re-reads its post,
    // recomputes artworkUrl and lands here with a fresh URL.
    if (track.artworkUrl) metadata.artwork = [{ src: track.artworkUrl }];
    mediaSession.metadata = new MediaMetadata(metadata);
  }, [state.current, state.isPlaying]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic(): MusicContextValue {
  const context = useContext(MusicContext);
  if (!context) throw new Error('useMusic requires MusicProvider');
  return context;
}
