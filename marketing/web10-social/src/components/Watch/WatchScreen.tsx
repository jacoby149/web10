// The watch page (watch-page.md) — the YouTube-shaped video destination.
//
// Click a landscape video in the Video wall → /watch/:postId?from=discover&
// knobs=…[&related=…][&t=…]. A big `mode="full"` player + a "What's next"
// queue (the loaded Discover board, re-ranked by the tunable relatedness) +
// comments below + the author overlay (not a navigation). The URL is the
// entire state: no client-side preservation — ?t= is the playback position,
// ?knobs= is the ranking, ?related= is the relatedness. Refresh / back / share
// all rebuild the exact state.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { X, User, ExternalLink } from 'lucide-react';
import { VideoPlayer, sourceFromMedia } from '@/components/Feed/VideoPlayer';
import { PostActions } from '@/components/Feed/PostActions';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readDiscoverFeed,
  readPostById,
  resolveMediaRefs,
  getV3Client,
  getDiscoverGroupId,
  extractUsername,
  toggleReactionKind,
  readRepostCounts,
  readMyRepostedIds,
  readUserProfile,
  readUserPublicProfile,
  isFollowing,
  followUser,
  unfollowUser,
  getFollowersCount,
  saveSettings,
  mediaRefId,
  type PostRecord,
  type MediaRecord,
  type ProfileRecord,
  type ResolvedMediaRef,
  type ReactionKind,
} from '@/data';
import { getWapi } from '@/data/wapi';
import { useRepost } from '@/context/RepostContext';
import { defaultKnobState, knobStateToSort, type KnobState, type PowerMeanSortConfig } from '@/lib/powerMean';
import {
  rankWatchQueue,
  RELATEDNESS_PRESETS,
  parseRelatednessParam,
  encodeRelatednessParam,
  type RelatednessId,
} from '@/lib/watchQueue';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:watch]', ...args);

// ── ?knobs= parsing (the same 5-detent encoding DiscoverScreen uses) ─────────
const KNOB_KEYS: (keyof KnobState)[] = ['recency', 'likes', 'comments', 'halfLife', 'character'];

function parseWatchKnobs(raw: string | null): KnobState {
  if (!raw) return defaultKnobState();
  const parts = raw.split(',');
  if (parts.length !== KNOB_KEYS.length) return defaultKnobState();
  const state = {} as KnobState;
  for (let i = 0; i < KNOB_KEYS.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 5) return defaultKnobState();
    state[KNOB_KEYS[i]] = n;
  }
  return state;
}

function encodeWatchKnobs(state: KnobState): string {
  return KNOB_KEYS.map((k) => String(state[k])).join(',');
}

// ── Media helpers ────────────────────────────────────────────────────────────

/** The post's first video media (the watch page plays the lead video). */
function firstVideoMedia(media: MediaRecord[]): MediaRecord | undefined {
  return media.find((m) => m.mime_type?.startsWith('video/'));
}

/** The post's lead media (video preferred, else the first) — the queue thumbnail. */
function leadMedia(media: MediaRecord[]): MediaRecord | undefined {
  return firstVideoMedia(media) ?? media[0];
}

/**
 * Resolve media for a set of posts, batched by author (the readShortsFeed /
 * DiscoverScreen idiom — one presign round-trip per author, not per post).
 * Returns a post_id → MediaRecord[] map.
 */
async function resolvePostsMedia(posts: PostRecord[]): Promise<Record<string, MediaRecord[]>> {
  const token = getWapi().readToken();
  const withMedia = posts.filter((p) => p.media_refs?.length);
  if (!withMedia.length) return {};

  const byAuthor = new Map<string, { posts: PostRecord[]; refs: (string | ResolvedMediaRef)[] }>();
  for (const p of withMedia) {
    const key = `${p.author_username}@${p.author_provider}`;
    const entry = byAuthor.get(key);
    if (entry) {
      entry.posts.push(p);
      entry.refs.push(...(p.media_refs || []));
    } else {
      byAuthor.set(key, { posts: [p], refs: [...(p.media_refs || [])] });
    }
  }

  const mediaByPost: Record<string, MediaRecord[]> = {};
  for (const [key, entry] of byAuthor) {
    const [username, provider] = key.split('@');
    const isOwn = token && username === token.username && provider === token.provider;
    const seen = new Set<string>();
    const uniqueRefs = entry.refs.filter((r) => {
      const id = mediaRefId(r);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (!uniqueRefs.length) continue;
    try {
      const media = await resolveMediaRefs(uniqueRefs, { username, provider }, isOwn ? 'media' : 'public_media');
      for (const p of entry.posts) {
        const refIds = new Set((p.media_refs || []).map(mediaRefId));
        mediaByPost[p._id || ''] = media.filter((m) => m._id && refIds.has(m._id));
      }
    } catch {
      // Media resolution failed for this author — degrade (no media for them).
    }
  }
  return mediaByPost;
}

// ── The queue card (the "What's next" row — YouTube's right-rail shape) ──────

function QueueCard({ post, media, authorName, authorAvatar, onOpen, active }: {
  post: PostRecord;
  media?: MediaRecord;
  authorName: string;
  authorAvatar?: string;
  onOpen: () => void;
  active?: boolean;
}) {
  const thumb = media?.thumbnail_url || (media?.mime_type?.startsWith('video/') ? undefined : media?.url);
  const duration = media?.duration_seconds;
  return (
    <button
      type="button"
      data-testid="watch-queue-card"
      onClick={onOpen}
      className={cn(
        'group flex w-full gap-3 rounded-lg p-2 text-left transition-colors',
        'hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active && 'bg-elevated/60',
      )}
    >
      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md bg-elevated">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
        {duration ? (
          <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1 text-[0.625rem] font-mono tabular-nums text-foreground">
            {Math.floor(duration / 60)}:{String(Math.round(duration % 60)).padStart(2, '0')}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{post.title || post.text || 'Untitled'}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{authorName}</p>
      </div>
    </button>
  );
}

// ── The author overlay (the "stay on the train" rule — not a navigation) ─────

function AuthorOverlay({ author, profile, posts, mediaMap, following, onToggleFollow, onClose, onViewAll }: {
  author: string;
  profile: ProfileRecord | null;
  posts: PostRecord[];
  mediaMap: Record<string, MediaRecord[]>;
  following: boolean;
  onToggleFollow: () => void;
  onClose: () => void;
  onViewAll: () => void;
}) {
  const displayName = profile?.display_name || author.replace(/[-_]/g, ' ');
  const avatarUrl = profile?.avatar_ref
    ? (mediaMap[`avatar:${profile.avatar_ref}`]?.[0]?.url)
    : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-testid="watch-author-overlay"
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/60 backdrop-blur-sm md:items-stretch"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`About ${displayName}`}
    >
      <div
        data-testid="watch-author-overlay-panel"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-y-auto bg-surface shadow-2xl md:w-96 md:border-l md:border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-base font-semibold text-foreground">About</h2>
          <button
            type="button"
            data-testid="watch-author-overlay-close"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Face */}
        <div className="flex flex-col items-center px-6 py-6 text-center">
          <Avatar className="h-20 w-20">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : (
              <AvatarFallback className="bg-brand-muted text-brand-300 text-xl font-semibold">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <p className="mt-3 font-display text-lg font-semibold text-foreground">{displayName}</p>
          <p className="text-sm text-muted-foreground">@{author}</p>
          {profile?.bio ? <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p> : null}
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant={following ? 'outline' : 'brand'}
              size="sm"
              data-testid="watch-author-overlay-follow"
              onClick={onToggleFollow}
            >
              {following ? 'Following' : 'Follow'}
            </Button>
            <Button variant="ghost" size="sm" data-testid="watch-author-overlay-view-all" onClick={onViewAll}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
              View all posts
            </Button>
          </div>
        </div>

        {/* Recent posts */}
        {posts.length > 0 && (
          <div className="border-t border-border px-4 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">Recent posts</p>
            <div className="grid grid-cols-3 gap-1.5">
              {posts.slice(0, 6).map((p) => {
                const m = leadMedia(mediaMap[p._id || ''] || []);
                return (
                  <div key={p._id} className="aspect-square overflow-hidden rounded-md bg-elevated">
                    {m?.thumbnail_url || (m && !m.mime_type?.startsWith('video/') ? m.url : undefined) ? (
                      <img src={m.thumbnail_url || m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function WatchScreen() {
  const { postId } = useParams<{ postId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = getWapi().readToken();
  const isAnon = !token;

  // ── URL state (the entire watch state lives here) ──────────────────────────
  // Derive STABLE primitives (strings) from the URL — never a fresh object.
  // The load effect below is keyed on these; a fresh object (a re-parsed
  // KnobState, the searchParams array, a re-decoded token) in the dep chain
  // would recreate `load` on every render and re-run the effect forever
  // (the "sick spammy loop" — the node 429s under the hammering). `knobState`
  // is parsed inside `load` from `knobsKey` so it never sits in the dep chain.
  const knobsKey = searchParams.get('knobs') ?? '';
  const relatedness: RelatednessId = parseRelatednessParam(searchParams.get('related')) ?? 'mixed';

  // ?t= — captured once per postId (the write-back updates ?t= but must not
  // re-seek the same video).
  const [initialTime, setInitialTime] = useState<number | undefined>(undefined);
  useEffect(() => {
    const t = Number(searchParams.get('t'));
    setInitialTime(Number.isFinite(t) && t > 0 ? t : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [post, setPost] = useState<PostRecord | null>(null);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord[]>>({});
  const [queue, setQueue] = useState<PostRecord[]>([]);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [authorPosts, setAuthorPosts] = useState<PostRecord[]>([]);
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Engagement for the current post.
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [comments, setComments] = useState(0);
  const [reposts, setReposts] = useState(0);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [reposted, setReposted] = useState(false);

  const load = useCallback(async () => {
    if (!postId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setNotFound(false);
    // Read the token inside the callback (the ShortsScreen idiom). `readToken()`
    // returns a fresh object every call — capturing it as a `useCallback` dep
    // would recreate `load` on every render and re-run the effect forever.
    const token = getWapi().readToken();
    const knobState = parseWatchKnobs(knobsKey || null);
    LOG('load — post:', postId, 'knobs:', knobsKey || '(default)', 'related:', relatedness);
    try {
      const w = getV3Client();
      const discoverId = getDiscoverGroupId();

      // 1. The post by doc_id (anon-capable — the node's read-by-id is
      //    user_or_anon, so a signed-out visitor lands on a working screen).
      //    The canonical mapper (`fromV3DocToPost`) derives the author from
      //    the doc's `author_key` — the post body carries no author fields
      //    (the write path never puts them there), so a body read renders
      //    "Unknown". It also carries the post's `title` (D82).
      const p = await readPostById(postId);
      if (!p) { setNotFound(true); setLoading(false); return; }
      setPost(p);

      // 2. The board (the "What's next" source) — the same read the Video wall
      //    runs, with the ?knobs= ranking. Re-ranked client-side by relatedness.
      const sortConfig: PowerMeanSortConfig | null = knobStateToSort(knobState);
      const board = await readDiscoverFeed(sortConfig, 50);

      // 3. The author's public posts (the overlay's "recent posts" strip) —
      //    fetched before media resolution so their media resolves in the same
      //    batch. Best-effort — a failure degrades to an empty strip.
      const author = p.author_username || '';
      let authorPosts: PostRecord[] = [];
      let profile: ProfileRecord | null = null;
      if (author) {
        const results = await Promise.allSettled([
          readUserProfile(author, p.author_provider),
          readUserPublicProfile(author, p.author_provider),
        ]);
        const [face, pub] = results;
        profile = face.status === 'fulfilled' ? face.value : null;
        authorPosts = pub.status === 'fulfilled' ? pub.value.posts : [];
      }
      setProfile(profile);
      setAuthorPosts(authorPosts);

      // 4. Resolve media for the current post + the board + the author's posts
      //    (batched by author — one presign round-trip per author).
      const media = await resolvePostsMedia([p, ...board, ...authorPosts]);
      setMediaMap(media);

      // 5. The queue: the board re-ranked for similarity to the current video.
      //    Landscape videos only (the "What's next" is a video queue — the
      //    Video wall is landscape-only, so the queue is too). Portrait videos
      //    are shorts (the TikTok shape) — they live in the Shorts destination,
      //    not the YouTube-shaped watch queue. The aspect-ratio split keeps the
      //    two from bleeding into each other.
      const ranked = rankWatchQueue(board, p, knobState, relatedness);
      const videoQueue = ranked.filter((q) => {
        const ms = media[q._id || ''] || [];
        const hasVideo = ms.some((m) => m.mime_type?.startsWith('video/'));
        if (!hasVideo) return false;
        // Exclude portrait (9:16) shorts — the queue is landscape only.
        const isPortrait = ms.some(
          (m) => m.mime_type?.startsWith('video/') && !!m.width && !!m.height && m.width < m.height,
        );
        return !isPortrait;
      });
      setQueue(videoQueue);

      // 6. Engagement for the current post (the ref pattern — count the
      //    reactions + comments over the discover group, scoped to this post).
      try {
        const [reactionDocs, commentDocs, repostCounts, myReposts] = await Promise.all([
          w.read('reactions', { groups: [discoverId], limit: 500 }),
          w.read('comments', { groups: [discoverId], limit: 500 }),
          readRepostCounts([postId], [discoverId]),
          readMyRepostedIds(),
        ]);
        let l = 0, d = 0, c = 0, likedMe = false, dislikedMe = false;
        for (const r of reactionDocs) {
          if (r.ref_value !== postId) continue;
          const type = (r.body as Record<string, unknown>)?.type as string | undefined;
          if (type === 'like') { l++; if (token && extractUsername(r.author_key) === token.username) likedMe = true; }
          else if (type === 'dislike') { d++; if (token && extractUsername(r.author_key) === token.username) dislikedMe = true; }
        }
        for (const cdoc of commentDocs) if (cdoc.ref_value === postId) c++;
        setLikes(l); setDislikes(d); setComments(c);
        setLiked(likedMe); setDisliked(dislikedMe);
        setReposts(repostCounts[postId] || 0);
        setReposted(myReposts.has(postId));
      } catch (e) {
        LOG('engagement — failed (degrading to zero counts):', e);
      }

      // 7. The author's follower count + following state (the row + overlay).
      if (author) {
        try { setFollowersCount(await getFollowersCount(author)); } catch { setFollowersCount(null); }
        if (token) {
          try { setFollowing(await isFollowing(author, p.author_provider)); } catch { setFollowing(false); }
        }
      }
    } catch (e) {
      LOG('load — failed:', e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [postId, knobsKey, relatedness]);

  useEffect(() => { void load(); }, [load]);

  // ── ?t= write-back (throttled, replace — no history flood) ─────────────────
  const lastTWrite = useRef(0);
  const handleTimeUpdate = useCallback((t: number) => {
    const now = Date.now();
    if (now - lastTWrite.current < 5000) return;
    lastTWrite.current = now;
    const params = new URLSearchParams(searchParams);
    params.set('t', String(Math.floor(t)));
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Relatedness change (URL > saved > default) ─────────────────────────────
  const handleRelatedness = useCallback((id: RelatednessId) => {
    const params = new URLSearchParams(searchParams);
    const encoded = encodeRelatednessParam(id);
    if (encoded) params.set('related', encoded);
    else params.delete('related');
    setSearchParams(params);
    LOG('relatedness →', id);
    // Persist (URL > saved > default). Best-effort — a failure never blocks.
    if (token) void saveSettings({ watchRelatedness: id });
  }, [searchParams, setSearchParams, token]);

  // ── Reaction toggle (optimistic, the DiscoverScreen pattern) ───────────────
  const handleToggleReaction = useCallback(async (kind: ReactionKind) => {
    if (!token || !post?._id) return;
    const postIdNow = post._id;
    const wasLiked = liked, wasDisliked = disliked;
    const nextLiked = kind === 'like' ? !wasLiked : false;
    const nextDisliked = kind === 'dislike' ? !wasDisliked : false;
    const likeDelta = (nextLiked ? 1 : 0) - (wasLiked ? 1 : 0);
    const dislikeDelta = (nextDisliked ? 1 : 0) - (wasDisliked ? 1 : 0);
    setLiked(nextLiked); setDisliked(nextDisliked);
    setLikes((v) => Math.max(0, v + likeDelta));
    setDislikes((v) => Math.max(0, v + dislikeDelta));
    try {
      await toggleReactionKind(postIdNow, kind, [getDiscoverGroupId()]);
    } catch (e) {
      console.error('Failed to toggle reaction:', e);
      setLiked(wasLiked); setDisliked(wasDisliked);
      setLikes((v) => Math.max(0, v - likeDelta));
      setDislikes((v) => Math.max(0, v - dislikeDelta));
    }
  }, [token, post, liked, disliked]);

  // ── Repost (reposts.md): a repost is a POST, not a reaction toggle. The
  //    repeat icon opens the app-level composer in repost mode (the shared
  //    RepostContext seam — the same composer the feed uses) and returns to
  //    the feed, where the composer lives. The composer's createRepost is the
  //    single write; the count + fill re-derive on the next load.
  const { setRepostingTo } = useRepost();
  const handleRepost = useCallback(() => {
    if (!token || !post) return;
    setRepostingTo(post);
    navigate('/feed');
  }, [token, post, setRepostingTo, navigate]);

  // ── Follow toggle (the overlay + the author row) ───────────────────────────
  const handleToggleFollow = useCallback(async () => {
    if (!token || !post?.author_username) return;
    const author = post.author_username;
    const provider = post.author_provider || '';
    const next = !following;
    setFollowing(next);
    try {
      if (next) await followUser(author, provider);
      else await unfollowUser(author, provider);
      setFollowersCount((c) => (c == null ? c : Math.max(0, c + (next ? 1 : -1))));
    } catch (e) {
      console.error('Failed to toggle follow:', e);
      setFollowing(!next);
    }
  }, [token, post, following]);

  // ── Queue navigation (a new history entry — back steps through the queue) ──
  const openQueuePost = useCallback((q: PostRecord) => {
    const params = new URLSearchParams(searchParams);
    // Carry the ranking + relatedness; drop the playback position (a new video
    // starts at 0).
    params.delete('t');
    navigate(`/watch/${q._id}?${params.toString()}`);
  }, [searchParams, navigate]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-6 w-3/4" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-xl font-semibold text-foreground">Video not found</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This video isn't on the board (it may have been removed or is private).
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  const media = mediaMap[post._id || ''] || [];
  const video = firstVideoMedia(media);
  const author = post.author_username || '';
  const authorName = profile?.display_name || author.replace(/[-_]/g, ' ') || 'Unknown';
  const authorAvatar = profile?.avatar_ref ? mediaMap[`avatar:${profile.avatar_ref}`]?.[0]?.url : undefined;

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[1fr_360px]">
      {/* ── Left: the video + title + author + engagement + comments ── */}
      <div className="min-w-0 space-y-4">
        {video ? (
          <div className="overflow-hidden rounded-lg bg-black" data-testid="watch-player">
            <VideoPlayer
              source={sourceFromMedia(video)}
              mode="full"
              fit="contain"
              loop={false}
              initialTime={initialTime}
              onTimeUpdate={handleTimeUpdate}
              testId="watch-video"
              className="w-full"
            />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg bg-elevated" data-testid="watch-no-video">
            <p className="text-sm text-muted-foreground">No video to play</p>
          </div>
        )}

        <h1 className="font-display text-lg font-semibold leading-snug text-foreground" data-testid="watch-title">
          {post.title || post.text || 'Untitled'}
        </h1>

        {/* The caption (D82): the post's `text` body, shown under the title
            when the post carries both (title = the headline, text = the
            description). A caption-only post shows just the title (the text). */}
        {post.title && post.text && (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words" data-testid="watch-caption">
            {post.text}
          </p>
        )}

        {/* The author row (under the video — the watch page's shape). */}
        <div className="flex items-center gap-3" data-testid="watch-author-row">
          <button
            type="button"
            onClick={() => setOverlayOpen(true)}
            className="flex min-w-0 items-center gap-3 rounded-full transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`About ${authorName}`}
          >
            <Avatar className="h-11 w-11 shrink-0">
              {authorAvatar ? <AvatarImage src={authorAvatar} alt={authorName} /> : (
                <AvatarFallback className="bg-brand-muted text-brand-300 font-semibold">{authorName.charAt(0).toUpperCase()}</AvatarFallback>
              )}
            </Avatar>
            <div className="min-w-0 text-left">
              <p className="truncate font-medium text-foreground">{authorName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {followersCount != null ? `${followersCount.toLocaleString()} followers` : `@${author}`}
              </p>
            </div>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {!isAnon && (
              <Button
                variant={following ? 'outline' : 'brand'}
                size="sm"
                data-testid="watch-follow-button"
                onClick={handleToggleFollow}
              >
                {following ? 'Following' : 'Follow'}
              </Button>
            )}
            <Button variant="ghost" size="sm" data-testid="watch-about-button" onClick={() => setOverlayOpen(true)}>
              About
            </Button>
          </div>
        </div>

        {/* The engagement bar + the inline comment thread (comments below). */}
        <PostActions
          postId={post._id || ''}
          liked={liked}
          disliked={disliked}
          reactionCount={likes}
          dislikeCount={dislikes}
          commentCount={comments}
          reposted={reposted}
          repostCount={reposts}
          onToggleReaction={(kind) => void handleToggleReaction(kind)}
          onToggleRepost={handleRepost}
          groups={[getDiscoverGroupId()]}
          postAuthor={author}
          onAuthorClick={(username, provider) => navigate(`/u/${username}`, { state: { provider: provider || '' } })}
          dislike="interactive"
          repost={isAnon ? 'display' : 'interactive'}
          testId="watch-post-actions"
        />
      </div>

      {/* ── Right: the "What's next" queue ── */}
      <aside className="min-w-0" aria-label="What's next">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.04em] text-foreground" data-testid="watch-queue-header">
            What's next
          </h2>
        </div>

        {/* The relatedness preset row (the tunable "how much to tilt"). */}
        <div className="mb-3 flex flex-wrap gap-1.5" data-testid="watch-relatedness-row" role="tablist" aria-label="Tune what's next">
          {RELATEDNESS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={relatedness === p.id}
              data-testid={`watch-relatedness-${p.id}`}
              onClick={() => handleRelatedness(p.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                relatedness === p.id
                  ? 'border-brand bg-brand-muted text-brand-300'
                  : 'border-border bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {queue.length > 0 ? (
          <div className="space-y-1" data-testid="watch-queue">
            {queue.map((q) => {
              const qMedia = leadMedia(mediaMap[q._id || ''] || []);
              const qAuthor = q.author_username || '';
              const qName = qAuthor ? qAuthor.replace(/[-_]/g, ' ') : 'Unknown';
              return (
                <QueueCard
                  key={q._id}
                  post={q}
                  media={qMedia}
                  authorName={qName}
                  onOpen={() => openQueuePost(q)}
                  active={q._id === post._id}
                />
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground" data-testid="watch-queue-empty">
            Nothing else on the board yet.
          </p>
        )}
      </aside>

      {/* ── The author overlay (the "stay on the train" rule) ── */}
      {overlayOpen && (
        <AuthorOverlay
          author={author}
          profile={profile}
          posts={authorPosts}
          mediaMap={mediaMap}
          following={following}
          onToggleFollow={() => void handleToggleFollow()}
          onClose={() => setOverlayOpen(false)}
          onViewAll={() => { setOverlayOpen(false); navigate(`/u/${author}`, { state: { provider: post.author_provider || '' } }); }}
        />
      )}
    </div>
  );
}
