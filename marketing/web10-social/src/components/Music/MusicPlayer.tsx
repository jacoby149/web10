import { Link } from 'react-router-dom';
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
  if (!music.current) return null;
  const track = music.current;
  const link = `/music?track=${encodeURIComponent(track.post._id || '')}&panel=`;
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
  return (
    <section aria-label="Music player" data-testid="music-player" className="chrome-player-position fixed inset-x-0 z-30 border-t border-border bg-surface md:bottom-0 md:left-64">
      {music.error && <div role="alert" className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-danger">
        <span>{music.error}</span>
        <Button size="sm" variant="outline" onClick={() => void music.retry()}>Retry playback</Button>
      </div>}
      <div className="flex items-center gap-1 px-2 pt-2 md:gap-3 md:px-4">
        <Link to={`${link}player`} data-replay-private={track.post.visibility !== 'public' ? '' : undefined} className={`flex min-w-0 flex-1 items-center gap-3 rounded-sm ${focus}`} aria-label={`Open player: ${musicTitle(track)}`}>
          <MusicArtwork url={track.artworkUrl} className="h-11 w-11 rounded-sm" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{musicTitle(track)}</span><span className="block truncate text-xs text-muted-foreground">{musicArtist(track)}</span></span>
        </Link>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Previous track" onClick={music.previous}><SkipBack className="h-5 w-5" /></Button>
        <Button variant="brand" size="icon" className="h-11 w-11 shrink-0" aria-label={music.isPlaying ? 'Pause music' : 'Play music'} onClick={music.toggle}>{music.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Next track" onClick={music.next}><SkipForward className="h-5 w-5" /></Button>
        <label className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">Volume<input aria-label="Music volume" type="range" min="0" max="1" step="0.01" value={music.volume} onChange={e => music.setVolume(Number(e.target.value))} className={`h-11 w-20 accent-brand ${focus}`} /></label>
        <Link to={`${link}queue`} aria-label="Open music queue" className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-elevated hover:text-foreground sm:flex ${focus}`}><ListMusic className="h-5 w-5" /></Link>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Close music player" onClick={music.clear}><X className="h-5 w-5" /></Button>
      </div>
      <div className="flex items-center gap-2 px-4 text-xs tabular-nums text-muted-foreground">
        <span>{time(music.currentTime)}</span>
        <input aria-label="Seek music" type="range" min="0" max={music.duration || 0} step="1" value={Math.min(music.currentTime, music.duration)} disabled={!music.duration} onChange={e => music.seek(Number(e.target.value))} className={`h-8 min-w-0 flex-1 accent-brand disabled:opacity-40 ${focus}`} />
        <span>{time(music.duration)}</span>
        <Link to={`${link}queue`} className={`rounded-sm px-2 py-2 text-brand-300 sm:hidden ${focus}`}>Queue</Link>
      </div>
    </section>
  );
}
