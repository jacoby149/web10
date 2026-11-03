import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Bookmark, Disc3, Headphones, ListMusic, MoreVertical, Music, Pause, Play, Plus, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward, X } from 'lucide-react';
import MusicTrackMenu from './MusicTrackMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMusic } from '@/context/MusicContext';
import { useSave } from '@/context/SaveContext';
import { getWapi, readMusicPage, readMusicCollection, readMusicTrack, getMyCollections, readSavedPostIds, findSavedMusicCollection, toggleSavedMusic, createCollection, type MusicTrack } from '@/data';
import type { CollectionRecord } from '@/data/saved';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const title = (track: MusicTrack) => track.post.title || track.post.text?.slice(0, 60) || 'Untitled track';
const artist = (track: MusicTrack) => track.post.group_identity?.name || track.post.profile?.display_name || `@${track.post.author_username || 'Unknown artist'}`;
const postLink = (track: MusicTrack) => track.post.author_key?.includes('/groups/')
  ? `/groups/${encodeURIComponent(track.post.author_key)}/p/${encodeURIComponent(track.post._id || '')}`
  : `/u/${encodeURIComponent(track.post.author_username || '')}/p/${encodeURIComponent(track.post._id || '')}`;
function time(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function Artwork({ track, className }: { track?: MusicTrack; className?: string }) {
  return <div className={cn('aspect-square shrink-0 overflow-hidden rounded bg-gradient-to-br from-brand-muted via-elevated to-background', className)}>
    {track?.media.thumbnail_url ? <img src={track.media.thumbnail_url} alt={title(track)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Disc3 className="h-1/3 w-1/3 text-brand-300/60" strokeWidth={1} /></div>}
  </div>;
}

export default function MusicScreen() {
  const music = useMusic();
  const musicRef = useRef(music);
  musicRef.current = music;
  const { openSave, saveOpen } = useSave();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'explore';
  const collectionId = params.get('collection') || '';
  const query = params.get('q') || '';
  const trackId = params.get('track') || '';
  const panel = params.get('panel') || '';
  const menuId = params.get('menu') || '';
  const client = getWapi();
  const token = client.readToken();
  const signedIn = client.isSignedIn();
  const session = signedIn && token ? `${token.provider}/${token.username}/${token.expires || ''}` : 'anonymous';
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const generation = useRef(0);
  const lifecycle = useRef(0);
  const mutationInFlight = useRef(false);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [libraryReady, setLibraryReady] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [playlist, setPlaylist] = useState<{ tracks: MusicTrack[]; name: string; skipped: number }>({ tracks: [], name: '', skipped: 0 });
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [newName, setNewName] = useState('');
  const [menuResolved, setMenuResolved] = useState<MusicTrack | null>(null);
  const savedCollection = findSavedMusicCollection(collections);
  const activeCollection = view === 'saved' ? savedCollection?.groupId || '' : collectionId;
  const menuTrack = menuId ? [...tracks, ...playlist.tracks, ...music.queue].find(track => track.post._id === menuId) || (menuResolved?.post._id === menuId ? menuResolved : null) : null;

  useEffect(() => {
    let cancelled = false;
    setMenuResolved(null);
    if (menuId && ![...tracks, ...playlist.tracks, ...music.queue].some(track => track.post._id === menuId)) {
      readMusicTrack(menuId).then(track => { if (!cancelled) { setMenuResolved(track); if (!track) setNotice('This track is unavailable.'); } })
        .catch(() => { if (!cancelled) setNotice('The track menu could not be loaded.'); });
    }
    return () => { cancelled = true; };
  }, [menuId, session]);

  useEffect(() => {
    lifecycle.current++;
    mutationInFlight.current = false;
    setNotice(''); setBusy(''); setNewName('');
    return () => { lifecycle.current++; mutationInFlight.current = false; };
  }, [session]);

  function mutationGuard() {
    const current = lifecycle.current;
    const owner = session;
    return () => {
      if (lifecycle.current !== current || sessionRef.current !== owner) throw new Error('Music session changed');
    };
  }

  function change(values: Record<string, string | null>, replace = false) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
      return next;
    }, { replace });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setTracks([]);
    console.log('[music] explore read start');
    readMusicPage(30, 0).then(page => {
      if (cancelled) return;
      setTracks(page.tracks); setHasMore(page.hasMore); setOffset(page.nextOffset ?? 30);
      console.log('[music] explore read complete', { tracks: page.tracks.length });
    }).catch(() => { if (!cancelled) setError('Music could not be loaded. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, refresh]);

  useEffect(() => {
    const current = ++generation.current;
    let cancelled = false;
    setCollections([]); setSavedIds(new Set()); setLibraryReady(false); setLibraryError('');
    if (!signedIn) { setLibraryReady(true); return; }
    console.log('[music] library read start');
    (async () => {
      const cols = await getMyCollections();
      if (cancelled || current !== generation.current) return;
      const saved = findSavedMusicCollection(cols);
      const ids = saved ? await readSavedPostIds(saved.groupId) : new Set<string>();
      if (cancelled || current !== generation.current) return;
      setCollections(cols); setSavedIds(ids);
      console.log('[music] library read complete', { collections: cols.length });
    })().catch(() => { if (!cancelled) setLibraryError('Your music library could not be loaded.'); })
      .finally(() => { if (!cancelled) setLibraryReady(true); });
    return () => { cancelled = true; };
  }, [session, signedIn, libraryVersion, saveOpen]);

  useEffect(() => {
    let cancelled = false;
    setPlaylist({ tracks: [], name: '', skipped: 0 }); setPlaylistError(''); setPlaylistLoading(false);
    if (!signedIn || !activeCollection) return;
    setPlaylistLoading(true);
    readMusicCollection(activeCollection).then(result => { if (!cancelled) setPlaylist(result); })
      .catch(() => { if (!cancelled) setPlaylistError('This playlist could not be opened. It may be unavailable.'); })
      .finally(() => { if (!cancelled) setPlaylistLoading(false); });
    return () => { cancelled = true; };
  }, [session, signedIn, activeCollection, libraryVersion, saveOpen]);

  useEffect(() => {
    let cancelled = false;
    setLinkError('');
    if (!trackId || musicRef.current.current?.post._id === trackId) return;
    readMusicTrack(trackId).then(track => {
      if (cancelled) return;
      if (track) musicRef.current.select(track);
      else setLinkError('This track is unavailable or is no longer music.');
    }).catch(() => { if (!cancelled) setLinkError('This track could not be opened.'); });
    return () => { cancelled = true; };
  }, [trackId, session]);

  // Transport changes keep the expanded player link on the audible track.
  useEffect(() => {
    if (music.current && trackId && music.current.post._id !== trackId) change({ track: music.current.post._id || null }, true);
  }, [music.current?.post._id]);

  async function loadMore() {
    if (loading) return;
    const owner = session;
    setLoading(true); setError('');
    try {
      const page = await readMusicPage(30, offset);
      if (sessionRef.current !== owner) return;
      setTracks(previous => [...new Map([...previous, ...page.tracks].map(track => [track.post._id, track])).values()]);
      setHasMore(page.hasMore); setOffset(page.nextOffset ?? offset + 30);
    } catch { if (sessionRef.current === owner) setError('More music could not be loaded. Try again.'); }
    finally { if (sessionRef.current === owner) setLoading(false); }
  }

  async function save(track: MusicTrack) {
    if (!signedIn || mutationInFlight.current || !libraryReady || libraryError) return;
    const id = track.post._id!;
    const owner = session;
    const ownerGeneration = lifecycle.current;
    const assertCurrent = mutationGuard();
    const wasSaved = savedIds.has(id);
    mutationInFlight.current = true;
    setBusy(id); setNotice('');
    try {
      await toggleSavedMusic(id, wasSaved, assertCurrent);
      assertCurrent();
      setNotice(wasSaved ? 'Removed from Saved Music.' : 'Added to Saved Music.');
      setLibraryVersion(value => value + 1);
    } catch { if (sessionRef.current === owner && lifecycle.current === ownerGeneration) setNotice('Could not update Saved Music. Try again.'); }
    finally { if (sessionRef.current === owner && lifecycle.current === ownerGeneration) { setBusy(''); mutationInFlight.current = false; } }
  }

  async function newPlaylist(event: React.FormEvent) {
    event.preventDefault();
    if (!signedIn || !newName.trim() || mutationInFlight.current) return;
    const owner = session;
    const ownerGeneration = lifecycle.current;
    const assertCurrent = mutationGuard();
    mutationInFlight.current = true;
    setBusy('create'); setNotice('');
    try {
      const groupId = await createCollection(newName.trim(), { assertCurrent });
      assertCurrent();
      setNewName(''); setLibraryVersion(value => value + 1);
      change({ view: 'playlists', collection: groupId });
    } catch { if (sessionRef.current === owner && lifecycle.current === ownerGeneration) setNotice('Could not create your playlist. Try again.'); }
    finally { if (sessionRef.current === owner && lifecycle.current === ownerGeneration) { setBusy(''); mutationInFlight.current = false; } }
  }

  const source = view === 'explore' ? tracks : playlist.tracks;
  const q = query.trim().toLowerCase();
  const filtered = source.filter(track => !q || [title(track), track.post.text, artist(track), track.post.author_username].some(value => value?.toLowerCase().includes(q)));
  const filteredCollections = collections.filter(col => !q || col.name.toLowerCase().includes(q));
  const current = music.current;
  const featured = view === 'explore' && !q && tracks[0];

  function start(track: MusicTrack) {
    if (music.current?.post._id === track.post._id) music.toggle(); else music.play(track, filtered);
    change({ track: track.post._id || null });
  }
  function actions(track: MusicTrack) {
    return <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`More actions: ${title(track)}`} aria-haspopup="dialog" aria-expanded={menuId === track.post._id} onClick={() => { setNotice(''); change({ menu: track.post._id || null }); }}><MoreVertical className="h-5 w-5" /></Button>;
  }

  async function share(track: MusicTrack) {
    try {
      const url = new URL(`/music?track=${encodeURIComponent(track.post._id || '')}&panel=player`, window.location.origin).href;
      if (navigator.share) await navigator.share({ title: title(track), url });
      else { await navigator.clipboard.writeText(url); setNotice('Track link copied.'); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice('Could not share this track. Try again.'); }
  }

  return <div data-testid="music-screen" className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-8 sm:py-8">
    {menuTrack && <MusicTrackMenu track={menuTrack} saved={savedIds.has(menuTrack.post._id!)} signedIn={signedIn} disabled={!!busy || !libraryReady || !!libraryError} message={notice || libraryError} onClose={() => change({ menu: null }, true)} onNext={() => { music.enqueue(menuTrack, true); setNotice('Added to play next.'); change({ menu: null }, true); }} onQueue={() => { music.enqueue(menuTrack); setNotice('Added to queue.'); change({ menu: null }, true); }} onSave={() => save(menuTrack)} onPlaylist={() => { change({ menu: null }, true); openSave(menuTrack.post); }} onShare={() => share(menuTrack)} />}
    {!panel && <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 hidden items-center gap-2 text-xs font-medium uppercase tracking-widest text-brand-300 sm:flex"><Headphones className="h-4 w-4" /> Your listening room</p><h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">Music</h1><p className="mt-2 hidden text-sm text-muted-foreground sm:block">Find your next favorite. Make it yours.</p></div>
      <div className="w-full sm:w-72"><label htmlFor="music-search" className="mb-2 block text-xs text-muted-foreground">Search music &amp; your playlists</label><div className="flex items-center gap-2 rounded border border-border bg-surface px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input id="music-search" value={query} onChange={event => change({ q: event.target.value || null }, true)} placeholder="Tracks, artists, playlists" className={cn('h-11 w-full min-w-0 rounded bg-transparent text-sm placeholder:text-muted-foreground', focus)} />{query && <button aria-label="Clear music search" className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-sm', focus)} onClick={() => change({ q: null })}><X className="h-4 w-4" /></button>}</div></div>
    </header>}

    {!panel && <nav aria-label="Music views" className="my-4 flex gap-1 border-b border-border pb-3 sm:my-6 sm:gap-2 sm:pb-4">
      {[['explore', 'Explore', Disc3], ['saved', 'Saved Music', Bookmark], ['playlists', 'Playlists', ListMusic]].map(([key, label, Icon]) => <Button key={key as string} variant={view === key && !panel ? 'brand_subtle' : 'ghost'} className="h-11 gap-2 px-3" onClick={() => change({ view: key === 'explore' ? null : key as string, collection: null, panel: null })} aria-current={view === key && !panel ? 'page' : undefined}>{typeof Icon !== 'string' && <Icon className="h-4 w-4" />}{label as string}</Button>)}
    </nav>}
    {notice && !menuTrack && <p role="status" className="mb-4 rounded border border-border bg-surface px-4 py-3 text-sm">{notice}</p>}
    {linkError && <p role="alert" className="mb-4 text-sm text-danger">{linkError} <Button variant="ghost" onClick={() => change({ track: null, panel: null })}>Back to music</Button></p>}

    {panel ? <section aria-label="Now playing" className="grid gap-8 lg:grid-cols-2">
      {panel === 'queue' && <Button variant="ghost" className="h-11 w-fit gap-2 lg:hidden" onClick={() => change({ panel: 'player' })}><ArrowLeft className="h-4 w-4" />Back to player</Button>}
      <div className={panel === 'queue' ? 'hidden lg:block' : ''}><Button variant="ghost" className="mb-4 h-11 gap-2" onClick={() => change({ panel: null })}><ArrowLeft className="h-4 w-4" />Back to browsing</Button>
        {current ? <><Artwork track={current} className="mx-auto w-56 sm:w-64" /><div className="mt-4 text-center"><p className="text-xs uppercase tracking-widest text-brand-300">Now playing</p><h2 className="mt-2 font-display text-2xl">{title(current)}</h2><p className="mt-1 text-sm text-muted-foreground">{artist(current)}</p></div>
          <div className="mx-auto mt-6 max-w-sm"><label className="sr-only" htmlFor="full-music-seek">Playback position</label><input id="full-music-seek" type="range" min="0" max={music.duration || 0} value={Math.min(music.currentTime, music.duration)} disabled={!music.duration} onChange={e => music.seek(Number(e.target.value))} className={cn('h-11 w-full accent-brand disabled:opacity-40', focus)} /><div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{time(music.currentTime)}</span><span>{time(music.duration || current.media.duration_seconds || 0)}</span></div>
            <div className="my-4 flex items-center justify-center gap-3"><Button variant="ghost" size="icon" aria-label="Shuffle" aria-pressed={music.shuffle} className={cn('h-11 w-11', music.shuffle && 'text-brand-300')} onClick={music.toggleShuffle}><Shuffle className="h-5 w-5" /></Button><Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Previous" onClick={music.previous}><SkipBack className="h-5 w-5" /></Button><Button variant="brand" size="icon" className="h-14 w-14 rounded-full" aria-label={music.isPlaying ? 'Pause track' : 'Play track'} data-testid="music-player-toggle" onClick={music.toggle}>{music.isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}</Button><Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Next" onClick={music.next}><SkipForward className="h-5 w-5" /></Button><Button variant="ghost" size="icon" className={cn('h-11 w-11', music.repeat !== 'off' && 'text-brand-300')} aria-label={`Repeat: ${music.repeat}`} onClick={music.cycleRepeat}>{music.repeat === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}</Button></div>
            <div className="flex justify-center">{actions(current)}</div><Link to={postLink(current)} className={cn('mt-3 flex h-11 items-center justify-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground', focus)}>Open original post<ArrowUpRight className="h-4 w-4" /></Link>
          </div></> : <p className="rounded border border-border p-8 text-muted-foreground">Choose a track to start listening.</p>}
      </div>
      <div className={cn('rounded-lg border border-border bg-surface p-4 sm:p-6', panel !== 'queue' && 'hidden lg:block')}><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl">Your queue</h2><span className="text-xs text-muted-foreground">{music.queue.length} tracks</span></div><p className="mb-6 text-sm text-muted-foreground">Just this listening session. Your playlists stay unchanged.</p>
        {!music.queue.length && <p className="py-8 text-sm text-muted-foreground">Use Play next or Add to queue on any track.</p>}
        <ol className="space-y-2">{music.queue.map((track, index) => <li key={`${track.post._id}-${index}`} className={cn('flex items-center gap-3 rounded p-2', index === music.currentIndex ? 'bg-brand-muted' : 'hover:bg-elevated')}><span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span><button onClick={() => music.playQueue(index)} className={cn('min-w-0 flex-1 rounded text-left', focus)}><span className="block truncate text-sm">{title(track)}</span><span className="block truncate text-xs text-muted-foreground">{artist(track)}</span></button><Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={`Remove from queue: ${title(track)}`} onClick={() => music.remove(index)}><X className="h-4 w-4" /></Button></li>)}</ol>
      </div>
    </section> : <>
      {view !== 'explore' && !signedIn ? <div className="rounded-lg border border-border bg-surface p-8"><h2 className="font-display text-2xl">A library of your own</h2><p className="mt-3 text-muted-foreground">Sign in to save music and build playlists with your web10 collections. You can explore and listen without an account.</p></div> : <>
        {view !== 'explore' && libraryError && <div role="alert" className="mb-4 text-sm text-danger">{libraryError}<Button variant="ghost" onClick={() => setLibraryVersion(v => v + 1)}>Retry library</Button></div>}
        {view === 'playlists' && !collectionId ? <section>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-display text-2xl">Your playlists</h2><p className="mt-2 text-sm text-muted-foreground">Your web10 collections, ready to listen.</p></div><form onSubmit={newPlaylist} className="flex w-full items-end gap-2 sm:w-auto"><div className="min-w-0 flex-1"><label htmlFor="playlist-name" className="mb-2 block text-xs text-muted-foreground">New private playlist</label><input id="playlist-name" value={newName} onChange={e => setNewName(e.target.value)} maxLength={100} placeholder="Give it a name" className={cn('h-11 w-full rounded border border-border bg-surface px-3 text-sm', focus)} /></div><Button type="submit" variant="brand_subtle" className="h-11" disabled={!newName.trim() || !!busy}><Plus className="mr-2 h-4 w-4" />Create</Button></form></div>
          {!libraryReady ? <div className="h-40 animate-pulse rounded bg-elevated" /> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{filteredCollections.map(col => <button key={col.groupId} className={cn('group rounded-lg border border-border bg-surface p-3 text-left hover:border-brand/40', focus)} onClick={() => change({ collection: col.groupId })}><div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded bg-gradient-to-br from-brand-muted to-elevated">{col.coverUrl ? <img src={col.coverUrl} alt="" className="h-full w-full object-cover" /> : <ListMusic className="h-12 w-12 text-brand-300/60" strokeWidth={1} />}</div><h3 className="truncate text-sm font-medium">{col.name}</h3><p className="mt-1 text-xs text-muted-foreground">{col.itemCount} saved items · {col.visibility}</p></button>)}</div>}
          {libraryReady && !filteredCollections.length && !libraryError && <p className="py-8 text-sm text-muted-foreground">{q ? 'No playlists match your search.' : 'Make a playlist for a mood, a late night, or the long way home.'}</p>}
        </section> : <>
          {featured && <section className="mb-8 hidden items-center justify-between gap-4 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-brand-muted/60 via-surface to-background p-4 sm:flex sm:p-6">
            <div className="min-w-0"><p className="mb-2 text-xs font-medium uppercase tracking-widest text-brand-300">New in the mix</p><h2 className="font-display text-2xl sm:text-3xl">Set the tone.</h2><p className="mt-2 hidden text-sm text-muted-foreground sm:block">A few new tracks for your next listening session.</p><Button variant="brand" className="mt-4 h-11 gap-2" onClick={() => { music.play(tracks[0], tracks); change({ track: tracks[0].post._id || null, panel: 'player' }); }}><Play className="h-4 w-4" />Start listening</Button></div>
            <button className={cn('relative w-28 shrink-0 overflow-hidden rounded transition-transform hover:scale-105 motion-reduce:transform-none sm:w-40', focus)} aria-label={`Listen to ${title(featured)}`} onClick={() => start(featured)}><Artwork track={featured} /></button>
          </section>}
          <section aria-label="Music tracks"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl">{view === 'saved' ? 'Saved Music' : view === 'playlists' ? playlist.name || 'Playlist' : q ? 'Search results' : 'Fresh in your headphones'}</h2><p className="mt-1 text-xs text-muted-foreground">{query ? <>Results for <span className="text-foreground">{query}</span>. </> : null}{view === 'explore' ? 'Search covers loaded tracks, titles and artists. Load more to explore further.' : 'Playable music from your web10 collection.'}</p></div>{filtered.length > 0 && <Button variant="brand_subtle" className="h-11 gap-2" onClick={() => { music.play(filtered[0], filtered); change({ track: filtered[0].post._id || null, panel: 'player' }); }}><Play className="h-4 w-4" />Play all</Button>}</div>
            {view === 'playlists' && collectionId && token && <Link className={cn('mb-4 inline-flex h-11 items-center gap-2 rounded text-sm text-brand-300', focus)} to={`/u/${encodeURIComponent(token.username)}/saved/${encodeURIComponent(collectionId)}`}>Manage collection &amp; order<ArrowUpRight className="h-4 w-4" /></Link>}
            {playlist.skipped > 0 && view !== 'explore' && <p className="mb-4 text-xs text-muted-foreground">{playlist.skipped} unavailable or nonmusic items aren't shown. Your collection is unchanged.</p>}
            {(view === 'explore' ? error : playlistError) && <div role="alert" className="mb-4 rounded border border-danger/30 p-4 text-sm text-danger">{view === 'explore' ? error : playlistError}<Button variant="ghost" onClick={() => view === 'explore' ? setRefresh(v => v + 1) : setLibraryVersion(v => v + 1)}>Retry</Button></div>}
            {(view === 'explore' ? loading && !tracks.length : playlistLoading || !libraryReady) ? <div className="space-y-3" aria-label="Loading music">{[0, 1, 2, 3].map(n => <div key={n} className="h-20 animate-pulse rounded bg-elevated" />)}</div> : <div className="divide-y divide-border">{filtered.map((track, index) => <article key={track.post._id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-3 sm:flex-nowrap sm:px-3', current?.post._id === track.post._id ? 'bg-brand-muted/40' : 'hover:bg-surface')}>
              <button data-testid="music-track-card" aria-label={`Play ${title(track)}`} onClick={() => start(track)} className={cn('flex min-w-0 flex-1 items-center gap-3 rounded text-left sm:gap-4', focus)}><span className="hidden w-5 text-center text-xs tabular-nums text-muted-foreground sm:block">{current?.post._id === track.post._id && music.isPlaying ? <Pause className="h-4 w-4 text-brand-300" /> : index + 1}</span><Artwork track={track} className="w-12" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title(track)}</span><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><span className="truncate">{artist(track)}</span><span className="shrink-0 tabular-nums">· {time(track.media.duration_seconds || 0)}</span></span></span></button>{actions(track)}
            </article>)}</div>}
            {!loading && !playlistLoading && (view === 'explore' || libraryReady) && !filtered.length && !(view === 'explore' ? error : playlistError || libraryError) && <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center"><Music className="mx-auto mb-3 h-8 w-8 text-brand-300" strokeWidth={1} /><p className="text-sm text-muted-foreground">{q ? 'No tracks match your search.' : view === 'saved' ? 'Your favorites start here. Save a track to add it to Saved Music.' : view === 'playlists' ? 'No playable music in this collection yet. Add a track from Explore.' : 'No music yet. Be the first to share a track.'}</p></div>}
            {view === 'explore' && hasMore && <div className="mt-6 text-center"><Button variant="outline" className="h-11" disabled={loading} onClick={loadMore}>{loading ? 'Loading music...' : 'Explore more music'}</Button></div>}
          </section>
        </>}
      </>}
    </>}
  </div>;
}
