import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, RotateCcw } from 'lucide-react';

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const validDuration = (value?: number) => value && Number.isFinite(value) && value > 0 ? value : 0;
const control = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand-300 transition-colors hover:bg-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

/** URL replacement owns a fresh transport; no autoplay or persisted signed URL. */
export function AudioPlayer(props: { src?: string; durationSeconds?: number }) {
  return <AudioTransport key={props.src || 'unavailable'} {...props} />;
}

function AudioTransport({ src, durationSeconds }: { src?: string; durationSeconds?: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const live = useRef(true);
  const requested = useRef(false);
  const attempt = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(validDuration(durationSeconds));

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
    if (failed) { setFailed(false); audio.load(); }
    try {
      await audio.play();
      if (!live.current || !requested.current) { audio.pause(); return; }
      console.log('[audio-player] playback request completed');
    } catch {
      if (live.current && current === attempt.current) { setFailed(true); setPlaying(false); console.warn('[audio-player] playback request failed'); }
    } finally {
      if (live.current && current === attempt.current) setStarting(false);
    }
  };

  if (!src) return <div className="flex items-center gap-3 rounded-lg bg-elevated p-3 text-sm text-muted-foreground" data-testid="audio-unavailable"><Music2 className="h-5 w-5" />Audio unavailable</div>;
  return (
    <div className="w-full rounded-lg bg-elevated p-3" data-testid="audio-player">
      <audio ref={ref} src={src} preload="none" aria-label="Attached audio"
        onPlay={(event) => { if (!requested.current) { event.currentTarget.pause(); return; } setPlaying(true); setFailed(false); }}
        onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(validDuration(event.currentTarget.duration) || validDuration(durationSeconds))}
        onDurationChange={(event) => setDuration(validDuration(event.currentTarget.duration) || validDuration(durationSeconds))}
        onTimeUpdate={(event) => setPosition(Number.isFinite(event.currentTarget.currentTime) ? event.currentTarget.currentTime : 0)}
        onError={() => { console.warn('[audio-player] media load failed'); setFailed(true); setPlaying(false); setStarting(false); }} />
      <div className="flex items-center gap-3">
        <button type="button" className={control} onClick={() => void play()} disabled={starting}
          aria-label={failed ? 'Retry audio' : playing ? 'Pause audio' : 'Play audio'}>
          {failed ? <RotateCcw className="h-5 w-5" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2 text-xs tabular-nums text-muted-foreground">
            <span>{starting ? 'Starting…' : 'Audio'}</span><span>{time(position)} / {duration ? time(duration) : '—:—'}</span>
          </div>
          <input type="range" aria-label="Seek audio" min={0} max={duration || 1} step={0.1}
            value={Math.min(position, duration || 0)} disabled={!duration || failed}
            className="h-11 w-full cursor-pointer appearance-none rounded bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand"
            onChange={(event) => {
              if (!ref.current) return;
              const next = Number(event.target.value);
              ref.current.currentTime = next;
              setPosition(next);
            }} />
        </div>
      </div>
      {failed && <p role="alert" className="mt-2 text-sm text-muted-foreground">Audio could not be played. Try again or refresh the post for a fresh link.</p>}
    </div>
  );
}
