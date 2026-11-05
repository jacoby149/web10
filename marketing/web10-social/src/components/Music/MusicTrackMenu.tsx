import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Bookmark, Check, ListMusic, ListPlus, MessageCircle, Share2, SkipForward, UserRound, X } from 'lucide-react';
import type { MusicTrack } from '@/data';
import { Button } from '@/components/ui/button';
import { musicTitle, musicArtist } from '@/data/musicTrack';
import MusicArtwork from './MusicArtwork';

interface Props {
  track: MusicTrack;
  saved: boolean;
  signedIn: boolean;
  disabled: boolean;
  message?: string;
  onClose(): void;
  onNext(): void;
  onQueue(): void;
  onSave(): void;
  onPlaylist(): void;
  onShare(): void;
}

export default function MusicTrackMenu({ track, saved, signedIn, disabled, message, onClose, onNext, onQueue, onSave, onPlaylist, onShare }: Props) {
  const location = useLocation();
  const comments = new URLSearchParams(location.pathname === '/music' ? location.search : '');
  comments.set('track', track.post._id || ''); comments.set('panel', 'comments'); comments.delete('menu');
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);
  const name = musicTitle(track);
  const artist = musicArtist(track);
  const artistLink = track.post.author_key?.includes('/groups/') ? `/groups/${encodeURIComponent(track.post.author_key)}` : `/u/${encodeURIComponent(track.post.author_username || '')}`;
  const actionClass = 'h-12 w-full justify-start gap-4 px-4 text-sm';
  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" data-testid="music-track-menu-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pointer-events-none absolute inset-0 bg-background/80 backdrop-blur-sm" />
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="music-menu-title" className="relative max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-lg border border-border bg-popover pb-3 shadow-xl" data-testid="music-track-menu">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <MusicArtwork url={track.artworkUrl} className="h-12 w-12 rounded-sm" />
        <div className="min-w-0 flex-1"><h2 id="music-menu-title" className="truncate text-sm font-medium">{name}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{artist}</p></div>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Close track menu" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>
      {message && <p role="status" className="px-4 pt-3 text-xs text-brand-300">{message}</p>}
      <div className="px-2 pt-2">
        <Button variant="ghost" className={actionClass} onClick={onNext}><SkipForward className="h-5 w-5 text-muted-foreground" />Play next</Button>
        <Button variant="ghost" className={actionClass} onClick={onQueue}><ListPlus className="h-5 w-5 text-muted-foreground" />Add to queue</Button>
        {signedIn && <>
          <Button variant="ghost" className={actionClass} onClick={onPlaylist}><ListMusic className="h-5 w-5 text-muted-foreground" />Save to playlist</Button>
          <Button variant="ghost" className={actionClass} disabled={disabled} onClick={onSave}>{saved ? <Check className="h-5 w-5 text-brand-300" /> : <Bookmark className="h-5 w-5 text-muted-foreground" />}{saved ? 'Remove from Saved Music' : 'Save to Saved Music'}</Button>
        </>}
        <Button variant="ghost" className={actionClass} onClick={onShare}><Share2 className="h-5 w-5 text-muted-foreground" />Share track</Button>
        <Button variant="ghost" className={actionClass} asChild><Link to={`/music?${comments}`} onClick={onClose}><MessageCircle className="h-5 w-5 text-muted-foreground" />Comments</Link></Button>
        <Button variant="ghost" className={actionClass} asChild><Link to={artistLink} onClick={onClose}><UserRound className="h-5 w-5 text-muted-foreground" />Go to artist</Link></Button>
      </div>
    </div>
  </div>, document.body);
}
