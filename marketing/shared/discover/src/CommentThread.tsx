import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ExternalLink, Heart, X, Image as ImageIcon } from 'lucide-react';
import { cn } from './utils';
import { TextInput, IconBtn, Skeleton } from './ui';
import type {
  CommentItem,
  CommentPageResult,
  ReadComments,
  ReadReplies,
  CreateComment,
  UploadCommentMedia,
  MediaItem,
} from './types';

/**
 * The shared comment thread (comments.md) — the Facebook/Instagram model:
 * threaded replies + comment likes, **paged** at both levels. The read side
 * is identical on both apps; the write side is the seam.
 *
 * The data layer is injected (`readComments` / `readReplies` /
 * `createComment` / `onToggleCommentLike`) so the thread runs on
 * web10-social's wapi-backed data AND marketing-ui's public-ledger reader
 * without the package knowing about either.
 *
 * Paging (the load-bearing part): a comment's `ref_value` is its PARENT — the
 * post for a top-level comment, the parent comment for a reply. So the server
 * pages each level independently (keyset cursor on `created_at`):
 *   - the thread opens with the first page of TOP-LEVEL comments;
 *   - "View more comments" loads the next top-level page and appends;
 *   - each comment shows its first few replies; "View more replies (N)" loads
 *     that comment's next reply page.
 * A 10k-comment post opens in one bounded read and grows on demand.
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
 * (the comment list, the thread shape, the like counts, the paging) still
 * renders.
 */

// ── The tree node ────────────────────────────────────────────────────────────

/** A photo picked for the draft: kept locally until send uploads it. */
interface AttachedPhoto {
  id: number;
  file: File;
  previewUrl: string;
}

let nextPhotoId = 0;

/** The cap on photos per comment (X/Twitter parity). */
const MAX_COMMENT_PHOTOS = 4;

export interface CommentNode extends CommentItem {
  /** The replies loaded so far (the thread appends as "view more replies"
   *  pages arrive). */
  replies: CommentNode[];
  /** Cursor for the next reply page (null = no more, or not fetched). */
  replyCursor: string | null;
  /** The comment has more replies than are loaded ("view more replies" shows). */
  hasMoreReplies: boolean;
}

// ── The thread ───────────────────────────────────────────────────────────────

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
  /** The top-level comment reader (injected by the app — the data seam).
   *  Paged: returns one page + a `nextCursor` for "view more comments". */
  readComments: ReadComments;
  /** The reply reader for "view more replies" (injected). Paged. */
  readReplies?: ReadReplies;
  /** The comment writer (injected; absent in `remote` mode). */
  createComment?: CreateComment;
  /** The comment-photo uploader (injected; absent → no attach control, text-only). */
  uploadMedia?: UploadCommentMedia;
  /** The comment-like writer (injected; absent in `remote` mode). The app
   *  owns the optimistic toggle + rollback (the post-like pattern). */
  onToggleCommentLike?: (commentId: string) => void;
  /** Remote (marketing) mode: compose becomes a link-out to the post permalink. */
  remote?: boolean;
  /** The post permalink the remote compose links to (web10 social). */
  remoteHref?: string;
  /** Error sink (the app wires its toast); the package stays toast-free. */
  onError?: (message: string) => void;
  /** The author-click handler (in-app profile navigation). When present, a
   *  comment's author username is a tappable link to their profile. */
  onAuthorClick?: (username: string, provider?: string) => void;
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
  readReplies,
  createComment,
  uploadMedia,
  onToggleCommentLike,
  remote = false,
  remoteHref,
  onError,
  onAuthorClick,
}: CommentThreadProps) {
  const [topLevel, setTopLevel] = useState<CommentNode[]>([]);
  const [topCursor, setTopCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  /** The comment the compose box is replying to (absent = post-level). */
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  /** Photos picked for the draft (local previews; uploaded on send). */
  const [attached, setAttached] = useState<AttachedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const hasScrolled = useRef(false);
  // Live object-URL previews, revoked on unmount (the PostComposer idiom).
  const previewUrlsRef = useRef(new Set<string>());
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const toNode = useCallback((c: CommentItem): CommentNode => ({
    ...c,
    replies: [],
    replyCursor: null,
    hasMoreReplies: false,
  }), []);

  // Count every node in the tree (top-level + all loaded replies) — the live
  // count reported to the comment button.
  const countTree = useCallback((nodes: CommentNode[]): number =>
    nodes.reduce((sum, n) => sum + 1 + countTree(n.replies), 0), []);

  // Build a tree from a FLAT list of comments (the marketing mode — the
  // reader returns the whole conversation, top-level + replies). A reply
  // whose parent is not in the list renders top-level (degrade, never drop).
  const buildTree = useCallback((list: CommentItem[]): CommentNode[] => {
    const nodes = new Map<string, CommentNode>();
    for (const c of list) if (c._id) nodes.set(c._id, toNode(c));
    const topLevel: CommentNode[] = [];
    for (const c of list) {
      const node = c._id ? (nodes.get(c._id) as CommentNode) : toNode(c);
      const parent = c.parent_id ? nodes.get(c.parent_id) : undefined;
      if (parent) parent.replies.push(node);
      else topLevel.push(node);
    }
    const byTime = (a: CommentItem, b: CommentItem) =>
      (a.created_at || '').localeCompare(b.created_at || '');
    const sortTree = (list: CommentNode[]) => {
      list.sort(byTime);
      for (const n of list) sortTree(n.replies);
    };
    sortTree(topLevel);
    return topLevel;
  }, [toNode]);

  // Pre-fetch the first reply page for each top-level comment that has
  // replies (the social mode — `replyCounts` tells us which). Bounded +
  // parallel (one small page per comment).
  const prefetchReplies = useCallback(async (nodes: CommentNode[], replyCounts: Record<string, number>) => {
    const withReplies = nodes.filter((n) => n._id && (replyCounts[n._id] || 0) > 0);
    if (!withReplies.length || !readReplies) return nodes;
    const pages = await Promise.all(
      withReplies.map((n) =>
        readReplies(n._id!, groups, { limit: 5 })
          .then((page) => ({ id: n._id!, page }))
          .catch((e) => {
            console.error('[discover:comments] reply prefetch failed:', e);
            return null;
          }),
      ),
    );
    const byId = new Map(pages.filter(Boolean).map((p) => [p!.id, p!.page]));
    return nodes.map((n) => {
      const page = byId.get(n._id || '');
      const total = replyCounts[n._id || ''] || 0;
      if (!page) return n;
      return {
        ...n,
        replies: page.comments.map(toNode),
        replyCursor: page.nextCursor,
        hasMoreReplies: total > page.comments.length,
      };
    });
  }, [readReplies, groups, toNode]);

  // Initial load: the first page of top-level comments (+ their first reply
  // pages, when the reader provides replyCounts).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    readComments(postId, groups)
      .then(async (page) => {
        if (cancelled) return;
        let nodes: CommentNode[];
        if (page.replyCounts) {
          // Social mode: top-level page + pre-fetched first reply pages.
          nodes = await prefetchReplies(page.comments.map(toNode), page.replyCounts);
        } else {
          // Marketing mode: the whole flat conversation — build the tree.
          nodes = buildTree(page.comments);
        }
        setTopLevel(nodes);
        setTopCursor(page.nextCursor);
        onCountChange(countTree(nodes));
      })
      .catch((e) => console.error('[discover:comments] failed to load:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, postId, groups]);

  // Scroll to + flash the anchored comment once comments are loaded
  useEffect(() => {
    if (!highlightedCommentId || hasScrolled.current || !topLevel.length || loading) return;
    const el = commentRefs.current[highlightedCommentId];
    if (el && typeof el.scrollIntoView === 'function') {
      hasScrolled.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedCommentId, topLevel, loading]);

  const setCommentRef = useCallback((id: string) => (el: HTMLLIElement | null) => {
    if (el) commentRefs.current[id] = el;
  }, []);

  function handleReply(target: CommentItem) {
    setReplyingTo(target);
  }

  // "View more comments" — load the next top-level page and append.
  async function handleViewMoreComments() {
    if (!topCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await readComments(postId, groups, { cursor: topCursor });
      let nodes: CommentNode[];
      if (page.replyCounts) {
        nodes = await prefetchReplies(page.comments.map(toNode), page.replyCounts);
      } else {
        nodes = page.comments.map(toNode);
      }
      setTopLevel((prev) => {
        const next = [...prev, ...nodes];
        onCountChange(countTree(next));
        return next;
      });
      setTopCursor(page.nextCursor);
    } catch (e) {
      console.error('[discover:comments] failed to load more:', e);
      onError?.('Could not load more comments.');
    } finally {
      setLoadingMore(false);
    }
  }

  // "View more replies" — load the next reply page for one comment + append.
  async function handleViewMoreReplies(parentId: string) {
    if (!readReplies) return;
    const parent = findNode(topLevel, parentId);
    if (!parent || !parent.replyCursor || parent.hasMoreReplies === false) return;
    try {
      const page = await readReplies(parentId, groups, { cursor: parent.replyCursor });
      const nodes = page.comments.map(toNode);
      setTopLevel((prev) => {
        const next = prev.map((n) =>
          n._id === parentId
            ? {
                ...n,
                replies: [...n.replies, ...nodes],
                replyCursor: page.nextCursor,
                hasMoreReplies: page.nextCursor !== null,
              }
            : n,
        );
        onCountChange(countTree(next));
        return next;
      });
    } catch (e) {
      console.error('[discover:comments] failed to load replies:', e);
      onError?.('Could not load more replies.');
    }
  }

  // Pick photos for the draft (local previews; uploaded on send). Capped at
  // MAX_COMMENT_PHOTOS — the attach control is hidden once the tray is full.
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const room = MAX_COMMENT_PHOTOS - attached.length;
    if (!files.length || room <= 0) return;
    const items: AttachedPhoto[] = files.slice(0, room).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return { id: nextPhotoId++, file, previewUrl };
    });
    setAttached((prev) => [...prev, ...items]);
  }

  function removePhoto(id: number) {
    setAttached((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) previewUrlsRef.current.delete(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clearAttached() {
    setAttached((prev) => {
      prev.forEach((a) => previewUrlsRef.current.delete(a.previewUrl));
      return [];
    });
  }

  async function handleSend() {
    const text = draft.trim();
    if ((!text && attached.length === 0) || !createComment) return;
    setSending(true);
    try {
      // Upload the picked photos first (the app's seam), then write the comment
      // with the returned doc_ids. A photo-only comment is valid (text may be
      // empty). A failed upload aborts the send — the photo is part of the comment.
      let mediaRefs: string[] | undefined;
      if (attached.length && uploadMedia) {
        const docIds: string[] = [];
        for (const item of attached) {
          const r = await uploadMedia(item.file);
          if (r?.docId) docIds.push(r.docId);
        }
        mediaRefs = docIds.length ? docIds : undefined;
      }
      const created = await createComment({
        postId,
        text,
        parentId: replyingTo?._id,
        postAuthor,
        postService,
        groups,
        mediaRefs,
      });
      if (created) {
        // Show the new comment's photos immediately from the local previews —
        // the write path returns bare doc_ids, not resolved URLs.
        const previewMedia: MediaItem[] = attached.map((a) => ({
          url: a.previewUrl,
          mime_type: a.file.type,
        }));
        const node = toNode({ ...created, media: previewMedia.length ? previewMedia : undefined });
        setTopLevel((prev) => {
          let next: CommentNode[];
          if (created.parent_id) {
            // A reply: nest under its parent (if loaded), else top-level.
            next = prev.map((n) => (n._id === created.parent_id ? { ...n, replies: [...n.replies, node] } : n));
          } else {
            next = [...prev, node];
          }
          onCountChange(countTree(next));
          return next;
        });
        clearAttached();
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
      ) : topLevel.length ? (
        <ul className="space-y-2" data-testid="comment-list">
          {topLevel.map((c) => (
            <CommentNodeRow
              key={c._id || c.text}
              node={c}
              depth={0}
              highlightedCommentId={highlightedCommentId}
              canWrite={!!createComment}
              setRef={setCommentRef}
              onReply={handleReply}
              onToggleLike={onToggleCommentLike}
              onViewMoreReplies={readReplies ? handleViewMoreReplies : undefined}
              onAuthorClick={onAuthorClick}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>
      )}

      {/* "View more comments" — the top-level pager (the Facebook model). */}
      {topCursor && !loading && (
        <button
          type="button"
          data-testid="view-more-comments"
          onClick={handleViewMoreComments}
          disabled={loadingMore}
          className="block w-full rounded-md border border-border px-3 py-2 text-center text-sm text-brand-300 transition-colors duration-150 hover:bg-elevated/60 hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'View more comments'}
        </button>
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
          {attached.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="comment-photo-tray">
              {attached.map((p) => (
                <div key={p.id} className="relative h-16 w-16 shrink-0" data-testid="comment-photo-preview">
                  <img
                    src={p.previewUrl}
                    alt=""
                    className="h-full w-full rounded-md object-cover ring-1 ring-border"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    data-testid="comment-photo-remove"
                    onClick={() => removePhoto(p.id)}
                    disabled={sending}
                    className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors duration-150 hover:bg-elevated disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {uploadMedia && attached.length < MAX_COMMENT_PHOTOS && (
              <IconBtn
                type="button"
                data-testid="comment-attach-photo"
                aria-label="Attach a photo"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="h-9 w-9"
              >
                <ImageIcon className="w-4 h-4" />
              </IconBtn>
            )}
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
              disabled={sending || (!draft.trim() && attached.length === 0)}
              aria-label={replyingTo ? 'Send reply' : 'Send comment'}
              className="h-9 w-9"
            >
              <Send className="w-4 h-4" />
            </IconBtn>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            data-testid="comment-photo-input"
          />
        </form>
      )}
    </div>
  );
}

// ── Find a node in the tree (for reply-append + view-more-replies) ───────────

function findNode(nodes: CommentNode[], id: string | undefined): CommentNode | undefined {
  if (!id) return undefined;
  for (const n of nodes) {
    if (n._id === id) return n;
    const found = findNode(n.replies, id);
    if (found) return found;
  }
  return undefined;
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
  /** "View more replies" for this comment (absent → no pager). */
  onViewMoreReplies?: (parentId: string) => void;
  /** The author-click handler (in-app profile navigation) — the comment's
   *  author is a tappable profile link when wired. */
  onAuthorClick?: (username: string, provider?: string) => void;
}

function CommentNodeRow({ node, depth, highlightedCommentId, canWrite, setRef, onReply, onToggleLike, onViewMoreReplies, onAuthorClick }: CommentNodeRowProps) {
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
            <span className="text-sm font-medium text-brand-300">
              {node.author_username ? (
                onAuthorClick ? (
                  <button
                    type="button"
                    data-testid={id ? `comment-author-${id}` : undefined}
                    aria-label={`View ${node.author_username}'s profile`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAuthorClick(node.author_username!, node.author_provider);
                    }}
                    className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:underline"
                  >
                    {node.author_username}
                  </button>
                ) : (
                  node.author_username
                )
              ) : (
                'you'
              )}
            </span>
            <span className="text-sm leading-relaxed text-foreground break-words">{node.text}</span>
          </div>
          {node.media && node.media.length > 0 && (
            <CommentMedia media={node.media} id={id} />
          )}
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
              onViewMoreReplies={onViewMoreReplies}
              onAuthorClick={onAuthorClick}
            />
          ))}
        </ul>
      )}
      {/* "View more replies" — the per-comment pager (the Facebook model). */}
      {node.hasMoreReplies && onViewMoreReplies && (
        <button
          type="button"
          data-testid={id ? `view-more-replies-${id}` : 'view-more-replies'}
          onClick={(e) => {
            e.stopPropagation();
            if (id) onViewMoreReplies(id);
          }}
          className="mt-1.5 ml-4 rounded px-1.5 py-0.5 text-xs text-brand-300 transition-colors duration-150 hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View more replies
        </button>
      )}
    </li>
  );
}

// ── Comment photos (the compact grid, comments.md "Photos in comments") ──────

/**
 * Renders a comment's photos as a compact grid below the text:
 *  - 1 photo → single image, full width, capped height (object-cover).
 *  - 2–4 photos → 2-column grid of square cells (object-cover).
 * A missing/unresolvable URL is dropped, never a broken-image icon.
 */
function CommentMedia({ media, id }: { media: MediaItem[]; id: string }) {
  const items = media.slice(0, MAX_COMMENT_PHOTOS).filter((m) => m.url);
  if (!items.length) return null;
  const single = items.length === 1;
  return (
    <div
      className={cn(
        'mt-2 grid gap-1 overflow-hidden rounded-md',
        single ? 'grid-cols-1' : 'grid-cols-2',
      )}
      data-testid={id ? `comment-media-${id}` : 'comment-media'}
    >
      {items.map((m, i) => (
        <img
          key={m._id || i}
          src={m.url}
          alt={m.alt_text || ''}
          loading="lazy"
          className={cn(
            'w-full bg-elevated object-cover',
            single ? 'max-h-64' : 'aspect-square',
          )}
          data-testid={id ? `comment-media-item-${id}-${i}` : `comment-media-item-${i}`}
        />
      ))}
    </div>
  );
}
