import { useEffect, useRef, useState } from 'react';
import { PostActions } from '@/components/Feed/PostActions';
import { Button } from '@/components/ui/button';
import { getWapi, readReactions, toggleReactionKind, type MusicTrack, type ReactionKind } from '@/data';
import { matchesActingAuthor, useActingAuthor } from '@/data/actingIdentity';

export default function MusicReactions({ track, signedIn }: { track: MusicTrack; signedIn: boolean }) {
  const actor = useActingAuthor();
  const token = getWapi().readToken();
  const scope = JSON.stringify([token?.provider, token?.username, token?.expires, actor, track.post._id, track.post.groups]);
  const live = useRef(scope); live.current = scope;
  const epoch = useRef(0);
  const pending = useRef(false);
  const [state, setState] = useState({ liked: false, disliked: false, likes: 0, dislikes: 0 });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const version = ++epoch.current;
    pending.current = false; setBusy(false); setReady(false); setError('');
    setState({ liked: false, disliked: false, likes: 0, dislikes: 0 });
    console.log('[music] reactions read start');
    readReactions(track.post._id!, undefined, track.post.groups?.length ? track.post.groups : undefined).then(rows => {
      if (version !== epoch.current || live.current !== scope) return;
      const mine = rows.filter(row => matchesActingAuthor(row.author_key || row.author_username, token?.username || '', actor));
      setState({ liked: mine.some(row => row.type === 'like'), disliked: mine.some(row => row.type === 'dislike'), likes: rows.filter(row => row.type === 'like').length, dislikes: rows.filter(row => row.type === 'dislike').length });
      setReady(true); console.log('[music] reactions read complete', { count: rows.length });
    }).catch(() => { if (version === epoch.current && live.current === scope) setError('Reactions could not be loaded.'); });
    return () => { epoch.current++; };
  }, [scope, retry]);

  async function toggle(kind: ReactionKind) {
    if (!signedIn || !ready || pending.current) return;
    pending.current = true;
    setBusy(true);
    const version = epoch.current;
    const before = state;
    const next = kind === 'like' ? !state.liked : !state.disliked;
    const liked = kind === 'like' && next, disliked = kind === 'dislike' && next;
    setState({ liked, disliked, likes: Math.max(0, state.likes + Number(liked) - Number(state.liked)), dislikes: Math.max(0, state.dislikes + Number(disliked) - Number(state.disliked)) });
    setError(''); console.log('[music] reaction mutation start', { kind });
    try {
      const assertCurrent = () => { if (version !== epoch.current || live.current !== scope) throw new Error('Music reaction scope changed'); };
      const result = await toggleReactionKind(track.post._id!, kind, track.post.groups?.length ? track.post.groups : undefined, 'posts', assertCurrent);
      assertCurrent();
      const resultLiked = result === 'like', resultDisliked = result === 'dislike';
      setState({ liked: resultLiked, disliked: resultDisliked, likes: Math.max(0, before.likes + Number(resultLiked) - Number(before.liked)), dislikes: Math.max(0, before.dislikes + Number(resultDisliked) - Number(before.disliked)) });
      if (version === epoch.current && live.current === scope) console.log('[music] reaction mutation complete');
    } catch {
      if (version === epoch.current && live.current === scope) { setState(before); setError('Reaction could not be saved. Try again.'); }
    } finally { if (version === epoch.current && live.current === scope) { pending.current = false; setBusy(false); } }
  }
  return <div data-testid="music-reactions" aria-busy={busy || (!ready && !error)}>
    {ready ? <fieldset disabled={busy} className="flex items-center gap-1 border-0 p-0 disabled:opacity-60 [&_button]:min-h-11 [&_button]:min-w-11">
    <PostActions postId={track.post._id!} liked={state.liked} disliked={state.disliked} reactionCount={state.likes} dislikeCount={state.dislikes} commentCount={0} comments="none" layout="bare" like={signedIn && ready ? 'interactive' : 'display'} dislike={signedIn && ready ? 'interactive' : 'display'} onToggleReaction={toggle} />
    </fieldset> : !error ? <div aria-label="Loading reactions" className="h-11 w-28 animate-pulse rounded bg-elevated" /> : null}
    {error && <p role="alert" className="text-xs text-danger">{error}{!ready && <Button variant="ghost" className="h-11" onClick={() => setRetry(n => n + 1)}>Retry reactions</Button>}</p>}
  </div>;
}
