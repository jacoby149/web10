import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, ExternalLink, Heart, X } from 'lucide-react';
import { cn } from './utils';
import { TextInput, IconBtn, Skeleton } from './ui';
import type { CommentItem, ReadComments, CreateComment } from './types';

/**
 * The shared comment thread (comments.md) — threaded replies + comment
 * likes, the read side identical on both apps; the write side is the seam.
 *
 * The data layer is injected (`readComments` / `createComment` /
 * `onToggleCommentLike`) so the thread runs on web10-social's wapi-backed
 * data AND marketing-ui's public-ledger reader without the package knowing
 * about either.
 *
 * The threading model (comments.md): the reader returns the whole
 * conversation (top-level + replies) in ONE read — every comment's
 * `ref_value` is the post, a reply carries `parent_id`. The thread groups
 * by `parent_id` client-side (`buildCommentTree`); there is no per-comment
 * fetch and no "show more replies" pager.
 *
 * Comment likes: a `reactions` doc on the comment (same shape as a post
 * like). The app resolves `likeCount` / `likedByMe` per comment and wires
 * `onToggleCommentLike` (optimistic + rollback on the app, the post-like
 * pattern). Absent seam → the like renders display-only (count, no tap
 * target), the same rule as the post like in `remote` mode.
 *
 * The compose box is ONE. "Reply" retargets it (it shows who it replies to);
 * it does not spawn a per-comment input.
 *
 * `remote` mode (the marketing context, no session): the compose box becomes
 * a "Comment on web10 →" link-out to the post permalink — an anon visitor
 * can't write, so a dead tap target is worse than a link. The read side
 * (the comment list, the thread shape, the like counts) still renders.
 */

// ── The tree ────────────────────────────────────────────────────────────────

export interface CommentNode extends CommentItem {
  replies: CommentNode[];
}

/**
 * Build the comment tree from a flat conversation (comments.md).
 * Top-level comments (no `parent_id`) come first, `created_at` order;
 * replies nest under their parent, `created_at` order. A reply whose parent
 * is not in the read (deleted, or in a group the reader can't read) renders
 * as top-level — the thread degrades, it never drops content.
 */
export function buildCommentTree(comments: CommentItem[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const c of comments) {
    if (c._id) nodes.set(c._id, { ...c, replies: [] });
  }
  const topLevel: CommentNode[] = [];
  for (const c of comments) {
    const node: CommentNode = c._id ? (nodes.get(c._id) as CommentNode) : { ...c, replies: [] };
    const parent = c.parent_id ? nodes.get(c.parent_id) : undefined;
    if (parent) {
      parent.replies.push(node);
    } else {
      topLevel.push(node);
    }
  }
  const byTime = (a: CommentItem, b: CommentItem) =>
    (a.created_at || '').localeCompare(b.created_at || '');
  const sortTree = (list: CommentNode[]) => {
    list.sort(byTime);
    for (const n of list) sortTree(n.replies);
  };
  sortTree(topLevel);
  return topLevel;
}

/** Count every comment in the tree (top-level + all replies). */
export function countCommentTree(nodes: CommentNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countCommentTree(n.replies), 0);
}

// ── The thread ──────────────────────────────────────────────────────────────

export interface CommentThreadProps {
  postId: string;
  isOpen: boolean;
  count: number;
  onCountChange: (n: number) => void;
  postAuthor?: string;
  postService?: string;
  highlightedCommentId?: string;
  /** The group the post lives in (group posts — comments attach to the group). */
  groups?: string[];
  /** The comment reader (injected by the app — the data seam). Returns the
   *  whole conversation (top-level + replies) in one read. */
  readComments: ReadComments;
  /** The comment writer (injected; absent in `remote` mode). */
  createComment?: CreateComment;
  /** The comment-like writer (injected; absent in `remote` mode). The app
   *  owns the optimistic toggle + rollback (the post-like pattern). */
  onToggleCommentLike?: (commentId: string) => void;
  /** Remote (marketing) mode: compose becomes a link-out to the post permalink. */
  remote?: boolean;
  /** The post permalink the remote compose links to (web10 social). */
  remoteHref?: string;
  /** Error sink (the app wires its toast); the package stays toast-free. */
  onError?: (message: string) => void;
}

export function CommentThread({
  postId,
  isOpen,
  onCountChange,
  postAuthor,
  postService,
  highlightedCommentId,
  groups,
  readComments,
  createComment,
  onToggleCommentLike,
  remote = false,
  remoteHref,
  onError,
}: CommentThreadProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  /** The comment the compose box is replying to (absent = post-level). */
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const commentRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const hasScrolled = useRef(false);

  const tree = useMemo(() => buildCommentTree(comments), [comments]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    readComments(postId, groups)
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch((e) => console.error('[discover:comments] failed to load:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, postId, groups, readComments]);

  // Scroll to + flash the anchored comment once comments are loaded
  useEffect(() => {
    if (!highlightedCommentId || hasScrolled.current || !comments.length || loading) return;
    const el = commentRefs.current[highlightedCommentId];
    if (el && typeof el.scrollIntoView === 'function') {
      hasScrolled.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedCommentId, comments, loading]);

  const setCommentRef = useCallback((id: string) => (el: HTMLLIElement | null) => {
    if (el) commentRefs.current[id] = el;
  }, []);

  function handleReply(target: CommentItem) {
    setReplyingTo(target);
  }

  async function handleSend() {
    if (!draft.trim() || !createComment) return;
    setSending(true);
    try {
      const created = await createComment({
        postId,
        text: draft.trim(),
        parentId: replyingTo?._id,
        postAuthor,
        postService,
        groups,
      });
      if (created) {
        const next = [...comments, created];
        setComments(next);
        onCountChange(countCommentTree(buildCommentTree(next)));
        setDraft('');
        setReplyingTo(null);
      }
    } catch (e) {
      console.error('[discover:comments] failed to add:', e);
      onError?.('Could not post your comment.');
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="border-t border-border px-4 py-3 space-y-3" data-testid="comment-thread">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : tree.length ? (
        <ul className="space-y-2" data-testid="comment-list">
          {tree.map((c) => (
            <CommentNodeRow
              key={c._id || c.text}
              node={c}
              depth={0}
              highlightedCommentId={highlightedCommentId}
              canWrite={!!createComment}
              setRef={setCommentRef}
              onReply={handleReply}
              onToggleLike={onToggleCommentLike}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>
      )}

      {remote ? (
        // Remote (marketing) mode: no session, so the compose is a link-out to
        // the post permalink on web10 social — not a dead input.
        <a
          href={remoteHref || '#'}
          target="_blank"
          rel="noopener"
          data-testid="comment-remote-link"
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-border/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Send className="w-4 h-4" />
          Comment on web10
          <ExternalLink className="w-3.5 h-3.5 ml-auto" />
        </a>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="space-y-1.5"
        >
          {replyingTo && (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              data-testid="comment-reply-target"
            >
              <span className="truncate">
                Replying to <span className="font-medium text-brand-300">{replyingTo.author_username || 'comment'}</span>
              </span>
              <button
                type="button"
                aria-label="Cancel reply"
                data-testid="comment-reply-cancel"
                onClick={() => setReplyingTo(null)}
                className="rounded p-0.5 transition-colors duration-150 hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <TextInput
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={replyingTo ? 'Write a reply…' : 'Add a comment…'}
              data-testid="comment-input"
              disabled={sending}
              className="h-9"
            />
            <IconBtn
              type="submit"
              data-testid="comment-send"
              disabled={sending || !draft.trim()}
              aria-label={replyingTo ? 'Send reply' : 'Send comment'}
              className="h-9 w-9"
            >
              <Send className="w-4 h-4" />
            </IconBtn>
          </div>
        </form>
      )}
    </div>
  );
}

// ── One comment row (recursive) ─────────────────────────────────────────────

interface CommentNodeRowProps {
  node: CommentNode;
  depth: number;
  highlightedCommentId?: string;
  /** The reader can write (a createComment seam is present) — gates Reply. */
  canWrite: boolean;
  setRef: (id: string) => (el: HTMLLIElement | null) => void;
  onReply: (target: CommentItem) => void;
  onToggleLike?: (commentId: string) => void;
}

function CommentNodeRow({ node, depth, highlightedCommentId, canWrite, setRef, onReply, onToggleLike }: CommentNodeRowProps) {
  const id = node._id || '';
  const highlighted = !!id && id === highlightedCommentId;
  const showLike = onToggleLike !== undefined || node.likeCount !== undefined;
  const likeInteractive = onToggleLike !== undefined;

  return (
    <li
      ref={id ? setRef(id) : undefined}
      data-testid={id ? `comment-${id}` : undefined}
      className={cn(
        'rounded-md px-2 py-1 transition-colors duration-300',
        highlighted && 'bg-brand-muted ring-1 ring-brand animate-pulse-once',
      )}
    >
      <div className="flex items-start gap-2">
        {depth > 0 && (
          // The thread rail: replies hang off the parent's line.
          <div className="mt-2 w-px self-stretch bg-border" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-brand-300">{node.author_username || 'you'}</span>
            <span className="text-sm leading-relaxed text-foreground break-words">{node.text}</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            {showLike && (
              <button
                type="button"
                data-testid={id ? `comment-like-${id}` : undefined}
                aria-pressed={!!node.likedByMe}
                aria-label={`Like comment, ${node.likeCount || 0} likes`}
                disabled={!likeInteractive}
                onClick={(e) => {
                  e.stopPropagation();
                  if (id && onToggleLike) onToggleLike(id);
                }}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-all duration-150',
                  node.likedByMe
                    ? 'text-danger'
                    : likeInteractive
                      ? 'text-muted-foreground hover:text-foreground hover:bg-elevated/80'
                      : 'text-muted-foreground',
                  !likeInteractive && 'cursor-default',
                )}
              >
                <Heart
                  className={cn(
                    'h-3.5 w-3.5 transition-all duration-150',
                    node.likedByMe && 'drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]',
                  )}
                  strokeWidth={1.75}
                  fill={node.likedByMe ? 'currentColor' : 'none'}
                />
                <span className="tabular-nums">{node.likeCount || ''}</span>
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                data-testid={id ? `comment-reply-${id}` : undefined}
                aria-label="Reply to comment"
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(node);
                }}
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground hover:bg-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Reply
              </button>
            )}
          </div>
        </div>
      </div>
      {node.replies.length > 0 && (
        <ul className="mt-2 space-y-2 pl-4">
          {node.replies.map((r) => (
            <CommentNodeRow
              key={r._id || r.text}
              node={r}
              depth={depth + 1}
              highlightedCommentId={highlightedCommentId}
              canWrite={canWrite}
              setRef={setRef}
              onReply={onReply}
              onToggleLike={onToggleLike}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
