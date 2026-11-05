import { ReliableImage } from './ReliableImage';
import { claimMediaPlayback, hasMediaRecovery, mediaExpiry, recoverMediaUrl } from './mediaRecovery';
import { useEffect, useRef, useState } from 'react';
import { Disc3, Pause, Play, RotateCcw } from 'lucide-react';
import { Skeleton } from './ui';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const validDuration = (value?: number) => value && Number.isFinite(value) && value > 0 ? value : 0;
const control = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand-300 transition-colors hover:bg-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

// The pure selector lives in ./audioArtwork (the data layer imports that
// subpath directly — no React barrel); re-exported here for barrel consumers.
export { audioArtwork } from './audioArtwork';

interface AudioPlayerProps {
  src?: string;
  durationSeconds?: number;
  title?: string;
  artist?: string;
  artworkUrl?: string;
}

function AlbumArtwork({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-surface sm:h-20 sm:w-20" data-testid="audio-artwork">
    {!src || failed ? <div role="img" aria-label="No album artwork" className="flex h-full w-full items-center justify-center bg-brand-muted/30 text-brand-300"><Disc3 className="h-8 w-8" strokeWidth={1.5} /></div> : <>
      {!loaded && <Skeleton className="absolute inset-0 h-full w-full" aria-label="Loading cover art" />}
      <ReliableImage src={src} alt={`${title} cover art`} className={`h-full w-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)} onError={() => { console.warn('[audio-player] artwork unavailable; using disc fallback'); setFailed(true); }} loading="lazy" />
    </>}
  </div>;
}

/** URL replacement owns a fresh transport; art-only changes preserve playback. */
export function AudioPlayer(props: AudioPlayerProps) {
  return <AudioTransport key={props.src || 'unavailable'} {...props} />;
}

function AudioTransport({ src, durationSeconds, title = 'Audio recording', artist, artworkUrl }: AudioPlayerProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const live = useRef(true);
  const requested = useRef(false);
  const attempt = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(validDuration(durationSeconds));
  const [currentSrc, setCurrentSrc] = useState(src);
  const refreshing = useRef(false);
  const recovered = useRef(false);
  const restoration = useRef<{ time: number; attempt: number; current: () => boolean } | undefined>(undefined);

  const renew = async () => {
    if (!src || refreshing.current || recovered.current || navigator.onLine === false) return false;
    refreshing.current = true;
    recovered.current = true;
    const captured = attempt.current;
    const resumeTime = ref.current?.currentTime || position;
    setStarting(true);
    console.log('[audio-player] authorized media recovery started');
    try {
      const fresh = await recoverMediaUrl(currentSrc || src);
      if (!live.current || !requested.current || captured !== attempt.current || !fresh.isCurrent()) return false;
      restoration.current = { time: resumeTime, attempt: captured, current: fresh.isCurrent };
      setFailed(false);
      setCurrentSrc(fresh.url);
      if (fresh.url === currentSrc) ref.current?.load();
      return true;
    } catch {
      if (live.current && captured === attempt.current) { setFailed(true); setStarting(false); }
      console.warn('[audio-player] authorized media recovery unavailable');
      return false;
    } finally { refreshing.current = false; }
  };

  useEffect(() => {
    live.current = true;
    const audio = ref.current;
    // Share the normal media play event with MusicProvider and other players.
    const onOtherPlay = (event: Event) => {
      const other = event.target;
      if (other instanceof HTMLMediaElement && other !== audio && !other.muted && other.volume > 0) {
        requested.current = false;
        attempt.current++;
        setStarting(false);
        audio?.pause();
      }
    };
    document.addEventListener('play', onOtherPlay, true);
    return () => {
      live.current = false;
      requested.current = false;
      document.removeEventListener('play', onOtherPlay, true);
      audio?.pause();
    };
  }, []);

  const play = async () => {
    const audio = ref.current;
    if (!audio) return;
    if (!audio.paused) { requested.current = false; attempt.current++; audio.pause(); return; }
    requested.current = true;
    const current = ++attempt.current;
    console.log('[audio-player] playback requested');
    setStarting(true);
    if (failed) { recovered.current = false; setFailed(false); }
    if (currentSrc && hasMediaRecovery(currentSrc) && mediaExpiry(currentSrc) <= Date.now() + 5000) {
      await renew();
      return;
    }
    if (failed) audio.load();
    try {
      await audio.play();
      if (!live.current || !requested.current) { audio.pause(); return; }
      console.log('[audio-player] playback request completed');
    } catch {
      if (live.current && current === attempt.current && !refreshing.current) { setFailed(true); setPlaying(false); console.warn('[audio-player] playback request failed'); }
    } finally {
      if (live.current && current === attempt.current && !refreshing.current) setStarting(false);
    }
  };

  return (
    <div className="w-full rounded-lg border border-border bg-elevated p-4" data-testid="audio-player">
      {src && <audio ref={ref} src={currentSrc} preload="none" aria-label="Attached audio"
        onPlay={(event) => { if (!requested.current || !claimMediaPlayback(event.currentTarget)) { event.currentTarget.pause(); return; } setPlaying(true); setFailed(false); }}
        onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          setDuration(validDuration(event.currentTarget.duration) || validDuration(durationSeconds));
          const restore = restoration.current;
          restoration.current = undefined;
          if (!restore || !live.current || !requested.current || restore.attempt !== attempt.current || !restore.current()) return;
          event.currentTarget.currentTime = restore.time;
          void event.currentTarget.play().catch(() => { if (live.current) { setFailed(true); setStarting(false); } });
        }}
        onDurationChange={(event) => setDuration(validDuration(event.currentTarget.duration) || validDuration(durationSeconds))}
        onTimeUpdate={(event) => setPosition(Number.isFinite(event.currentTarget.currentTime) ? event.currentTarget.currentTime : 0)}
        onError={() => {
          if (refreshing.current) return;
          if (requested.current && !recovered.current && currentSrc && hasMediaRecovery(currentSrc)) { void renew(); return; }
          console.warn('[audio-player] media load failed'); setFailed(true); setPlaying(false); setStarting(false);
        }} />}
      <div className="flex items-center gap-3">
        <AlbumArtwork key={artworkUrl || 'no-art'} src={artworkUrl} title={title} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Audio</p>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" data-testid="audio-track-title">{title}</p>
          {artist && <p className="mt-1 truncate text-xs text-muted-foreground" data-testid="audio-track-artist">{artist}</p>}
        </div>
        <button type="button" className={control} onClick={() => void play()} disabled={starting || !src}
          aria-label={!src ? 'Audio unavailable' : failed ? 'Retry audio' : playing ? 'Pause audio' : 'Play audio'}>
          {failed ? <RotateCcw className="h-5 w-5" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
      </div>
        <div className="mt-3 min-w-0">
          <div className="flex justify-between gap-2 text-xs tabular-nums text-muted-foreground">
            <span>{!src ? 'Unavailable' : failed ? 'Playback unavailable' : starting ? 'Starting…' : playing ? 'Playing' : 'Ready to play'}</span><span>{time(position)} / {duration ? time(duration) : '—:—'}</span>
          </div>
          <input type="range" aria-label="Seek audio" min={0} max={duration || 1} step={0.1}
            value={Math.min(position, duration || 0)} disabled={!src || !duration || failed}
            className="h-11 w-full cursor-pointer appearance-none rounded bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand"
            onChange={(event) => {
              if (!ref.current) return;
              const next = Number(event.target.value);
              ref.current.currentTime = next;
              setPosition(next);
            }} />
        </div>
      {!src && <p className="mt-2 text-sm text-muted-foreground" data-testid="audio-unavailable">Audio unavailable</p>}
      {failed && <p role="alert" className="mt-2 text-sm text-muted-foreground">Audio could not be played. Try again or refresh the post for a fresh link.</p>}
    </div>
  );
}
