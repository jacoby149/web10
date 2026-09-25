import { useEffect, useRef, useState } from 'react';
import {
  countComments,
  readReactions,
  toggleReactionKind,
  readRepostCounts,
  readMyRepostedIds,
  getDiscoverGroupId,
  type ReactionKind,
} from '@/data';
import { getWapi } from '@/data/wapi';
import {
  fromResolvedMediaRef,
  type MediaRecord,
  type PostRecord,
} from '@/data/types';
import { PostCard } from '@/components/Feed/FeedScreen';
import { useRepost } from '@/context/RepostContext';
import { toast, errorMessage } from '@/components/shared/Toast';

const LOG = (...args: unknown[]) => console.log('[social:profile-feed]', ...args);

interface ProfileFeedProps {
  posts: PostRecord[];
  mediaMap: Record<string, MediaRecord>;
  authorName: string;
  authorUsername?: string;
  authorProvider?: string;
  authorAvatar?: string;
  isOwnProfile?: boolean;
  onPostUpdated?: () => void;
  /** The author-click handler (in-app profile navigation) — a comment's author
   *  is a tappable profile link. */
  onAuthorClick?: (username: string, provider?: string) => void;
}

// The profile's facebook-shaped feed view (the "view lenses" idea — rendering
// only, never ranking): the profile's posts as a vertical stream of the feed's
// own PostCard (text + media + the shared engagement bar), instead of the
// insta-shaped 3-column grid. The data is the same `posts` the grid renders —
// the lens only changes the rendering.
//
// Engagement (like counts + the reader's own reaction) is not in the profile
// read, so it is loaded per post here (isolated — one bad read degrades that
// card to zero, never the whole view), the feed's optimistic-toggle pattern.
export function ProfileFeed({
  posts,
  mediaMap,
  authorName,
  authorUsername,
  authorProvider,
  authorAvatar,
  isOwnProfile = false,
  onPostUpdated,
  onAuthorClick,
}: ProfileFeedProps) {
  const [likeMap, setLikeMap] = useState<Record<string, number>>({});
  const [dislikeCountMap, setDislikeCountMap] = useState<Record<string, number>>({});
  const [repostCountMap, setRepostCountMap] = useState<Record<string, number>>({});
  const [commentMap, setCommentMap] = useState<Record<string, number>>({});
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [dislikedMap, setDislikedMap] = useState<Record<string, boolean>>({});
  const [repostedMap, setRepostedMap] = useState<Record<string, boolean>>({});
  const [engagementReady, setEngagementReady] = useState(false);
  // Re-key the engagement read when the post set changes (a new post after an
  // edit/delete, a profile switch) — without re-reading on every mediaMap
  // update (media resolution lands after the posts).
  const postsKey = posts.map((p) => p._id || '').join('|');
  const token = getWapi().readToken();
  const tokenUsername = token?.username;

  useEffect(() => {
    let cancelled = false;
    if (!posts.length) {
      setEngagementReady(true);
      return;
    }
    LOG('load engagement for', posts.length, 'posts');
    (async () => {
      // Repost (reposts.md: a repost is a POST, not a reaction). The count is
      // the number of `repost_of` posts (readRepostCounts, the feed query's
      // I3-scoped join lifted to a surface read) and the "I reposted this"
      // fill is the reader's own repost post (readMyRepostedIds, the
      // readFeedReactions own-post read lifted to a surface read). Batched
      // once for the whole profile, not per post. The legacy `type:'repost'`
      // reaction still fills for old data (a read-only fallback).
      const ids = posts.map((p) => p._id || '').filter(Boolean);
      const [repostCounts, myReposts] = await Promise.all([
        readRepostCounts(ids, [getDiscoverGroupId()]),
        readMyRepostedIds(),
      ]);
      // Per-post isolation: one rejected read degrades that card's counts to
      // zero (the feed's 3.25.x pattern), it never blanks the view.
      await Promise.all(
        posts.map(async (post) => {
          const id = post._id || '';
          if (!id) return;
          try {
            const reactions = await readReactions(id);
            if (cancelled) return;
            // Likes and dislikes are counted separately (the heart and the
            // thumb each show their own tally — post-actions.md). The repost is
            // a separate tally too (reposts.md — independent of like/dislike).
            const likeCount = reactions.filter((r) => r.type === 'like').length;
            const dislikeCount = reactions.filter((r) => r.type === 'dislike').length;
            const mine = tokenUsername
              ? reactions.find(
                  (r) => r.author_username === tokenUsername && (r.type === 'like' || r.type === 'dislike'),
                )
              : undefined;
            // The repost fill: the reader's own repost post, OR a legacy
            // `type:'repost'` reaction (old data, read-only fallback).
            const mineRepost = tokenUsername
              ? reactions.find((r) => r.author_username === tokenUsername && r.type === 'repost')
              : undefined;
            setLikeMap((prev) => ({ ...prev, [id]: likeCount }));
            setDislikeCountMap((prev) => ({ ...prev, [id]: dislikeCount }));
            setRepostCountMap((prev) => ({ ...prev, [id]: repostCounts[id] || 0 }));
            setLikedMap((prev) => ({ ...prev, [id]: mine?.type === 'like' }));
            setDislikedMap((prev) => ({ ...prev, [id]: mine?.type === 'dislike' }));
            setRepostedMap((prev) => ({ ...prev, [id]: myReposts.has(id) || !!mineRepost }));
          } catch (e) {
            console.error('[social:profile-feed] reaction read failed:', e);
          }
          try {
            const n = await countComments(id);
            if (!cancelled) setCommentMap((prev) => ({ ...prev, [id]: n }));
          } catch (e) {
            console.error('[social:profile-feed] comment count failed:', e);
          }
        }),
      );
      if (!cancelled) {
        setEngagementReady(true);
        LOG('engagement ready');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postsKey, tokenUsername]);

  // Reset the engagement maps when the post set changes (a profile switch must
  // not show the previous profile's counts on the new cards for a frame).
  const lastPostsKey = useRef(postsKey);
  if (lastPostsKey.current !== postsKey) {
    lastPostsKey.current = postsKey;
    setLikeMap({});
    setDislikeCountMap({});
    setRepostCountMap({});
    setCommentMap({});
    setLikedMap({});
    setDislikedMap({});
    setRepostedMap({});
    setEngagementReady(false);
  }

  async function handleToggleReaction(postId: string, kind: ReactionKind) {
    const wasLiked = !!likedMap[postId];
    const wasDisliked = !!dislikedMap[postId];
    const nextLiked = kind === 'like' ? !wasLiked : false;
    const nextDisliked = kind === 'dislike' ? !wasDisliked : false;
    // Per-tally delta from the CURRENT flags (a like↔dislike swap moves the
    // reaction: like -1, dislike +1) — the old single `delta` was wrong on a
    // swap (the "0 1 0 1" flicker).
    const likeDelta = (nextLiked ? 1 : 0) - (wasLiked ? 1 : 0);
    const dislikeDelta = (nextDisliked ? 1 : 0) - (wasDisliked ? 1 : 0);
    setLikedMap((prev) => ({ ...prev, [postId]: nextLiked }));
    setDislikedMap((prev) => ({ ...prev, [postId]: nextDisliked }));
    setLikeMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) + likeDelta) }));
    setDislikeCountMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) + dislikeDelta) }));
    try {
      await toggleReactionKind(postId, kind);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      toast.error(errorMessage(e, 'Could not update your reaction.'));
      setLikedMap((prev) => ({ ...prev, [postId]: wasLiked }));
      setDislikedMap((prev) => ({ ...prev, [postId]: wasDisliked }));
      setLikeMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - likeDelta) }));
      setDislikeCountMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - dislikeDelta) }));
    }
  }

  // Repost (reposts.md): a repost is a POST, not a reaction toggle. Tapping
  // the repeat icon opens the app-level composer in repost mode (the shared
  // RepostContext seam) with this post as the context. The composer's
  // createRepost is the single write; the count + fill re-derive from the
  // post-based read on the next load (onPostUpdated).
  const { setRepostingTo } = useRepost();
  function handleRepost(post: PostRecord) {
    setRepostingTo(post);
  }

  function mediaItemsFor(post: PostRecord): MediaRecord[] {
    const items: MediaRecord[] = [];
    for (const ref of post.media_refs || []) {
      if (typeof ref === 'string') {
        const m = mediaMap[ref];
        if (m) items.push(m);
      } else {
        items.push(fromResolvedMediaRef(ref));
      }
    }
    return items;
  }

  return (
    <div className="md:px-4 md:py-4" data-testid="profile-feed">
      {posts.map((post) => {
        const id = post._id || '';
        return (
          <PostCard
            key={id || post.created_at}
            post={post}
            authorName={authorName}
            authorUsername={authorUsername}
            authorProvider={authorProvider}
            authorAvatar={authorAvatar}
            mediaItems={mediaItemsFor(post)}
            reactionCount={likeMap[id] || 0}
            dislikeCount={dislikeCountMap[id] || 0}
            repostCount={repostCountMap[id] || 0}
            commentCount={commentMap[id] || 0}
            liked={!!likedMap[id]}
            disliked={!!dislikedMap[id]}
            reposted={!!repostedMap[id]}
            timestamp={post.created_at}
            onToggleReaction={(kind) => handleToggleReaction(id, kind)}
            onToggleRepost={() => handleRepost(post)}
            onCommentCountChange={(n) => setCommentMap((prev) => ({ ...prev, [id]: n }))}
            onAuthorClick={onAuthorClick}
            postAuthor={authorUsername}
            postService="public_posts"
            isOwnPost={isOwnProfile}
            onPostUpdated={onPostUpdated}
          />
        );
      })}
      {/* engagementReady is consumed by tests; the cards render immediately
          with zero counts and fill in as the per-post reads land. */}
      <span data-testid="profile-feed-engagement-ready" hidden={!engagementReady} />
    </div>
  );
}
