import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Edit3, Trash2, Eye, EyeOff, Share2, Check, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { PostRecord, MediaRecord, AdRecord } from '@/data/types';
import { mediaRefId } from '@/data/types';
import { getWapi } from '@/data/wapi';
import {
  toggleReactionKind,
  readReactions,
  countComments,
  updatePost,
  deletePost,
  movePostVisibility,
  readMyAds,
  readRepostCounts,
  readMyRepostedIds,
  getDiscoverGroupId,
  type ReactionKind,
  type AdAlbum,
} from '@/data';
import { PostActions } from '@/components/Feed/PostActions';
import { useRepost } from '@/context/RepostContext';
import { TextWithLinks } from '@/components/Feed/LinkEmbed';
import { AdBlock } from '@/components/Feed/AdBlock';
import { AdPicker } from '@/components/Feed/AdPicker';
import { toast, errorMessage } from '@/components/shared/Toast';
import { cn } from '@/lib/utils';
import { VideoPlayer, sourceFromMedia } from '@/components/Feed/VideoPlayer';

/** The lightbox's video pane — the modal modality (video-player.md): the full
 *  player. Transcoded plays the hls.js rack; non-transcoded plays native
 *  controls. Both route through the shared <VideoPlayer>.
 *
 *  A portrait (9:16) clip is capped to a square-ish frame (`maxWidth`) and
 *  centered in a black letterbox — the full-width 9:16 frame would be ~1.78×
 *  the viewport tall (clipped by the modal, the rack stranded off-screen).
 *  The operator liked the square frame; the cap restores it for vertical video. */
function LightboxVideo({ media }: { media: MediaRecord }) {
  const source = sourceFromMedia(media);
  // width/height exist on the hls + file variants (not the youtube embed, which
  // the lightbox never renders). A portrait clip (width < height) gets the
  // square-ish cap.
  const dims = source.type === 'youtube' ? null : { w: source.width, h: source.height };
  const portrait = !!dims && !!dims.w && !!dims.h && dims.w < dims.h;
  return (
    <VideoPlayer
      source={source}
      mode="full"
      fit="contain"
      testId={source.type === 'file' ? 'lightbox-video' : undefined}
      maxWidth={portrait ? 'min(50vh, 100%)' : undefined}
      className={source.type === 'file' ? 'max-h-[50vh] sm:max-h-[88vh]' : 'w-full'}
    />
  );
}

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
  highlightedCommentId?: string;
}

export function PostLightbox({ post, mediaMap, onClose, onReload, postAuthor, postService, isOwner: isOwnerProp, highlightedCommentId }: PostLightboxProps) {
  const navigate = useNavigate();
  // Track the live post — initialized from the prop but updated in-place
  // after mutations (visibility toggle, edit) so a re-toggle uses the fresh
  // _id + visibility, not the stale prop. Without this, public→private→public
  // duplicates the post because the second toggle deletes the old _id.
  const [currentPost, setCurrentPost] = useState(post);
  const media = (currentPost.media_refs || [])
    .map(ref => mediaMap[mediaRefId(ref)])
    .filter((m): m is MediaRecord => Boolean(m));
  const [index, setIndex] = useState(0);
  const hasMedia = media.length > 0;
  const multiple = media.length > 1;

  // Like state (post-actions.md: the reaction pair — like XOR dislike). The
  // like and dislike counts are tracked separately (each tally shows its own
  // number — the heart and the thumb are the same).
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0);
  // Repost state (reposts.md: independent of like/dislike).
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(0);

  // Comment state (the thread's open/closed state lives in <PostActions>)
  const [commentCount, setCommentCount] = useState(0);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(currentPost.text || '');
  const [saving, setSaving] = useState(false);

  // The edit flow's "Pin an ad" (ad-improvements.md): swap / clear the post's
  // pinned ad. `pinnedAdId` is the ad's doc_id (null = no ad); the picker
  // lazy-loads the creator's ads (the PostComposer pattern).
  const [pinnedAdId, setPinnedAdId] = useState<string | null>(currentPost.ad_target || null);
  const [showAdPicker, setShowAdPicker] = useState(false);
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [albums, setAlbums] = useState<AdAlbum[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);

  const openAdPicker = useCallback(async () => {
    setPinnedAdId(currentPost.ad_target || null);
    setShowAdPicker(true);
    if (!ads.length && !loadingAds) {
      setLoadingAds(true);
      try {
        const { ads: myAds, albums: myAlbums } = await readMyAds();
        setAds(myAds);
        setAlbums(myAlbums);
      } catch (e) {
        console.warn('[social-lightbox] readMyAds failed:', e);
      } finally {
        setLoadingAds(false);
      }
    }
  }, [currentPost.ad_target, ads.length, loadingAds]);

  // Delete confirm state. `deleteArmed` reveals the confirm UI (type "delete"
  // to proceed); `deleteConfirm` is the typed value that gates the confirm
  // button. (Previously the confirm UI was gated on deleteConfirm === 'delete',
  // which was unreachable — the input that sets it only rendered after it was
  // already 'delete', so the delete button did nothing.)
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // Visibility toggle state
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  // Share state
  const [copied, setCopied] = useState(false);

  // Check ownership: explicit prop wins, otherwise derive it from the post's
  // author (v3: author_key is the bare username, so compare usernames — the
  // same rule as the feed's isOwnPost). The old `token !== null` fallback
  // showed the owner menu on every post while signed in (the discover bug).
  const token = getWapi().readToken();
  const isOwner = isOwnerProp !== undefined
    ? isOwnerProp
    : token !== null && post.author_username === token.username;

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

  // Load reaction + comment state (the lightbox reads fresh — it's a modal,
  // not a feed). The like and dislike counts are derived from the reactions
  // read (each type counted separately — the heart and the thumb are the same).
  //
  // Repost (reposts.md: a repost is a POST, not a reaction). The count is the
  // number of `repost_of` posts (readRepostCounts, the feed query's I3-scoped
  // join lifted to a surface read) and the "I reposted this" fill is the
  // reader's own repost post (readMyRepostedIds, the readFeedReactions
  // own-post read lifted to a surface read). The legacy `type:'repost'`
  // reaction still fills for old data (a read-only fallback).
  useEffect(() => {
    let cancelled = false;
    const postId = currentPost._id || '';
    Promise.all([
      token ? readReactions('posts', postId) : Promise.resolve([]),
      countComments(postId),
      readRepostCounts([postId], [getDiscoverGroupId()]),
      readMyRepostedIds(),
    ]).then(([reactions, cCount, repostCounts, myReposts]) => {
      if (cancelled) return;
      setLikeCount(reactions.filter((r) => r.type === 'like').length);
      setDislikeCount(reactions.filter((r) => r.type === 'dislike').length);
      // v3 ownership is by username alone: a reaction's author_key is the
      // bare username, so author_provider is the v2 fallback ('web10') and
      // never equals the token's real provider — comparing it left the
      // heart un-filled on a post the user had already liked (same class as
      // the feed's isOwnPost fix, 3.79.3).
      setLiked(!!reactions.find(
        r => r.author_username === token.username && r.type === 'like',
      ));
      setDisliked(!!reactions.find(
        r => r.author_username === token.username && r.type === 'dislike',
      ));
      // Repost (reposts.md): the count is the number of `repost_of` posts; the
      // fill is the reader's own repost post (the legacy reaction is a
      // read-only fallback for old data).
      setRepostCount(repostCounts[postId] || 0);
      setReposted(
        myReposts.has(postId) ||
        !!reactions.find(
          r => r.author_username === token.username && r.type === 'repost',
        ),
      );
      setCommentCount(cCount);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [currentPost._id, token]);

  // The reaction pair (post-actions.md): like XOR dislike. Optimistic update
  // of both flags + both counts, rollback on error. The data layer
  // (toggleReactionKind) enforces the mutual exclusion server-side. The delta
  // is computed per-tally from the CURRENT flags (a like↔dislike swap moves
  // the reaction: like -1, dislike +1) — the old single `delta` was wrong on
  // a swap (the "0 1 0 1" flicker).
  async function handleToggleReaction(kind: ReactionKind) {
    if (!token) return;
    const wasLiked = liked;
    const wasDisliked = disliked;
    const nextLiked = kind === 'like' ? !wasLiked : false;
    const nextDisliked = kind === 'dislike' ? !wasDisliked : false;
    const likeDelta = (nextLiked ? 1 : 0) - (wasLiked ? 1 : 0);
    const dislikeDelta = (nextDisliked ? 1 : 0) - (wasDisliked ? 1 : 0);
    setLiked(nextLiked);
    setDisliked(nextDisliked);
    setLikeCount(prev => Math.max(0, prev + likeDelta));
    setDislikeCount(prev => Math.max(0, prev + dislikeDelta));
    try {
      await toggleReactionKind(currentPost._id || '', kind);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      toast.error(errorMessage(e, 'Could not update your reaction.'));
      setLiked(wasLiked);
      setDisliked(wasDisliked);
      setLikeCount(prev => Math.max(0, prev - likeDelta));
      setDislikeCount(prev => Math.max(0, prev - dislikeDelta));
    }
  }

  // Repost (reposts.md): a repost is a POST, not a reaction toggle. Tapping
  // the repeat icon opens the app-level composer in repost mode (the shared
  // RepostContext seam — the same composer the feed uses) with this post as
  // the context. The composer's createRepost is the single write; the count +
  // fill re-derive from the post-based read on the next load.
  const { setRepostingTo } = useRepost();
  function handleRepost() {
    setRepostingTo(currentPost);
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      // The edit can also swap / clear the pinned ad (ad-improvements.md).
      const adPreference = pinnedAdId
        ? { mode: 'pinned' as const, target: pinnedAdId }
        : { mode: 'none' as const };
      await updatePost(currentPost._id || '', { text: editDraft, updated_at: new Date().toISOString() }, adPreference);
      setEditing(false);
      setShowAdPicker(false);
      onClose();
      onReload?.();
    } catch (e) {
      console.error('Failed to update post:', e);
      toast.error(errorMessage(e, 'Could not save your edit.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deletePost(currentPost._id || '');
      onClose();
      onReload?.();
    } catch (e) {
      console.error('Failed to delete post:', e);
      toast.error(errorMessage(e, 'Could not delete the post.'));
    }
  }

  async function handleToggleVisibility() {
    setTogglingVisibility(true);
    try {
      const moved = await movePostVisibility(currentPost);
      // Update local state with the server-created record (new _id) so a
      // re-toggle targets the right record. Without this, the second toggle
      // deletes the old _id, leaving a duplicate.
      setCurrentPost(moved);
      onClose();
      onReload?.();
    } catch (e) {
      console.error('Failed to toggle visibility:', e);
      toast.error(errorMessage(e, 'Could not change the post visibility.'));
    } finally {
      setTogglingVisibility(false);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/u/${postAuthor || 'unknown'}/p/${currentPost._id || 'unknown'}${highlightedCommentId ? `?comment=${highlightedCommentId}` : ''}`;
    // Share is a link (navigator.share / clipboard) — not a data write. The
    // repost is a separate, tappable signal on the engagement row (reposts.md).
    if (navigator.share) {
      navigator.share({ title: currentPost.text?.slice(0, 100) || 'Post on web10', url }).catch(() => {
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
              <LightboxVideo media={current} />
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
            {formatTimeAgo(currentPost.created_at)}
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
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => { setEditing(false); setEditDraft(currentPost.text || ''); setShowAdPicker(false); }}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={openAdPicker}
                  data-testid="post-edit-pin-ad"
                  className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  {pinnedAdId ? 'Change ad' : 'Pin an ad'}
                </Button>
              </div>
            </div>
) : currentPost.text ? (
              <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                <TextWithLinks text={currentPost.text} />
             </div>
           ) : (
            !hasMedia && (
              <p className="mt-3 text-sm text-muted-foreground">This post has no content.</p>
            )
          )}

          {/* Actions bar (post-actions.md): the shared reaction pair +
              comment entry, with the lightbox's share button trailing. */}
          <PostActions
            postId={currentPost._id || ''}
            liked={liked}
            disliked={disliked}
            reactionCount={likeCount}
            dislikeCount={dislikeCount}
            commentCount={commentCount}
            onToggleReaction={handleToggleReaction}
            onCommentCountChange={setCommentCount}
            postAuthor={postAuthor}
            postService={postService}
            highlightedCommentId={highlightedCommentId}
            defaultOpen={!!highlightedCommentId}
            onAuthorClick={(username) => navigate(`/u/${username}`)}
            dislike="interactive"
            repost="interactive"
            reposted={reposted}
            repostCount={repostCount}
            onToggleRepost={handleRepost}
            testId="lightbox-post-actions"
            trailing={
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
            }
          />

          {/* Carried ads (D55 + D57): the creator's pinned ad + the node's ad
               can both be present — render both, neither suppressing the other.
               The comment thread mounts with the actions bar above (PostActions). */}
          {(currentPost.ad || currentPost.node_ad) && (
            <div className="mt-3 -mx-1 px-4 space-y-2">
              {currentPost.ad && <AdBlock ad={currentPost.ad} />}
              {currentPost.node_ad && <AdBlock ad={currentPost.node_ad} />}
            </div>
          )}

          {/* The edit flow's "Pin an ad" picker (ad-improvements.md). */}
          <AdPicker
            open={showAdPicker}
            ads={ads}
            albums={albums}
            selectedAdId={pinnedAdId || undefined}
            loading={loadingAds}
            onClose={() => setShowAdPicker(false)}
            onSelect={(ad) => setPinnedAdId(ad._id || null)}
            onClear={() => setPinnedAdId(null)}
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
                {currentPost.visibility === 'public' ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                {togglingVisibility ? 'Updating…' : currentPost.visibility === 'public' ? 'Make private' : 'Make public'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setEditing(true); setEditDraft(currentPost.text || ''); }}
                className="text-sm text-muted-foreground hover:text-foreground gap-1.5 w-full justify-start"
                data-testid="post-edit-button"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit post
              </Button>

              {deleteArmed ? (
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
                      disabled={deleteConfirm !== 'delete'}
                      className="text-xs flex-1"
                      data-testid="post-delete-confirm-button"
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setDeleteArmed(false); setDeleteConfirm(''); }}
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
                  onClick={() => { setDeleteArmed(true); setDeleteConfirm(''); }}
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