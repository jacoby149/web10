import type { ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { useOptionalMusic } from '@/context/MusicContext';
import { useFeedMusicQueue } from '@/context/FeedMusicContext';
import { musicArtist, musicTitle, musicTrackFromPost, musicTrackKey } from '@/data/musicTrack';
import type { MediaRecord, PostRecord } from '@/data/types';
import { Button } from '@/components/ui/button';
import MusicArtwork from './MusicArtwork';

/** Eligible music has one voice: feed taps hand off to the app transport. */
export default function MusicFeedMedia({ post, media, readOnlySource = false, children }: {
  post: PostRecord; media: MediaRecord[]; readOnlySource?: boolean; children: ReactNode;
}) {
  const music = useOptionalMusic();
  const queue = useFeedMusicQueue();
  const resolved = musicTrackFromPost(post, media);
  if (!music || !resolved) return children;
  const track = { ...resolved, readOnlySource };
  const selected = !!music.current && musicTrackKey(music.current) === musicTrackKey(track);
  const playing = selected && music.isPlaying;
  const open = () => {
    console.log('[music-feed] persistent player handoff in place', { selected, readOnlySource, kind: track.media.mime_type?.split('/')[0] });
    if (!selected) music.play(track, queue?.some(item => musicTrackKey(item) === musicTrackKey(track)) ? queue : [track]);
    else if (!music.isPlaying) music.toggle();
  };
  return <div className="p-4" data-testid="music-feed-media">
    <div className="flex items-center gap-3 rounded-lg border border-border bg-elevated p-4">
      <button type="button" onClick={open} aria-label={`Open player: ${musicTitle(track)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MusicArtwork url={track.artworkUrl} className="h-16 w-16 rounded" />
        <span className="min-w-0"><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Music</span><span className="block truncate text-sm font-semibold text-foreground">{musicTitle(track)}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{musicArtist(track)}</span></span>
      </button>
      <Button variant="brand" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={playing ? 'Pause music' : 'Play music'} onClick={() => { if (playing) music.toggle(); else open(); }}>
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </Button>
    </div>
  </div>;
}
