// The post-detail system (rich-text.md "The post-detail styling system",
// post-render.md "The detail surfaces"): ONE shared layout for every
// "read a post in full" surface — the lightbox, the watch page, the post
// permalink. The three surfaces differ only in the chrome around this layout
// (the modal, the video destination, the standalone page); the layout itself
// is fixed so a post looks the same at every "full" zoom level.
//
// The structure (the Facebook-grade shape the lightbox was missing):
//   - identity row  — avatar + name + @handle + · timestamp + privacy glyph
//   - title         — Space Grotesk, the h2 step (only when the post has one)
//   - body          — <PostBody> full markdown at a reading measure
//   - media         — the surface's media (carousel / player), injected
//   - stats row     — a quiet "N likes · M comments" line
//   - action bar    — LABELED (Like / Comment / Share), icon + text + counts
//   - owner menu    — a ⋯ menu, not a flat list jammed under a divider
//   - comment thread — the shared threaded comments (the "Comment" affordance)
//
// The click-through seam (post-render.md): a teaser / summary is clickable to
// this full post, and this full post shows ≥ what the teaser showed — no dead
// ends. The identity row, the title (the anchor), and the full body are always
// present, so the detail never contradicts the teaser.
import { useState, type ReactNode } from 'react';
import {
  Heart, ThumbsDown, MessageCircle, Repeat2, Share2, Check,
  MoreHorizontal, Globe, Lock, Edit3, Eye, EyeOff, Trash2, Bookmark,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PostBody } from '@/components/Feed/PostBody';
import { CommentThread } from '@/components/Feed/CommentThread';
import { useSave } from '@/context/SaveContext';
import type { ReactionKind } from '@/components/Feed/PostActions';

function formatTimeAgo(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * A labeled action-bar button (icon + text + count) — the Facebook-grade
 * engagement shape, not a bare icon. `active` fills the icon (the like's
 * heart, the repost's brand fill); the count is tabular so the row never
 * shifts. The whole button is the tap target (min 44px on mobile).
 */
function ActionBtn({
  testid, icon, label, count, active, activeClass, onClick,
}: {
  testid: string;
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  activeClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={active}
      aria-label={count != null ? `${label}, ${count}` : label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        active ? activeClass : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80',
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
      {count != null && count > 0 && (
        <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

export interface PostIdentityRowProps {
  post: {
    created_at: string;
    visibility?: string;
    author_username?: string;
    author_provider?: string;
  };
  /** The author's display name (falls back to the username). */
  authorName?: string;
  /** The author's avatar URL. */
  authorAvatar?: string;
  /** Navigate to a profile (the author's name becomes a tappable link). */
  onAuthorClick?: (username: string, provider?: string) => void;
  /** The ⋯ owner menu (absent → no menu). The owner's actions live in a menu,
   *  not a flat list jammed under a divider (the post-detail system). */
  menu?: {
    signedIn: boolean;
    onEdit?: () => void;
    onToggleVisibility?: () => void;
    visibilityToggling?: boolean;
    onDelete?: () => void;
    /** The full post (the Save-to… target). */
    post: { _id?: string };
  };
  /** A trailing action (before the ⋯ menu) — the watch page's Follow button. */
  action?: ReactNode;
  /** A testid prefix (default 'post-detail'). */
  testId?: string;
}

/**
 * The identity row (the post-detail system): avatar + name + `@handle` +
 * `·` timestamp + privacy glyph, with the ⋯ owner menu at the trailing edge.
 * One row, the small type step (the Facebook move the lightbox was missing).
 * Shared by the lightbox, the watch page, and the post permalink so the
 * author reads identically at every "full" zoom level.
 */
export function PostIdentityRow({
  post,
  authorName,
  authorAvatar,
  onAuthorClick,
  menu,
  action,
  testId = 'post-detail',
}: PostIdentityRowProps) {
  const username = post.author_username || '';
  const provider = post.author_provider || '';
  const name = authorName || username || 'Unknown';
  const isPublic = post.visibility !== 'private';

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const { openSave } = useSave();

  const hasMenu = !!menu && (menu.onEdit || menu.onToggleVisibility || menu.onDelete);

  function closeMenu() {
    setMenuOpen(false);
    setDeleteArmed(false);
    setDeleteConfirm('');
  }

  return (
    <div className="flex items-center gap-2.5" data-testid={`${testId}-identity`}>
      <Avatar className="h-9 w-9 shrink-0">
        {authorAvatar ? (
          <AvatarImage src={authorAvatar} alt={name} />
        ) : (
          <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        )}
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0">
        {username && onAuthorClick ? (
          <button
            type="button"
            data-testid={`${testId}-author`}
            onClick={(e) => { e.stopPropagation(); onAuthorClick(username, provider); }}
            className="truncate font-medium text-sm text-foreground transition-colors duration-150 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={`View ${name}'s profile`}
          >
            {name}
          </button>
        ) : (
          <span className="truncate font-medium text-sm text-foreground">{name}</span>
        )}
        {username && (
          <span className="truncate text-[0.8125rem] text-muted-foreground">@{username}</span>
        )}
        <span className="shrink-0 text-[0.8125rem] text-muted-foreground">· {formatTimeAgo(post.created_at)}</span>
        <span
          className="shrink-0 text-muted-foreground"
          data-testid={`${testId}-privacy`}
          title={isPublic ? 'Public' : 'Private'}
          aria-label={isPublic ? 'Public' : 'Private'}
        >
          {isPublic ? <Globe className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </span>
      </div>
      {/* A trailing action (before the ⋯ menu) — the watch page's Follow. */}
      {action && <div className="shrink-0">{action}</div>}
      {/* The ⋯ owner menu — the owner's actions live in a menu, not a flat
          list jammed under a divider (the post-detail system). */}
      {hasMenu && menu && (
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Post options"
            aria-expanded={menuOpen}
            data-testid="post-options-button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            className="rounded-full p-1.5 text-muted-foreground transition-all duration-150 hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={(e) => { e.stopPropagation(); closeMenu(); }}
                aria-hidden="true"
              />
              <div
                className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
                data-testid="post-options-menu"
                onClick={(e) => e.stopPropagation()}
              >
                {menu.signedIn && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); closeMenu(); openSave(menu.post as never); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-elevated"
                    data-testid="post-option-save"
                  >
                    <Bookmark className="h-4 w-4" />
                    Save to…
                  </button>
                )}
                {menu.onEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); closeMenu(); menu.onEdit(); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-elevated"
                    data-testid="post-option-edit"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit post
                  </button>
                )}
                {menu.onToggleVisibility && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); closeMenu(); menu.onToggleVisibility(); }}
                    disabled={menu.visibilityToggling}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-elevated disabled:opacity-50"
                    data-testid="post-option-visibility"
                  >
                    {isPublic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {menu.visibilityToggling ? 'Updating…' : isPublic ? 'Make private' : 'Make public'}
                  </button>
                )}
                {menu.onDelete && (
                  deleteArmed ? (
                    <div className="space-y-2 p-2" data-testid="post-delete-confirm">
                      <p className="text-xs text-danger">Type <span className="font-mono font-medium">delete</span> to confirm</p>
                      <input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="delete"
                        data-testid="post-delete-confirm-input"
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); closeMenu(); menu.onDelete(); }}
                          disabled={deleteConfirm !== 'delete'}
                          className="flex-1 rounded-md bg-danger px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-danger/90 disabled:opacity-50"
                          data-testid="post-delete-confirm-button"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeleteArmed(false); setDeleteConfirm(''); }}
                          className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteArmed(true); setDeleteConfirm(''); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-muted"
                      data-testid="post-delete-button"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete post
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The quiet stats row (the post-detail system): "N likes · M comments" — a
 * muted, tabular line above the action bar. The watch page and the lightbox
 * share it so the engagement reads identically at every "full" zoom level.
 */
export function PostStatsRow({ likeCount, commentCount, testId = 'post-detail' }: {
  likeCount: number;
  commentCount: number;
  testId?: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-1 text-[0.8125rem] text-muted-foreground" data-testid={`${testId}-stats`}>
      <span className="tabular-nums">{likeCount}</span>
      <span>like{likeCount === 1 ? '' : 's'}</span>
      <span className="px-0.5">·</span>
      <span className="tabular-nums">{commentCount}</span>
      <span>comment{commentCount === 1 ? '' : 's'}</span>
    </div>
  );
}

export interface PostActionBarProps {
  liked: boolean;
  disliked: boolean;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  reposted: boolean;
  repostCount: number;
  /** The comment button's open state (the thread is open → the label fills). */
  commentsOpen?: boolean;
  onToggleReaction: (kind: ReactionKind) => void;
  onToggleRepost: () => void;
  onComment: () => void;
  onShare?: () => void;
  /** The share button's "Copied!" state (the surface tracks the clipboard). */
  shared?: boolean;
  testId?: string;
}

/**
 * The LABELED action bar (the post-detail system): Like / Not for me / Comment
 * / Repost / Share — icon + text + count, not bare icons. The Facebook-grade
 * engagement shape the lightbox was missing. Shared by the lightbox and the
 * watch page so the engagement reads identically at every "full" zoom level.
 */
export function PostActionBar({
  liked, disliked, likeCount, dislikeCount, commentCount,
  reposted, repostCount, commentsOpen = false,
  onToggleReaction, onToggleRepost, onComment, onShare, shared = false,
  testId = 'post-detail',
}: PostActionBarProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2" data-testid={`${testId}-actions`}>
      <ActionBtn
        testid="like-button"
        icon={
          <Heart
            className={cn('h-[18px] w-[18px] transition-all duration-150', liked && 'drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]')}
            strokeWidth={1.75}
            fill={liked ? 'currentColor' : 'none'}
          />
        }
        label="Like"
        count={likeCount}
        active={liked}
        activeClass="text-danger"
        onClick={() => onToggleReaction('like')}
      />
      <ActionBtn
        testid="dislike-button"
        icon={
          <ThumbsDown
            className={cn('h-[18px] w-[18px] transition-all duration-150', disliked && 'scale-110')}
            strokeWidth={1.75}
            fill={disliked ? 'currentColor' : 'none'}
          />
        }
        label="Not for me"
        count={dislikeCount}
        active={disliked}
        activeClass="text-foreground bg-elevated"
        onClick={() => onToggleReaction('dislike')}
      />
      <ActionBtn
        testid="comment-button"
        icon={<MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />}
        label="Comment"
        count={commentCount}
        active={commentsOpen}
        activeClass="text-foreground"
        onClick={onComment}
      />
      <ActionBtn
        testid="repost-button"
        icon={
          <Repeat2
            className={cn('h-[18px] w-[18px] transition-all duration-150', reposted && 'scale-110')}
            strokeWidth={1.75}
          />
        }
        label="Repost"
        count={repostCount}
        active={reposted}
        activeClass="text-brand-300"
        onClick={onToggleRepost}
      />
      {onShare && (
        <ActionBtn
          testid="share-button"
          icon={shared ? <Check className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          label={shared ? 'Copied!' : 'Share'}
          active={shared}
          activeClass="text-success"
          onClick={onShare}
        />
      )}
    </div>
  );
}

export interface PostDetailProps {
  post: {
    _id?: string;
    title?: string;
    text?: string;
    created_at: string;
    visibility?: string;
    author_username?: string;
    author_provider?: string;
  };
  /** The author's display name (falls back to the username). */
  authorName?: string;
  /** The author's avatar URL (the feed read carries it inline). */
  authorAvatar?: string;
  /** Whether the reader owns this post (gates the ⋯ owner menu). */
  isOwner?: boolean;
  /** Whether the reader is signed in (gates the Save affordance). */
  signedIn?: boolean;
  // Engagement state (the surface owns it — optimistic + rollback).
  liked: boolean;
  disliked: boolean;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  reposted: boolean;
  repostCount: number;
  // Engagement handlers (the surface's writers).
  onToggleReaction: (kind: ReactionKind) => void;
  onToggleRepost: () => void;
  onShare: () => void;
  onCommentCountChange: (n: number) => void;
  /** The share button's "Copied!" state (the surface tracks the clipboard). */
  shared?: boolean;
  /** The group the post lives in (group posts — reactions + comments attach). */
  groups?: string[];
  /** The post service for the comment thread (default 'posts'). */
  postService?: string;
  /** Deep-link anchor: auto-open + scroll to this comment. */
  highlightedCommentId?: string;
  /** Navigate to a profile (the identity row's author + the comment authors). */
  onAuthorClick?: (username: string, provider?: string) => void;
  // Owner actions (the ⋯ menu). Absent → the item is hidden.
  onEdit?: () => void;
  onToggleVisibility?: () => void;
  visibilityToggling?: boolean;
  onDelete?: () => void;
  /** The surface's media (the lightbox's carousel / the watch player). Rendered
   *  between the body and the stats row. */
  media?: ReactNode;
  /** A testid for the root. */
  testId?: string;
}

export function PostDetail({
  post,
  authorName,
  authorAvatar,
  isOwner = false,
  signedIn = false,
  liked,
  disliked,
  likeCount,
  dislikeCount,
  commentCount,
  reposted,
  repostCount,
  onToggleReaction,
  onToggleRepost,
  onShare,
  onCommentCountChange,
  shared = false,
  groups,
  postService = 'posts',
  highlightedCommentId,
  onAuthorClick,
  onEdit,
  onToggleVisibility,
  visibilityToggling = false,
  onDelete,
  media,
  testId = 'post-detail',
}: PostDetailProps) {
  const username = post.author_username || '';

  const [commentsOpen, setCommentsOpen] = useState(!!highlightedCommentId);

  return (
    <div data-testid={testId} className="flex min-h-0 flex-col">
      {/* Identity row — avatar + name + @handle + · timestamp + privacy glyph,
          with the ⋯ owner menu (the shared PostIdentityRow). */}
      <PostIdentityRow
        post={post}
        authorName={authorName}
        authorAvatar={authorAvatar}
        onAuthorClick={onAuthorClick}
        menu={isOwner ? {
          signedIn,
          onEdit,
          onToggleVisibility,
          visibilityToggling,
          onDelete,
          post,
        } : undefined}
        testId={testId}
      />

      {/* Title — Space Grotesk, the h2 step (1.5rem), tight tracking. The
          anchor: the same string the teaser showed, now the detail's header. */}
      {post.title && (
        <h2 className="mt-3 font-display text-2xl font-medium leading-tight tracking-tight text-foreground" data-testid="post-detail-title">
          {post.title}
        </h2>
      )}

      {/* Body — full markdown at a reading measure (the "beautiful Notion"
          surface). The reading measure is the content-sized column: a text-only
          post gets a centered reading column, not 320px-in-896px dead space. */}
      {post.text && (
        <div className="mt-2 max-w-prose text-sm leading-relaxed text-foreground">
          <PostBody text={post.text} density="full" />
        </div>
      )}

      {/* Media — the surface's media (the lightbox's carousel / the watch
          player), between the body and the stats row. */}
      {media && <div className="mt-3">{media}</div>}

      {/* Stats row — a quiet "N likes · M comments" line above the actions. */}
      <PostStatsRow likeCount={likeCount} commentCount={commentCount} testId={testId} />

      {/* Action bar — LABELED (icon + text + count), not bare icons. */}
      <PostActionBar
        liked={liked}
        disliked={disliked}
        likeCount={likeCount}
        dislikeCount={dislikeCount}
        commentCount={commentCount}
        reposted={reposted}
        repostCount={repostCount}
        commentsOpen={commentsOpen}
        onToggleReaction={onToggleReaction}
        onToggleRepost={onToggleRepost}
        onComment={() => setCommentsOpen((o) => !o)}
        onShare={onShare}
        shared={shared}
        testId={testId}
      />

      {/* Comment thread — the "Comment" affordance opens the shared threaded
          comments (the Facebook/Instagram model, paged at both levels). */}
      {commentsOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <CommentThread
            postId={post._id || ''}
            isOpen={commentsOpen}
            count={commentCount}
            onCountChange={onCommentCountChange}
            postAuthor={username || undefined}
            postService={postService}
            highlightedCommentId={highlightedCommentId}
            groups={groups}
            onAuthorClick={onAuthorClick}
          />
        </div>
      )}
    </div>
  );
}
