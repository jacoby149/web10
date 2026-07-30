import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Heart, MessageCircle, Edit3, Trash2, Eye, EyeOff, Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { PostRecord, MediaRecord } from '@/data/types';
import { getWapi } from '@/data/wapi';
import {
  toggleReaction,
  countReactions,
  readReactions,
  countComments,
  updatePost,
  deletePost,
  movePostVisibility,
} from '@/data';
import { CommentThread } from '@/components/Feed/CommentThread';
import { cn } from '@/lib/utils';

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

interface PostLightboxProps {
  post: PostRecord;
  mediaMap: Record<string, MediaRecord>;
  onClose: () => void;
  onReload?: () => void;
  postAuthor?: string;
  postService?: string;
  isOwner?: boolean;
}

export function PostLightbox({ post, mediaMap, onClose, onReload, postAuthor, postService, isOwner: isOwnerProp }: PostLightboxProps) {
  const media = (post.media_refs || [])
    .map(ref => mediaMap[ref])
    .filter((m): m is MediaRecord => Boolean(m));
  const [index, setIndex] = useState(0);
  const hasMedia = media.length > 0;
  const multiple = media.length > 1;

  // Like state
  const [liked, setLiked] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [burstKey, setBurstKey] = useState(0);

  // Comment state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.text || '');
  const [saving, setSaving] = useState(false);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // Visibility toggle state
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  // Share state
  const [copied, setCopied] = useState(false);

  // Check ownership: explicit prop wins, otherwise fall back to token presence (profile view)
  const token = getWapi().readToken();
  const isOwner = isOwnerProp !== undefined ? isOwnerProp : token !== null;

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + media.length) % media.length);
  }, [media.length]);
  const next = useCallback(() => {
    setIndex(i => (i + 1) % media.length);
  }, [media.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && multiple) prev();
      else if (e.key === 'ArrowRight' && multiple) next();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next, multiple]);

  // Load like state
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      countReactions('posts', post._id || ''),
      token ? readReactions('posts', post._id || '') : Promise.resolve([]),
      countComments(post._id || ''),
    ]).then(([count, reactions, cCount]) => {
      if (cancelled) return;
      setReactionCount(count);
      setLiked(!!reactions.find(
        r => r.author_username === token.username && r.author_provider === token.provider && r.type === 'like',
      ));
      setCommentCount(cCount);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [post._id, token]);

  async function handleToggleLike() {
    if (!token) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setReactionCount(prev => prev + (wasLiked ? -1 : 1));
    if (!wasLiked) {
      setBurstKey(k => k + 1);
    }
    try {
      await toggleReaction('posts', post._id || '', 'like', token.username, token.provider, postAuthor, postService);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      setLiked(wasLiked);
      setReactionCount(prev => prev + (wasLiked ? 1 : -1));
    }
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await updatePost(post._id || '', { text: editDraft, updated_at: new Date().toISOString() });
      setEditing(false);
      onClose();
      onReload?.();
    } catch (e) {
      console.error('Failed to update post:', e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deletePost(post._id || '');
      onClose();
      onReload?.();
    } catch (e) {
      console.error('Failed to delete post:', e);
    }
  }

  async function handleToggleVisibility() {
    setTogglingVisibility(true);
    try {
      await movePostVisibility(post);
      onClose();
      onReload?.();
    } catch (e) {
      console.error('Failed to toggle visibility:', e);
    } finally {
      setTogglingVisibility(false);
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/u/${postAuthor || 'unknown'}/p/${post._id || 'unknown'}`;
    if (navigator.share) {
      navigator.share({ title: post.text?.slice(0, 100) || 'Post on web10', url }).catch(() => {
        copyUrl();
      });
    } else {
      copyUrl();
    }
    function copyUrl() {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  const current = media[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-overlay-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Post"
      data-testid="post-lightbox"
    >
      <div
        className="relative flex w-full max-w-4xl max-h-[88vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_30px_rgb(0_0_0/0.35)] animate-panel-in sm:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          data-testid="post-lightbox-close"
          className="absolute right-2 top-2 z-10 bg-background/60 backdrop-blur-sm hover:bg-background/80"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Media pane */}
        {hasMedia && (
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
            {current.mime_type?.startsWith('video/') ? (
              <video
                key={current._id || current.url}
                src={current.url}
                poster={current.thumbnail_url}
                controls
                playsInline
                className="max-h-[50vh] w-full object-contain sm:max-h-[88vh]"
              />
            ) : (
              <img
                src={current.url}
                alt={current.alt_text || ''}
                className="max-h-[50vh] w-full object-contain sm:max-h-[88vh]"
              />
            )}
            {multiple && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous"
                  data-testid="post-lightbox-prev"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Next"
                  data-testid="post-lightbox-next"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-2 py-0.5 text-xs font-mono tabular-nums text-foreground backdrop-blur-sm">
                  {index + 1} / {media.length}
                </div>
              </>
            )}
          </div>
        )}

        {/* Details pane */}
        <div className="flex min-h-0 shrink-0 flex-col overflow-y-auto p-5 pr-14 sm:w-80">
          {/* Timestamp */}
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(post.created_at)}
          </span>

          {/* Text content (editable) */}
          {editing ? (
            <div className="mt-3 space-y-2">
              <Textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                placeholder="Edit post…"
                className="text-sm min-h-[80px] resize-none"
                data-testid="post-edit-input"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="brand"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  data-testid="post-edit-save"
                  className="text-xs"
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditing(false); setEditDraft(post.text || ''); }}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : post.text ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {post.text}
            </p>
          ) : (
            !hasMedia && (
              <p className="mt-3 text-sm text-muted-foreground">This post has no content.</p>
            )
          )}

          {/* Actions bar */}
          <div className="flex items-center gap-1 mt-3">
            {/* Like */}
            <button
              key={burstKey}
              data-testid="like-button"
              aria-pressed={liked}
              onClick={handleToggleLike}
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

            {/* Comment */}
            <button
              data-testid="comment-button"
              aria-expanded={commentsOpen}
              onClick={() => setCommentsOpen((o) => !o)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm text-muted-foreground hover:text-foreground hover:bg-elevated/80 transition-all duration-150"
            >
              <MessageCircle className="w-[18px] h-[18px]" strokeWidth={1.75} />
              <span className="tabular-nums">{commentCount || ''}</span>
            </button>

            {/* Share */}
            <button
              data-testid="share-button"
              onClick={handleShare}
              aria-label={copied ? 'Copied!' : 'Share'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm transition-all duration-150',
                copied
                  ? 'text-success'
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80',
              )}
            >
              {copied ? (
                <Check className="w-[18px] h-[18px]" strokeWidth={1.75} />
              ) : (
                <Share2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
              )}
            </button>
          </div>

          {/* Comment thread */}
          <CommentThread
            postId={post._id || ''}
            isOpen={commentsOpen}
            count={commentCount}
            postAuthor={postAuthor}
            postService={postService}
            onCountChange={setCommentCount}
          />

          {/* Owner actions */}
          {isOwner && !editing && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleVisibility}
                disabled={togglingVisibility}
                className="text-sm text-muted-foreground hover:text-foreground gap-1.5 w-full justify-start"
                data-testid="post-visibility-toggle-button"
              >
                {post.visibility === 'public' ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                {togglingVisibility ? 'Updating…' : post.visibility === 'public' ? 'Make private' : 'Make public'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setEditing(true); setEditDraft(post.text || ''); }}
                className="text-sm text-muted-foreground hover:text-foreground gap-1.5 w-full justify-start"
                data-testid="post-edit-button"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit post
              </Button>

              {deleteConfirm === 'delete' ? (
                <div className="space-y-2">
                  <p className="text-xs text-danger">Type <span className="font-mono font-medium">delete</span> to confirm</p>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="delete"
                    className="h-8 text-xs"
                    data-testid="post-delete-confirm-input"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      className="text-xs flex-1"
                      data-testid="post-delete-confirm-button"
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm('')}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirm('')}
                  className="text-sm text-danger hover:text-danger hover:bg-danger-muted gap-1.5 w-full justify-start"
                  data-testid="post-delete-button"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete post
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}