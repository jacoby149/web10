import { Link } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import { ListMusic, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMusic } from '@/context/MusicContext';
import { musicTitle, musicArtist } from '@/data/musicTrack';
import MusicArtwork from './MusicArtwork';

function time(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export default function MusicPlayer() {
  const music = useMusic();
  const player = useRef<HTMLElement>(null);
  const hasTrack = !!music.current;
  useLayoutEffect(() => {
    const element = player.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty('--chrome-player-height', `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => { observer?.disconnect(); document.documentElement.style.removeProperty('--chrome-player-height'); };
  }, [hasTrack]);
  if (!music.current) return null;
  const track = music.current;
  const source = track.post.source_origin ? `&source=${encodeURIComponent(track.post.source_origin)}` : '';
  const link = (panel: string) => `/music?track=${encodeURIComponent(track.post._id || '')}&panel=${panel}${source}`;
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
  return (
    <section ref={player} aria-label="Music player" data-testid="music-player" className="chrome-player-position chrome-player-glass chrome-glass chrome-floating fixed inset-x-3 z-30 rounded-lg border border-border bg-surface md:inset-x-0 md:bottom-0 md:left-64 md:rounded-none md:border-x-0 md:border-b-0">
      <span aria-hidden="true" className="chrome-dock-bed" />
      <div className="relative z-2">
      {music.error && <div role="alert" className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-danger">
        <span>{music.error}</span>
        <Button size="sm" variant="outline" onClick={() => void music.retry()}>Retry playback</Button>
      </div>}
      <div className="flex items-center gap-1 px-2 pt-2 md:gap-3 md:px-4">
        <Link to={link('player')} data-replay-private={track.post.visibility !== 'public' ? '' : undefined} className={`flex min-w-0 flex-1 items-center gap-3 rounded-sm ${focus}`} aria-label={`Open player: ${musicTitle(track)}`}>
          <MusicArtwork url={track.artworkUrl} className="h-11 w-11 rounded-sm" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{musicTitle(track)}</span><span className="block truncate text-xs text-muted-foreground">{musicArtist(track)}</span></span>
        </Link>
        <Button variant="ghost" size="icon" className="hidden h-11 w-11 shrink-0 sm:inline-flex" aria-label="Previous track" onClick={music.previous}><SkipBack className="h-5 w-5" /></Button>
        <Button variant="brand" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={music.isPlaying ? 'Pause music' : 'Play music'} onClick={music.toggle}>{music.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Next track" onClick={music.next}><SkipForward className="h-5 w-5" /></Button>
        <label className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">Volume<input aria-label="Music volume" type="range" min="0" max="1" step="0.01" value={music.volume} onChange={e => music.setVolume(Number(e.target.value))} className={`h-11 w-20 accent-brand ${focus}`} /></label>
        <Link to={link('queue')} aria-label="Open music queue" className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-elevated hover:text-foreground sm:flex ${focus}`}><ListMusic className="h-5 w-5" /></Link>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Close music player" onClick={music.clear}><X className="h-5 w-5" /></Button>
      </div>
      <div className="flex items-center gap-2 px-3 text-xs tabular-nums text-muted-foreground md:px-4">
        <span>{time(music.currentTime)}</span>
        <input aria-label="Seek music" type="range" min="0" max={music.duration || 0} step="1" value={Math.min(music.currentTime, music.duration)} disabled={!music.duration} onChange={e => music.seek(Number(e.target.value))} className={`h-11 min-w-0 flex-1 cursor-pointer appearance-none rounded bg-transparent disabled:opacity-40 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand ${focus}`} />
        <span>{time(music.duration)}</span>
        <Link to={link('queue')} className={`flex h-11 items-center rounded-sm px-2 text-brand-300 sm:hidden ${focus}`}>Queue</Link>
      </div>
      </div>
    </section>
  );
}
