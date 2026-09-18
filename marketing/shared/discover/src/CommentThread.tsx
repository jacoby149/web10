import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ExternalLink } from 'lucide-react';
import { cn } from './utils';
import { TextInput, IconBtn, Skeleton } from './ui';
import type { CommentItem, ReadComments, CreateComment } from './types';

/**
 * The shared comment thread (post-actions.md) — the read side (the comment
 * list) is identical on both apps; the write side is the seam.
 *
 * The data layer is injected (`readComments` / `createComment`) so the thread
 * runs on web10-social's wapi-backed data AND marketing-ui's public-ledger
 * reader without the package knowing about either.
 *
 * `remote` mode (the marketing context, no session): the compose box becomes a
 * "Comment on web10 →" link-out to the post permalink — an anon visitor can't
 * write, so a dead tap target is worse than a link. The read side (the comment
 * list) still renders, so "see comments on both" holds.
 */
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
  /** The comment reader (injected by the app — the data seam). */
  readComments: ReadComments;
  /** The comment writer (injected; absent in `remote` mode). */
  createComment?: CreateComment;
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
  createComment,
  remote = false,
  remoteHref,
  onError,
  onAuthorClick,
}: CommentThreadProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const commentRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const hasScrolled = useRef(false);

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

  async function handleSend() {
    if (!draft.trim() || !createComment) return;
    setSending(true);
    try {
      const created = await createComment({
        postId,
        text: draft.trim(),
        postAuthor,
        postService,
        groups,
      });
      if (created) {
        const next = [...comments, created];
        setComments(next);
        onCountChange(next.length);
        setDraft('');
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
      ) : comments.length ? (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c._id}
              ref={c._id ? setCommentRef(c._id) : undefined}
              data-testid={`comment-${c._id}`}
              className={cn(
                'text-sm leading-relaxed rounded-md px-2 py-1 transition-colors duration-300',
                c._id === highlightedCommentId
                  ? 'bg-brand-muted ring-1 ring-brand text-foreground animate-pulse-once'
                  : '',
              )}
            >
              <span className="font-medium text-brand-300">
                {c.author_username ? (
                  onAuthorClick ? (
                    <button
                      type="button"
                      data-testid={`comment-author-${c._id}`}
                      aria-label={`View ${c.author_username}'s profile`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAuthorClick(c.author_username!, c.author_provider);
                      }}
                      className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:underline"
                    >
                      {c.author_username}
                    </button>
                  ) : (
                    c.author_username
                  )
                ) : (
                  'you'
                )}
              </span>{' '}
              <span className="text-foreground">{c.text}</span>
            </li>
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
          className="flex items-center gap-2"
        >
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            data-testid="comment-input"
            disabled={sending}
            className="h-9"
          />
          <IconBtn
            type="submit"
            data-testid="comment-send"
            disabled={sending || !draft.trim()}
            aria-label="Send comment"
            className="h-9 w-9"
          >
            <Send className="w-4 h-4" />
          </IconBtn>
        </form>
      )}
    </div>
  );
}
