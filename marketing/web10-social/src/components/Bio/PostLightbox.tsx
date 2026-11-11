import { ReliableImage } from '@web10/discover/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PostRecord, MediaRecord } from '@/data/types';
import { mediaRefId } from '@/data/types';
import { getWapi } from '@/data/wapi';
import { useActingAuthor, matchesActingAuthor } from '@/data/actingIdentity';
import { useMutationAuthority } from '@/data/mutationAuthority';
import { postPath } from '@/lib/postLinks';
import {
  toggleReactionKind,
  readReactions,
  countComments,
  deletePost,
  movePostVisibility,
  readRepostCounts,
  readMyRepostedIds,
  readViewCount,
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
import { PostMediaRenewal } from '@/components/Feed/PostMediaRenewal';
import { AudioPlayer, audioArtwork } from '@web10/discover';
import { musicArtist, musicTitle, musicTrackFromPost } from '@/data/musicTrack';

/** A single frame in the lightbox's swipeable media strip. Video renders
 *  through the full player (the modal modality); audio through the shared
 *  `AudioPlayer` (the same control the Posts feed renders for a music track —
 *  album art + the recording, never an `<img>` pointed at an mp3); an image
 *  is an `<img>` fit to the frame. The strip (below) lays these out as
 *  full-width snap slides so a mobile swipe pages the post's frames (native
 *  scroll-snap, no dep). */
function LightboxSlide({ media, items, title, artist, testId }: { media: MediaRecord; items: MediaRecord[]; title?: string; artist?: string; testId?: string }) {
  const isVideo = media.mime_type?.startsWith('video/');
  const isAudio = media.mime_type?.startsWith('audio/');
  if (isAudio) {
    return (
      <div className="w-full max-w-md px-1 py-2" data-testid="post-lightbox-audio">
        <AudioPlayer
          src={media.url}
          durationSeconds={media.duration_seconds}
          title={title}
          artist={artist}
          artworkUrl={audioArtwork(media, items)}
        />
      </div>
    );
  }
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
    <ReliableImage
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
  // A product (D89) carries its photo in `pics` (bare doc_ids), not
  // `media_refs` — the product card's photo comes from the same media map.
  const productPic = currentPost.product?.pics?.[0] ? mediaMap[currentPost.product.pics[0]] : undefined;
  const [index, setIndex] = useState(0);
  const hasMedia = media.length > 0;
  // The music-track collapse (music.md): a post that passes the shared
  // music gate (the `music` tag + exactly one playable media, audio or video)
  // renders as a SINGLE slide — for an audio track, the shared `AudioPlayer`
  // with the track's album art. Without this, a music post's frames would
  // page as [recording-slide, album-art-slide] and the recording would render
  // as an `<img>` (the "profile mp3 posts don't play" break — the audio
  // mime has no image to draw). A non-music audio item (a voice note) keeps
  // the per-frame strip; a music-video track keeps the video player.
  const musicAudio = (() => {
    if (!media.length) return null;
    const track = musicTrackFromPost(currentPost, media);
    return track && track.media.mime_type?.startsWith('audio/') ? track : null;
  })();
  const strip = musicAudio ? [musicAudio.media] : media;
  const multiple = strip.length > 1;
  const slideTitle = musicAudio ? musicTitle(musicAudio) : currentPost.title || undefined;
  const slideArtist = musicAudio ? musicArtist(musicAudio) : postAuthor;

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
  // The view metrics (D86) — impressions + reach in the stats row.
  const [viewImpressions, setViewImpressions] = useState(0);
  const [viewReach, setViewReach] = useState(0);

  // Visibility toggle state
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  // Share state
  const [copied, setCopied] = useState(false);

  // Profile ownership and the navigation identity are not mutation authority.
  const token = getWapi().readToken();
  // The SDK decodes a new object on each read. Depend on reader values,
  // never that object's identity, or every state update restarts engagement.
  const readerUsername = token?.username;
  const readerProvider = token?.provider;
  const readerExpires = token?.expires;
  const groupsKey = JSON.stringify(currentPost.groups);
  const engagementGeneration = useRef(0);
  const reactionRevision = useRef(0);
  const identity = useActingAuthor();
  const authority = useMutationAuthority(post.author_key || post.author_username, 'posts');
  const isOwner = authority.canEdit || authority.canDelete;

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
    const i = Math.min(strip.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    indexRef.current = i;
    setIndex(i);
  }

  // The arrows + keyboard page the strip (a swipe updates `index` the same way).
  const prevFrame = useCallback(() => {
    scrollToIndex((indexRef.current - 1 + strip.length) % strip.length);
  }, [strip.length, scrollToIndex]);
  const nextFrame = useCallback(() => {
    scrollToIndex((indexRef.current + 1) % strip.length);
  }, [strip.length, scrollToIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // The arrows page the post's own frames first (the multi-frame
      // carousel); with post navigation (the profile grid) they hand off to
      // the PROFILE'S posts only when the carousel is exhausted — last
      // frame → next post, first frame → prev post. Without post nav, the
      // arrows just page the post's own media (wrapping).
      else if (e.key === 'ArrowLeft') {
        if (multiple) {
          if (indexRef.current === 0 && onPrevPost) onPrevPost();
          else prevFrame();
        } else onPrevPost?.();
      } else if (e.key === 'ArrowRight') {
        if (multiple) {
          if (indexRef.current === strip.length - 1 && onNextPost) onNextPost();
          else nextFrame();
        } else onNextPost?.();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prevFrame, nextFrame, multiple, onPrevPost, onNextPost, strip.length]);

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
    const generation = ++engagementGeneration.current;
    const revision = reactionRevision.current;
    const postId = currentPost._id || '';
    const groups: string[] | undefined = groupsKey ? JSON.parse(groupsKey) : undefined;
    setLiked(false);
    setDisliked(false);
    setReposted(false);
    setLikeCount(0);
    setDislikeCount(0);
    setRepostCount(0);
    setCommentCount(0);
    setViewImpressions(0);
    setViewReach(0);
    console.log('[post-lightbox] engagement read started', { generation, signedIn: !!readerUsername });
    Promise.all([
      readerUsername ? readReactions('posts', postId, groups) : Promise.resolve([]),
      countComments(postId, groups),
      readRepostCounts([postId], groups || [getDiscoverGroupId()]),
      readMyRepostedIds(),
      readViewCount(postId, groups || [getDiscoverGroupId()]),
    ]).then(([reactions, cCount, repostCounts, myReposts, vCount]) => {
      if (cancelled) {
        console.log('[post-lightbox] stale engagement read ignored', { generation });
        return;
      }
      const reactionChanged = reactionRevision.current !== revision;
      console.log('[post-lightbox] engagement read completed', { generation, reactionChanged });
      if (!reactionChanged) {
        setLikeCount(reactions.filter((r) => r.type === 'like').length);
        setDislikeCount(reactions.filter((r) => r.type === 'dislike').length);
        // v3 ownership is by username alone: a reaction's author_key is the
        // bare username, so author_provider is the v2 fallback ('web10') and
        // never equals the token's real provider — comparing it left the
        // heart un-filled on a post the user had already liked (same class as
        // the feed's isOwnPost fix, 3.79.3).
        setLiked(!!reactions.find(
          r => matchesActingAuthor(r.author_key || r.author_username, readerUsername || '', identity || null) && r.type === 'like',
        ));
        setDisliked(!!reactions.find(
          r => matchesActingAuthor(r.author_key || r.author_username, readerUsername || '', identity || null) && r.type === 'dislike',
        ));
      }
      // Repost (reposts.md): the count is the number of `repost_of` posts; the
      // fill is the reader's own repost post (the legacy reaction is a
      // read-only fallback for old data).
      setRepostCount(repostCounts[postId] || 0);
      setReposted(
        myReposts.has(postId) ||
        !!reactions.find(
          r => matchesActingAuthor(r.author_key || r.author_username, readerUsername || '', identity || null) && r.type === 'repost',
        ),
      );
      setCommentCount(cCount);
      setViewImpressions(vCount.impressions);
      setViewReach(vCount.reach);
      // The view itself is the delivery — logged server-side when the post was
      // served (the feed/grid/permalink read that opened this lightbox passes
      // the D86 surface). No client-side "record a view" write: the node already
      // recorded the delivery, and a client write would be redundant + gameable.
    }).catch((error) => console.error('[post-lightbox] engagement read failed', error));
    return () => { cancelled = true; ++engagementGeneration.current; };
  }, [currentPost._id, groupsKey, readerUsername, readerProvider, readerExpires, identity]);

  // The reaction pair (post-actions.md): like XOR dislike. Optimistic update
  // of both flags + both counts, rollback on error. The data layer
  // (toggleReactionKind) enforces the mutual exclusion server-side. The delta
  // is computed per-tally from the CURRENT flags (a like↔dislike swap moves
  // the reaction: like -1, dislike +1) — the old single `delta` was wrong on
  // a swap (the "0 1 0 1" flicker).
  async function handleToggleReaction(kind: ReactionKind) {
    if (!token) return;
    const generation = engagementGeneration.current;
    const revision = ++reactionRevision.current;
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
    console.log('[post-lightbox] reaction write started', { generation, revision, kind });
    try {
      await toggleReactionKind(currentPost._id || '', kind, currentPost.groups);
      console.log('[post-lightbox] reaction write completed', { generation, revision });
    } catch (e) {
      console.error('[post-lightbox] reaction write failed', e);
      if (engagementGeneration.current !== generation || reactionRevision.current !== revision) return;
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
      if (currentPost.author_key?.includes('/groups/')) await deletePost(currentPost._id || '', currentPost.author_key);
      else await deletePost(currentPost._id || '');
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
    const url = `${window.location.origin}${postPath({ ...currentPost, author_username: postAuthor || currentPost.author_username })}${highlightedCommentId ? `?comment=${encodeURIComponent(highlightedCommentId)}` : ''}`;
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
  // the `h-full` slides have a defined box — EXCEPT the music-track slide
  // (the audio player sizes to its own content; a 4:3 black stage around a
  // music bar would read as a dead video frame).
  const frameRatio = strip[0]?.width && strip[0]?.height ? strip[0].width / strip[0].height : 4 / 3;
  const mediaPane = hasMedia && (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-lg',
        musicAudio ? '' : 'bg-black max-h-[50vh] sm:max-h-[88vh]',
      )}
      style={{ aspectRatio: musicAudio ? undefined : frameRatio }}
      data-testid="post-lightbox-media-pane"
    >
      <div
        ref={stripRef}
        onScroll={onStripScroll}
        data-testid="post-lightbox-strip"
        className={cn(
          'flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          musicAudio ? 'items-start' : 'h-full items-center',
        )}
        role="group"
        aria-label={`${strip.length} media items`}
      >
        {strip.map((m, i) => (
          <div
            key={m._id || i}
            className={cn(
              'flex w-full shrink-0 snap-start justify-center',
              musicAudio ? 'items-start' : 'h-full items-center',
            )}
          >
            <PostMediaRenewal postId={currentPost._id}>
              <LightboxSlide media={m} items={media} title={slideTitle} artist={slideArtist} testId={`post-lightbox-media-${i}`} />
            </PostMediaRenewal>
          </div>
        ))}
      </div>
      {/* The in-pane media arrows page the post's own frames. They render
          whenever the post has multiple frames — even when post nav is
          active (the profile grid's Instagram-style prev/next post) — and
          are the SAME size as the backdrop post-nav arrows (p-2, h-6 w-6)
          so both sets read as one system. Instagram's boundary rule: an
          arrow that would perform an impossible action is hidden — no
          prev on the first frame (there is no frame before it), no next
          on the last frame (there is no frame after it). Without this,
          a multi-frame post in a multi-post profile leaves the user
          stuck on frame 1 with no way to advance frames on desktop. */}
      {multiple && index > 0 && (
        <button
          type="button"
          onClick={prevFrame}
          aria-label="Previous"
          data-testid="post-lightbox-prev"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {multiple && index < media.length - 1 && (
        <button
          type="button"
          onClick={nextFrame}
          aria-label="Next"
          data-testid="post-lightbox-next"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background/80"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
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
      data-replay-private={post.visibility !== 'public' ? '' : undefined}
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
            groups={currentPost.groups}
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
            impressions={viewImpressions}
            reach={viewReach}
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
            onEdit={authority.canEdit ? () => openComposer({ editingPost: currentPost }) : undefined}
            onToggleVisibility={!authority.canEdit || currentPost.author_key?.includes('/groups/') ? undefined : handleToggleVisibility}
            visibilityToggling={togglingVisibility}
            onDelete={authority.canDelete ? handleDelete : undefined}
            media={mediaPane}
            productPic={productPic}
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
