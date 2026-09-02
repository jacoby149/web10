import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readFeed,
  getFeedGroups,
  readFeedEngagement,
  readProfile,
  readUserProfile,
  resolveMediaRefs,
  countReactions,
  countComments,
  toggleReaction,
  readSettings,
  saveSettings,
} from '@/data';
import { getWapi } from '@/data/wapi';
import type {
  PostRecord,
  MediaRecord,
  ProfileRecord,
} from '@/data/types';
import {
  rankPosts,
  PRESETS,
  getPreset,
  type PresetId,
  type KnobState,
} from '@/lib/powerMean';
import { KnobRack } from '@/components/Discover/KnobRack';
import { Heart, MessageCircle, Play, Pause, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKETING_ORIGIN } from '@/lib/origins';
import { CommentThread } from './CommentThread';
import { TextWithLinks } from './LinkEmbed';
import { AdBlock } from './AdBlock';
import { PostLightbox } from '@/components/Bio/PostLightbox';

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
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!playing || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
    return () => {
      videoRef.current?.pause();
    };
  }, [playing]);

  const src = media.thumbnail_url || media.url;

  // The read path now carries the real dimensions; measure on load only as a
  // fallback for legacy media that predates dimension storage. Reserving the
  // ratio up front (known or measured) is what keeps the feed from shifting.
  const knownRatio = media.width && media.height ? media.width / media.height : null;
  const ratio = knownRatio ?? measuredRatio ?? 4 / 3;
  const onMediaLoaded = (el: HTMLVideoElement | HTMLImageElement) => {
    if (knownRatio) return;
    const w = 'videoWidth' in el ? el.videoWidth : el.naturalWidth;
    const h = 'videoHeight' in el ? el.videoHeight : el.naturalHeight;
    if (w && h) setMeasuredRatio(w / h);
  };

  // Natural aspect ratio, capped so a portrait clip can't blow up the feed,
  // object-contain so it never crops (letterboxes on the cap) — matching the
  // lightbox. The card bg (not black) shows through any letterbox.
  const containerStyle: React.CSSProperties = { aspectRatio: `${ratio}`, maxHeight: '60vh' };

  if (isVideo) {
    return (
      <div
        className="bg-elevated overflow-hidden group relative cursor-pointer"
        style={containerStyle}
        onClick={() => setPlaying((p) => !p)}
        role="button"
        tabIndex={0}
        aria-label={playing ? 'Pause video' : 'Play video'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPlaying((p) => !p);
          }
        }}
        data-testid="media-video"
      >
        <video
          ref={videoRef}
          src={media.url}
          poster={media.thumbnail_url}
          onLoadedMetadata={(e) => onMediaLoaded(e.currentTarget)}
          className="w-full h-full object-contain"
          preload="metadata"
          playsInline
          muted={!playing}
          loop
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-background/80 backdrop-blur-sm">
              <Play className="w-5 h-5 text-foreground ml-0.5" strokeWidth={2} />
            </div>
          </div>
        )}
        {playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Pause className="w-8 h-8 text-foreground/60 animate-pulse" strokeWidth={1.5} />
          </div>
        )}
        {media.duration_seconds && (
          <div className="absolute bottom-1.5 right-1.5 bg-background/80 rounded px-1.5 text-[0.625rem] font-mono tabular-nums text-foreground">
            {formatDuration(media.duration_seconds)}
          </div>
        )}
      </div>
    );
  }

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
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
  onOpenLightbox?: () => void;
  isOwnPost?: boolean;
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
  onOpenLightbox,
  isOwnPost,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [localCount, setLocalCount] = useState(commentCount);
  const [burstKey, setBurstKey] = useState(0);
  const prevLiked = useRef(liked);

  useEffect(() => {
    if (liked && !prevLiked.current) {
      setBurstKey((k) => k + 1);
    }
    prevLiked.current = liked;
  }, [liked]);

  return (
    <article
      data-testid="post-card"
      className={cn(
        'bg-card border-b border-border md:border md:rounded-lg md:mb-4 overflow-hidden',
        'glow-card transition-all duration-150',
        onOpenLightbox && 'cursor-pointer',
      )}
      onClick={onOpenLightbox}
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
          <button
            type="button"
            aria-label="Edit post"
            data-testid="post-edit-pencil"
            onClick={(e) => { e.stopPropagation(); onOpenLightbox?.(); }}
            className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-all duration-150"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <MediaGrid mediaItems={mediaItems} />

      {post.text && (
        <div className="px-4 pt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          <TextWithLinks text={post.text} />
        </div>
      )}

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

      {post.ad && (
        <AdBlock
          ad={post.ad}
          className="md:mx-4 md:mb-3 md:rounded-lg md:border md:border-border"
        />
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
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord[]>>({});
  const [flatMediaMap, setFlatMediaMap] = useState<Record<string, MediaRecord>>({});
  const [reactionMap, setReactionMap] = useState<Record<string, number>>({});
  const [commentMap, setCommentMap] = useState<Record<string, number>>({});
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [profileMap, setProfileMap] = useState<Record<string, ProfileRecord>>({});
  const [avatarUrlMap, setAvatarUrlMap] = useState<Record<string, string>>({});
  const [lightboxPost, setLightboxPost] = useState<PostRecord | null>(null);
  const token = getWapi().readToken();
  const isOwnPost = (p: PostRecord) =>
    token && p.author_username === token.username && p.author_provider === token.provider;

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

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      // v3: readFeed returns PostRecord[] directly from group-based reads
      // (newest first — the ranking below re-orders by the knob state).
      const [feed, feedGroups] = await Promise.all([
        readFeed('newest', 50),
        getFeedGroups(),
      ]);

      // Engagement counts (the ref pattern — the same one DiscoverScreen
      // runs): without this the likes/comments knobs only ever see recency.
      let engLikes: Record<string, number> = {};
      let engComments: Record<string, number> = {};
      if (feedGroups.length) {
        try {
          const eng = await readFeedEngagement(feedGroups);
          engLikes = eng.likes;
          engComments = eng.comments;
        } catch (e) {
          LOG('engagement — failed (degrading to zero counts):', e);
        }
      }
      for (const p of feed) {
        p.likes = engLikes[p._id || ''] || 0;
        p.comments = engComments[p._id || ''] || 0;
        p.reposts = 0;
      }
      setPosts(feed);

      const token = getWapi().readToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const profiles: Record<string, ProfileRecord> = {};
      for (const post of feed) {
        const authorKey = `${post.author_username}@${post.author_provider}`;
        if (!profiles[authorKey]) {
          let profile: ProfileRecord | null = null;
          try {
            profile =
              post.author_username === token.username
                ? await readProfile()
                : await readUserProfile(post.author_username || '');
          } catch { /* fall through */ }
          profiles[authorKey] = profile || { display_name: post.author_username };
        }
      }

      // Resolve media refs per post
      const mMedia: Record<string, MediaRecord[]> = {};
      const flat: Record<string, MediaRecord> = {};
      for (const post of feed) {
        if (post.media_refs?.length) {
          try {
            const media = await resolveMediaRefs(post.media_refs);
            mMedia[post._id || ''] = media;
            for (const m of media) {
              if (m._id) flat[m._id] = m;
            }
          } catch { /* skip media for this post */ }
        }
      }

      // Resolve reaction/comment counts per post
      const reactions: Record<string, number> = {};
      const comments: Record<string, number> = {};
      await Promise.all(
        feed.map(async (post) => {
          try {
            const [rc, cc] = await Promise.all([
              countReactions('posts', post._id || ''),
              countComments(post._id || ''),
            ]);
            reactions[post._id || ''] = rc;
            comments[post._id || ''] = cc;
          } catch { /* counts stay 0 */ }
        }),
      );

      // Resolve author avatars
      const avatarByAuthor: Record<string, string> = {};
      for (const [key, profile] of Object.entries(profiles)) {
        if (profile.avatar_ref) {
          const [u, p] = key.split('@');
          try {
            const avatars = await resolveMediaRefs(
              [profile.avatar_ref],
              { username: u, provider: p },
              u === token.username ? 'media' : 'public_media',
            );
            if (avatars[0]?.url) avatarByAuthor[profile.avatar_ref] = avatars[0].url;
          } catch { /* skip */ }
        }
      }

      setMediaMap(mMedia);
      setFlatMediaMap(flat);
      setProfileMap(profiles);
      setAvatarUrlMap(avatarByAuthor);
      setReactionMap(reactions);
      setCommentMap(comments);
    } catch (e) {
      console.error('Failed to load feed:', e);
      setPosts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Client-side re-ranking via knob state (zero network calls per twist —
  // the same pattern as DiscoverScreen). The Newest preset (the default)
  // short-circuits to pure chronological in rankPosts.
  const rankedPosts = useMemo(() => {
    return rankPosts(
      posts,
      (post) => ({
        ageMs: Date.now() - new Date(post.created_at).getTime(),
        likes: post.likes || 0,
        comments: post.comments || 0,
        reposts: post.reposts || 0,
      }),
      knobState,
    );
  }, [posts, knobState]);

  async function handleToggleLike(postId: string) {
    const token = getWapi().readToken();
    if (!token) return;
    setLikedMap((prev) => ({ ...prev, [postId]: !prev[postId] }));
    setReactionMap((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + (likedMap[postId] ? -1 : 1) }));
    try {
      await toggleReaction(postId, 'like', token.username, token.provider);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
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
          rankedPosts.map((post) => {
            const authorKey = `${post.author_username}@${post.author_provider}`;
            const profile = profileMap[authorKey];
            const mediaItems = mediaMap[post._id || ''] || [];

            return (
              <PostCard
                key={post._id || post.created_at}
                post={post}
                authorName={profile?.display_name || post.author_username || ''}
                authorUsername={post.author_username}
                authorProvider={post.author_provider}
                authorAvatar={
                  profile?.avatar_ref ? avatarUrlMap[profile.avatar_ref] : undefined
                }
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
                onOpenLightbox={() => setLightboxPost(post)}
                isOwnPost={isOwnPost(post)}
              />
            );
          })
        )}
      </div>

      {lightboxPost && (
        <PostLightbox
          post={lightboxPost}
          mediaMap={flatMediaMap}
          onClose={() => setLightboxPost(null)}
          isOwner={isOwnPost(lightboxPost)}
        />
      )}
    </div>
  );
}