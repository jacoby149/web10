import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PostRecord, MediaRecord } from '@/data/types';
import { mediaRefId } from '@/data/types';
import { getWapi } from '@/data/wapi';
import {
  toggleReactionKind,
  readReactions,
  countComments,
  deletePost,
  movePostVisibility,
  readRepostCounts,
  readMyRepostedIds,
  getDiscoverGroupId,
  type ReactionKind,
} from '@/data';
import { useRepost } from '@/context/RepostContext';
import { useComposer } from '@/context/ComposerContext';
import { PostDetail } from '@/components/Feed/PostDetail';
import { AttachedAd } from '@/components/Feed/AttachedAd';
import { toast, errorMessage } from '@/components/shared/Toast';
import { cn } from '@/lib/utils';
import { VideoPlayer, sourceFromMedia } from '@/components/Feed/VideoPlayer';

/** A single frame in the lightbox's swipeable media strip. Video renders
 *  through the full player (the modal modality); an image is an `<img>` fit to
 *  the frame. The strip (below) lays these out as full-width snap slides so a
 *  mobile swipe pages the post's frames (native scroll-snap, no dep). */
function LightboxSlide({ media, testId }: { media: MediaRecord; testId?: string }) {
  const isVideo = media.mime_type?.startsWith('video/');
  if (isVideo) {
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
        testId={source.type === 'file' ? testId : undefined}
        maxWidth={portrait ? 'min(50vh, 100%)' : undefined}
        className={source.type === 'file' ? 'max-h-[50vh] sm:max-h-[88vh]' : 'w-full'}
      />
    );
  }
  return (
    <img
      src={media.url}
      alt={media.alt_text || ''}
      className="h-full w-full object-contain"
      data-testid={testId}
    />
  );
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
    indexRef.current = 0;
    setIndex(0);
    const el = stripRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ left: 0 });
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

  // Comment state (the thread's open/closed state lives in <PostDetail>)
  const [commentCount, setCommentCount] = useState(0);

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

  // The swipeable media strip (mobile): a scroll-snap row of the post's frames.
  // Swiping the strip (native scroll-snap) + the arrows + the keyboard all
  // converge on the same `index`. The strip is the source of truth for position
  // — a swipe updates `index` via `onScroll`, and the arrows/keyboard scroll the
  // strip to the target frame (so the arrows and the swipe can't disagree).
  // `indexRef` mirrors `index` so a rapid arrow/keyboard press reads the
  // settled frame, not a mid-animation `scrollLeft`.
  const stripRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);

  const scrollToIndex = useCallback((i: number) => {
    const el = stripRef.current;
    indexRef.current = i;
    setIndex(i);
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    }
  }, []);

  // The strip's onScroll (a swipe) keeps `index` in sync with the scroll
  // position — the indicator follows the finger.
  function onStripScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (!el || el.clientWidth === 0) return;
    const i = Math.min(media.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    indexRef.current = i;
    setIndex(i);
  }

  // The arrows + keyboard page the strip (a swipe updates `index` the same way).
  const prevFrame = useCallback(() => {
    scrollToIndex((indexRef.current - 1 + media.length) % media.length);
  }, [media.length, scrollToIndex]);
  const nextFrame = useCallback(() => {
    scrollToIndex((indexRef.current + 1) % media.length);
  }, [media.length, scrollToIndex]);

  const hasPostNav = Boolean(onPrevPost || onNextPost);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // With post navigation (the profile grid), the arrows step through the
      // PROFILE'S posts — Instagram's model. Without it, they page the
      // post's own media (the multi-frame carousel).
      else if (e.key === 'ArrowLeft' && hasPostNav) onPrevPost?.();
      else if (e.key === 'ArrowRight' && hasPostNav) onNextPost?.();
      else if (e.key === 'ArrowLeft' && multiple) prevFrame();
      else if (e.key === 'ArrowRight' && multiple) nextFrame();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prevFrame, nextFrame, multiple, hasPostNav, onPrevPost, onNextPost]);

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

  const signedIn = token !== null;

  // The lightbox's media (the swipeable carousel) — injected into the shared
  // post-detail layout between the body and the stats row. The pane is a
  // scroll-snap strip of the post's frames: on mobile a swipe pages the
  // carousel (native scroll-snap, no dep), and the arrows + keyboard converge
  // on the same `index`. A single frame is the same strip with one slide (no
  // arrows/indicator). The pane sizes to the first frame's ratio (capped) so
  // the `h-full` slides have a defined box.
  const frameRatio = media[0]?.width && media[0]?.height ? media[0].width / media[0].height : 4 / 3;
  const mediaPane = hasMedia && (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black max-h-[50vh] sm:max-h-[88vh]"
      style={{ aspectRatio: frameRatio }}
      data-testid="post-lightbox-media-pane"
    >
      <div
        ref={stripRef}
        onScroll={onStripScroll}
        data-testid="post-lightbox-strip"
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={`${media.length} media items`}
      >
        {media.map((m, i) => (
          <div
            key={m._id || i}
            className="flex h-full w-full shrink-0 snap-start items-center justify-center"
          >
            <LightboxSlide media={m} testId={`post-lightbox-media-${i}`} />
          </div>
        ))}
      </div>
      {/* The in-pane media arrows page the post's own frames. They are
          suppressed when post nav owns the side arrows (the profile
          grid's Instagram-style prev/next post) — otherwise a
          multi-frame post shows TWO chevrons per side (the media
          arrows here + the post arrows on the backdrop). The frame
          counter stays either way, so the current frame is always
          visible. */}
      {multiple && !hasPostNav && (
        <>
          <button
            type="button"
            onClick={prevFrame}
            aria-label="Previous"
            data-testid="post-lightbox-prev"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={nextFrame}
            aria-label="Next"
            data-testid="post-lightbox-next"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-1.5 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
      {multiple && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-2 py-0.5 text-xs font-mono tabular-nums text-foreground backdrop-blur-sm">
          {index + 1} / {media.length}
        </div>
      )}
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
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_30px_rgb(0_0_0/0.35)] animate-panel-in"
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

        {/* The shared post-detail layout (the post-detail system). The modal
            sizes to content — a text-only post gets a centered reading column
            (max-w-prose), not 320px-in-896px dead space. The media (the
            swipeable carousel) is injected between the body and the stats row. */}
        <div className="min-h-0 overflow-y-auto p-5 pr-14">
          <PostDetail
            post={currentPost}
            authorName={postAuthor}
            authorAvatar={currentPost.avatar_url}
            isOwner={isOwner}
            signedIn={signedIn}
            liked={liked}
            disliked={disliked}
            likeCount={likeCount}
            dislikeCount={dislikeCount}
            commentCount={commentCount}
            reposted={reposted}
            repostCount={repostCount}
            onToggleReaction={handleToggleReaction}
            onToggleRepost={handleRepost}
            onShare={handleShare}
            onCommentCountChange={setCommentCount}
            shared={copied}
            postService={postService}
            highlightedCommentId={highlightedCommentId}
            onAuthorClick={(username) => navigate(`/u/${username}`)}
            onEdit={() => openComposer({ editingPost: currentPost })}
            onToggleVisibility={handleToggleVisibility}
            visibilityToggling={togglingVisibility}
            onDelete={handleDelete}
            media={mediaPane}
            testId="post-lightbox-detail"
          />

          {/* Carried ads (D55 + D57): the creator's pinned ad + the node's ad
              can both be present — render both, neither suppressing the other.
              Each renders per its format (attached variant — the compact
              AdBlock / the post-format card inside the lightbox). */}
          {(currentPost.ad || currentPost.node_ad) && (
            <div className="mt-3 -mx-1 px-4 space-y-2">
              {currentPost.ad && <AttachedAd ad={currentPost.ad} />}
              {currentPost.node_ad && <AttachedAd ad={currentPost.node_ad} />}
            </div>
          )}
        </div>
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
