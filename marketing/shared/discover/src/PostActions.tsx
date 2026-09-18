import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart, ThumbsDown, MessageCircle, Repeat2 } from 'lucide-react';
import { cn } from './utils';
import { CommentThread } from './CommentThread';
import type { ReadComments, CreateComment } from './types';

/**
 * The shared engagement row (post-actions.md): the like/dislike pair, the
 * comment entry, and the counts. No surface owns the engagement row — every
 * surface composes this. Both apps' discover cards use it (D73).
 *
 * Controlled component: the surface owns the state (liked / disliked / counts)
 * and reports intent back via onToggleReaction. The fiddly bits live once here
 * — the optimistic heart-burst, the count formatting, the thread mount.
 *
 * Axes (post-actions.md):
 *   like    — 'interactive' | 'display' | 'none'   (default 'interactive')
 *   dislike — 'interactive' | 'display' | 'none'   (default 'none')
 *   comments— 'inline' | 'none'                    (default 'inline')
 *   layout  — 'row' | 'bar' | 'bare'               (default 'row')
 *
 * `remote` mode (the marketing context, no session): the like is display-only
 * (an anon visitor can't like), and the comment thread's compose becomes a
 * link-out to the post permalink. The read side (counts, the comment list) is
 * identical — "see comments on both."
 */

export type ReactionKind = 'like' | 'dislike';
export type PostActionMode = 'interactive' | 'display' | 'none';

export interface PostActionsProps {
  postId: string;
  liked: boolean;
  disliked: boolean;
  /** The like count (the heart's number). */
  reactionCount: number;
  /** The dislike count (the thumb's number) — rendered the same way the like
   *  count renders on the heart (post-actions.md: likes and dislikes are the
   *  same, each shows its own tally). */
  dislikeCount?: number;
  /** The comment count (seed — the thread's live count wins once open). */
  commentCount: number;
  /** The surface's reaction writer (optimistic + rollback on the surface). */
  onToggleReaction?: (kind: ReactionKind) => void;
  /** The surface's repost writer (optimistic + rollback on the surface). */
  onToggleRepost?: () => void;
  /** Whether the reader has reposted this post (the repeat icon fills). */
  reposted?: boolean;
  /** The repost count (the repeat icon's number). */
  repostCount?: number;
  like?: PostActionMode;
  dislike?: PostActionMode;
  /** The repost axis (reposts.md): independent of like/dislike, default none. */
  repost?: PostActionMode;
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
  // ── The comment-thread data seam (injected by the app) ────────────────────
  /** The comment reader (required when comments are inline). */
  readComments?: ReadComments;
  /** The comment writer (absent in `remote` mode). */
  createComment?: CreateComment;
  /** Remote (marketing) mode: like is display-only, compose is a link-out. */
  remote?: boolean;
  /** The post permalink the remote compose links to (web10 social). */
  remoteHref?: string;
  /** Error sink (the app wires its toast). */
  onError?: (message: string) => void;
  /** The author-click handler (in-app profile navigation) — passed to the
   *  comment thread so a comment's author is a tappable profile link. */
  onAuthorClick?: (username: string, provider?: string) => void;
  testId?: string;
}

export function PostActions({
  postId,
  liked,
  disliked,
  reactionCount,
  dislikeCount = 0,
  commentCount,
  onToggleReaction,
  onToggleRepost,
  reposted = false,
  repostCount = 0,
  like = 'interactive',
  dislike = 'none',
  repost = 'none',
  comments = 'inline',
  layout = 'row',
  postAuthor,
  postService = 'posts',
  groups,
  onCommentCountChange,
  highlightedCommentId,
  defaultOpen = false,
  trailing,
  readComments,
  createComment,
  remote = false,
  remoteHref,
  onError,
  onAuthorClick,
  testId = 'post-actions',
}: PostActionsProps) {
  // Remote (marketing) mode: an anon visitor can't like, so the like is
  // display-only (a dead tap target is worse than a count). Same for the
  // repost — an anon visitor can't repost, so it is display-only too.
  const effectiveLike: PostActionMode = remote ? 'display' : like;
  const effectiveRepost: PostActionMode = remote ? 'display' : repost;

  // The heart-burst: re-key the button when the like is added.
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
    if (!commentsOpen) setLocalCommentCount(commentCount);
  }, [commentCount, commentsOpen]);

  const handleCommentCountChange = (n: number) => {
    setLocalCommentCount(n);
    onCommentCountChange?.(n);
  };

  const showLike = effectiveLike !== 'none';
  const showComments = comments === 'inline';

  const likeButton = effectiveLike === 'interactive' && (
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

  const likeDisplay = effectiveLike === 'display' && (
    <span
      className="flex items-center gap-1.5 text-muted-foreground"
      aria-label={`${reactionCount} likes`}
    >
      <Heart className="h-4 w-4" strokeWidth={1.5} />
      <span className="text-xs tabular-nums">{reactionCount}</span>
    </span>
  );

  const dislikeButton = dislike === 'interactive' && !remote && (
    <button
      type="button"
      data-testid="dislike-button"
      aria-pressed={disliked}
      aria-label={`Dislike, ${dislikeCount} dislikes`}
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
      <span className="tabular-nums">{dislikeCount || ''}</span>
    </button>
  );

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

  // The repost (reposts.md): independent of like/dislike. Filled (brand) when
  // the reader has reposted; toggles on tap. The repeat icon is stroke-only —
  // a filled Repeat2 reads as noise, so the active state is color + a subtle
  // scale (the dislike button's idiom).
  const repostButton = effectiveRepost === 'interactive' && (
    <button
      type="button"
      data-testid="repost-button"
      aria-pressed={reposted}
      aria-label={`Repost, ${repostCount} reposts`}
      onClick={(e) => { e.stopPropagation(); onToggleRepost?.(); }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm transition-all duration-150',
        reposted
          ? 'text-brand-300'
          : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80',
      )}
    >
      <Repeat2
        className={cn(
          'w-[18px] h-[18px] transition-all duration-150',
          reposted && 'scale-110',
        )}
        strokeWidth={1.75}
      />
      <span className="tabular-nums">{repostCount || ''}</span>
    </button>
  );

  const repostDisplay = effectiveRepost === 'display' && (
    <span
      className="flex items-center gap-1.5 text-muted-foreground"
      aria-label={`${repostCount} reposts`}
    >
      <Repeat2 className="h-4 w-4" strokeWidth={1.5} />
      <span className="text-xs tabular-nums">{repostCount}</span>
    </span>
  );

  const bar = (
    <>
      {showLike && (likeButton || likeDisplay)}
      {dislikeButton}
      {commentButton}
      {repostButton || repostDisplay}
      {trailing}
    </>
  );

  const thread = showComments && readComments && (
    <CommentThread
      postId={postId}
      isOpen={commentsOpen}
      count={localCommentCount}
      onCountChange={handleCommentCountChange}
      postAuthor={postAuthor}
      postService={postService}
      highlightedCommentId={highlightedCommentId}
      groups={groups}
      readComments={readComments}
      createComment={createComment}
      remote={remote}
      remoteHref={remoteHref}
      onError={onError}
      onAuthorClick={onAuthorClick}
    />
  );

  if (layout === 'bare') {
    return <div data-testid={testId} className="contents">{bar}</div>;
  }

  return (
    <div data-testid={testId}>
      {layout === 'row' ? (
        <div className="flex items-center gap-1 px-2 py-2">{bar}</div>
      ) : (
        <div className="flex items-center gap-6 border-t border-border px-4 pt-3 pb-3">{bar}</div>
      )}
      {thread}
    </div>
  );
}
