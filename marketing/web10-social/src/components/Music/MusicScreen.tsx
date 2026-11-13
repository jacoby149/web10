import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Bookmark, Disc3, Headphones, ListMusic, MessageCircle, MoreVertical, Music, Pause, Play, Plus, Repeat, Repeat1, Search, Share2, Shuffle, SkipBack, SkipForward, X } from 'lucide-react';
import MusicTrackMenu from './MusicTrackMenu';
import MusicArtwork from './MusicArtwork';
import { musicTitle as title, musicArtist as artist, musicTrackKey, musicTrackFromPost } from '@/data/musicTrack';
import { useTunedSurface, preparedSurfaceMedia } from '@/components/Feed/useTunedSurface';
import MusicReactions from './MusicReactions';
import MusicPlaylistBrowser from './MusicPlaylistBrowser';
import { Button } from '@/components/ui/button';
import ShareCollectionSheet from '@/components/shared/ShareCollectionSheet';
import { cn } from '@/lib/utils';
import { useMusic } from '@/context/MusicContext';
import { useSave } from '@/context/SaveContext';
import { getWapi, readMusicPage, readMusicCollection, readMusicTrack, getMyCollections, readSavedPostIds, findSavedMusicCollection, toggleSavedMusic, createCollection, setCollectionVisibility, type MusicTrack } from '@/data';
import type { CollectionRecord } from '@/data/saved';
import { CommentThread } from '@/components/Feed/CommentThread';
import { PostBody } from '@/components/Feed/PostBody';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const postLink = (track: MusicTrack) => track.post.author_key?.includes('/groups/')
  ? `/groups/${encodeURIComponent(track.post.author_key)}/p/${encodeURIComponent(track.post._id || '')}`
  : `/u/${encodeURIComponent(track.post.author_username || '')}/p/${encodeURIComponent(track.post._id || '')}`;
const originOf = (value: string) => { try { return new URL(value).origin; } catch { return value; } };
function time(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function Artwork({ track, className }: { track?: MusicTrack; className?: string }) {
  return <MusicArtwork url={track?.artworkUrl} alt={track ? title(track) : ''} className={className} />;
}

export default function MusicScreen() {
  const tuned = useTunedSurface('music');
  const music = useMusic();
  const musicRef = useRef(music);
  musicRef.current = music;
  const { openSave, saveOpen } = useSave();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'explore';
  const collectionId = params.get('collection') || '';
  const externalPlaylists = view === 'playlists' && ['browse', 'bookmarks'].includes(params.get('scope') || '');
  const query = params.get('q') || '';
  const trackId = params.get('track') || '';
  const sourceOrigin = params.get('source');
  const matchesSource = (track: MusicTrack) => !sourceOrigin || track.post.source_origin === sourceOrigin;
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
  const [legacyTracks, setTracks] = useState<MusicTrack[]>([]);
  const tunedTracks = useMemo(() => tuned.posts.flatMap(post => {
    const track = musicTrackFromPost(post, preparedSurfaceMedia(post));
    return track ? [{ ...track, readOnlySource: post.source_origin !== tuned.home }] : [];
  }), [tuned.posts, tuned.home]);
  const tracks = tuned.enabled ? tunedTracks : legacyTracks;
  const playbackOwner = useRef(tuned.owner);
  useEffect(() => {
    if (playbackOwner.current !== tuned.owner && musicRef.current.current?.readOnlySource) musicRef.current.clear();
    playbackOwner.current = tuned.owner;
  }, [tuned.owner]);
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
  const [playlist, setPlaylist] = useState<{ tracks: MusicTrack[]; name: string; skipped: number; visibility: 'private' | 'public' }>({ tracks: [], name: '', skipped: 0, visibility: 'private' });
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState('');
  const [linkError, setLinkError] = useState('');
  // The URL's track is resolving (its original post read or the board read it
  // is bound to). Drives the panel's designed loading state — a deep-linked
  // track must never render as the empty "choose a track" session.
  const [trackPending, setTrackPending] = useState(() => Boolean(trackId));
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [newName, setNewName] = useState('');
  const [menuResolved, setMenuResolved] = useState<MusicTrack | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const savedCollection = findSavedMusicCollection(collections);
  const activeCollection = view === 'saved' ? savedCollection?.groupId || '' : collectionId;
  // A video track (music.md: a video CAN be a track — a music video marked as
  // music) rides the session's video transport; the expanded panel lends it
  // its visible stage (the provider owns the element — borrow/return by
  // parent; position + hls state survive the move). Audio tracks keep the
  // artwork stage. The effect (not a ref callback) borrows it: the provider's
  // mount effect creates the element AFTER this screen's first commit, so the
  // borrow must re-run once `music.videoElement` lands.
  const isVideoTrack = (track?: MusicTrack | null) => !!track?.media.mime_type?.startsWith('video/');
  const menuTrack = menuId ? [...tracks, ...playlist.tracks, ...music.queue].find(track => track.post._id === menuId && matchesSource(track) && !track.readOnlySource) || (!sourceOrigin && menuResolved?.post._id === menuId ? menuResolved : null) : null;

  useEffect(() => {
    let cancelled = false;
    setMenuResolved(null);
    if (!sourceOrigin && menuId && ![...tracks, ...playlist.tracks, ...music.queue].some(track => track.post._id === menuId)) {
      readMusicTrack(menuId).then(track => { if (!cancelled) { setMenuResolved(track); if (!track) setNotice('This track is unavailable.'); } })
        .catch(() => { if (!cancelled) setNotice('The track menu could not be loaded.'); });
    }
    return () => { cancelled = true; };
  }, [menuId, session, sourceOrigin]);

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
    // Bulk-play callers select the first row; bind their URL to that same row.
    if (values.track && values.panel === 'player' && !('source' in values)) {
      const selected = filtered.find(track => track.post._id === values.track);
      values = { ...values, source: selected?.post.source_origin || null };
    }
    setParams(previous => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
      return next;
    }, { replace });
  }

  useEffect(() => {
    if (tuned.enabled) return;
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
  }, [session, refresh, tuned.enabled]);

  useEffect(() => {
    if (!tuned.enabled) return;
    setLoading(tuned.loading); setHasMore(tuned.hasMore);
  }, [tuned.enabled, tuned.posts, tuned.loading, tuned.hasMore, tuned.home]);

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
    setPlaylist({ tracks: [], name: '', skipped: 0, visibility: 'private' }); setPlaylistError(''); setPlaylistLoading(false);
    // The URL holds which collection is open (the deep-link rule): a signed-in
    // user opens their own library (Saved Music / their playlists); a VISITOR
    // opens a shared playlist by URL alone (`view=playlists&collection=…`) —
    // public ones read through the collection's `anyone` grant, a private one
    // 403s into the unavailable state. I3 is the access control, not this gate.
    if (!activeCollection || (!signedIn && view !== 'playlists')) return;
    setPlaylistLoading(true);
    readMusicCollection(activeCollection).then(result => { if (!cancelled) setPlaylist(result); })
      .catch(() => { if (!cancelled) setPlaylistError('This playlist is private or no longer available.'); })
      .finally(() => { if (!cancelled) setPlaylistLoading(false); });
    return () => { cancelled = true; };
  }, [session, signedIn, view, activeCollection, libraryVersion, saveOpen]);

  // The URL's source, normalized: the home origin (or its absence) names the
  // home post; anything else is a foreign node whose rows only exist on the
  // board. The mix reader stamps `source_origin` on its HOME rows too, so a
  // signed-in share carries `&source=<home>` — that must NOT gate the link on
  // the whole board loading (the operator's "loads for a minute" report).
  const sourceNorm = sourceOrigin ? originOf(sourceOrigin) : '';
  const isHomeSource = !sourceNorm || sourceNorm === originOf(tuned.home);
  const targetCurrent = () => {
    const current = musicRef.current.current;
    return current?.post._id === trackId && matchesSource(current);
  };

  // Board binder: a source-pinned link whose row is already on the board binds
  // it without a read (the row carries the source-bound media URLs and the
  // read-only state the URL promises). A truly FOREIGN source's post lives on
  // that node — the home node cannot read it by id, so the loaded board is its
  // only resolution path: hold the designed loading state until the board
  // settles; only then is "not in the mix" a real answer (no dead-air panel).
  // The binder owns linkError only in its own territory (a pinned source); the
  // home/no-source error belongs to the direct reader, and board churn must
  // never clear it.
  useEffect(() => {
    if (!trackId) { setLinkError(''); return; }
    if (!sourceOrigin) return;
    if (targetCurrent()) { setTrackPending(false); setLinkError(''); return; }
    const found = tracks.find(track => track.post._id === trackId && matchesSource(track));
    if (found) { setTrackPending(false); setLinkError(''); musicRef.current.select(found); return; }
    if (isHomeSource) return;
    setTrackPending(true);
    console.log('[music] track link: foreign source, waiting on board', { source: sourceOrigin, boardLoading: loading });
    if (!loading) setLinkError('This source track is not in the loaded mix. Load more or check its server connection.');
  }, [trackId, session, sourceOrigin, isHomeSource, loading, tracks]);

  // Direct reader: no source — or the home node's own origin — resolves the
  // original readable post DIRECTLY, including tracks outside the current
  // Explore page (music-listening.md: "A track link resolves the original
  // readable post"). This effect's lifetime is the link target's identity, not
  // the board's: a settled/arrived board read must never cancel a read already
  // in flight for the same target (the pinned history-restoration +
  // stale-session controls assert exactly one read).
  useEffect(() => {
    if (!trackId) { setLinkError(''); return; }
    if (!isHomeSource) return;
    if (targetCurrent()) { setTrackPending(false); setLinkError(''); return; }
    let cancelled = false;
    setLinkError('');
    setTrackPending(true);
    console.log('[music] track link read start', { track: trackId, source: sourceNorm || 'home' });
    readMusicTrack(trackId).then(track => {
      if (cancelled) return;
      setTrackPending(false);
      console.log('[music] track link read complete', { track: trackId, resolved: Boolean(track) });
      // The board binder may have bound a loaded row for this same target in
      // the meantime — never reselect over it (one queue entry per track).
      if (targetCurrent()) return;
      if (track) musicRef.current.select(track);
      else setLinkError('This track is unavailable or is no longer music.');
    }).catch(() => { if (!cancelled) { setTrackPending(false); setLinkError('This track could not be opened.'); } });
    return () => { cancelled = true; };
  }, [trackId, session, isHomeSource, sourceNorm]);

  // Transport changes keep the expanded player link on the audible track.
  // The home origin and "no source" name the same home post — neither
  // rewrites the other (a shared link keeps its exact shape; the pinned
  // history-restoration controls rely on no mid-session entry rewrite).
  useEffect(() => {
    const homeish = (value: string | null) => !value ? tuned.home : originOf(value) === originOf(tuned.home) ? tuned.home : value;
    if (music.current && trackId && (music.current.post._id !== trackId || homeish(music.current.post.source_origin || null) !== homeish(sourceOrigin))) change({ track: music.current.post._id || null, source: music.current.post.source_origin || null }, true);
  }, [music.current && musicTrackKey(music.current)]);

  async function loadMore() {
    if (tuned.enabled) { await tuned.next(); return; }
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
    if (track.readOnlySource) return;
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

  const shareCollection = view === 'saved' ? savedCollection : collectionId ? collections.find(c => c.groupId === collectionId) : undefined;
  // The share link is the LISTENING permalink — the Music view's own URL
  // (address bar is part of the product): a recipient, logged in or not, lands
  // on the playlist (public ones open; I3 403s the private ones). The D88
  // collection screen (`/u/…/saved/…`) stays the MANAGE link (the owner's
  // "Manage collection & order"), not the sharing shape.
  const shareUrl = shareCollection && token
    ? new URL(`/music?view=playlists&collection=${encodeURIComponent(shareCollection.groupId)}`, window.location.origin).href
    : '';
  // The open collection's D107 replay state: the library record when it's the
  // reader's own, else the face's visibility from the read (unknown stays
  // masked until the face says public).
  const collectionVisibility = shareCollection?.visibility ?? playlist.visibility;
  const source = view === 'explore' ? tracks : playlist.tracks;
  const q = query.trim().toLowerCase();
  const filtered = source.filter(track => !q || [title(track), track.post.text, artist(track), track.post.author_username].some(value => value?.toLowerCase().includes(q)));
  const filteredCollections = collections.filter(col => !q || col.name.toLowerCase().includes(q));
  const current = music.current;
  const featured = view === 'explore' && !q && tracks[0];

  // The video stage borrow (music.md): while the panel is open on a video
  // track, the session's OWN video element plays in this frame (the provider
  // owns the element — borrow/return by parent; position + hls state survive
  // the move). Audio tracks keep the artwork stage. An effect (not a ref
  // callback) does the borrowing: the provider's mount effect creates the
  // element AFTER this screen's first commit, so the borrow re-runs once
  // `music.videoElement` lands.
  const videoStageEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const attach = panel === 'player' && !!current && isVideoTrack(current);
    musicRef.current.attachVideoStage(attach ? videoStageEl.current : null);
  }, [panel, current, music.videoElement]);

  function start(track: MusicTrack) {
    if (music.current && musicTrackKey(music.current) === musicTrackKey(track)) music.toggle(); else music.play(track, filtered);
    change({ track: track.post._id || null, source: track.post.source_origin || null });
  }
  function actions(track: MusicTrack) {
    if (track.readOnlySource) return <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Read-only source</span><Button variant="ghost" className="h-11 gap-2" onClick={() => share(track)}><Share2 className="h-4 w-4" />Share</Button></div>;
    return <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`More actions: ${title(track)}`} aria-haspopup="dialog" aria-expanded={menuId === track.post._id} onClick={() => { setNotice(''); change({ menu: track.post._id || null, source: track.post.source_origin || null }); }}><MoreVertical className="h-5 w-5" /></Button>;
  }

  async function share(track: MusicTrack) {
    try {
       const url = new URL(`/music?track=${encodeURIComponent(track.post._id || '')}&panel=player${track.post.source_origin ? `&source=${encodeURIComponent(track.post.source_origin)}` : ''}`, window.location.origin).href;
      if (navigator.share) await navigator.share({ title: title(track), url });
      else { await navigator.clipboard.writeText(url); setNotice('Track link copied.'); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice('Could not share this track. Try again.'); }
  }

  return <div data-testid="music-screen" className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-8 sm:py-8">
    {view === 'explore' && !panel && tuned.panel}
    {menuTrack && <MusicTrackMenu track={menuTrack} saved={savedIds.has(menuTrack.post._id!)} signedIn={signedIn} disabled={!!busy || !libraryReady || !!libraryError} message={notice || libraryError} onClose={() => change({ menu: null }, true)} onNext={() => { music.enqueue(menuTrack, true); setNotice('Added to play next.'); change({ menu: null }, true); }} onQueue={() => { music.enqueue(menuTrack); setNotice('Added to queue.'); change({ menu: null }, true); }} onSave={() => save(menuTrack)} onPlaylist={() => { change({ menu: null }, true); openSave(menuTrack.post); }} onShare={() => share(menuTrack)} />}
    {shareOpen && shareCollection && token && <ShareCollectionSheet name={shareCollection.name || 'Playlist'} url={shareUrl} visibility={shareCollection.visibility} canMakePublic onMakePublic={async () => { await setCollectionVisibility(shareCollection.groupId, 'public'); setLibraryVersion(value => value + 1); }} onShared={kind => setNotice(kind === 'copied' ? 'Playlist link copied.' : 'Playlist shared.')} onClose={() => setShareOpen(false)} testId="music-share-playlist" />}
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
      {(panel === 'queue' || panel === 'comments') && <Button variant="ghost" className="h-11 w-fit gap-2 lg:hidden" onClick={() => change({ panel: 'player' })}><ArrowLeft className="h-4 w-4" />Back to player</Button>}
      <div className={panel === 'queue' || panel === 'comments' ? 'hidden lg:block' : ''}><Button variant="ghost" className="mb-4 h-11 gap-2" onClick={() => change({ panel: null })}><ArrowLeft className="h-4 w-4" />Back to browsing</Button>
        {current ? <><div data-replay-private={current.post.visibility !== 'public' ? '' : undefined}>
          {/* A video track (a music video marked as music, music.md) plays on
              the session's OWN video element — the provider's hidden transport
              borrowed into this stage (same element: position + hls state
              survive the borrow). An audio track keeps the artwork stage. */}
          {isVideoTrack(current)
            ? <div data-testid="music-video-stage" ref={videoStageEl} className="mx-auto aspect-video w-full overflow-hidden rounded-lg bg-black sm:max-w-2xl" />
            : <Artwork track={current} className="mx-auto w-56 sm:w-64" />}
          <div className="mt-4 text-center"><p className="text-xs uppercase tracking-widest text-brand-300">Now playing</p><h2 className="mt-2 font-display text-2xl">{title(current)}</h2><p className="mt-1 text-sm text-muted-foreground">{artist(current)}</p></div></div>
          <div className="mx-auto mt-6 max-w-sm"><label className="sr-only" htmlFor="full-music-seek">Playback position</label><input id="full-music-seek" type="range" min="0" max={music.duration || 0} value={Math.min(music.currentTime, music.duration)} disabled={!music.duration} onChange={e => music.seek(Number(e.target.value))} className={cn('h-11 w-full accent-brand disabled:opacity-40', focus)} /><div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{time(music.currentTime)}</span><span>{time(music.duration || current.media.duration_seconds || 0)}</span></div>
            <div className="my-4 flex items-center justify-center gap-3"><Button variant="ghost" size="icon" aria-label="Shuffle" aria-pressed={music.shuffle} className={cn('h-11 w-11', music.shuffle && 'text-brand-300')} onClick={music.toggleShuffle}><Shuffle className="h-5 w-5" /></Button><Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Previous" onClick={music.previous}><SkipBack className="h-5 w-5" /></Button><Button variant="brand" size="icon" className="h-14 w-14 rounded-full" aria-label={music.isPlaying ? 'Pause track' : 'Play track'} data-testid="music-player-toggle" onClick={music.toggle}>{music.isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}</Button><Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Next" onClick={music.next}><SkipForward className="h-5 w-5" /></Button><Button variant="ghost" size="icon" className={cn('h-11 w-11', music.repeat !== 'off' && 'text-brand-300')} aria-label={`Repeat: ${music.repeat}`} onClick={music.cycleRepeat}>{music.repeat === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}</Button></div>
            <div className="flex flex-wrap items-center justify-center gap-1">{!menuTrack && !current.readOnlySource && <MusicReactions track={current} signedIn={signedIn} />}<Button variant="ghost" disabled={current.readOnlySource} title={current.readOnlySource ? 'Source comments are not connected' : undefined} className="h-11 gap-2" onClick={() => change({ panel: 'comments' })}><MessageCircle className="h-4 w-4" />Comments</Button><Button variant="ghost" className="h-11 gap-2" onClick={() => change({ panel: 'queue' })}><ListMusic className="h-4 w-4" />Queue</Button>{actions(current)}</div>{!current.readOnlySource && <Link to={postLink(current)} className={cn('mt-3 flex h-11 items-center justify-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground', focus)}>Open original post<ArrowUpRight className="h-4 w-4" /></Link>}
          </div></> : trackId && trackPending ? <div aria-label="Loading track" className="flex flex-col items-center">
          {/* The designed loading state (design.md §1): a deep-linked track
              resolves off-page (or off-board for a foreign source) — the panel
              names that instead of faking the empty session. The skeleton
              reserves the artwork's footprint so nothing shifts on land. */}
          <div className="h-56 w-56 animate-pulse rounded bg-elevated sm:h-64 sm:w-64" />
          <p className="mt-6 text-sm text-muted-foreground">Loading your track…</p>
        </div> : <p className="rounded border border-border p-8 text-muted-foreground">Choose a track to start listening.</p>}
      </div>
      {panel === 'comments' ? current && <section data-testid="music-comments" data-replay-private={current.post.visibility !== 'public' ? '' : undefined} className="min-w-0 rounded-lg border border-border bg-surface py-4"><header className="px-4 pb-4"><p className="text-xs text-brand-300">The conversation</p><h2 className="mt-2 font-display text-xl">{title(current)}</h2>{current.post.text && <PostBody text={current.post.text} density="light" className="mt-2" />}</header><MusicComments key={`${session}:${current.post._id}`} track={current} signedIn={signedIn} highlightedCommentId={params.get('comment') || undefined} /></section> : <div className={cn('rounded-lg border border-border bg-surface p-4 sm:p-6', panel !== 'queue' && 'hidden lg:block')}><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl">Your queue</h2><span className="text-xs text-muted-foreground">{music.queue.length} tracks</span></div><p className="mb-6 text-sm text-muted-foreground">Just this listening session. Your playlists stay unchanged.</p>
        {!music.queue.length && <p className="py-8 text-sm text-muted-foreground">Use Play next or Add to queue on any track.</p>}
        <ol className="space-y-2">{music.queue.map((track, index) => <li key={`${track.post._id}-${index}`} data-replay-private={track.post.visibility !== 'public' ? '' : undefined} className={cn('flex items-center gap-3 rounded p-2', index === music.currentIndex ? 'bg-brand-muted' : 'hover:bg-elevated')}><span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span><button onClick={() => music.playQueue(index)} className={cn('min-w-0 flex-1 rounded text-left', focus)}><span className="block truncate text-sm">{title(track)}</span><span className="block truncate text-xs text-muted-foreground">{artist(track)}</span></button><Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={`Remove from queue: ${title(track)}`} onClick={() => music.remove(index)}><X className="h-4 w-4" /></Button></li>)}</ol>
      </div>}
    </section> : <>
      {view === 'playlists' && <MusicPlaylistBrowser tracks={tracks.filter(track => !track.readOnlySource)} session={session} signedIn={signedIn} change={change} />}
      {view !== 'explore' && !signedIn && !(view === 'playlists' && collectionId) ? <div className="rounded-lg border border-border bg-surface p-8"><h2 className="font-display text-2xl">A library of your own</h2><p className="mt-3 text-muted-foreground">Sign in to save music and build playlists with your web10 collections. You can explore and listen without an account.</p></div> : <>
        {view !== 'explore' && libraryError && <div role="alert" className="mb-4 text-sm text-danger">{libraryError}<Button variant="ghost" onClick={() => setLibraryVersion(v => v + 1)}>Retry library</Button></div>}
        {externalPlaylists && !collectionId ? null : view === 'playlists' && !collectionId ? <section>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-display text-2xl">Your playlists</h2><p className="mt-2 text-sm text-muted-foreground">Your web10 collections, ready to listen.</p></div><form onSubmit={newPlaylist} className="flex w-full items-end gap-2 sm:w-auto"><div className="min-w-0 flex-1"><label htmlFor="playlist-name" className="mb-2 block text-xs text-muted-foreground">New private playlist</label><input id="playlist-name" value={newName} onChange={e => setNewName(e.target.value)} maxLength={100} placeholder="Give it a name" className={cn('h-11 w-full rounded border border-border bg-surface px-3 text-sm', focus)} /></div><Button type="submit" variant="brand_subtle" className="h-11" disabled={!newName.trim() || !!busy}><Plus className="mr-2 h-4 w-4" />Create</Button></form></div>
          {!libraryReady ? <div className="h-40 animate-pulse rounded bg-elevated" /> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{filteredCollections.map(col => <button key={col.groupId} data-replay-private={col.visibility !== 'public' ? '' : undefined} className={cn('group rounded-lg border border-border bg-surface p-3 text-left hover:border-brand/40', focus)} onClick={() => change({ collection: col.groupId })}><MusicArtwork url={col.coverUrl} className="mb-3 w-full" /><h3 className="truncate text-sm font-medium">{col.name}</h3><p className="mt-1 text-xs text-muted-foreground">{col.itemCount} saved items · {col.visibility}</p></button>)}</div>}
          {libraryReady && !filteredCollections.length && !libraryError && <p className="py-8 text-sm text-muted-foreground">{q ? 'No playlists match your search.' : 'Make a playlist for a mood, a late night, or the long way home.'}</p>}
        </section> : <>
          {featured && <section className="mb-8 hidden items-center justify-between gap-4 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-brand-muted/60 via-surface to-background p-4 sm:flex sm:p-6">
            <div className="min-w-0"><p className="mb-2 text-xs font-medium uppercase tracking-widest text-brand-300">New in the mix</p><h2 className="font-display text-2xl sm:text-3xl">Set the tone.</h2><p className="mt-2 hidden text-sm text-muted-foreground sm:block">A few new tracks for your next listening session.</p><Button variant="brand" className="mt-4 h-11 gap-2" onClick={() => { music.play(tracks[0], tracks); change({ track: tracks[0].post._id || null, panel: 'player' }); }}><Play className="h-4 w-4" />Start listening</Button></div>
            <button className={cn('relative w-28 shrink-0 overflow-hidden rounded transition-transform hover:scale-105 motion-reduce:transform-none sm:w-40', focus)} aria-label={`Listen to ${title(featured)}`} onClick={() => start(featured)}><Artwork track={featured} /></button>
          </section>}
          <section aria-label="Music tracks" data-replay-private={view !== 'explore' && collectionVisibility !== 'public' ? '' : undefined}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl">{view === 'saved' ? 'Saved Music' : view === 'playlists' ? playlist.name || 'Playlist' : q ? 'Search results' : 'Fresh in your headphones'}</h2><p className="mt-1 text-xs text-muted-foreground">{query ? <>Results for <span className="text-foreground">{query}</span>. </> : null}{view === 'explore' ? 'Search covers loaded tracks, titles and artists. Load more to explore further.' : 'Playable music from this web10 collection.'}</p></div><div className="flex flex-wrap items-center gap-2">{view !== 'explore' && shareCollection && token && <Button variant="outline" className="h-11 gap-2" data-testid="music-share-playlist" onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4" />Share playlist</Button>}{filtered.length > 0 && <Button variant="brand_subtle" className="h-11 gap-2" onClick={() => { music.play(filtered[0], filtered); change({ track: filtered[0].post._id || null, panel: 'player' }); }}><Play className="h-4 w-4" />Play all</Button>}</div></div>
            {view === 'playlists' && !externalPlaylists && shareCollection && token && <Link className={cn('mb-4 inline-flex h-11 items-center gap-2 rounded text-sm text-brand-300', focus)} to={`/u/${encodeURIComponent(token.username)}/saved/${encodeURIComponent(shareCollection.groupId)}`}>Manage collection &amp; order<ArrowUpRight className="h-4 w-4" /></Link>}
            {playlist.skipped > 0 && view !== 'explore' && <p className="mb-4 text-xs text-muted-foreground">{playlist.skipped} unavailable or nonmusic items aren't shown. Your collection is unchanged.</p>}
            {(view === 'explore' ? error : playlistError) && <div role="alert" className="mb-4 rounded border border-danger/30 p-4 text-sm text-danger">{view === 'explore' ? error : playlistError}<Button variant="ghost" onClick={() => view === 'explore' ? setRefresh(v => v + 1) : setLibraryVersion(v => v + 1)}>Retry</Button></div>}
            {(view === 'explore' ? loading && !tracks.length : playlistLoading || !libraryReady) ? <div className="space-y-3" aria-label="Loading music">{[0, 1, 2, 3].map(n => <div key={n} className="h-20 animate-pulse rounded bg-elevated" />)}</div> : <div className="divide-y divide-border">{filtered.map((track, index) => <article key={musicTrackKey(track)} data-replay-private={track.post.visibility !== 'public' ? '' : undefined} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-3 sm:flex-nowrap sm:px-3', current && musicTrackKey(current) === musicTrackKey(track) ? 'bg-brand-muted/40' : 'hover:bg-surface')}>
              <button data-testid="music-track-card" aria-label={`Play ${title(track)}`} onClick={() => start(track)} className={cn('flex min-w-0 flex-1 items-center gap-3 rounded text-left sm:gap-4', focus)}><span className="hidden w-5 text-center text-xs tabular-nums text-muted-foreground sm:block">{current && musicTrackKey(current) === musicTrackKey(track) && music.isPlaying ? <Pause className="h-4 w-4 text-brand-300" /> : index + 1}</span><Artwork track={track} className="w-12" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title(track)}</span><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><span className="truncate">{artist(track)}</span><span className="shrink-0 tabular-nums">· {time(track.media.duration_seconds || 0)}</span></span></span></button>{actions(track)}
            </article>)}</div>}
            {!loading && !playlistLoading && (view === 'explore' || libraryReady) && !filtered.length && !(view === 'explore' ? error : playlistError || libraryError) && <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center"><Music className="mx-auto mb-3 h-8 w-8 text-brand-300" strokeWidth={1} /><p className="text-sm text-muted-foreground">{q ? 'No tracks match your search.' : view === 'saved' ? 'Your favorites start here. Save a track to add it to Saved Music.' : view === 'playlists' ? 'No playable music in this collection yet. Add a track from Explore.' : 'No music yet. Be the first to share a track.'}</p></div>}
            {view === 'explore' && hasMore && <div className="mt-6 text-center"><Button variant="outline" className="h-11" disabled={loading} onClick={loadMore}>{loading ? 'Loading music...' : 'Explore more music'}</Button></div>}
          </section>
        </>}
      </>}
    </>}
  </div>;
}

function MusicComments({ track, signedIn, highlightedCommentId }: { track: MusicTrack; signedIn: boolean; highlightedCommentId?: string }) {
  const [count, setCount] = useState(track.post.comments || 0);
  const navigate = useNavigate();
  if (track.readOnlySource) return <p className="px-4 text-sm text-muted-foreground">Read-only source. Comments are not connected to this server; no request was sent to your home node.</p>;
  return <CommentThread postId={track.post._id!} isOpen count={count} onCountChange={setCount} groups={track.post.groups?.length ? track.post.groups : undefined} postAuthor={track.post.author_username} readOnly={!signedIn} highlightedCommentId={highlightedCommentId} onAuthorClick={username => navigate(`/u/${encodeURIComponent(username)}`)} />;
}
