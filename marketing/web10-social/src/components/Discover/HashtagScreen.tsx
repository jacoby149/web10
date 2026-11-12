import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Hash, Plus } from 'lucide-react';
import { HASHTAG_VALID, normalizeHashtag } from '@web10/discover/hashtags';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PostCard } from '@/components/Feed/FeedScreen';
import { AttachedAd } from '@/components/Feed/AttachedAd';
import { useComposer } from '@/context/ComposerContext';
import { useRepost } from '@/context/RepostContext';
import { useActingAuthor, getActingAuthor, matchesActingAuthor } from '@/data/actingIdentity';
import { getWapi } from '@/data/wapi';
import { readHashtagBoard } from '@/data/hashtags';
import { readFeedReactions, type FeedCursor } from '@/data/feed';
import { toggleReactionKind } from '@/data';
import { fromResolvedMediaRef, type PostRecord } from '@/data/types';
import { toast, errorMessage } from '@/components/shared/Toast';

const LOG = (...args: unknown[]) => console.log('[social:hashtag]', ...args);
type Reactions = Awaited<ReturnType<typeof readFeedReactions>>;
const emptyReactions = (): Reactions => ({ liked: {}, disliked: {}, reposted: {} });

export default function HashtagScreen({ onLogin }: { onLogin?: () => void }) {
  const { hashtag = '' } = useParams();
  const tag = normalizeHashtag(hashtag);
  if (!HASHTAG_VALID.test(tag)) return <section className="mx-auto max-w-2xl px-4 py-16 text-center" data-testid="hashtag-invalid">
    <Hash className="mx-auto mb-4 h-8 w-8 text-brand-300" />
    <h1 className="font-display text-2xl text-foreground">That isn’t a hashtag</h1>
    <p className="mt-2 text-sm text-muted-foreground">Use 1–30 letters, numbers or underscores.</p>
    <Link to="/hot-gossip" className="mt-6 inline-flex min-h-11 items-center text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring">Explore posts</Link>
  </section>;
  if (hashtag !== tag) return <Navigate to={`/tag/${tag}`} replace />;
  return <HashtagBoard key={tag} tag={tag} onLogin={onLogin} />;
}

function HashtagBoard({ tag, onLogin }: { tag: string; onLogin?: () => void }) {
  const navigate = useNavigate();
  const { openComposer } = useComposer();
  const { setRepostingTo } = useRepost();
  const identity = useActingAuthor();
  const credential = JSON.stringify(getWapi().readToken() || null);
  const signedIn = !!getWapi().readToken();
  // Each route/identity/read owns its callbacks. Late pages and mutations may
  // never repopulate a different topic or overwrite a newer refresh.
  const owner = `${tag}:${identity}:${credential}`;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const generation = useRef(0);
  const busy = useRef(false);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [reactions, setReactions] = useState<Reactions>(emptyReactions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursor = useRef<FeedCursor | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const pendingReactions = useRef(new Set<string>());
  const changedReactions = useRef(new Set<string>());

  const load = useCallback(async (append = false) => {
    if (append && busy.current) return;
    const request = append ? generation.current : ++generation.current;
    const current = () => request === generation.current && ownerRef.current === owner &&
      getActingAuthor() === identity && JSON.stringify(getWapi().readToken() || null) === credential;
    busy.current = true;
    setLoading(true);
    setError(false);
    if (!append) { setPosts([]); setReactions(emptyReactions()); changedReactions.current.clear(); cursor.current = null; setHasMore(false); }
    LOG('page start', { append });
    try {
      const page = await readHashtagBoard(tag, { cursor: append ? cursor.current : null, isCurrent: current });
      if (!current()) return;
      LOG('page complete', { count: page.posts.length, more: page.has_more });
      cursor.current = page.next_cursor;
      setHasMore(page.has_more);
      setPosts(previous => append ? [...previous, ...page.posts.filter(post => !previous.some(old => old._id === post._id && old.author_key === post.author_key))] : page.posts);
      // Content is already render-ready; personal fills must not block paint.
      if (signedIn) {
        const fills = await readFeedReactions(page.posts.map(post => post._id || '').filter(Boolean));
        if (!current()) return;
        setReactions(previous => {
          const next = { liked: { ...previous.liked }, disliked: { ...previous.disliked }, reposted: { ...previous.reposted } };
          for (const post of page.posts) {
            const id = post._id || '';
            if (changedReactions.current.has(id)) continue;
            for (const kind of ['liked', 'disliked', 'reposted'] as const) next[kind][id] = !!fills[kind][id];
          }
          return next;
        });
      }
    } catch (failure) {
      if (current()) { console.error('[social:hashtag] page failed', failure); setError(true); }
    } finally {
      if (current()) { busy.current = false; setLoading(false); }
    }
  }, [owner, tag, identity, credential, signedIn]);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('post-created', refresh);
    return () => { generation.current++; busy.current = false; window.removeEventListener('post-created', refresh); };
  }, [load]);
  useEffect(() => {
    if (!hasMore || loading || error || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) void load(true); }, { rootMargin: '200px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, error, load]);

  async function react(post: PostRecord, kind: 'like' | 'dislike') {
    if (!signedIn) { onLogin?.(); return; }
    const id = post._id || '';
    if (pendingReactions.current.has(id)) return;
    pendingReactions.current.add(id);
    changedReactions.current.add(id);
    const request = generation.current;
    const current = () => request === generation.current && ownerRef.current === owner &&
      getActingAuthor() === identity && JSON.stringify(getWapi().readToken() || null) === credential;
    const before = { liked: !!reactions.liked[id], disliked: !!reactions.disliked[id] };
    const after = { liked: kind === 'like' && !before.liked, disliked: kind === 'dislike' && !before.disliked };
    const delta = { likes: Number(after.liked) - Number(before.liked), dislikes: Number(after.disliked) - Number(before.disliked) };
    const counts = (direction: number) => setPosts(previous => previous.map(row => row._id === id ? { ...row,
      likes: Math.max(0, (row.likes || 0) + direction * delta.likes), dislikes: Math.max(0, (row.dislikes || 0) + direction * delta.dislikes) } : row));
    const flags = (value: typeof before) => setReactions(previous => ({ ...previous, liked: { ...previous.liked, [id]: value.liked }, disliked: { ...previous.disliked, [id]: value.disliked } }));
    flags(after); counts(1);
    LOG('reaction start', { kind });
    try { await toggleReactionKind(id, kind); LOG('reaction complete'); }
    catch (failure) { if (current()) { flags(before); counts(-1); toast.error(errorMessage(failure, 'Could not update your reaction.')); } }
    finally { pendingReactions.current.delete(id); }
  }

  return <section className="mx-auto w-full max-w-2xl pb-8" data-testid="hashtag-screen">
    <header className="border-b border-border px-4 py-6">
      <Link to="/hot-gossip" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" />Explore posts</Link>
      <div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand-300"><Hash className="h-6 w-6" /></span>
        <div className="min-w-0"><h1 className="break-words font-display text-2xl font-semibold text-foreground">#{tag}</h1><p className="mt-1 text-sm text-muted-foreground">Public posts · Newest first</p></div></div>
    </header>
    {posts.flatMap(post => {
      const id = post._id || '';
      const authorName = post.group_identity?.name || post.profile?.display_name || post.author_username || 'Creator';
      return [<PostCard key={`${post.author_key}:${id}`} post={post} authorName={authorName}
        authorUsername={post.author_username} authorProvider={post.author_provider} authorAvatar={post.avatar_url}
        mediaItems={(post.media_refs || []).filter(ref => typeof ref !== 'string').map(fromResolvedMediaRef)}
        reactionCount={post.likes || 0} dislikeCount={post.dislikes || 0} commentCount={post.comments || 0}
        repostCount={post.reposts || 0} impressions={post.impressions || 0} reach={post.reach || 0}
        liked={!!reactions.liked[id]} disliked={!!reactions.disliked[id]} reposted={!!reactions.reposted[id]}
        timestamp={post.created_at} signedIn={signedIn}
        isOwnPost={signedIn && matchesActingAuthor(post.author_key || post.author_username, getWapi().readToken()!.username, identity || null)}
        onToggleReaction={kind => { void react(post, kind); }}
        onToggleRepost={() => { if (!signedIn) { onLogin?.(); return; } setRepostingTo(post); openComposer(); }}
        onAuthorClick={username => navigate(`/u/${encodeURIComponent(username)}`)}
        onCommentCountChange={count => setPosts(previous => previous.map(row => row === post ? { ...row, comments: count } : row))}
        onPostUpdated={() => { void load(); }} surface="hashtag" testId="hashtag-card" />,
        ...[post.ad, post.node_ad].filter(ad => ad?.format === 'post').map((ad, index) => <AttachedAd key={`${id}:ad:${index}`} ad={ad!} standalone />)];
    })}
    {loading && <div className="space-y-4 border-b border-border p-4" data-testid="hashtag-loading" aria-label="Loading posts"><Skeleton className="h-9 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-4 w-2/3" /></div>}
    {error && <div className="m-4 rounded-lg border border-border bg-card p-6 text-center" role="alert"><h2 className="font-semibold text-foreground">Couldn’t load these posts</h2><p className="mt-2 text-sm text-muted-foreground">Your place is saved. Give it another try.</p><Button className="mt-4 min-h-11" variant="outline" onClick={() => { void load(posts.length > 0); }}>Try again</Button></div>}
    {!loading && !error && !posts.length && <div className="px-6 py-16 text-center" data-testid="hashtag-empty"><Hash className="mx-auto mb-4 h-10 w-10 text-brand-300" /><h2 className="break-words font-display text-xl font-semibold text-foreground">Nothing under #{tag} yet</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Every topic starts with one post. Make this one yours.</p><Button variant="brand" className="mt-6 min-h-11 max-w-full gap-2" onClick={() => { if (signedIn) openComposer({ draftText: `#${tag} ` }); else onLogin?.(); }}><Plus className="h-4 w-4 shrink-0" /><span className="truncate">{signedIn ? `Post with #${tag}` : 'Log in to post'}</span></Button></div>}
    {hasMore && <div ref={sentinel} data-testid="hashtag-sentinel" className="flex justify-center p-4"><Button variant="outline" className="min-h-11" disabled={loading} onClick={() => { void load(true); }}>Load more posts</Button></div>}
  </section>;
}
