import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Edit3, Trash2, Eye, EyeOff, Share2, Check, Globe, Lock, Users, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { PostRecord, MediaRecord, AdRecord, Visibility } from '@/data/types';
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
import { useComposer } from '@/context/ComposerContext';
import { PostBody } from '@/components/Feed/PostBody';
import { AttachedAd } from '@/components/Feed/AttachedAd';
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
  // Instagram-style post navigation (the profile grid's modal): when the
  // parent supplies a prev/next post, the lightbox's side arrows step through
  // the PROFILE'S posts (not the post's media). The parent owns the list +
  // the index; the lightbox just swaps the `post` prop it renders.
  onPrevPost?: () => void;
  onNextPost?: () => void;
}

export function PostLightbox({ post, mediaMap, onClose, onReload, postAuthor, postService, isOwner: isOwnerProp, highlightedCommentId, onPrevPost, onNextPost }: PostLightboxProps) {
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

  // The parent can swap the post in place (the profile grid's Instagram-style
  // prev/next post arrows). `currentPost` is internal state (it tracks
  // in-place mutations like the visibility toggle's new _id), so a prop swap
  // must re-sync it — and the media index resets to the first frame of the
  // new post. (The initial mount is a no-op: the state already equals the
  // prop.)
  useEffect(() => {
    setCurrentPost(post);
    setIndex(0);
  }, [post]);

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

  // Editing is NOT inline — it opens the app-level composer sheet in edit mode
  // (openComposer({ editingPost }) — the ONE edit path, so the lightbox stays
  // the read surface). No edit state lives here.

  // Visibility toggle state
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  // Share state
  const [copied, setCopied] = useState(false);

  // The owner's `⋯` menu (the post-detail's owner actions — a menu, not a flat
  // list). The delete confirm is two-tap inside the menu (Delete → Confirm
  // delete), not a type-to-confirm input.
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  // Check ownership: explicit prop wins, otherwise derive it from the post's
  // author (v3: author_key is the bare username, so compare usernames — the
  // same rule as the feed's isOwnPost). The old `token !== null` fallback
  // showed the owner menu on every post while signed in (the discover bug).
  const token = getWapi().readToken();
  const isOwner = isOwnerProp !== undefined
    ? isOwnerProp
    : token !== null && post.author_username === token.username;

  // The identity row (the Facebook "read a post in full" header): the author's
  // avatar + name + @handle + timestamp + privacy glyph. The name comes from
  // the feed's inline profile read (D69) when present, else the @handle.
  const authorUsername = currentPost.author_username || postAuthor || '';
  const authorName = currentPost.profile?.display_name || authorUsername;
  const authorAvatar = currentPost.avatar_url || currentPost.profile?.avatar_ref || null;
  const visibility: Visibility = currentPost.visibility || 'public';
  const privacyGlyph =
    visibility === 'private'
      ? { Icon: Lock, label: 'Private' }
      : visibility === 'friends'
        ? { Icon: Users, label: 'Followers only' }
        : { Icon: Globe, label: 'Public' };

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + media.length) % media.length);
  }, [media.length]);
  const next = useCallback(() => {
    setIndex(i => (i + 1) % media.length);
  }, [media.length]);

  const hasPostNav = Boolean(onPrevPost || onNextPost);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // With post navigation (the profile grid), the arrows step through the
      // PROFILE'S posts — Instagram's model. Without it, they page the
      // post's own media (the multi-frame carousel).
      else if (e.key === 'ArrowLeft' && hasPostNav) onPrevPost?.();
      else if (e.key === 'ArrowRight' && hasPostNav) onNextPost?.();
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
  }, [onClose, prev, next, multiple, hasPostNav, onPrevPost, onNextPost]);

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
  // RepostContext seam) with this post as the context — the New Post sheet
  // pops up in place (no navigation; the user stays on the post). The
  // composer's createRepost is the single write; the count + fill
  // re-derive from the post-based read on the next load.
  const { setRepostingTo } = useRepost();
  const { openComposer } = useComposer();
  function handleRepost() {
    setRepostingTo(currentPost);
    openComposer();
  }

  async function handleDelete() {
    setDeleteArmed(false);
    setMenuOpen(false);
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
  const { Icon: PrivacyIcon } = privacyGlyph;
  // A text-only post (no media) gets a centered reading column, not a
  // media-pane + details-pane split with dead space (the post-detail system).
  const textOnly = !hasMedia;

  // The labeled action bar's trailing slots: the lightbox's Share button + the
  // owner's `⋯` menu (a menu, not a flat list). Shared by the text-only and
  // media layouts.
  const trailingActions = (
    <>
      <button
        data-testid="share-button"
        onClick={handleShare}
        aria-label={copied ? 'Copied!' : 'Share'}
        className={cn(
          'flex items-center justify-center gap-2 px-2.5 py-2.5 rounded-lg min-h-11 text-sm font-medium transition-all duration-150',
          copied
            ? 'text-success'
            : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80',
        )}
      >
        {copied ? <Check className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Share2 className="w-[18px] h-[18px]" strokeWidth={1.75} />}
        <span>Share</span>
      </button>
      {isOwner && (
        <div className="relative">
          <button
            type="button"
            aria-label="Post options"
            aria-expanded={menuOpen}
            data-testid="post-options-button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            className="flex items-center justify-center rounded-lg p-2.5 text-muted-foreground hover:text-foreground hover:bg-elevated/80 transition-all duration-150"
          >
            <MoreHorizontal className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} aria-hidden="true" />
              <div
                className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
                data-testid="post-options-menu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); void handleToggleVisibility(); }}
                  disabled={togglingVisibility}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors disabled:opacity-50"
                  data-testid="post-visibility-toggle-button"
                >
                  {currentPost.visibility === 'public' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {togglingVisibility ? 'Updating…' : currentPost.visibility === 'public' ? 'Make private' : 'Make public'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); openComposer({ editingPost: currentPost }); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                  data-testid="post-edit-button"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit post
                </button>
                {deleteArmed ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-muted transition-colors"
                    data-testid="post-delete-confirm-button"
                  >
                    <Trash2 className="w-4 h-4" />
                    Confirm delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteArmed(true)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-muted transition-colors"
                    data-testid="post-delete-button"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete post
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );

  // The quiet stats row (the Facebook "N likes · M comments" line above the
  // actions).
  const statsRow = (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="post-lightbox-stats">
      <span className="tabular-nums">{likeCount}</span>
      <span>likes</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{commentCount}</span>
      <span>comments</span>
    </div>
  );

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
        className={cn(
          'relative flex max-h-[88vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_30px_rgb(0_0_0/0.35)] animate-panel-in',
          textOnly ? 'w-full max-w-2xl' : 'w-full max-w-5xl',
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Identity row (the Facebook "read a post in full" header): avatar +
            name + @handle + timestamp + privacy glyph, with the close button
            trailing. */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3" data-testid="post-lightbox-identity">
          <Avatar className="h-10 w-10">
            {authorAvatar ? (
              <AvatarImage src={authorAvatar} alt={authorName} />
            ) : (
              <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
                {authorName.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => authorUsername && navigate(`/u/${authorUsername}`)}
                className="truncate text-sm font-semibold text-foreground hover:text-brand-300 transition-colors"
                aria-label={`View ${authorName}'s profile`}
                data-testid="post-lightbox-author"
              >
                {authorName}
              </button>
              {visibility !== 'public' && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="post-lightbox-privacy">
                  <PrivacyIcon className="h-3 w-3" />
                  {privacyGlyph.label}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {authorUsername && <span>@{authorUsername}</span>}
              <span> · {formatTimeAgo(currentPost.created_at)}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            data-testid="post-lightbox-close"
            className="shrink-0 -mr-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {textOnly ? (
          /* Text-only post: a single centered reading column (the
              "beautiful Notion" surface), not a media-pane + details-pane
              split with dead space. */
          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-8" data-testid="post-lightbox-text-only">
            <div className="mx-auto max-w-prose">
              {currentPost.title && (
                <h2 className="mb-3 font-display text-2xl font-medium tracking-tight text-foreground" data-testid="post-lightbox-title">
                  {currentPost.title}
                </h2>
              )}
              {currentPost.text ? (
                <PostBody text={currentPost.text} density="full" className="text-[0.9375rem] leading-relaxed" />
              ) : (
                <p className="text-sm text-muted-foreground">This post has no content.</p>
              )}
              <div className="mt-4">{statsRow}</div>
              <div className="mt-3 border-t border-border pt-1">
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
                  layout="labeled"
                  testId="lightbox-post-actions"
                  trailing={trailingActions}
                />
              </div>
              {(currentPost.ad || currentPost.node_ad) && (
                <div className="mt-3 space-y-2">
                  {currentPost.ad && <AttachedAd ad={currentPost.ad} />}
                  {currentPost.node_ad && <AttachedAd ad={currentPost.node_ad} />}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Media post: the media viewer (left) + the details column (right).
             On mobile the whole thing scrolls as one unit (media + details
             natural height); on desktop it's a row with the details column
             scrolling internally. */
          <div className="flex flex-col overflow-y-auto sm:min-h-0 sm:flex-1 sm:flex-row sm:overflow-hidden">
            <div className="relative flex items-center justify-center bg-black sm:min-h-0 sm:flex-1">
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

            <div className="flex flex-col p-5 sm:min-h-0 sm:w-[28rem] sm:shrink-0 sm:overflow-y-auto">
              {currentPost.title && (
                <h2 className="mb-2 font-display text-xl font-medium tracking-tight text-foreground" data-testid="post-lightbox-title">
                  {currentPost.title}
                </h2>
              )}
              {currentPost.text && (
                <div className="text-[0.9375rem] leading-relaxed text-foreground">
                  <PostBody text={currentPost.text} density="full" />
                </div>
              )}
              <div className="mt-3">{statsRow}</div>
              <div className="mt-2 border-t border-border pt-1">
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
                  layout="labeled"
                  testId="lightbox-post-actions"
                  trailing={trailingActions}
                />
              </div>
              {(currentPost.ad || currentPost.node_ad) && (
                <div className="mt-3 -mx-1 px-4 space-y-2">
                  {currentPost.ad && <AttachedAd ad={currentPost.ad} />}
                  {currentPost.node_ad && <AttachedAd ad={currentPost.node_ad} />}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Instagram-style post navigation (the profile grid's modal): the side
          arrows live on the backdrop, outside the panel — the modal steps
          through the PROFILE'S posts, not just the post's media. (The
          media-carousel arrows stay inside the media pane, for the
          post's own frames.) */}
      {onPrevPost && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrevPost(); }}
          aria-label="Previous post"
          data-testid="post-lightbox-prev-post"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/60 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80 sm:left-4"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {onNextPost && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNextPost(); }}
          aria-label="Next post"
          data-testid="post-lightbox-next-post"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/60 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80 sm:right-4"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}