import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readUserPublicCollections, readGroupPublicCollections, readPlaylistBookmarks, readPlaylistBookmarkName, setPlaylistBookmarked, type MusicTrack, type CollectionRecord } from '@/data';
import { musicArtist } from '@/data/musicTrack';
import MusicArtwork from './MusicArtwork';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
type Change = (values: Record<string, string | null>, replace?: boolean) => void;
export default function MusicPlaylistBrowser({ tracks, session, signedIn, change }: { tracks: MusicTrack[]; session: string; signedIn: boolean; change: Change }) {
  const [params] = useSearchParams();
  const scope = params.get('scope') || 'own';
  const curator = params.get('curator') || '';
  const collectionId = params.get('collection') || '';
  const [username, setUsername] = useState(curator.includes('/groups/') ? '' : curator);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookmarkError, setBookmarkError] = useState('');
  const [bookmarkReady, setBookmarkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const epoch = useRef(0);
  const live = useRef(session); live.current = session;
  const mutation = useRef(false);
  const curators = [...new Map(tracks.map(track => [track.post.author_key?.includes('/groups/') ? track.post.author_key : track.post.author_username || '', musicArtist(track)])).entries()].filter(([id]) => id);

  useEffect(() => { setUsername(curator.includes('/groups/') ? '' : curator); }, [curator]);
  useEffect(() => {
    epoch.current++; mutation.current = false; setBusy(false);
    return () => { epoch.current++; };
  }, [session]);
  useEffect(() => {
    let cancelled = false;
    setBookmarks([]); setNames({}); setBookmarkReady(false); setBookmarkError('');
    if (!signedIn || scope === 'own') return;
    readPlaylistBookmarks().then(async rows => {
      if (cancelled || live.current !== session) return;
      setBookmarks(rows.map(row => row.collectionId)); setBookmarkReady(true);
      // Sequential resolution bounds actual outstanding reads to one.
      for (const row of rows) {
        if (cancelled || live.current !== session) return;
        let name: string | null = null;
        try { name = await readPlaylistBookmarkName(row.collectionId); } catch { /* unreadable/outage: no copied metadata */ }
        if (cancelled || live.current !== session) return;
        setNames(previous => ({ ...previous, [row.collectionId]: name }));
      }
    }).catch(() => { if (!cancelled && live.current === session) setBookmarkError('Saved playlists could not be loaded.'); });
    return () => { cancelled = true; };
  }, [session, signedIn, version, scope]);
  useEffect(() => {
    let cancelled = false;
    setCollections([]); setError(''); setLoading(false);
    if (scope !== 'browse' || !curator || collectionId) return;
    setLoading(true); console.log('[music] curator playlists read start');
    const read = curator.includes('/groups/') ? readGroupPublicCollections(curator) : readUserPublicCollections(curator);
    read.then(rows => {
      if (!cancelled && live.current === session) { setCollections(rows.filter(row => row.visibility === 'public')); console.log('[music] curator playlists read complete', { count: rows.length }); }
    }).catch(() => { if (!cancelled && live.current === session) setError('Public playlists could not be loaded.'); })
      .finally(() => { if (!cancelled && live.current === session) setLoading(false); });
    return () => { cancelled = true; };
  }, [curator, scope, collectionId, session, version]);

  async function bookmark(id: string, saved: boolean) {
    if (!signedIn || !bookmarkReady || mutation.current) return;
    const captured = epoch.current;
    const assertCurrent = () => { if (epoch.current !== captured || live.current !== session) throw new Error('Music session changed'); };
    mutation.current = true; setBusy(true); setBookmarkError('');
    try {
      await setPlaylistBookmarked(id, saved, assertCurrent); assertCurrent();
      setVersion(n => n + 1);
    } catch { if (epoch.current === captured && live.current === session) setBookmarkError('Playlist could not be saved or removed. Try again.'); }
    finally { if (epoch.current === captured && live.current === session) { mutation.current = false; setBusy(false); } }
  }
  const selectedName = curators.find(([id]) => id === curator)?.[1] || curator;
  const own = scope === 'own';
  return <section aria-label="Playlist library" className="mb-6">
    <nav aria-label="Playlist views" className="mb-4 flex flex-wrap gap-2">
      {[['own', 'Your playlists', 'Yours'], ['browse', 'Browse playlists', 'Browse'], ['bookmarks', 'Saved playlists', 'Saved']].map(([key, label, short]) => <Button key={key} aria-label={label} variant={scope === key ? 'brand_subtle' : 'ghost'} className="h-11" aria-current={scope === key ? 'page' : undefined} onClick={() => change({ scope: key === 'own' ? null : key, collection: null, curator: null })}><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></Button>)}
    </nav>
    {bookmarkError && !own && <p role="alert" className="mb-4 text-sm text-danger">{bookmarkError}<Button variant="ghost" className="h-11" onClick={() => setVersion(n => n + 1)}>Retry saved playlists</Button></p>}
    {!own && collectionId ? <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" className="h-11" onClick={() => change({ collection: null })}>Back to playlists</Button>
      {signedIn ? <Button variant="outline" className="h-11 gap-2" disabled={busy || !bookmarkReady} onClick={() => bookmark(collectionId, !bookmarks.includes(collectionId))}><Bookmark className="h-4 w-4" />{bookmarks.includes(collectionId) ? 'Remove saved playlist' : 'Save playlist'}</Button> : <p className="text-sm text-muted-foreground">Sign in to save this playlist.</p>}
      <p className="text-xs text-muted-foreground">A live bookmark, not a copy. The curator keeps control.</p>
    </div> : scope === 'browse' ? <>
      <h2 className="font-display text-2xl">Find your next curator</h2>
      <p className="mt-2 text-sm text-muted-foreground">Public collections from artists on this Music page, or an exact username.</p>
      <form className="my-4 flex max-w-md items-end gap-2" onSubmit={event => { event.preventDefault(); if (username.trim()) change({ curator: username.trim().replace(/^@/, ''), collection: null }); }}>
        <div className="min-w-0 flex-1"><label htmlFor="playlist-curator" className="mb-2 block text-xs text-muted-foreground">Curator username</label><input id="playlist-curator" maxLength={100} value={username} onChange={event => setUsername(event.target.value)} placeholder="@username" className={`h-11 w-full rounded border border-border bg-surface px-3 text-sm ${focus}`} /></div>
        <Button type="submit" variant="outline" className="h-11 gap-2" disabled={!username.trim()}><Search className="h-4 w-4" />Browse</Button>
      </form>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">{curators.map(([id, name]) => <Button key={id} variant={curator === id ? 'brand_subtle' : 'ghost'} className="h-11 max-w-full shrink-0 gap-2" onClick={() => change({ curator: id, collection: null })}><Users className="h-4 w-4 shrink-0" /><span className="truncate">{name}</span></Button>)}</div>
      {curator && <h3 className="mb-4 break-words text-sm text-muted-foreground">Public playlists · {selectedName}</h3>}
      {error && <p role="alert" className="text-sm text-danger">{error}<Button variant="ghost" className="h-11" onClick={() => setVersion(n => n + 1)}>Retry public playlists</Button></p>}
      {loading ? <div aria-label="Loading public playlists" className="h-40 animate-pulse rounded bg-elevated" /> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{collections.map(col => <button key={col.groupId} onClick={() => change({ collection: col.groupId })} className={`min-w-0 rounded-lg border border-border bg-surface p-3 text-left hover:border-brand/40 ${focus}`}><MusicArtwork url={col.coverUrl} className="mb-3 w-full" /><span className="block truncate text-sm font-medium">{col.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{selectedName} · {col.itemCount} saved items</span></button>)}</div>}
      {!loading && !error && curator && !collections.length && <p className="py-8 text-sm text-muted-foreground">No public playlists here yet. Try another curator.</p>}
      {!curator && <p className="py-8 text-sm text-muted-foreground">Choose an artist above or enter a username to explore their public playlists.</p>}
    </> : scope === 'bookmarks' ? <>
      <h2 className="font-display text-2xl">Saved playlists</h2><p className="my-3 text-sm text-muted-foreground">Their latest selections, in your library. Songs are checked for access each time.</p>
      {!signedIn ? <p className="py-6 text-muted-foreground">Sign in to keep playlists in your library.</p> : !bookmarkReady && !bookmarkError ? <div className="h-40 animate-pulse rounded bg-elevated" /> : <ul className="divide-y divide-border">{bookmarks.map(id => <li key={id} className="flex items-center gap-3 py-3"><button className={`min-w-0 flex-1 rounded text-left ${focus}`} onClick={() => change({ collection: id })}><span className="block truncate text-sm">{names[id] === undefined ? 'Loading playlist…' : names[id] || 'Unavailable playlist'}</span><span className="block truncate text-xs text-muted-foreground">{id.split('/groups/')[1]?.replace(/^users\//, '')}</span></button><Button variant="ghost" className="h-11 shrink-0" disabled={busy} onClick={() => bookmark(id, false)}>Remove</Button></li>)}</ul>}
      {signedIn && bookmarkReady && !bookmarks.length && <p className="py-8 text-sm text-muted-foreground">Find a curator you trust, then save a playlist here.</p>}
    </> : null}
    {!own && curator && collectionId && <Link className="mt-3 inline-flex min-h-11 items-center break-all text-sm text-brand-300" to={curator.includes('/groups/') ? `/groups/${encodeURIComponent(curator)}` : `/u/${encodeURIComponent(curator)}`}>Curated by {selectedName}</Link>}
  </section>;
}
