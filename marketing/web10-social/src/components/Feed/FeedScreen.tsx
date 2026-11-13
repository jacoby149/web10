import { ReliableImage } from '@web10/discover/image';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useIsMobile } from '@/lib/pwa';
import { PostMediaRenewal } from './PostMediaRenewal';
import { useDwellTracking } from '@/hooks/useDwellTracking';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useActingAuthor, getActingAuthor, matchesActingAuthor } from '@/data/actingIdentity';
import { useMutationAuthority } from '@/data/mutationAuthority';
import { postPath } from '@/lib/postLinks';
import {
  readFeedPage,
  readFeedReactions,
  toggleReactionKind,
  type ReactionKind,
  readSettings,
  saveSettings,
  updatePost,
  deletePost,
  movePostVisibility,
  readPostById,
  resolveMediaRefs,
  readMyAds,
  MAX_PROFILE_PINS,
  type AdAlbum,
} from '@/data';
import { getWapi } from '@/data/wapi';
import { fromResolvedMediaRef, mediaRefId, type ResolvedMediaRef, type PostRecord, type MediaRecord, type AdRecord } from '@/data/types';
import {
  PRESETS,
  getPreset,
  type PresetId,
  type KnobState,
} from '@/lib/powerMean';
import { KnobRack } from '@/components/Discover/KnobRack';
import { FeedSourcesEditor } from './FeedSourcesEditor';
import { useFeedSources } from './useFeedSources';
import { createMixedFeedReader, type MixedFeedPage } from '@/data/mixedFeed';
import type { ServerAllocation } from '@/lib/serverMixer';
import { MoreHorizontal, Share2, Check, Edit3, Eye, EyeOff, Trash2, Repeat2, Megaphone, X, Film, Bookmark, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { PostActions } from './PostActions';
import { TextWithLinks } from './LinkEmbed';
import { PostBody } from './PostBody';
import { AdBlock } from './AdBlock';
import { AttachedAd } from './AttachedAd';
import { AdPicker } from './AdPicker';
import { useComposer } from '@/context/ComposerContext';
import { useSave } from '@/context/SaveContext';
import { VideoPlayer, sourceFromMedia } from './VideoPlayer';
import { MediaCarousel } from './MediaCarousel';
import { AudioPlayer, audioArtwork } from '@web10/discover';
import MusicFeedMedia from '@/components/Music/MusicFeedMedia';
import { FeedMusicQueue } from '@/context/FeedMusicContext';
import { musicQueueFromPosts } from '@/data/musicTrack';
import PostEntryPrompt from './PostEntryPrompt';
import { toast, errorMessage } from '@/components/shared/Toast';

const LOG = (...args: unknown[]) => console.log('[social:feed]', ...args);

// ── Feed knob state (D36 knobs on the feed — operator 30.08) ────────────────
// The feed gets the same sorting knobs as the trending page (the D36 rack:
// presets + 5 rotary knobs, power-mean re-ranking). The knob state is screen
// state, so the URL holds it (the deep-link rule — same ?knobs= encoding as
// DiscoverScreen): refresh restores the ranking, a shared link carries it.
// The state is ALSO persisted to the user's web10 `settings` service
// (settings.ts → the settings doc in the followers group), so the app
// remembers how the user tuned their feed across sessions and devices.
//
// Precedence: URL (?knobs=) > saved settings (feedKnobs) > the Newest preset
// (the feed is chronological until the user tunes it — the delivery pitch).

const KNOB_KEYS: (keyof KnobState)[] = ['recency', 'likes', 'comments', 'halfLife', 'character'];

function encodeKnobState(state: KnobState): string {
  return KNOB_KEYS.map((k) => String(state[k])).join(',');
}

function parseKnobParam(raw: string | null): KnobState | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== KNOB_KEYS.length) return null;
  const state = {} as KnobState;
  for (let i = 0; i < KNOB_KEYS.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 5) return null;
    state[KNOB_KEYS[i]] = n;
  }
  return state;
}

function presetIdForState(state: KnobState): PresetId | null {
  const match = PRESETS.find((p) => KNOB_KEYS.every((k) => p.state[k] === state[k]));
  return match ? match.id : null;
}

// The feed's default tuning: Most recent (pure chronological — "no algorithm"
// is the delivery pitch; the knobs are opt-in).
const FEED_DEFAULT_STATE = () => getPreset('most-recent')!.state;
const FEED_DEFAULT_ENCODING = encodeKnobState(FEED_DEFAULT_STATE());

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function MediaItem({ media, audioTitle, audioArtist }: { media: MediaRecord; audioTitle?: string; audioArtist?: string }) {
  const isVideo = media.mime_type?.startsWith('video/');
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null);

  if (media.mime_type?.startsWith('audio/')) {
    return <div className="p-4"><AudioPlayer src={media.url} durationSeconds={media.duration_seconds} title={audioTitle} artist={audioArtist} artworkUrl={audioArtwork(media)} /></div>;
  }

  // Video (D44): the shared <VideoPlayer> — transcoded plays the hls.js rack,
  // non-transcoded plays the shared inline tap-to-play. The feed is the inline
  // modality: natural ratio, object-contain, capped so a portrait clip can't
  // blow up the card. (video-player.md)
  if (isVideo) {
    const source = sourceFromMedia(media);
    return (
      <VideoPlayer
        source={source}
        mode={source.type === 'hls' ? 'full' : 'inline'}
        fit="contain"
        maxHeight="60vh"
        testId={source.type === 'file' ? 'media-video' : undefined}
      />
    );
  }

  // Image: the frame is reserved at the media's natural ratio (no layout
  // shift — that's the aspectRatio style, not the object-fit), and the photo
  // FILLS it (object-cover) so a multi-photo carousel crops to one consistent
  // frame instead of letterboxing. Measure on load only as a fallback for
  // legacy media that predates dimension storage.
  const src = media.thumbnail_url || media.url;
  const knownRatio = media.width && media.height ? media.width / media.height : null;
  const ratio = knownRatio ?? measuredRatio ?? 4 / 3;
  const onMediaLoaded = (el: HTMLImageElement) => {
    if (knownRatio) return;
    if (el.naturalWidth && el.naturalHeight) setMeasuredRatio(el.naturalWidth / el.naturalHeight);
  };
  // The 60vh cap only bites for a portrait photo (ratio < 1): a landscape photo
  // at full width is already shorter than the cap, so the cap is a no-op for it.
  // A portrait photo's frame shrinks to fit the capped height — center it in a
  // FULL-WIDTH BLACK "photobox" (the same shape the video player's heightCapped
  // cap produces: a black outer box, the media centered, black bars on the
  // sides) instead of leaving it left-aligned in the grey card.
  const heightCapped = ratio < 1;
  const containerStyle: React.CSSProperties = { aspectRatio: `${ratio}`, maxHeight: '60vh' };

  const frame = (
    <div
      className={cn('bg-elevated overflow-hidden group relative', heightCapped && 'mx-auto')}
      style={containerStyle}
      data-testid="media-image"
    >
      <ReliableImage
        src={src}
        alt={media.alt_text || ''}
        onLoad={(e) => onMediaLoaded(e.currentTarget)}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
    </div>
  );

  // A portrait photo is centered in a full-width black box (the "photobox"
  // letterbox — black bars on the sides, like the portrait video). A landscape
  // photo is full-width (no cap, no letterbox) and renders the frame directly.
  if (heightCapped) {
    return (
      <div className="w-full bg-black">
        {frame}
      </div>
    );
  }
  return frame;
}

function MediaGrid({ mediaItems, audioTitle, audioArtist, post, readOnlySource }: { mediaItems: MediaRecord[]; audioTitle?: string; audioArtist?: string; post?: PostRecord; readOnlySource?: boolean }) {
  if (!mediaItems.length) return null;
  const count = mediaItems.length;
  const first = mediaItems[0];

  // Single item: the natural-ratio MediaItem (unchanged). Multi-item: the
  // shared inline carousel (video-player.md) — all items swipe in a fixed
  // frame, with a position indicator where the old dead count badge was.
  // fit="cover": the frame is the first item's natural ratio and every photo
  // FILLS it (crops to one consistent frame) instead of letterboxing — the
  // feed's no-shift guarantee is the reserved frame, not the object-fit.
  const inline = count === 1
    ? <MediaItem media={first} audioTitle={audioTitle} audioArtist={audioArtist} />
    : <MediaCarousel items={mediaItems} fit="cover" maxHeight="60vh" testId="media-carousel" audioTitle={audioTitle} audioArtist={audioArtist} />;
  return post ? <div data-media-session-title={post.title || post.text?.slice(0, 60) || 'Feed media'} data-media-session-artist={audioArtist}>
    <MusicFeedMedia post={post} media={mediaItems} readOnlySource={readOnlySource}>{inline}</MusicFeedMedia>
  </div> : inline;
}

/**
 * The embedded original post inside a repost card (reposts.md). Fetches the
 * original by doc_id and renders it as a nested, read-only card (author,
 * text, media). I3: the reader must be able to read the original — a post the
 * reader can't read degrades to an "unavailable" placeholder (a repost never
 * grants access to the original).
 */
function RepostedEmbed({
  repostOf,
  onAuthorClick,
}: {
  repostOf: string;
  onAuthorClick?: (username: string, provider: string) => void;
}) {
  const [original, setOriginal] = useState<PostRecord | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaRecord[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await readPostById(repostOf);
        if (cancelled) return;
        if (!p) {
          setState('unavailable');
          return;
        }
        setOriginal(p);
        // Resolve the original's media (cross-user path — the API read path).
        const refs = (p.media_refs || []).filter(Boolean);
        if (refs.length) {
          try {
            const media = await resolveMediaRefs(refs);
            if (!cancelled) setMediaItems(media);
          } catch {
            // Media resolution failed — degrade (text-only embed).
          }
        }
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repostOf]);

  if (state === 'loading') {
    return (
      <div className="mx-4 mb-3 rounded-lg border border-border bg-elevated/40 p-3" data-testid="repost-embed-loading">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </div>
    );
  }

  if (state === 'unavailable' || !original) {
    return (
      <div
        className="mx-4 mb-3 rounded-lg border border-border bg-elevated/40 px-3 py-2.5 text-sm text-muted-foreground"
        data-testid="repost-embed-unavailable"
      >
        Original post unavailable
      </div>
    );
  }

  const authorName = original.profile?.display_name || original.author_username || 'Original author';
  return (
    <div className="mx-4 mb-3 rounded-lg border border-border bg-elevated/30 overflow-hidden" data-testid="repost-embed" data-replay-private={original.visibility !== 'public' ? '' : undefined}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar className="h-8 w-8">
          {original.avatar_url ? (
            <AvatarImage src={original.avatar_url} alt={authorName} />
          ) : (
            <AvatarFallback className="bg-brand-muted text-brand-300 text-xs font-semibold">
              {authorName.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          {original.author_username && onAuthorClick ? (
            <button
              type="button"
              className="font-medium text-sm text-foreground truncate hover:text-brand-300 transition-colors duration-150"
              onClick={() => onAuthorClick(original.author_username!, original.author_provider || '')}
              aria-label={`View ${authorName}'s profile`}
              data-testid="repost-embed-author-link"
            >
              {authorName}
            </button>
          ) : (
            <span className="font-medium text-sm text-foreground truncate">{authorName}</span>
          )}
          <span className="text-[0.8125rem] text-muted-foreground shrink-0">· {formatTimeAgo(original.created_at)}</span>
        </div>
      </div>
      {original.text ? (
        <div className="px-3 pb-2.5 text-sm text-foreground line-clamp-6">
          <PostBody text={original.text} density="light" />
        </div>
      ) : null}
      <div className="pb-2">
        <PostMediaRenewal postId={original._id}><MediaGrid post={original} mediaItems={mediaItems} audioTitle={original.title} audioArtist={authorName} /></PostMediaRenewal>
      </div>
      {/* The original's creator-pinned ad (D55) renders inside the embed — the
          repost resurfaces the original's content AND its monetization, so the
          original creator earns from the reach the repost gives them. Only the
          creator's pinned ad (`original.ad`), never a node ad (`original.node_ad`)
          — a node ad on the repost post itself already covers the node's
          inventory, and two ads in a compact embed is too much. */}
      {original.ad ? (
        <div className="px-2 pb-2" data-testid="repost-embed-ad">
          <AdBlock ad={original.ad} />
        </div>
      ) : null}
    </div>
  );
}

export interface PostCardProps {
  post: PostRecord;
  authorName: string;
  authorUsername?: string;
  authorProvider?: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  reactionCount: number;
  dislikeCount?: number;
  commentCount: number;
  /** Impressions (D86) — total delivery events, the eye icon. Display-only. */
  impressions?: number;
  /** Reach (D86) — distinct readers, the person icon. Display-only. */
  reach?: number;
  liked: boolean;
  disliked: boolean;
  /** Whether the reader has reposted this post (the repeat icon fills). */
  reposted?: boolean;
  /** The repost count (the repeat icon's number). */
  repostCount?: number;
  /** The reader's tap on the repost (reposts.md — independent of like). */
  onToggleRepost?: () => void;
  timestamp: string;
  onToggleReaction: (kind: ReactionKind) => void;
  onCommentCountChange: (n: number) => void;
  onAuthorClick?: (username: string, provider: string) => void;
  postAuthor?: string;
  postService?: string;
  /** The group the post lives in (group posts — reactions + comments attach
   *  to the group, not the discover board; post-actions.md). Threaded to the
   *  card's <PostActions>. */
  groups?: string[];
  isOwnPost?: boolean;
  /** Whether the reader is signed in (the Save-to-collection control is
   *  owner-of-the-token only — an anon visitor has no collections, so the
   *  kebab's Save item is hidden for them). */
  signedIn?: boolean;
  // Profile pins (profile-pins.md) — the owner's held-up post state, supplied
  // only by the profile's feed view (pinning is a profile concept; no other
  // surface offers the item). Absent → no pin items.
  /** This post is currently on the owner's pin list. */
  pinned?: boolean;
  /** The owner's current pin count (the slots-full check). */
  pinCount?: number;
  /** The owner's pin toggle (`wantPin` = the desired state after the tap). */
  onTogglePin?: (wantPin: boolean) => void;
  onPostUpdated?: () => void;
  testId?: string;
  /** A DOM id for the card (the Discover board's ?post= highlight target). */
  id?: string;
  /** Extra classes (the Discover board's ?post= highlight ring). */
  className?: string;
  /** The D86 surface label for dwell tracking (the screen that shows the card —
   *  `feed` / `discover` / `profile` / `group`). When set, the card reports its
   *  viewport dwell to the D86 engine (the client-gated tier, gated on the
   *  delivery the read already logged). Absent → no dwell tracking. */
  surface?: string;
}

// Exported so other surfaces (the profile's feed view) can compose the same
// card — the feed is the reference renderer, no surface re-implements it.
export function PostCard({
  post,
  authorName,
  authorUsername,
  authorProvider,
  authorAvatar,
  mediaItems,
  reactionCount,
  dislikeCount,
  commentCount,
  impressions = 0,
  reach = 0,
  liked,
  disliked,
  reposted = false,
  repostCount = 0,
  onToggleRepost,
  timestamp,
  onToggleReaction,
  onCommentCountChange,
  onAuthorClick,
  postAuthor,
  postService,
  groups = post.groups,
  isOwnPost,
  signedIn = false,
  pinned,
  pinCount,
  onTogglePin,
  onPostUpdated,
  testId = 'post-card',
  id,
  className,
  surface,
}: PostCardProps) {
  // Owner actions (previously the lightbox's job — the feed is now inline).
  // Editing is NOT inline — it opens the app-level composer sheet in edit mode
  // (the ONE edit path, so the card stays the read surface).
  const { openComposer } = useComposer();
  const { openSave } = useSave();
  const isMobile = useIsMobile();
  // D86 dwell tracking: how long this card is in the reader's viewport,
  // reported to the engine when it leaves (gated on the delivery the read
  // logged). No-op when `surface` is absent or the post id is unresolved.
  const cardRef = useRef<HTMLElement | null>(null);
  useDwellTracking(cardRef, post._id, surface || '');
  const [menuOpen, setMenuOpen] = useState(false);
  const authority = useMutationAuthority(post.author_key || post.author_username, 'posts', menuOpen);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  // Close the owner menu on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Reset the two-tap delete confirm when the menu closes, so a dismissed
  // delete doesn't linger as "Confirm delete" on the next open.
  useEffect(() => {
    if (!menuOpen) setDeleteConfirm(false);
  }, [menuOpen]);

  async function handleShare() {
    setMenuOpen(false);
    const url = `${window.location.origin}${postPath({ ...post, author_username: postAuthor || authorUsername || post.author_username })}`;
    // Share is a link (navigator.share / clipboard) — not a data write. The
    // repost is a separate, tappable signal on the engagement row (reposts.md).
    if (navigator.share) {
      navigator.share({ title: (post.text || '').slice(0, 100) || 'Post on web10', url }).catch(() => copyUrl());
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

  async function handleDelete() {
    try {
      if (post.author_key?.includes('/groups/')) await deletePost(post._id || '', post.author_key);
      else await deletePost(post._id || '');
      onPostUpdated?.();
    } catch (e) {
      console.error('Failed to delete post:', e);
      toast.error(errorMessage(e, 'Could not delete the post.'));
    }
  }

  async function handleToggleVisibility() {
    setTogglingVisibility(true);
    try {
      await movePostVisibility(post);
      setMenuOpen(false);
      onPostUpdated?.();
    } catch (e) {
      console.error('Failed to toggle visibility:', e);
      toast.error(errorMessage(e, 'Could not change the post visibility.'));
    } finally {
      setTogglingVisibility(false);
    }
  }

  return (
    <article
      ref={cardRef}
      data-replay-private={post.visibility !== 'public' ? '' : undefined}
      data-testid={testId}
      id={id}
      className={cn(
        'bg-card border-b border-border overflow-hidden',
        'glow-card transition-all duration-150',
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar className="h-9 w-9 ring-2 ring-transparent hover:ring-brand/20 transition-all duration-150">
          {post.author_face_pending ? (
            <Skeleton className="h-full w-full rounded-full" data-testid="post-author-avatar-loading" aria-label="Loading author picture" />
          ) : authorAvatar ? (
            <AvatarImage src={authorAvatar} alt={authorName} />
          ) : (
            <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
              {authorName.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          {post.author_face_pending ? (
            <Skeleton className="h-4 w-24" data-testid="post-author-name-loading" aria-label="Loading author name" />
          ) : post.author_key?.includes('/groups/') ? (
            <div className="min-w-0">
              <a href={`/groups/${encodeURIComponent(post.author_key)}`} className="block truncate text-sm font-medium text-foreground hover:text-brand-300" data-testid="post-author-link">{post.group_identity?.name || authorName}</a>
              <span className="text-xs text-muted-foreground">Group{post.posted_by && <> · <a href={`/u/${encodeURIComponent(post.posted_by)}`} className="hover:text-foreground">posted by {post.posted_by}</a></>}</span>
            </div>
          ) : authorUsername && onAuthorClick ? (
            <button
              type="button"
              className="font-medium text-sm text-foreground truncate hover:text-brand-300 transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation();
                onAuthorClick(authorUsername!, authorProvider!);
              }}
              aria-label={`View ${authorName}'s profile`}
              data-testid="post-author-link"
            >
              {authorName}
            </button>
          ) : (
            <span className="font-medium text-sm text-foreground truncate">{authorName}</span>
          )}
          <span className="text-[0.8125rem] text-muted-foreground shrink-0">· {formatTimeAgo(timestamp)}</span>
          {post.repost_of && (
            <span
              className="flex items-center gap-1 shrink-0 text-[0.8125rem] text-brand-300"
              data-testid="repost-badge"
            >
              <Repeat2 className="w-3.5 h-3.5" strokeWidth={2} />
              reposted
            </span>
          )}
        </div>
        {/* Owner menu (⋯): own posts always (edit / visibility / delete). On
            mobile it's also shown for signed-in visitors — the share + save
            affordances live here on a phone (the row is too narrow for them),
            so a signed-in visitor can still save/share any post. */}
        {(authority.canEdit || authority.canDelete || (signedIn && isMobile)) && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Post options"
              aria-expanded={menuOpen}
              data-testid="post-options-button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
              className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-all duration-150"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                  aria-hidden="true"
                />
                <div
                  className="absolute right-0 top-9 z-30 w-48 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
                  data-testid="post-options-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Share + save-to-collection: mobile-only (on desktop they're
                      in the engagement row, right-aligned). Share is for
                      everyone; save is signed-in only. */}
                  {isMobile && (
                    <>
                      {signedIn && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(false); openSave(post); }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                          data-testid="post-option-save"
                        >
                          <Bookmark className="w-4 h-4" />
                          Save to…
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleShare(); }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                        data-testid="post-option-share"
                      >
                        {copied ? <Check className="w-4 h-4 text-success" /> : <Share2 className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Share'}
                      </button>
                    </>
                  )}
                  {(authority.canEdit || authority.canDelete) && (
                    <>
                      {authority.canEdit && <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); openComposer({ editingPost: post }); }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                        data-testid="post-option-edit"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edit post
                      </button>}
                      {/* Pin to profile (profile-pins.md): the owner's personal
                          posts only (group-authored posts pin to their own
                          surface, not the person's). The item HIDES when the
                          slots are full (MAX_PROFILE_PINS) — pinning is
                          unpin-then-pin, and the full state is visible on the
                          profile itself. */}
                      {onTogglePin && authority.canEdit && !post.author_key?.includes('/groups/') && (pinned ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onTogglePin(false); }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                          data-testid="post-option-unpin"
                        >
                          <PinOff className="w-4 h-4" />
                          Unpin from profile
                        </button>
                      ) : (pinCount ?? 0) < MAX_PROFILE_PINS ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onTogglePin(true); }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                          data-testid="post-option-pin"
                        >
                          <Pin className="w-4 h-4" />
                          Pin to profile
                        </button>
                      ) : null)}
                      {authority.canEdit && <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleToggleVisibility(); }}
                        disabled={togglingVisibility || post.author_key?.includes('/groups/')}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors disabled:opacity-50"
                        data-testid="post-option-visibility"
                      >
                        {post.visibility === 'public' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        {togglingVisibility ? 'Updating…' : post.visibility === 'public' ? 'Make private' : 'Make public'}
                      </button>}
                      {authority.canDelete && (deleteConfirm ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-muted transition-colors"
                          data-testid="post-option-delete-confirm"
                        >
                          <Trash2 className="w-4 h-4" />
                          Confirm delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(true); }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-muted transition-colors"
                          data-testid="post-option-delete"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete post
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Repost (reposts.md): the reposter's comment (the quote) sits above the
          embedded original post — the X/Twitter quote-tweet layout. A repost
          carries no media of its own; the original's media lives in the embed. */}
      {post.repost_of && post.text ? (
        <div className="px-4 pt-3 text-sm text-foreground">
          <PostBody text={post.text} density="light" />
        </div>
      ) : null}

      {post.repost_of && (
        <RepostedEmbed repostOf={post.repost_of} onAuthorClick={onAuthorClick} />
      )}

      {/* Media. Editing (title / body / media remove) happens in the app-level
          composer sheet (openComposer({ editingPost }) — the ONE edit path),
          not inline here, so the card stays the read surface. */}
      <PostMediaRenewal postId={post._id}><MediaGrid post={post} mediaItems={mediaItems} audioTitle={post.title} audioArtist={authorName} /></PostMediaRenewal>

      {post.text && !post.repost_of ? (
        <div className="px-4 pt-3">
          {post.title && (
            <h3 className="mb-1 text-base font-semibold leading-snug text-foreground" data-testid="post-card-title">
              {post.title}
            </h3>
          )}
          <div className="text-sm text-foreground">
            <PostBody text={post.text} density="full" />
          </div>
        </div>
      ) : post.title && !post.repost_of ? (
        <div className="px-4 pt-3">
          <h3 className="text-base font-semibold leading-snug text-foreground" data-testid="post-card-title">
            {post.title}
          </h3>
        </div>
      ) : null}

      {post.tags?.length ? (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2.5 py-1 rounded-full bg-brand-muted/60 text-brand-300 border border-brand/10 hover:border-brand/30 hover:bg-brand-muted transition-all duration-150 cursor-default"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          <PostActions
            postId={post._id || ''}
            liked={liked}
            disliked={disliked}
            reactionCount={reactionCount}
            dislikeCount={dislikeCount}
            commentCount={commentCount}
            impressions={impressions}
            reach={reach}
            hideReach={isMobile}
            onToggleReaction={onToggleReaction}
            onCommentCountChange={onCommentCountChange}
            postAuthor={postAuthor}
            postService={postService}
            groups={groups}
            onAuthorClick={onAuthorClick}
            dislike="interactive"
            repost="interactive"
            reposted={reposted}
            repostCount={repostCount}
            onToggleRepost={onToggleRepost}
            layout="compact"
          />
        </div>
        {/* Save-to-collection + share — right-aligned on desktop (the
            Twitter/X action cluster, a touch looser). On mobile the row is too
            narrow, so these move into the kebab menu (below). Save is
            signed-in only (anon has no collections); share is for everyone (a
            link, not a data write). */}
        {!isMobile && (
          <div className="flex shrink-0 items-center gap-1 pr-1">
            {signedIn && (
              <button
                type="button"
                aria-label="Save to collection"
                data-testid="post-action-save"
                onClick={(e) => { e.stopPropagation(); openSave(post); }}
                className="rounded-full p-2 text-muted-foreground transition-all duration-150 hover:bg-elevated hover:text-foreground"
              >
                <Bookmark className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
            <button
              type="button"
              aria-label={copied ? 'Link copied' : 'Share'}
              data-testid="post-action-share"
              onClick={(e) => { e.stopPropagation(); handleShare(); }}
              className="rounded-full p-2 text-muted-foreground transition-all duration-150 hover:bg-elevated hover:text-foreground"
            >
              {copied ? <Check className="h-4 w-4 text-success" strokeWidth={1.75} /> : <Share2 className="h-4 w-4" strokeWidth={1.75} />}
            </button>
          </div>
        )}
        {(post.origin || 'web10') !== 'web10' && (
          <Badge variant="brand_glow" className="ml-1 mr-1 shrink-0">
            {post.origin}
          </Badge>
        )}
      </div>

      {/* Carried ads (D55 + D57): the creator's pinned ad (`post.ad`) and the
          node's ad (`post.node_ad`) can both be present. Each renders per its
          FORMAT: `inline` → the compact AdBlock in this slot (under the post);
          `post` → its own card in the stream, next in line after this post
          (the feed's list inserts it — the ad looks like just another post,
          with the Ad/Sponsored badge + disclosure, nothing indicating the
          pin). Neither format suppresses the other (unless node_ad_overwrite
          dropped the creator's). */}
      {((post.ad && post.ad.format !== 'post') || (post.node_ad && post.node_ad.format !== 'post')) && (
        <div className="px-3 pb-3 md:px-4 md:pb-4 space-y-2">
          {post.ad && post.ad.format !== 'post' && <AttachedAd ad={post.ad} />}
          {post.node_ad && post.node_ad.format !== 'post' && <AttachedAd ad={post.node_ad} />}
        </div>
      )}

    </article>
  );
}

function FeedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center" data-testid="feed-empty">
      <p className="text-sm text-muted-foreground mb-3">Your feed will appear here as people you follow post.</p>
    </div>
  );
}

/** Foreign read results never call the home node's mutation/recovery helpers. */
export function ForeignFeedCard({ post }: { post: PostRecord }) {
  const media = (post.media_refs || []).filter((ref): ref is ResolvedMediaRef => typeof ref === 'object' && ref !== null)
    .map(ref => fromResolvedMediaRef(ref)).filter(item => !!item.url);
  return <article data-testid="foreign-feed-card" className="overflow-hidden border-b border-border bg-card">
    <header className="flex items-baseline justify-between gap-3 px-4 pt-4 text-sm">
      <span className="truncate font-medium text-foreground">{post.profile?.display_name || post.author_username || post.author_key}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{new URL(post.source_origin!).host}</span>
    </header>
    {post.title && <h3 className="px-4 pt-2 font-semibold text-foreground">{post.title}</h3>}
    {post.text && <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm text-foreground">{post.text}</p>}
    {post.repost_of && <p className="px-4 pb-2 text-xs text-muted-foreground">Original repost stays on its source server.</p>}
    <MediaGrid post={post} readOnlySource mediaItems={media} audioTitle={post.title} audioArtist={post.profile?.display_name} />
    <footer className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-3 text-xs text-muted-foreground">
      <span>{post.likes || 0} likes</span><span>{post.comments || 0} comments</span><span>{formatTimeAgo(post.created_at)}</span>
      <span className="basis-full text-[10px]">Source-owned read · interactions are not routed through your home server</span>
    </footer>
  </article>;
}

function FeedSkeleton() {
  return (
    <div data-testid="feed-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card border-b border-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="w-full aspect-[4/3] rounded-none" />
          <div className="px-4 py-3 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedScreen({ onAuthorClick, onRepost }: { onAuthorClick?: (username: string, provider: string) => void; onRepost?: (post: PostRecord) => void }) {
  const sourceControl = useFeedSources();
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const [sourceAllocations, setSourceAllocations] = useState<ServerAllocation[]>();
  const [sourceRetry, retrySources] = useState(0);
  const actingIdentity = useActingAuthor();
  const viewOwner = `${sourceControl.scope}:${actingIdentity || ''}`;
  const [postOwner, setPostOwner] = useState(viewOwner);
  useEffect(() => { setLikedMap({}); setDislikedMap({}); setRepostedMap({}); }, [actingIdentity]);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<{ created_at?: string; score?: number } | null>(null);
  const [likeMap, setLikeMap] = useState<Record<string, number>>({});
  const [dislikeCountMap, setDislikeCountMap] = useState<Record<string, number>>({});
  const [repostCountMap, setRepostCountMap] = useState<Record<string, number>>({});
  const [commentMap, setCommentMap] = useState<Record<string, number>>({});
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [dislikedMap, setDislikedMap] = useState<Record<string, boolean>>({});
  const [repostedMap, setRepostedMap] = useState<Record<string, boolean>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);
  const token = getWapi().readToken();
  // The app-level composer seam (the New Post sheet) — the repeat icon opens
  // it in repost mode. A hook, so it must run before the `if (loading)` return.
  const { openComposer } = useComposer();
  // v3 ownership is by username alone: a post's author_key is the bare
  // username (the node's provider is implicit — every local user shares it),
  // so `author_provider` is the v2 fallback ('web10') and never equals the
  // token's real provider. Comparing it hid the owner menu on every own post.
  const isOwnPost = (p: PostRecord) =>
    token && matchesActingAuthor(p.author_key || p.author_username, token.username, actingIdentity || null);

  // ── Knob state: URL > saved settings > Newest preset ──────────────────────
  const [searchParams, setSearchParams] = useSearchParams();

  // The persisted tuning (the web10 `settings` service) — loaded once.
  const [savedKnobs, setSavedKnobs] = useState<KnobState | null>(null);
  // A ref mirror so the (useCallback-captured) preset handler reads the latest
  // saved tuning without a stale closure.
  const savedKnobsRef = useRef<KnobState | null>(null);
  useEffect(() => {
    readSettings()
      .then((s) => {
        const saved = s.feedKnobs ?? null;
        savedKnobsRef.current = saved;
        setSavedKnobs(saved);
        if (saved) LOG('saved knobs — restored from settings service:', encodeKnobState(saved));
      })
      .catch((e) => LOG('saved knobs — failed to load settings:', e));
  }, []);

  const knobParam = searchParams.get('knobs');
  const knobState = useMemo<KnobState>(() => {
    const fromUrl = parseKnobParam(knobParam);
    if (fromUrl) return fromUrl;
    if (savedKnobs) return savedKnobs;
    return FEED_DEFAULT_STATE();
  }, [knobParam, savedKnobs]);
  const activePreset = useMemo(() => presetIdForState(knobState), [knobState]);

  // Log the deep-link restore once on mount (the URL held the ranking).
  useEffect(() => {
    const raw = searchParams.get('knobs');
    if (raw) LOG('deep-link — knob state restored from URL:', raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the tuning to the settings service (debounced — a knob twist is
  // a burst of detent steps; the last one wins).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistKnobs = useCallback((state: KnobState) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      try {
        await saveSettings({ feedKnobs: state });
        LOG('knobs — persisted to settings service:', encodeKnobState(state));
      } catch (e) {
        LOG('knobs — persist failed:', e);
      }
    }, 400);
  }, []);
  useEffect(() => () => { if (persistTimer.current) clearTimeout(persistTimer.current); }, []);

  // Write a knob state to the URL (the deep-linkable ranking). The param is
  // omitted when the state is the default, so the default URL stays clean.
  const setKnobUrl = useCallback((next: KnobState) => {
    const params = new URLSearchParams(searchParams);
    params.delete('mixCursor'); params.delete('after');
    const encoded = encodeKnobState(next);
    if (encoded === FEED_DEFAULT_ENCODING) {
      params.delete('knobs');
    } else {
      params.set('knobs', encoded);
    }
    setSearchParams(params);
    const preset = presetIdForState(next);
    LOG('knob state —', encoded, preset ? `(preset: ${preset})` : '(custom)');
  }, [searchParams, setSearchParams]);

  const handleKnobChange = useCallback((key: keyof KnobState, value: number) => {
    const next = { ...knobState, [key]: value };
    setKnobUrl(next);
    persistKnobs(next);
  }, [knobState, setKnobUrl, persistKnobs]);

  const handlePreset = useCallback((id: PresetId) => {
    const presetDef = getPreset(id);
    if (presetDef) {
      // An explicit preset click always wins. When the clicked preset IS the
      // feed default (Most recent), setKnobUrl omits the ?knobs= param (to keep
      // the default URL clean) — so knobState would fall back to the saved
      // tuning and the Most recent chip would never light up. Clear the saved
      // tuning so the click takes effect (the feed is chronological until the
      // user re-tunes).
      if (encodeKnobState(presetDef.state) === FEED_DEFAULT_ENCODING && savedKnobsRef.current) {
        savedKnobsRef.current = null;
        setSavedKnobs(null);
        LOG('preset — Most recent clicked, cleared saved tuning so the default wins');
      }
      setKnobUrl(presetDef.state);
      persistKnobs(presetDef.state);
    }
  }, [setKnobUrl, persistKnobs]);

  // The feed read (D69): one request per page. `loadFeed` loads page one
  // (resetting the feed); `loadMore` appends the next page (the cursor rides on
  // created_at — chronological paging, the stable keyset). The counts, media,
  // ads, and author profiles all ride in the payload — the client never
  // re-fetches any of it (the N+1 the 267-requests diagnosis named).
  //
  // `knob` is the feed's ranking knobs — passed to the node so it ranks the
  // page server-side (the D36 power-mean sort). The cursor rides on the score
  // when ranked, created_at when chronological (the Newest preset).
  const engagementGeneration = useRef(0);
  const paging = useRef({ observed: searchParams.get('mixCursor'), written: searchParams.get('mixCursor'),
    requested: searchParams.get('mixCursor') || undefined, navigated: false, revision: 0, snapshot: undefined as string | undefined });
  const cursorParam = searchParams.get('mixCursor');
  if (cursorParam !== paging.current.observed) {
    paging.current.observed = cursorParam;
    if (cursorParam !== paging.current.written) {
      paging.current.requested = cursorParam || undefined; paging.current.navigated = true; paging.current.revision++;
      paging.current.written = cursorParam;
    }
  }
  const sourceScope = JSON.stringify([sourceControl.ready, sourceControl.sources, [...sourceControl.approved].sort(), sourceControl.scope,
    encodeKnobState(knobState), actingIdentity]);
  const sourceSignature = JSON.stringify([sourceScope, sourceRetry, paging.current.revision]);
  const sourceSignatureRef = useRef(sourceSignature);
  sourceSignatureRef.current = sourceSignature;
  const restoredSources = useRef(false);
  const previousScope = useRef(sourceScope);
  const mixedReader = useMemo(() => {
    if (!sourceControl.ready || !sourceControl.credential) return null;
    const options = { sources: sourceControl.sources.filter(row => sourceControl.approved.has(row.origin)),
      homeOrigin: sourceControl.home, credential: sourceControl.credential, knobState, actingAuthor: actingIdentity,
      isCurrent: () => sourceSignatureRef.current === sourceSignature && sourceControl.live() && getActingAuthor() === actingIdentity,
      homeRead: readFeedPage };
    const sameScope = previousScope.current === sourceScope;
    const initialCursor = !restoredSources.current || paging.current.navigated ? paging.current.requested
      : sameScope && sourceRetry ? paging.current.snapshot : undefined;
    paging.current.navigated = false;
    if (!sameScope) { paging.current.snapshot = undefined; paging.current.requested = undefined; }
    previousScope.current = sourceScope;
    restoredSources.current = true;
    try { return createMixedFeedReader({ ...options, initialCursor }); }
    catch { console.warn('[mixed-feed] invalid paging link; starting a fresh owned session'); return createMixedFeedReader(options); }
  }, [sourceSignature]);
  useEffect(() => {
    setSourceErrors({}); setSourceAllocations(undefined);
    return () => mixedReader?.dispose();
  }, [mixedReader]);
  const ownPosts = (page: PostRecord[]) => page.filter(post => !post.source_origin || post.source_origin === sourceControl.home);
  useEffect(() => {
    setLoadingMore(false);
    return () => { engagementGeneration.current++; };
  }, [actingIdentity, token?.username, token?.provider, knobState, mixedReader]);

  const loadFeed = useCallback(async (cursor: { created_at?: string; score?: number } | null = null, knob: KnobState) => {
    const generation = engagementGeneration.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const page = mixedReader ? await mixedReader.next() : await readFeedPage({ limit: 20, cursor, knobState: knob });
      if (generation !== engagementGeneration.current) return;
      if (mixedReader) { setSourceErrors((page as MixedFeedPage).errors); setSourceAllocations((page as MixedFeedPage).allocations); }
      if (mixedReader) paging.current.snapshot = mixedReader.snapshot();
      setPosts(page.posts);
      setPostOwner(viewOwner);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor);
      // The counts ride in the payload (post.likes / post.dislikes / post.comments) — no re-fetch.
      // Likes and dislikes are counted separately (the feed query counts each type), so the
      // heart and the thumb each show their own tally.
      setLikeMap(Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.likes || 0])));
      setDislikeCountMap(Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.dislikes || 0])));
      setRepostCountMap(Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.reposts || 0])));
      setCommentMap(Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.comments || 0])));
      // The reader's OWN reaction is NOT in the payload (D69 carries the like
      // count, not whether *I* liked it) — seed the liked/disliked/reposted
      // maps so a post the reader already liked/reposted shows a filled
      // icon on load. Without this the feed "forgot" every like on refresh
      // and the next tap stacked a second doc (the "liked it, shows 2,
      // refresh shows 0" bug).
      setLikedMap({});
      setDislikedMap({});
      setRepostedMap({});
      try {
        const { liked, disliked, reposted } = await readFeedReactions(
          ownPosts(page.posts).map((p) => p._id || '').filter(Boolean),
        );
        if (generation !== engagementGeneration.current || getActingAuthor() !== actingIdentity) return;
        setLikedMap(liked);
        setDislikedMap(disliked);
        setRepostedMap(reposted);
      } catch (e) {
        if (generation !== engagementGeneration.current) return;
        console.warn('[social-feed] own reactions unavailable; keeping loaded posts:', e);
      }
      LOG('loadFeed — page 1:', page.posts.length, 'posts, has_more:', page.has_more);
    } catch (e) {
      if (generation !== engagementGeneration.current) return;
      console.error('Failed to load feed:', e);
      setPosts([]);
      setHasMore(false);
      setNextCursor(null);
      setLoadFailed(true);
    }
    setLoading(false);
  }, [actingIdentity, token?.username, token?.provider, mixedReader, sourceControl.scope, sourceControl.home]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    const generation = engagementGeneration.current;
    setLoadingMore(true);
    try {
      const page = mixedReader ? await mixedReader.next() : await readFeedPage({ limit: 20, cursor: nextCursor, knobState: knobState });
      if (generation !== engagementGeneration.current) return;
      if (mixedReader) { setSourceErrors((page as MixedFeedPage).errors); setSourceAllocations((page as MixedFeedPage).allocations); }
      if (mixedReader) paging.current.snapshot = mixedReader.snapshot();
      setPosts((prev) => [...new Map([...prev, ...page.posts].map(post => [post.source_key || post._id, post])).values()]);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor);
      setLikeMap((prev) => ({ ...prev, ...Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.likes || 0])) }));
      setDislikeCountMap((prev) => ({ ...prev, ...Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.dislikes || 0])) }));
      setRepostCountMap((prev) => ({ ...prev, ...Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.reposts || 0])) }));
      setCommentMap((prev) => ({ ...prev, ...Object.fromEntries(ownPosts(page.posts).map((p) => [p._id || '', p.comments || 0])) }));
      // Seed the reader's own reaction for the new page's posts (same gap as
      // loadFeed — the payload carries the count, not whether *I* liked it).
      const { liked, disliked, reposted } = await readFeedReactions(
        ownPosts(page.posts).map((p) => p._id || '').filter(Boolean),
      );
      if (generation !== engagementGeneration.current) return;
      setLikedMap((prev) => ({ ...prev, ...liked }));
      setDislikedMap((prev) => ({ ...prev, ...disliked }));
      setRepostedMap((prev) => ({ ...prev, ...reposted }));
      // The cursor deep-link (the URL holds the scroll position — ?after=).
      if (mixedReader) paging.current.written = (page as MixedFeedPage).page_cursor || mixedReader.snapshot();
      setSearchParams(previous => {
        const params = new URLSearchParams(previous);
        if (mixedReader) { params.set('mixCursor', (page as MixedFeedPage).page_cursor || mixedReader.snapshot()); params.delete('after'); }
        else if (page.next_cursor?.created_at) params.set('after', page.next_cursor.created_at);
        else params.delete('after');
        return params;
      });
      LOG('loadMore — appended', page.posts.length, 'posts, has_more:', page.has_more);
    } catch (e) {
      if (generation !== engagementGeneration.current) return;
      console.error('Failed to load more feed:', e);
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, loading, nextCursor, searchParams, setSearchParams, knobState, mixedReader, sourceControl.home]);

  // The node ranks the feed (the D36 power-mean sort, server-side) — a knob
  // twist is a DEBOUNCED RE-READ of page one (the cursor resets; it was
  // computed for the old ranking). First load (mount) fires immediately,
  // restoring the ?after= deep link. The previous feed stays on screen while
  // the re-read is in flight (no skeleton flash per twist).
  const firstLoad = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (sourceControl.credential && !sourceControl.ready) { setLoading(false); return; }
    if (firstLoad.current) {
      firstLoad.current = false;
      const after = searchParams.get('after');
      LOG('load — initial, knobs:', encodeKnobState(knobState));
      loadFeed(after ? { created_at: after } : null, knobState);
      return;
    }
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    LOG('knob change — re-reading feed (page 1) in 400ms, knobs:', encodeKnobState(knobState));
    refreshTimer.current = setTimeout(() => loadFeed(null, knobState), 400);
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [knobState, loadFeed, sourceControl.ready, sourceControl.credential]);

  // Infinite scroll: a sentinel at the bottom of the feed triggers loadMore
  // when it scrolls into view (rootMargin prefetches a page early).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // The node returns the feed pre-ranked (the D36 power-mean sort,
  // server-side) — `posts` is already in display order, no client re-rank.

  // The reaction pair (post-actions.md): like XOR dislike, one reaction per
  // user. Optimistic update of BOTH counts (a like↔dislike swap moves the
  // reaction from one tally to the other — like -1, dislike +1; a clear drops
  // it), rollback on error. The data layer (toggleReactionKind) enforces the
  // mutual exclusion server-side.
  //
  // The delta is computed from the CURRENT flags, not a single "wasLiked" —
  // the old `delta = nextLiked - wasLiked` was wrong on a swap (dislike→like
  // computed 0, so the heart showed 0 instead of 1 — the "0 1 0 1" flicker).
  // Each tally changes by (next flag − old flag) for its own kind.
  async function handleToggleReaction(postId: string, kind: ReactionKind) {
    const generation = engagementGeneration.current;
    const token = getWapi().readToken();
    if (!token) return;
    const wasLiked = !!likedMap[postId];
    const wasDisliked = !!dislikedMap[postId];
    const nextLiked = kind === 'like' ? !wasLiked : false;
    const nextDisliked = kind === 'dislike' ? !wasDisliked : false;
    const likeDelta = (nextLiked ? 1 : 0) - (wasLiked ? 1 : 0);
    const dislikeDelta = (nextDisliked ? 1 : 0) - (wasDisliked ? 1 : 0);
    setLikedMap((prev) => ({ ...prev, [postId]: nextLiked }));
    setDislikedMap((prev) => ({ ...prev, [postId]: nextDisliked }));
    setLikeMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) + likeDelta) }));
    setDislikeCountMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) + dislikeDelta) }));
    try {
      await toggleReactionKind(postId, kind, posts.find((post) => post._id === postId)?.groups);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      if (generation !== engagementGeneration.current) return;
      toast.error(errorMessage(e, 'Could not update your reaction.'));
      setLikedMap((prev) => ({ ...prev, [postId]: wasLiked }));
      setDislikedMap((prev) => ({ ...prev, [postId]: wasDisliked }));
      setLikeMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - likeDelta) }));
      setDislikeCountMap((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - dislikeDelta) }));
    }
  }

  // Repost (reposts.md): a repost is a real post, not a reaction toggle.
  // Tapping the repeat icon opens the composer in repost mode (the app-level
  // composer above the feed) with this post as the context. The composer
  // creates the repost post; the feed remounts on onPostCreated so the new
  // repost shows up + the repost count / filled state re-derive.
  //
  // Two calls, matching every other surface (ProfileFeed / PostLightbox /
  // Watch / GroupDetail / Discover): `onRepost` sets the app-wide `repostingTo`
  // state (the post being reposted), and `openComposer()` actually opens the
  // New Post sheet — without the second call the repeat icon sets state but
  // nothing appears (the sheet is gated on `composerOpen`).
  function handleRepost(post: PostRecord) {
    onRepost?.(post);
    openComposer();
  }

  const visiblePosts = (postOwner === viewOwner ? posts : []).filter(post => !sourceControl.credential ||
    (sourceControl.ready && sourceControl.sources.some(row => row.origin === (post.source_origin || sourceControl.home) && row.weight > 0 && sourceControl.approved.has(row.origin))));
  const musicQueue = musicQueueFromPosts(visiblePosts,
    post => (post.media_refs || []).filter((ref): ref is ResolvedMediaRef => typeof ref !== 'string').map(fromResolvedMediaRef),
    post => !!post.source_origin && post.source_origin !== sourceControl.home);

  return (
    <div className="md:max-w-2xl md:mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
        <div className="flex items-center justify-between px-4 py-3 md:px-0">
          <h1 className="font-display text-lg font-bold text-foreground">Feed</h1>
        </div>
      </div>

      {/* Controls: presets + knobs (the same rack as the trending page, D36) */}
      <div className="px-4 py-3 md:px-0">
        <KnobRack
          state={knobState}
          activePreset={activePreset}
          onChange={handleKnobChange}
          onPreset={handlePreset}
          expanded={searchParams.get('tune') === '1' || searchParams.get('editServers') === '1'}
          onExpandedChange={expanded => setSearchParams(previous => {
            const params = new URLSearchParams(previous);
            if (expanded) params.set('tune', '1'); else { params.delete('tune'); params.delete('editServers'); params.delete('removeServer'); params.delete('approveServer'); }
            return params;
          })}
        ><FeedSourcesEditor key={sourceControl.scope} control={sourceControl} allocations={sourceAllocations} errors={sourceErrors} onRetry={() => retrySources(n => n + 1)} /></KnobRack>
      </div>

      {sourceControl.error && <div role="alert" className="px-4 py-3 text-sm text-muted-foreground">{sourceControl.error}<Button variant="ghost" onClick={sourceControl.reload}>Retry server settings</Button></div>}
      {Object.entries(sourceErrors).filter(([origin]) => sourceControl.ready && sourceControl.sources.some(row => row.origin === origin)).map(([origin, message]) => <div key={origin} role="alert" className="px-4 py-2 text-xs text-muted-foreground">{new URL(origin).host}: {message}<Button variant="ghost" onClick={() => retrySources(n => n + 1)}>Retry source reads</Button></div>)}

      <div className="md:px-0">
        <PostEntryPrompt />
        {loading && !visiblePosts.length ? <FeedSkeleton /> : loadFailed ? (
          <div role="alert" data-testid="feed-load-error" className="px-4 py-16 text-center">
            <p className="text-foreground">Could not load your Following feed.</p>
            <p className="mt-2 text-sm text-muted-foreground">Your follows have not been changed. Try loading it again.</p>
            <Button className="mt-4" onClick={() => void loadFeed(null, knobState)}>Try again</Button>
          </div>
        ) : !visiblePosts.length ? (
          sourceControl.credential && !sourceControl.ready ? <p role="status" className="px-4 py-8 text-sm text-muted-foreground">{sourceControl.error ? 'Server settings are unavailable. Retry above to open the feed.' : 'Loading private server settings…'}</p>
            : sourceControl.credential && !sourceControl.sources.some(row => row.weight > 0 && sourceControl.approved.has(row.origin)) ? <p className="px-4 py-8 text-sm text-muted-foreground">Feed paused. Open Advanced to add, approve or unmute a server.</p>
            : hasMore ? <Button variant="ghost" onClick={() => void loadMore()}>Continue reading sources</Button>
            : <FeedEmptyState />
        ) : (
          <>
            <FeedMusicQueue.Provider value={musicQueue}>{visiblePosts.flatMap((post) => {
              if (post.source_origin && post.source_origin !== sourceControl.home) return [<ForeignFeedCard key={post.source_key} post={post} />];
              // The feed carries everything per post (D69) — media (resolved +
              // HLS), the author's profile + avatar, and the counts. No maps,
              // no re-fetch. The counts display off the live maps (initialized
              // from the payload, bumped on like-toggle / comment-added).
              const mediaItems = (post.media_refs || [])
                .filter((r): r is ResolvedMediaRef => typeof r !== 'string')
                .map(fromResolvedMediaRef);

              // Post-format ads (ad-improvements.md): a `post`-format ad rides
              // the post it's attached to but renders as its OWN card, next in
              // line after that post in the stream — "just another post" with
              // the Ad/Sponsored badge + disclosure, nothing indicating the
              // pin. (Inline ads stay in the PostCard's own ad slot.)
              const attached: AdRecord[] = [
                ...(post.ad && post.ad.format === 'post' ? [post.ad] : []),
                ...(post.node_ad && post.node_ad.format === 'post' ? [post.node_ad] : []),
              ];

              const card = (
                <PostCard
                  key={post._id || post.created_at}
                  post={post}
                  authorName={post.profile?.display_name || post.author_username || ''}
                  authorUsername={post.author_username}
                  authorProvider={post.author_provider}
                  authorAvatar={post.avatar_url}
                  mediaItems={mediaItems}
                  reactionCount={likeMap[post._id || ''] || 0}
                  dislikeCount={dislikeCountMap[post._id || ''] || 0}
                  repostCount={repostCountMap[post._id || ''] || 0}
                  commentCount={commentMap[post._id || ''] || 0}
                  impressions={post.impressions || 0}
                  reach={post.reach || 0}
                  liked={!!likedMap[post._id || '']}
                  disliked={!!dislikedMap[post._id || '']}
                  reposted={!!repostedMap[post._id || '']}
                  timestamp={post.created_at}
                  onToggleReaction={(kind) => handleToggleReaction(post._id || '', kind)}
                  onToggleRepost={() => handleRepost(post)}
                  onCommentCountChange={(n) =>
                    setCommentMap((prev) => ({ ...prev, [post._id || '']: n }))
                  }
                  onAuthorClick={onAuthorClick}
                  onPostUpdated={() => mixedReader ? retrySources(n => n + 1) : loadFeed(null, knobState)}
                   isOwnPost={isOwnPost(post)}
                   signedIn={!!token}
                   surface="feed"
                 />
               );

              if (!attached.length) return [card];
              return [
                card,
                ...attached.map((ad) => (
                  <AttachedAd
                    key={`${post._id || post.created_at}-ad-${ad._id || 'x'}`}
                    ad={ad}
                    standalone
                  />
                )),
              ];
            })}</FeedMusicQueue.Provider>
            {/* The infinite-scroll sentinel (triggers loadMore when it scrolls in) */}
            <div ref={sentinelRef} className="h-12 flex items-center justify-center">
              {loadingMore ? (
                <Skeleton className="h-16 w-full" />
              ) : hasMore ? (
                <span className="text-xs text-muted-foreground">Loading…</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
