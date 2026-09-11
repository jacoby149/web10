import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readFeedPage,
  toggleReaction,
  readSettings,
  saveSettings,
  updatePost,
  deletePost,
  movePostVisibility,
  recordRepost,
} from '@/data';
import { getWapi } from '@/data/wapi';
import { fromResolvedMediaRef, type ResolvedMediaRef, type PostRecord, type MediaRecord } from '@/data/types';
import {
  PRESETS,
  getPreset,
  type PresetId,
  type KnobState,
} from '@/lib/powerMean';
import { KnobRack } from '@/components/Discover/KnobRack';
import { Heart, MessageCircle, MoreHorizontal, Share2, Check, Edit3, Eye, EyeOff, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKETING_ORIGIN } from '@/lib/origins';
import { Textarea } from '@/components/ui/textarea';
import { CommentThread } from './CommentThread';
import { TextWithLinks } from './LinkEmbed';
import { AdBlock } from './AdBlock';
import { VideoPlayer, sourceFromMedia } from './VideoPlayer';
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

// The feed's default tuning: Newest (pure chronological — "no algorithm" is
// the delivery pitch; the knobs are opt-in).
const FEED_DEFAULT_STATE = () => getPreset('newest')!.state;
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

function MediaItem({ media }: { media: MediaRecord }) {
  const isVideo = media.mime_type?.startsWith('video/');
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null);

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

  // Image: natural ratio, object-contain, lazy. Measure on load only as a
  // fallback for legacy media that predates dimension storage — reserving the
  // ratio up front is what keeps the feed from shifting.
  const src = media.thumbnail_url || media.url;
  const knownRatio = media.width && media.height ? media.width / media.height : null;
  const ratio = knownRatio ?? measuredRatio ?? 4 / 3;
  const onMediaLoaded = (el: HTMLImageElement) => {
    if (knownRatio) return;
    if (el.naturalWidth && el.naturalHeight) setMeasuredRatio(el.naturalWidth / el.naturalHeight);
  };
  const containerStyle: React.CSSProperties = { aspectRatio: `${ratio}`, maxHeight: '60vh' };

  return (
    <div
      className="bg-elevated overflow-hidden group relative"
      style={containerStyle}
      data-testid="media-image"
    >
      <img
        src={src}
        alt={media.alt_text || ''}
        onLoad={(e) => onMediaLoaded(e.currentTarget)}
        className="w-full h-full object-contain"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
    </div>
  );
}

function MediaGrid({ mediaItems }: { mediaItems: MediaRecord[] }) {
  if (!mediaItems.length) return null;
  const count = mediaItems.length;
  const first = mediaItems[0];

  // Option (b): the first item renders at its natural aspect ratio; the rest
  // live behind a count badge — tapping the card opens the lightbox, which
  // already has a working carousel for the full set.
  return (
    <div className="relative">
      <MediaItem media={first} />
      {count > 1 && (
        <div
          className="absolute top-2 right-2 flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-background/70 backdrop-blur-sm text-xs font-semibold text-foreground tabular-nums pointer-events-none"
          data-testid="media-count-badge"
          aria-label={`${count} items`}
        >
          {count}
        </div>
      )}
    </div>
  );
}

interface PostCardProps {
  post: PostRecord;
  authorName: string;
  authorUsername?: string;
  authorProvider?: string;
  authorAvatar?: string;
  mediaItems: MediaRecord[];
  reactionCount: number;
  commentCount: number;
  liked: boolean;
  timestamp: string;
  onToggleLike: () => void;
  onCommentCountChange: (n: number) => void;
  onAuthorClick?: (username: string, provider: string) => void;
  postAuthor?: string;
  postService?: string;
  isOwnPost?: boolean;
  onPostUpdated?: () => void;
}

function PostCard({
  post,
  authorName,
  authorUsername,
  authorProvider,
  authorAvatar,
  mediaItems,
  reactionCount,
  commentCount,
  liked,
  timestamp,
  onToggleLike,
  onCommentCountChange,
  onAuthorClick,
  postAuthor,
  postService,
  isOwnPost,
  onPostUpdated,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [localCount, setLocalCount] = useState(commentCount);
  const [burstKey, setBurstKey] = useState(0);
  const prevLiked = useRef(liked);

  // Owner actions (previously the lightbox's job — the feed is now inline).
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.text || '');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  useEffect(() => {
    if (liked && !prevLiked.current) {
      setBurstKey((k) => k + 1);
    }
    prevLiked.current = liked;
  }, [liked]);

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
    const url = `${window.location.origin}/u/${postAuthor || authorUsername || 'unknown'}/p/${post._id || 'unknown'}`;
    if (postAuthor && postService) {
      recordRepost(post._id || '', postAuthor, postService);
    }
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

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await updatePost(post._id || '', { text: editDraft, updated_at: new Date().toISOString() });
      setEditing(false);
      onPostUpdated?.();
    } catch (e) {
      console.error('Failed to update post:', e);
      toast.error(errorMessage(e, 'Could not save your edit.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deletePost(post._id || '');
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
      data-testid="post-card"
      className={cn(
        'bg-card border-b border-border md:border md:rounded-lg md:mb-4 overflow-hidden',
        'glow-card transition-all duration-150',
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar className="h-9 w-9 ring-2 ring-transparent hover:ring-brand/20 transition-all duration-150">
          {authorAvatar ? (
            <AvatarImage src={authorAvatar} alt={authorName} />
          ) : (
            <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
              {authorName.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          {authorUsername && onAuthorClick ? (
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
        </div>
        {isOwnPost && (
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
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleShare(); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                    data-testid="post-option-share"
                  >
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Share2 className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Share'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true); setEditDraft(post.text || ''); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                    data-testid="post-option-edit"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit post
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleToggleVisibility(); }}
                    disabled={togglingVisibility}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors disabled:opacity-50"
                    data-testid="post-option-visibility"
                  >
                    {post.visibility === 'public' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {togglingVisibility ? 'Updating…' : post.visibility === 'public' ? 'Make private' : 'Make public'}
                  </button>
                  {deleteConfirm ? (
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
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <MediaGrid mediaItems={mediaItems} />

      {editing ? (
        <div className="px-4 pt-3 space-y-2">
          <Textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            placeholder="Edit post…"
            className="text-sm min-h-[80px] resize-none"
            data-testid="post-edit-input"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="brand" onClick={handleSaveEdit} disabled={saving} data-testid="post-edit-save" className="text-xs">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditDraft(post.text || ''); }} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : post.text ? (
        <div className="px-4 pt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          <TextWithLinks text={post.text} />
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

      <div className="flex items-center gap-1 px-2 py-2">
        <button
          key={burstKey}
          data-testid="like-button"
          aria-pressed={liked}
          onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
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
        <button
          data-testid="comment-button"
          aria-expanded={commentsOpen}
          onClick={(e) => { e.stopPropagation(); setCommentsOpen((o) => !o); }}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg min-h-10 text-sm text-muted-foreground hover:text-foreground hover:bg-elevated/80 transition-all duration-150"
        >
          <MessageCircle className="w-[18px] h-[18px]" strokeWidth={1.75} />
          <span className="tabular-nums">{localCount || ''}</span>
        </button>
        {(post.origin || 'web10') !== 'web10' && (
          <Badge variant="brand_glow" className="ml-auto mr-2">
            {post.origin}
          </Badge>
        )}
      </div>

      {/* Carried ads (D55 + D57): the creator's pinned ad (`post.ad`) and the
          node's ad (`post.node_ad`) can both be present — render both, neither
          suppressing the other. The ad block is a self-contained card. */}
      {(post.ad || post.node_ad) && (
        <div className="px-3 pb-3 md:px-4 md:pb-4 space-y-2">
          {post.ad && <AdBlock ad={post.ad} />}
          {post.node_ad && <AdBlock ad={post.node_ad} />}
        </div>
      )}

      <CommentThread
        postId={post._id || ''}
        isOpen={commentsOpen}
        count={localCount}
        postAuthor={postAuthor}
        postService={postService}
        onCountChange={(n) => {
          setLocalCount(n);
          onCommentCountChange(n);
        }}
      />
    </article>
  );
}

function FeedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center" data-testid="feed-empty">
      <p className="text-sm text-muted-foreground mb-3">Your feed will appear here as people you follow post.</p>
      <p className="text-xs text-muted-foreground/50">
        Or{' '}
        <button
          data-testid="feed-import-cta"
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          onClick={() => window.open(`${MARKETING_ORIGIN}/import`, '_blank', 'noopener,noreferrer')}
        >
          import your existing posts
        </button>
      </p>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-0 md:space-y-4 md:p-4" data-testid="feed-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card border-b border-border md:border md:rounded-lg overflow-hidden">
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

export default function FeedScreen({ onAuthorClick }: { onAuthorClick?: (username: string, provider: string) => void }) {
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<{ created_at?: string; score?: number } | null>(null);
  const [reactionMap, setReactionMap] = useState<Record<string, number>>({});
  const [commentMap, setCommentMap] = useState<Record<string, number>>({});
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);
  const token = getWapi().readToken();
  // v3 ownership is by username alone: a post's author_key is the bare
  // username (the node's provider is implicit — every local user shares it),
  // so `author_provider` is the v2 fallback ('web10') and never equals the
  // token's real provider. Comparing it hid the owner menu on every own post.
  const isOwnPost = (p: PostRecord) =>
    token && p.author_username === token.username;

  // ── Knob state: URL > saved settings > Newest preset ──────────────────────
  const [searchParams, setSearchParams] = useSearchParams();

  // The persisted tuning (the web10 `settings` service) — loaded once.
  const [savedKnobs, setSavedKnobs] = useState<KnobState | null>(null);
  useEffect(() => {
    readSettings()
      .then((s) => {
        setSavedKnobs(s.feedKnobs ?? null);
        if (s.feedKnobs) LOG('saved knobs — restored from settings service:', encodeKnobState(s.feedKnobs));
      })
      .catch((e) => LOG('saved knobs — failed to load settings:', e));
  }, []);

  const knobState = useMemo<KnobState>(() => {
    const fromUrl = parseKnobParam(searchParams.get('knobs'));
    if (fromUrl) return fromUrl;
    if (savedKnobs) return savedKnobs;
    return FEED_DEFAULT_STATE();
  }, [searchParams, savedKnobs]);
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
  const loadFeed = useCallback(async (cursor: { created_at?: string; score?: number } | null = null, knob: KnobState) => {
    setLoading(true);
    try {
      const page = await readFeedPage({ limit: 20, cursor, knobState: knob });
      setPosts(page.posts);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor);
      // The counts ride in the payload (post.likes / post.comments) — no re-fetch.
      setReactionMap(Object.fromEntries(page.posts.map((p) => [p._id || '', p.likes || 0])));
      setCommentMap(Object.fromEntries(page.posts.map((p) => [p._id || '', p.comments || 0])));
      LOG('loadFeed — page 1:', page.posts.length, 'posts, has_more:', page.has_more);
    } catch (e) {
      console.error('Failed to load feed:', e);
      setPosts([]);
    }
    setLoading(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const page = await readFeedPage({ limit: 20, cursor: nextCursor, knobState: knobState });
      setPosts((prev) => [...prev, ...page.posts]);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor);
      setReactionMap((prev) => ({ ...prev, ...Object.fromEntries(page.posts.map((p) => [p._id || '', p.likes || 0])) }));
      setCommentMap((prev) => ({ ...prev, ...Object.fromEntries(page.posts.map((p) => [p._id || '', p.comments || 0])) }));
      // The cursor deep-link (the URL holds the scroll position — ?after=).
      const params = new URLSearchParams(searchParams);
      if (page.next_cursor?.created_at) params.set('after', page.next_cursor.created_at);
      else params.delete('after');
      setSearchParams(params, { replace: true });
      LOG('loadMore — appended', page.posts.length, 'posts, has_more:', page.has_more);
    } catch (e) {
      console.error('Failed to load more feed:', e);
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, loading, nextCursor, searchParams, setSearchParams, knobState]);

  // The node ranks the feed (the D36 power-mean sort, server-side) — a knob
  // twist is a DEBOUNCED RE-READ of page one (the cursor resets; it was
  // computed for the old ranking). First load (mount) fires immediately,
  // restoring the ?after= deep link. The previous feed stays on screen while
  // the re-read is in flight (no skeleton flash per twist).
  const firstLoad = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
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
  }, [knobState, loadFeed]);

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

  async function handleToggleLike(postId: string) {
    const token = getWapi().readToken();
    if (!token) return;
    setLikedMap((prev) => ({ ...prev, [postId]: !prev[postId] }));
    setReactionMap((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + (likedMap[postId] ? -1 : 1) }));
    try {
      await toggleReaction(postId, 'like', token.username, token.provider);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      toast.error(errorMessage(e, 'Could not update your like.'));
      setLikedMap((prev) => ({ ...prev, [postId]: !prev[postId] }));
      setReactionMap((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + (likedMap[postId] ? 1 : -1) }));
    }
  }

  if (loading) {
    return <FeedSkeleton />;
  }

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
        />
      </div>

      <div className="md:px-0">
        {!posts.length ? (
          <FeedEmptyState />
        ) : (
          <>
            {posts.map((post) => {
              // The feed carries everything per post (D69) — media (resolved +
              // HLS), the author's profile + avatar, and the counts. No maps,
              // no re-fetch. The counts display off the live maps (initialized
              // from the payload, bumped on like-toggle / comment-added).
              const mediaItems = (post.media_refs || [])
                .filter((r): r is ResolvedMediaRef => typeof r !== 'string')
                .map(fromResolvedMediaRef);

              return (
                <PostCard
                  key={post._id || post.created_at}
                  post={post}
                  authorName={post.profile?.display_name || post.author_username || ''}
                  authorUsername={post.author_username}
                  authorProvider={post.author_provider}
                  authorAvatar={post.avatar_url}
                  mediaItems={mediaItems}
                  reactionCount={reactionMap[post._id || ''] || 0}
                  commentCount={commentMap[post._id || ''] || 0}
                  liked={!!likedMap[post._id || '']}
                  timestamp={post.created_at}
                  onToggleLike={() => handleToggleLike(post._id || '')}
                  onCommentCountChange={(n) =>
                    setCommentMap((prev) => ({ ...prev, [post._id || '']: n }))
                  }
                  onAuthorClick={onAuthorClick}
                  onPostUpdated={() => loadFeed(null, knobState)}
                  isOwnPost={isOwnPost(post)}
                />
              );
            })}
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