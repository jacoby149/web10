import { ReliableImage } from '@web10/discover/image';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  readProfile,
  readMyPosts,
  readPinnedPosts,
  savePinnedPostIds,
  resolveMediaRefs,
  movePinnedPostId,
  MAX_PROFILE_PINS,
} from '@/data';
import { getWapi } from '@/data/wapi';
import type { PostRecord, MediaRecord, ProfileRecord } from '@/data/types';
import { mediaRefId } from '@/data/types';
import { textTileColor } from './textTileColor';
import { toast, errorMessage } from '@/components/shared/Toast';
import { cn } from '@/lib/utils';
import { ArrowLeft, ChevronUp, ChevronDown, Plus, Pin, Loader2, AlertTriangle, Music } from 'lucide-react';

// ── Pinned posts (profile-pins.md) — the owner's manage screen ──────────────
// /u/:username/pins — the deep-linkable home of the profile's pin list: the
// current pins in order (up/down to reorder, X to unpin) + the add section
// (the owner's unpinned posts, capped at MAX_PROFILE_PINS slots). The D88
// collection-detail idiom: the URL holds the screen (refresh-safe, back/
// forward work), the owner-only guard bounces anyone else to the profile, and
// every write is the face doc's pinned_post_ids through savePinnedPostIds
// (optimistic + rollback, the 5.18.0 toggle's model — three slots, not a
// twenty-item playlist, so each move persists on its own). Presentation, not
// ranking: this screen orders the profile's Posts tab and nothing else.

const LOG = (...args: unknown[]) => console.log('[social:pins-screen]', ...args);

export default function ProfilePinsScreen() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const token = getWapi().readToken();
  const isOwner = !!token && token.username === username;

  const [face, setFace] = useState<ProfileRecord | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  const [pins, setPins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const current = () => generation === loadGeneration.current;
    setLoading(true);
    setError(false);
    try {
      LOG('load — owner face + posts for', username);
      const [p, postsData] = await Promise.all([
        readProfile().catch((e) => {
          console.error('[social:pins-screen] readProfile failed:', e);
          return null;
        }),
        readMyPosts({}).catch((e) => {
          console.error('[social:pins-screen] readMyPosts failed:', e);
          throw e;
        }),
      ]);
      if (!current()) return;

      // The pinned gap (profile-pins.md): pins older than the main read's page
      // come back by exact doc_id (the owner scope — a private pin still
      // resolves for its owner).
      let pinnedExtra: PostRecord[] = [];
      const pinIds = p?.pinned_post_ids ?? [];
      if (pinIds.length) {
        const haveIds = new Set(postsData.map((x) => x._id).filter(Boolean));
        const missing = pinIds.filter((id) => !haveIds.has(id));
        if (missing.length) {
          const res = await readPinnedPosts({ username, docIds: missing, isOwn: true });
          if (res) pinnedExtra = res;
          // null = the read failed — unknown, the screen shows what it has.
        }
      }
      if (!current()) return;

      const seen = new Set<string>();
      const merged = [...pinnedExtra, ...postsData].filter((x) => {
        const id = x._id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      setFace(p ?? null);
      setPosts(merged);
      setPins(pinIds);

      // The previews (the owner's own media — the profile screen's resolve
      // pattern; the extra pinned posts' refs may already be inline-resolved,
      // and resolveMediaRefs handles both shapes).
      const refs = merged.flatMap((x) => x.media_refs || []);
      if (refs.length) {
        const media = await resolveMediaRefs([...new Set(refs)]).catch((e) => {
          console.warn('[social:pins-screen] media resolution failed (degraded):', e);
          return [] as MediaRecord[];
        });
        if (!current()) return;
        const map: Record<string, MediaRecord> = {};
        media.forEach((m) => {
          if (m._id) map[m._id] = m;
        });
        setMediaMap(map);
      }
    } catch (e) {
      console.error('Failed to load pinned posts:', e);
      if (current()) setError(true);
    }
    if (current()) setLoading(false);
  }, [username]);

  useEffect(() => {
    load();
    return () => {
      loadGeneration.current++;
    };
  }, [load]);

  const pinnedPosts = useMemo(
    () => pins.map((id) => posts.find((p) => p._id === id)).filter((p): p is PostRecord => Boolean(p)),
    [pins, posts],
  );
  const addablePosts = useMemo(
    () => posts.filter((p) => p._id && !pins.includes(p._id)),
    [posts, pins],
  );

  // The owner-only guard: a visitor (or anon) hitting /u/:username/pins gets
  // the profile back — pin management is the owner's surface. (After every
  // hook — a conditional return must come last.)
  if (!isOwner) {
    return <Navigate to={`/u/${username}`} replace />;
  }

  // Persist a new pin list optimistically (rollback + toast on failure).
  // `face` is the loaded record — the write carries it (the node's update is
  // a full-body replacement; savePinnedPostIds spreads the live state).
  async function persistPins(next: string[], label: string) {
    if (busy) return;
    const before = pins;
    setPins(next);
    setBusy(true);
    try {
      const saved = await savePinnedPostIds(face, next);
      if (saved) setFace(saved);
      LOG(label, '→', next.length, 'pin(s)');
    } catch (e) {
      console.error('[social:pins-screen]', label, 'failed, rolling back:', e);
      setPins(before);
      toast.error(errorMessage(e, `Could not ${label.toLowerCase()}.`));
    } finally {
      setBusy(false);
    }
  }

  const slotsFull = pins.length >= MAX_PROFILE_PINS;

  function postPreview(post: PostRecord) {
    const ref = (post.media_refs || [])[0];
    const media = ref ? mediaMap[mediaRefId(ref)] : undefined;
    const isVideo = !!media?.mime_type?.startsWith('video/');
    const isAudio = !!media?.mime_type?.startsWith('audio/');
    // The picture: a video's thumbnail (or its poster) first, then any
    // image/url — never the raw audio (the wall's album-art precedence, in
    // miniature: audio previews as its thumbnail or the music-note tile).
    const imgSrc = media?.thumbnail_url || (isAudio ? undefined : media?.url);
    if (imgSrc) {
      return (
        <ReliableImage
          src={imgSrc}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
          data-testid="profile-pins-preview"
        />
      );
    }
    // No picture: the wall's deterministic quote-card color (the same
    // textTileColor the profile grid uses — the list reads as the wall). An
    // audio post wears the music note (the wall's audio-tile idiom).
    const snippet = post.title || post.text || '';
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg p-1.5"
        style={{ backgroundColor: textTileColor(post._id) }}
        data-testid={isAudio ? 'profile-pins-preview-audio' : 'profile-pins-preview-text'}
      >
        {isAudio ? (
          <Music className="h-5 w-5 text-tile-foreground" aria-hidden="true" />
        ) : (
          <p className="w-full text-[10px] leading-tight text-tile-foreground line-clamp-4">{snippet}</p>
        )}
      </div>
    );
  }

  function postLabel(post: PostRecord) {
    const text = post.title || post.text || 'Untitled post';
    return <p className="text-sm text-foreground leading-snug line-clamp-2">{text}</p>;
  }

  if (loading) {
    return (
      <div className="px-4 py-4" data-testid="profile-pins-loading">
        <Skeleton className="h-8 w-40" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-16 text-center" data-testid="profile-pins-error" role="alert">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="mb-4 text-sm text-muted-foreground">Your pinned posts could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="profile-pins-screen">
      {/* Header — the profile's own back-button idiom (the D80 list screens). */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(`/u/${username}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Back to profile"
          data-testid="profile-pins-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">Pinned posts</h1>
          <p className="text-xs text-muted-foreground">
            Held up at the top of your Posts tab · {pins.length} of {MAX_PROFILE_PINS} slots
          </p>
        </div>
      </div>

      <div className="px-4 py-4">
        {pinnedPosts.length ? (
          <div className="space-y-3">
            {pinnedPosts.map((post, i) => (
              <div
                key={post._id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                data-testid="profile-pins-item"
              >
                {postPreview(post)}
                <div className="min-w-0 flex-1">
                  {postLabel(post)}
                </div>
                {/* The order controls (up to the slot above / down to the slot
                    below; both disabled at the ends — the D88 collection's
                    chevron idiom). */}
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    disabled={i === 0 || busy}
                    onClick={() => void persistPins(movePinnedPostId(pins, post._id || '', -1), `move ${i + 1} up`)}
                    aria-label={`Move pinned post ${i + 1} up`}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="profile-pins-up"
                  >
                    <ChevronUp className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    disabled={i === pinnedPosts.length - 1 || busy}
                    onClick={() => void persistPins(movePinnedPostId(pins, post._id || '', 1), `move ${i + 1} down`)}
                    aria-label={`Move pinned post ${i + 1} down`}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="profile-pins-down"
                  >
                    <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void persistPins(pins.filter((id) => id !== (post._id || '')), 'unpin')}
                  aria-label="Unpin from profile"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger-muted hover:text-danger disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="profile-pins-unpin"
                >
                  <Pin className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          // The empty state is a story beat (design.md §1), not a gray void:
          // point at the first pin, the way the fresh feed points at the
          // first post.
          <div className="py-12 text-center" data-testid="profile-pins-empty">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
              <Pin className="h-5 w-5 text-brand-300" />
            </div>
            <p className="text-sm font-medium text-foreground">Nothing pinned yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Open a post on your profile, tap the <span className="font-medium text-foreground">⋯</span> menu, and choose{' '}
              <span className="font-medium text-foreground">Pin to profile</span> to hold it up at the top of your Posts tab.
            </p>
          </div>
        )}

        {/* The add section — the owner's unpinned posts, one tap away (the
            slots-full state is copy, not a dead button). */}
        {pinnedPosts.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {slotsFull ? 'All 3 slots are full' : 'Add a post'}
            </h2>
            {slotsFull ? (
              <p className="text-sm text-muted-foreground">
                Unpin one to hold up another — your three slots are taken.
              </p>
            ) : addablePosts.length ? (
              <div className="space-y-2">
                {addablePosts.map((post) => (
                  <div
                    key={post._id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
                    data-testid="profile-pins-addable"
                  >
                    {postPreview(post)}
                    <div className="min-w-0 flex-1">{postLabel(post)}</div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void persistPins([...pins, post._id || ''], 'pin')}
                      aria-label={`Pin ${post.title || post.text || 'this post'}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="profile-pins-add"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />}
                      Pin
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No more posts to pin.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
