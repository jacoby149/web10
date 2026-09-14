import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart, ThumbsDown, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommentThread } from './CommentThread';
import type { ReactionKind } from '@/data/reactions';

/**
 * The shared engagement row (post-actions.md): the like/dislike pair, the
 * comment entry, and the counts. No surface owns the engagement row — every
 * surface composes this.
 *
 * Controlled component: the surface owns the state (liked / disliked /
 * counts) and reports intent back via onToggleReaction / onCommentCountChange.
 * The fiddly bits live once here — the optimistic heart-burst, the count
 * formatting, the thread mount.
 *
 * Axes (post-actions.md):
 *   like    — 'interactive' | 'display' | 'none'   (default 'interactive')
 *   dislike — 'interactive' | 'display' | 'none'   (default 'none')
 *   comments— 'inline' | 'none'                    (default 'inline')
 *   layout  — 'row' | 'bar' | 'bare'               (default 'row')
 *
 * `bare` renders just the slots with no container chrome — for surfaces that
 * provide their own bar (Discover's engagement row keeps its repost/share
 * slots in the same flex container).
 *
 * The like shows the like count. The dislike is tappable but its count stays
 * off the bar (the author sees it as a D69 nudge, not a public tally).
 */

export type PostActionMode = 'interactive' | 'display' | 'none';

interface PostActionsProps {
  postId: string;
  liked: boolean;
  disliked: boolean;
  /** The like count (the heart's number). */
  reactionCount: number;
  /** The comment count (seed — the thread's live count wins once open). */
  commentCount: number;
  /** The surface's reaction writer (optimistic + rollback on the surface). */
  onToggleReaction?: (kind: ReactionKind) => void;
  like?: PostActionMode;
  dislike?: PostActionMode;
  comments?: 'inline' | 'none';
  layout?: 'row' | 'bar' | 'bare';
  /** The post author's username (the comment nudge target). */
  postAuthor?: string;
  /** The post service (default 'posts'). */
  postService?: string;
  /** The group the post lives in (group posts — reactions + comments attach
   *  to the group, not the discover board). */
  groups?: string[];
  /** Called when the thread's live comment count changes. */
  onCommentCountChange?: (n: number) => void;
  /** Deep-link anchor: auto-open + scroll to this comment. */
  highlightedCommentId?: string;
  /** Start with the thread open (the lightbox's ?comment= deep link). */
  defaultOpen?: boolean;
  /** Extra bar slots the surface owns (Discover's repost/share signal),
   *  rendered after the shared slots in the bar. */
  trailing?: ReactNode;
  testId?: string;
}

export function PostActions({
  postId,
  liked,
  disliked,
  reactionCount,
  commentCount,
  onToggleReaction,
  like = 'interactive',
  dislike = 'none',
  comments = 'inline',
  layout = 'row',
  postAuthor,
  postService = 'posts',
  groups,
  onCommentCountChange,
  highlightedCommentId,
  defaultOpen = false,
  trailing,
  testId = 'post-actions',
}: PostActionsProps) {
  // The heart-burst: re-key the button when the like is added (the feed's
  // existing pattern — the prevLiked ref fires the burst exactly once per
  // like, not on every re-render).
  const [burstKey, setBurstKey] = useState(0);
  const prevLiked = useRef(liked);
  useEffect(() => {
    if (liked && !prevLiked.current) setBurstKey((k) => k + 1);
    prevLiked.current = liked;
  }, [liked]);

  // Comment state: the thread owns its live count once open; the prop is the
  // seed. The open/closed state is local (the surfaces all did this).
  const [commentsOpen, setCommentsOpen] = useState(defaultOpen);
  const [localCommentCount, setLocalCommentCount] = useState(commentCount);
  useEffect(() => {
    // Re-seed when the surface's count changes (e.g. a feed re-read) and the
    // thread is closed (an open thread's live count wins).
    if (!commentsOpen) setLocalCommentCount(commentCount);
  }, [commentCount, commentsOpen]);

  const handleCommentCountChange = (n: number) => {
    setLocalCommentCount(n);
    onCommentCountChange?.(n);
  };

  const showLike = like !== 'none';
  const showComments = comments === 'inline';

  const likeButton = like === 'interactive' && (
    <button
      key={burstKey}
      type="button"
      data-testid="like-button"
      aria-pressed={liked}
      aria-label={`Like, ${reactionCount} likes`}
      onClick={(e) => { e.stopPropagation(); onToggleReaction?.('like'); }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm transition-all duration-150',
        liked
          ? 'text-danger'
          : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80',
        liked && 'animate-heart-burst',
      )}
    >
      <Heart
        className={cn(
          'w-[18px] h-[18px] transition-all duration-150',
          liked && 'drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]',
        )}
        strokeWidth={1.75}
        fill={liked ? 'currentColor' : 'none'}
      />
      <span className="tabular-nums">{reactionCount || ''}</span>
    </button>
  );

  const likeDisplay = like === 'display' && (
    <span
      className="flex items-center gap-1.5 text-muted-foreground"
      aria-label={`${reactionCount} likes`}
    >
      <Heart className="h-4 w-4" strokeWidth={1.5} />
      <span className="text-xs tabular-nums">{reactionCount}</span>
    </span>
  );

  const dislikeButton = dislike === 'interactive' && (
    <button
      type="button"
      data-testid="dislike-button"
      aria-pressed={disliked}
      aria-label="Dislike"
      onClick={(e) => { e.stopPropagation(); onToggleReaction?.('dislike'); }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm transition-all duration-150',
        disliked
          ? 'text-muted-foreground bg-elevated'
          : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80',
      )}
    >
      <ThumbsDown
        className={cn(
          'w-[18px] h-[18px] transition-all duration-150',
          disliked && 'scale-110',
        )}
        strokeWidth={1.75}
        fill={disliked ? 'currentColor' : 'none'}
      />
    </button>
  );

  // display mode renders no dislike slot — the like count is the signal on a
  // read-only bar, and a thumb with no count would be a dead affordance
  // (design.md: "no dead anything"). The dislike count stays off the bar
  // everywhere (post-actions.md): the author sees it as a D69 nudge, not a tally.

  const commentButton = showComments && (
    <button
      type="button"
      data-testid="comment-button"
      aria-expanded={commentsOpen}
      aria-label={`${localCommentCount} comments${commentsOpen ? ', hide' : ', show'}`}
      onClick={(e) => { e.stopPropagation(); setCommentsOpen((o) => !o); }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm transition-all duration-150',
        commentsOpen
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80',
      )}
    >
      <MessageCircle className="w-[18px] h-[18px]" strokeWidth={1.75} />
      <span className="tabular-nums">{localCommentCount || ''}</span>
    </button>
  );

  const bar = (
    <>
      {showLike && (likeButton || likeDisplay)}
      {dislikeButton}
      {commentButton}
      {trailing}
    </>
  );

  const thread = showComments && (
    <CommentThread
      postId={postId}
      isOpen={commentsOpen}
      count={localCommentCount}
      onCountChange={handleCommentCountChange}
      postAuthor={postAuthor}
      postService={postService}
      highlightedCommentId={highlightedCommentId}
      groups={groups}
    />
  );

  // `bare` renders just the slots (display:contents — they join the parent's
  // flex row) and NO thread: the surface places the thread itself (Discover's
  // bar shares its row with repost/share slots, so the thread can't be a
  // sibling of the slots). row/bar render the thread right after the bar.
  if (layout === 'bare') {
    return <div data-testid={testId} className="contents">{bar}</div>;
  }

  return (
    <div data-testid={testId}>
      {layout === 'row' ? (
        <div className="flex items-center gap-1 px-2 py-2">{bar}</div>
      ) : (
        <div className="mt-3 flex items-center gap-6 border-t border-border pt-3">{bar}</div>
      )}
      {thread}
    </div>
  );
}
