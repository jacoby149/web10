import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readGroupDetail,
  readGroupIdentity,
  readGroupMediaPage,
  GROUP_MEDIA_PAGE_SIZE,
  joinGroup,
  requestJoinGroup,
  leaveGroup,
  resolveMediaRefs,
  mediaRefId,
  getGroupsManages,
  deleteGroup,
  countComments,
  readReactions,
  toggleReactionKind,
  readRepostCounts,
  readMyRepostedIds,
  readViewCount,
  getDiscoverGroupId,
  saveGroup,
  publishGroup,
  writeGroupIdentity,
  uploadMedia,
  groupCreator,
  healGroupOwnership,
  readGroupCollections,
  readGroupPublicCollections,
  createGroupCollection,
  type CollectionRecord,
  type ReactionKind,
  type GroupDetail,
  type GroupIdentity,
  type GroupCommitInput,
  type MediaRecord,
} from '@/data';
import { fromV3DocToPost } from '@/data/types';
import { getV3Client } from '@/data/v3';
import type { PostRecord } from '@/data/types';
import ManageGroupSheet, { type ManageSection } from '@/components/Groups/ManageGroup/ManageGroupSheet';
import GroupEditMode from '@/components/Groups/ManageGroup/GroupEditMode';
import ManageMembersSection from '@/components/Groups/ManageGroup/MembersSection';
import ManageRolesSection from '@/components/Groups/ManageGroup/RolesSection';
import { toast, errorMessage } from '@/components/shared/Toast';
import { PostCard } from '@/components/Feed/FeedScreen';
import { useRepost } from '@/context/RepostContext';
import { useComposer } from '@/context/ComposerContext';
import { PostLightbox } from '@/components/Bio/PostLightbox';
import { ProfileMediaLightbox, type ProfileMediaOption, type FaceCropResult } from '@/components/Bio/ProfileMediaLightbox';
import { ProfileViewToggle, type ProfileViewMode } from '@/components/Bio/ProfileViewToggle';
import { WallTile } from '@/components/Bio/UserProfileScreen';
import { SavedCollectionsGrid } from '@/components/Bio/SavedCollectionsGrid';
import {
  ArrowLeft,
  Users,
  UserPlus,
  UserCheck,
  LogOut,
  Loader2,
  Lock,
  AlertTriangle,
  RefreshCw,
  Globe,
  MoreHorizontal,
  ImagePlus,
  Play,
  Pencil,
  Plus,
  Camera,
  Bookmark,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:groups:detail]', ...args);

// ── Helpers ────────────────────────────────────────────────────────────────

function hashToColor(str: string): string {
  const colors = [
    'bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
    'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
    'bg-teal-500', 'bg-red-500',
  ];
  let hash = 0;
  for (let i = 0; str.length > i; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Group feed post (the reference PostCard, group-scoped) ─────────────────
// The feed is the reference renderer (FeedScreen's PostCard) — no surface
// re-implements the card. This wrapper owns the per-post engagement state
// (the reaction pair + comment count, scoped to the group — reactions and
// comments attach to the group, not the discover board, post-actions.md) and
// hands the card the group via `groups` so every engagement write lands in
// the group.

function GroupFeedPost({ post, media, groupId }: { post: PostRecord; media: MediaRecord[]; groupId: string }) {
  const navigate = useNavigate();
  const { openComposer } = useComposer();
  const author = post.author_username || post.author || 'unknown';

  // Engagement state (post-actions.md): the reaction pair + comment count,
  // scoped to the group. Loaded on mount — the group feed is a short list,
  // not a paginated feed, so a per-card read is fine (the lightbox's pattern).
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [viewImpressions, setViewImpressions] = useState(0);
  const [viewReach, setViewReach] = useState(0);
  const token = getV3Client().readToken();
  // The comment thread's group scope — memoized so its array identity is
  // stable across renders (a fresh `[groupId]` literal would re-key the
  // thread's load effect on every card re-render).
  const commentGroups = useMemo(() => [groupId], [groupId]);

  useEffect(() => {
    let cancelled = false;
    const postId = post._id || '';
    Promise.all([
      countComments(postId, [groupId]),
      token ? readReactions(postId, undefined, [groupId]) : Promise.resolve([]),
      // Repost (reposts.md: a repost is a POST, not a reaction). The count is
      // the number of `repost_of` posts (readRepostCounts, the feed query's
      // I3-scoped join lifted to a surface read) and the "I reposted this"
      // fill is the reader's own repost post (readMyRepostedIds, the
      // readFeedReactions own-post read lifted to a surface read). The legacy
      // `type:'repost'` reaction still fills for old data (a read-only
      // fallback).
      readRepostCounts([postId], [getDiscoverGroupId()]),
      readMyRepostedIds(),
      readViewCount(postId, [getDiscoverGroupId()]),
    ]).then(([cCount, reactions, repostCounts, myReposts, vCount]) => {
      if (cancelled) return;
      setCommentCount(cCount);
      setViewImpressions(vCount.impressions);
      setViewReach(vCount.reach);
      // The view itself is the delivery — logged server-side by the group post
      // read (which passes the D86 surface). No client-side "record a view"
      // write: the node already recorded the delivery.
      if (!token) return;
      // v3 ownership is by username alone (a reaction's author_key is the
      // bare username — the provider compare was the v2 rule, 3.79.3 class).
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
      // Likes and dislikes are counted separately (the heart and the thumb
      // each show their own tally — post-actions.md).
      setLikeCount(reactions.filter((r) => r.type === 'like').length);
      setDislikeCount(reactions.filter((r) => r.type === 'dislike').length);
    }).catch((e) => console.error('Failed to load group post engagement:', e));
    return () => { cancelled = true; };
  }, [post._id, groupId, token]);

  async function handleToggleReaction(kind: ReactionKind) {
    if (!token) return;
    const wasLiked = liked;
    const wasDisliked = disliked;
    const nextLiked = kind === 'like' ? !wasLiked : false;
    const nextDisliked = kind === 'dislike' ? !wasDisliked : false;
    // Per-tally delta from the CURRENT flags (a like↔dislike swap moves the
    // reaction: like -1, dislike +1) — the old single `delta` was wrong on a
    // swap (the "0 1 0 1" flicker).
    const likeDelta = (nextLiked ? 1 : 0) - (wasLiked ? 1 : 0);
    const dislikeDelta = (nextDisliked ? 1 : 0) - (wasDisliked ? 1 : 0);
    setLiked(nextLiked);
    setDisliked(nextDisliked);
    setLikeCount(prev => Math.max(0, prev + likeDelta));
    setDislikeCount(prev => Math.max(0, prev + dislikeDelta));
    try {
      await toggleReactionKind(post._id || '', kind, [groupId]);
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
  // pops up in place (no navigation; the user stays on the group). A repost
  // is a public post (the reposter's followers group), not a group post — so
  // it never uses the group composer. The composer's createRepost is the
  // single write; the count + fill re-derive on the next load.
  const { setRepostingTo } = useRepost();
  function handleRepost() {
    setRepostingTo(post);
    openComposer();
  }

  return (
    <PostCard
      post={post}
      authorName={author}
      authorUsername={post.author_username}
      authorProvider={post.author_provider}
      mediaItems={media}
      reactionCount={likeCount}
      dislikeCount={dislikeCount}
      commentCount={commentCount}
      impressions={viewImpressions}
      reach={viewReach}
      liked={liked}
      disliked={disliked}
      reposted={reposted}
      repostCount={repostCount}
      onToggleRepost={handleRepost}
      timestamp={post.created_at}
      onToggleReaction={handleToggleReaction}
      onCommentCountChange={setCommentCount}
      onAuthorClick={(username) => navigate(`/u/${username}`)}
      postAuthor={post.author_username}
      groups={commentGroups}
      isOwnPost={token ? post.author_username === token.username : false}
      onPostUpdated={() => {}}
      testId="group-post-card"
      surface="group"
    />
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4" data-testid="group-detail-skeleton">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

type JoinState = 'idle' | 'working' | 'done';

export default function GroupDetailScreen({ groupId }: { groupId: string }) {
  const navigate = useNavigate();
  const { openComposer } = useComposer();
  const id = groupId ? decodeURIComponent(groupId) : '';

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [identity, setIdentity] = useState<GroupIdentity>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [joinState, setJoinState] = useState<JoinState>('idle');
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  // Whether the current user can manage this group (owner/moderator). Gated by
  // the same op the authenticator uses: the group appears in getGroupsManages()
  // (the reader's role grants a management op under the 'group' key).
  const [canManage, setCanManage] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // The inline edit mode (G2, decision 2): the manager's "Edit" pencil flips
  // the page into edit mode (the hero's fields become inputs + the settings).
  // Edit mode STAGES the changes — the live group is frozen at the last commit;
  // Save/Publish is the atomic commit, Cancel discards.
  const [editing, setEditing] = useState(false);
  // A draft is being created right now (G4: the "New group" flow lands here
  // with ?edit=1) — the draft-delete in the action row is lightweight
  // (one-tap, no confirm): the group is inert, discarding it frees the slug.
  const [deletingDraft, setDeletingDraft] = useState(false);
  // A banner/avatar upload is in flight (reported by GroupEditMode, decision 3).
  // Gates the save (no auto-save mid-upload) + the nav-away warning.
  const [uploading, setUploading] = useState(false);
  // The nav-away-mid-upload warning is showing (decision 3).
  const [uploadWarning, setUploadWarning] = useState(false);
  // The create-time slug guard (G4, decision 1): true while an active group
  // exists at the draft's slug. Gates Publish (the guard is live in edit mode).
  const [slugTaken, setSlugTaken] = useState(false);
  // Quick face edit (the profile's face lightbox, shared): tapping the banner
  // or avatar opens the enlarged view + pick-from-posts + crop. The lightbox's
  // upload tile is the file path (the crop step is the single edit surface).
  const [faceLightbox, setFaceLightbox] = useState<'avatar' | 'banner' | null>(null);
  const [faceSaving, setFaceSaving] = useState(false);

  // The tabs (G1): Feed (default, bare URL) | Media (?tab=media) | Saved
  // (?tab=saved, the group's playlists — a group is a profile). The URL holds
  // the active tab (the deep-link rule) — refresh restores it, back/forward
  // work, and a shared link carries it. The group page is the profile page with
  // the tab order flipped (feed first, media second) + the profile's Saved tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: 'feed' | 'media' | 'saved' =
    searchParams.get('tab') === 'media' ? 'media' : searchParams.get('tab') === 'saved' ? 'saved' : 'feed';
  // The feed tab's view lens (the profile's grid | feed toggle, mirrored here —
  // a group is a profile). Screen state, so the URL holds it (?view=grid —
  // refresh restores it, a shared link carries it; the default feed is the
  // bare URL).
  const feedView: ProfileViewMode =
    searchParams.get('view') === 'grid' ? 'grid' : 'feed';
  const selectView = useCallback((mode: ProfileViewMode) => {
    const params = new URLSearchParams(searchParams);
    if (mode === 'grid') params.set('view', 'grid');
    else params.delete('view');
    setSearchParams(params, { replace: true });
    LOG('view —', mode);
  }, [searchParams, setSearchParams]);
  const selectTab = useCallback((next: 'feed' | 'media' | 'saved') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'feed') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
    LOG('tab —', next);
  }, [searchParams, setSearchParams]);

  // The Media tab (G1): a PAGED insta grid of the group's media posts —
  // infinite scroll appends the next page (not "pull everything") — plus a
  // total count ("N photos", the exhaustion signal). Media is resolved into
  // mediaGridMap (doc_id → MediaRecord) as each page lands.
  const [mediaPosts, setMediaPosts] = useState<PostRecord[]>([]);
  const [mediaTotal, setMediaTotal] = useState(0);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaLoadingMore, setMediaLoadingMore] = useState(false);
  const [mediaGridMap, setMediaGridMap] = useState<Record<string, MediaRecord>>({});
  const [mediaLightboxPost, setMediaLightboxPost] = useState<PostRecord | null>(null);
  // The feed tab's grid view (the profile's posts grid, mirrored — a group is
  // a profile): a tapped tile opens the post lightbox.
  const [gridLightboxPost, setGridLightboxPost] = useState<PostRecord | null>(null);
  const mediaOffsetRef = useRef(0);
  const mediaInitializedRef = useRef(false);
  const mediaSentinelRef = useRef<HTMLDivElement>(null);

  // The Saved tab (a group is a profile — the group's playlists). Manager: all
  // the group's collections (public + private) + a "New collection" affordance.
  // Visitor / member: only the group's PUBLIC collections (read-only). The read
  // is deferred until the tab is opened (the media tab's lazy-load idiom).
  const [collections, setCollections] = useState<CollectionRecord[] | null>(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const collectionsLoadedRef = useRef(false);

  const loadCollections = useCallback(async () => {
    if (!detail) return;
    const read = canManage ? readGroupCollections(detail.group_id) : readGroupPublicCollections(detail.group_id);
    try {
      const cols = await read;
      setCollections(cols);
      LOG('collections — loaded', cols.length, canManage ? '(manager)' : '(public)');
    } catch (e) {
      // A read failure degrades the tab to empty (never the group page).
      console.error('[social:groups:detail] loadCollections failed:', e);
      setCollections([]);
    }
  }, [detail, canManage]);

  // Load the collections when the Saved tab is active (and not yet loaded).
  useEffect(() => {
    if (tab === 'saved' && !collectionsLoadedRef.current && detail) {
      collectionsLoadedRef.current = true;
      void loadCollections();
    }
  }, [tab, detail, loadCollections]);

  const openGroupCollection = useCallback(
    (collectionGroupId: string) => {
      if (!detail) return;
      navigate(`/groups/${encodeURIComponent(detail.group_id)}/saved/${encodeURIComponent(collectionGroupId)}`);
    },
    [detail, navigate],
  );

  const handleCreateCollection = useCallback(async () => {
    if (!detail) return;
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    try {
      await createGroupCollection(detail.group_id, name, { visibility: 'private' });
      setNewCollectionOpen(false);
      setNewCollectionName('');
      collectionsLoadedRef.current = false;
      setCollections(null);
      await loadCollections();
    } catch (e) {
      console.error('[social:groups:detail] createGroupCollection failed:', e);
      toast.error(errorMessage(e, 'Could not create the collection.'));
    } finally {
      setCreatingCollection(false);
    }
  }, [detail, newCollectionName, loadCollections]);
  // The "dead group" heal runs at most once per mount (it reloads after healing,
  // and the ref stops a re-heal loop if a heal doesn't land).
  const healRetriedRef = useRef(false);

  // The face lightbox's pick-from-posts source (the group's own posts' media,
  // resolved). Mirrors the profile's faceOptions — same shared lightbox.
  const faceOptions = useMemo<ProfileMediaOption[]>(() => {
    if (!detail) return [];
    const out: ProfileMediaOption[] = [];
    const seen = new Set<string>();
    for (const doc of detail.posts) {
      const post = fromV3DocToPost(doc);
      for (const ref of post.media_refs || []) {
        const id = mediaRefId(ref);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const m = mediaMap[id];
        if (!m) continue; // unresolvable — nothing to render or set
        out.push({ post, ref: { doc_id: id, read_url: m.url, mime_type: m.mime_type } });
      }
    }
    return out;
  }, [detail, mediaMap]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    setNotFound(false);
    LOG('load — start', id);
    try {
      const [d, ident, manages] = await Promise.all([
        readGroupDetail(id),
        readGroupIdentity(id),
        getGroupsManages().catch(() => []),
      ]);
      LOG('load — got', d.name, { is_member: d.is_member, identity: ident.name, manages: manages.length });
      setDetail(d);
      setIdentity(ident);
      setCanManage(manages.some((g) => g.group_id === d.group_id));
      // Resolve all media (the face + every post's media) in one batch.
      const refs: string[] = [];
      if (ident.banner_ref) refs.push(ident.banner_ref);
      if (ident.avatar_ref) refs.push(ident.avatar_ref);
      for (const p of d.posts) {
        const body = (p.body || {}) as { media_refs?: (string | { doc_id?: string })[] };
        for (const r of body.media_refs || []) {
          const refId = typeof r === 'string' ? r : r.doc_id || '';
          if (refId) refs.push(refId);
        }
      }
      if (refs.length) {
        const resolved = await resolveMediaRefs([...new Set(refs)]);
        const map: Record<string, MediaRecord> = {};
        for (const m of resolved) if (m._id) map[m._id] = m;
        setMediaMap(map);
      } else {
        setMediaMap({});
      }
    } catch (e) {
      const status = (e as { status?: number })?.status;
      LOG('load — failed:', e);
      if (status === 404 || (e as Error)?.message?.includes('404')) {
        setNotFound(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // The app-level New Post sheet fires `post-created` (NewPostSheet) when a
  // post lands — reload the group feed so the fresh post shows up (the seam
  // that replaces the old inline group composer's onPostCreated callback).
  useEffect(() => {
    const onPostCreated = () => load();
    window.addEventListener('post-created', onPostCreated);
    return () => window.removeEventListener('post-created', onPostCreated);
  }, [load]);

  // The "dead group" heal: a group the user created can end up unmanageable
  // (the creator's row drifted to a non-owner role), so the Edit pencil + kebab
  // (and the delete) never appear. When the loaded group is one the user created
  // but can't manage, re-point the creator to owner, then reload so the
  // management surface shows. Runs at most once per mount.
  useEffect(() => {
    if (loading || !detail || canManage || healRetriedRef.current) return;
    const username = getV3Client().readToken()?.username || '';
    if (groupCreator(detail.group_id) !== username) return;
    healRetriedRef.current = true;
    LOG('heal — owned-but-dead group, re-pointing ownership', detail.group_id);
    healGroupOwnership(detail.group_id, username).then((healed) => {
      if (healed) load();
    });
  }, [loading, detail, canManage, load]);

  // G4: a draft opens in edit mode — the create flow lands here with ?edit=1,
  // and a draft with no staged name yet is still being configured. The page IS
  // the form (the operator's "profile looking page come up in the edit mode").
  // The flag is cleared on entry so a refresh mid-create doesn't re-flip a
  // named draft into edit mode (it re-opens via the pencil like any group).
  useEffect(() => {
    if (loading || editing || identity.status !== 'draft') return;
    const wantsEdit = searchParams.get('edit') === '1' || !identity.name;
    if (!wantsEdit) return;
    LOG('draft — auto-opening edit mode', id);
    setEditing(true);
    if (searchParams.get('edit') === '1') {
      const params = new URLSearchParams(searchParams);
      params.delete('edit');
      setSearchParams(params, { replace: true });
    }
  }, [loading, editing, identity.status, identity.name, id, searchParams, setSearchParams]);

  // ── Media tab (G1): the paged insta grid ──────────────────────────────────
  // `loadMediaPage` reads one page (limit/offset) of the group's media posts +
  // the total count, resolves the page's media refs into mediaGridMap, and
  // appends (or replaces, for page one) the grid. `loadMoreMedia` is the
  // infinite-scroll trigger (the sentinel's IntersectionObserver).
  const loadMediaPage = useCallback(async (offset: number, append: boolean) => {
    if (!id) return;
    if (append) setMediaLoadingMore(true);
    else setMediaLoading(true);
    LOG('loadMediaPage — start', id, { offset, append });
    try {
      const page = await readGroupMediaPage(id, GROUP_MEDIA_PAGE_SIZE, offset);
      // Resolve the page's media refs (the grid renders from the resolved map —
      // the same resolveMediaRefs path the hero + feed use).
      const refs: string[] = [];
      for (const p of page.posts) {
        for (const r of p.media_refs || []) {
          const refId = mediaRefId(r);
          if (refId) refs.push(refId);
        }
      }
      if (refs.length) {
        const resolved = await resolveMediaRefs([...new Set(refs)]);
        const map: Record<string, MediaRecord> = {};
        for (const m of resolved) if (m._id) map[m._id] = m;
        setMediaGridMap((prev) => ({ ...prev, ...map }));
      }
      setMediaPosts((prev) => (append ? [...prev, ...page.posts] : page.posts));
      setMediaTotal(page.total);
      setMediaHasMore(page.hasMore);
      mediaOffsetRef.current = offset + page.posts.length;
      LOG('loadMediaPage — got', page.posts.length, 'posts, total:', page.total, 'hasMore:', page.hasMore);
    } catch (e) {
      LOG('loadMediaPage — failed:', e);
    } finally {
      setMediaLoading(false);
      setMediaLoadingMore(false);
    }
  }, [id]);

  const loadMoreMedia = useCallback(() => {
    if (!mediaHasMore || mediaLoadingMore || mediaLoading) return;
    loadMediaPage(mediaOffsetRef.current, true);
  }, [mediaHasMore, mediaLoadingMore, mediaLoading, loadMediaPage]);

  // Reset the media grid when the group changes (the route param can change
  // without a remount). Fresh group → fresh grid.
  useEffect(() => {
    mediaInitializedRef.current = false;
    mediaOffsetRef.current = 0;
    setMediaPosts([]);
    setMediaTotal(0);
    setMediaHasMore(false);
    setMediaGridMap({});
    setMediaLightboxPost(null);
    setGridLightboxPost(null);
  }, [id]);

  // Load page one when the Media tab is active (and not yet loaded). The feed
  // is the default tab, so the media read is deferred until the tab is opened.
  useEffect(() => {
    if (tab === 'media' && !mediaInitializedRef.current && !mediaLoading) {
      mediaInitializedRef.current = true;
      loadMediaPage(0, false);
    }
  }, [tab, mediaLoading, loadMediaPage]);

  // Infinite scroll: a sentinel at the bottom of the grid triggers loadMoreMedia
  // when it scrolls into view (rootMargin prefetches a page early) — the feed's
  // exact pattern.
  useEffect(() => {
    if (tab !== 'media') return;
    const sentinel = mediaSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreMedia();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, loadMoreMedia]);

  const handleJoin = useCallback(async () => {
    if (!detail) return;
    setJoinState('working');
    try {
      if (detail.join_policy === 'open') {
        LOG('join —', detail.group_id);
        await joinGroup(detail.group_id);
        setDetail({ ...detail, is_member: true, posts_state: 'ok' });
      } else if (detail.join_policy === 'request') {
        LOG('request —', detail.group_id);
        await requestJoinGroup(detail.group_id);
      }
      setJoinState('done');
      load();
    } catch (e) {
      LOG('join — failed:', e);
      toast.error(errorMessage(e, 'Could not join the group.'));
      setJoinState('idle');
    }
  }, [detail, load]);

  const handleLeave = useCallback(async () => {
    if (!detail) return;
    setJoinState('working');
    try {
      LOG('leave —', detail.group_id);
      await leaveGroup(detail.group_id);
      setDetail({ ...detail, is_member: false, posts_state: 'join_to_view', posts: [] });
      setJoinState('done');
      load();
    } catch (e) {
      LOG('leave — failed:', e);
      toast.error(errorMessage(e, 'Could not leave the group.'));
      setJoinState('idle');
    }
  }, [detail, load]);

  const handleDeleteGroup = useCallback(async () => {
    if (!detail) return;
    LOG('delete —', detail.group_id);
    try {
      await deleteGroup(detail.group_id);
      navigate('/groups');
    } catch (e) {
      LOG('delete — failed:', e);
      toast.error(errorMessage(e, 'Could not delete the group.'));
    }
  }, [detail, navigate]);

  // The atomic commit (G2, decision 2): the staged face AND settings land
  // together via G0's saveGroup (published) / publishGroup (draft). On success
  // the live state re-reads and edit mode exits; on failure the error surfaces
  // in the edit form (the stage is kept so the user can retry).
  const handleEditSave = useCallback(
    async (staged: GroupCommitInput) => {
      if (!detail) return;
      const isDraft = identity.status === 'draft';
      // The create-time slug guard (decision 1) is live in edit mode: a draft
      // can't publish onto a slug another active group owns.
      if (isDraft && slugTaken) {
        LOG('edit save — blocked: slug taken', detail.group_id);
        return;
      }
      LOG('edit save — atomic commit', detail.group_id, { isDraft });
      if (isDraft) {
        await publishGroup(detail.group_id, staged);
      } else {
        await saveGroup(detail.group_id, staged);
      }
      setEditing(false);
      await load();
    },
    [detail, identity.status, slugTaken, load],
  );

  // Cancel discards the stage (decision 2) — the live state was never touched,
  // so exiting edit mode restores it.
  const handleEditCancel = useCallback(() => {
    LOG('edit cancel — discarding stage');
    setEditing(false);
  }, []);

  // The lightweight draft-delete (G4): only reachable on a draft (the create
  // flow's action row). One tap — the group is inert (unlisted, owner-only),
  // so discarding it can't kill a live community; the tombstone frees the slug
  // (delete-then-recreate is safe, G0). The published-delete two-tap confirm
  // lives in the kebab (G3) and is a different path.
  const handleDeleteDraft = useCallback(async () => {
    if (!detail || deletingDraft) return;
    LOG('draft delete —', detail.group_id);
    setDeletingDraft(true);
    try {
      await deleteGroup(detail.group_id);
      LOG('draft delete — done, back to groups');
      navigate('/groups');
    } catch (e) {
      LOG('draft delete — failed:', e);
      toast.error(errorMessage(e, 'Could not delete the draft.'));
      setDeletingDraft(false);
    }
  }, [detail, deletingDraft, navigate]);

  // The back button (decision 3): a nav-away while an upload is in flight shows
  // the warning (stay / leave) instead of leaving immediately.
  const handleBack = useCallback(() => {
    if (uploading) {
      LOG('back — upload in flight, showing warning');
      setUploadWarning(true);
      return;
    }
    navigate(-1);
  }, [uploading, navigate]);

  // ── Quick face edit (shared profile face lightbox) ─────────────────────
  // Managers can tap the banner/avatar to view it enlarged and pick a group
  // post's media as the new face, or use the lightbox's upload tile to upload
  // a file (the crop step is the single edit surface — the hover buttons open
  // the lightbox, not a raw file picker).
  const handleFaceCrop = useCallback(
    async (field: 'avatar' | 'banner', result: FaceCropResult) => {
      if (!detail) return;
      LOG('quick face crop — start', field, result.width, 'x', result.height, result.blob.size, 'bytes');
      setFaceSaving(true);
      try {
        const ext = result.mimeType === 'image/png' ? 'png' : 'jpg';
        const file = new File([result.blob], `group-face-${Date.now()}.${ext}`, { type: result.mimeType });
        const media = await uploadMedia({ file, service: 'public_media', width: result.width, height: result.height });
        LOG('quick face crop — uploaded media _id:', media._id);
        await writeGroupIdentity(detail.group_id, {
          ...identity,
          [field === 'avatar' ? 'avatar_ref' : 'banner_ref']: media._id || '',
        });
        setFaceLightbox(null);
        LOG('quick face crop — identity written, reloading');
        await load();
      } catch (e) {
        console.error('[social:groups:detail] quick face crop save failed:', e);
        toast.error(errorMessage(e, 'Could not update the group photo.'));
      } finally {
        setFaceSaving(false);
      }
    },
    [detail, identity, load],
  );

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <div className="w-full md:max-w-3xl md:mx-auto px-4 py-4 md:px-0">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <div className="w-full md:max-w-3xl md:mx-auto px-4 py-4 md:px-0">
          <div
            data-testid="group-detail-notfound"
            className="flex flex-col items-center justify-center py-16 px-8 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
              <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Group not found</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              This group doesn't exist on the node. It may have been deleted.
            </p>
            <Button variant="brand" size="sm" className="mt-6 gap-2" onClick={() => navigate('/groups')} data-testid="group-detail-notfound-back">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Back to groups
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <div className="w-full md:max-w-3xl md:mx-auto px-4 py-4 md:px-0">
          <div
            data-testid="group-detail-error"
            className="flex flex-col items-center justify-center py-16 px-8 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
              <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Couldn't load this group</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Something went wrong talking to the node. Try again.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" size="sm" onClick={() => navigate('/groups')} data-testid="group-detail-error-back">
                <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.75} />
                Back
              </Button>
              <Button variant="brand" size="sm" className="gap-2" onClick={load} data-testid="group-detail-error-retry">
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { posts } = detail;
  const postRecords: PostRecord[] = posts.map(fromV3DocToPost);
  const canJoin = !detail.is_member && detail.join_policy !== 'invite_only';
  const displayName = identity.name || detail.name;
  const bannerUrl = identity.banner_ref ? mediaMap[identity.banner_ref]?.url : undefined;
  const avatarUrl = identity.avatar_ref ? mediaMap[identity.avatar_ref]?.url : undefined;
  const hasAbout = Boolean(identity.description || (identity.tags && identity.tags.length) || identity.website);
  // The group has a "face" when it has any of the rich display metadata.
  const hasFace = Boolean(bannerUrl || avatarUrl || hasAbout);

  // The kebab's sections (G3): Profile + Settings are RETIRED — they fold into
  // the inline edit mode (the "Edit" pencil). The kebab (secondary to the
  // pencil) is the secondary surface for the list ops that don't fit inline
  // editing: Members + Roles + the published-delete two-tap confirm.
  const manageSections: ManageSection[] = [
    { id: 'members', label: 'Members', icon: Users, content: <ManageMembersSection groupId={detail.group_id} onSaved={load} /> },
    {
      id: 'roles',
      label: 'Roles',
      icon: UserCheck,
      content: (
        <ManageRolesSection
          groupId={detail.group_id}
          roles={detail.roles || []}
          onSaved={load}
          onDelete={handleDeleteGroup}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="w-full md:max-w-3xl md:mx-auto flex-1 flex flex-col">
        {/* Sticky top bar — back + (managers) the kebab entry point (G3) */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-2 py-2 backdrop-blur-md md:static md:border-0 md:bg-transparent md:px-0 md:py-1" data-testid="group-detail-topbar">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Back"
            data-testid="group-detail-back"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </Button>
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setManageOpen(true)}
              aria-label="Manage group"
              data-testid="group-detail-kebab"
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
            </Button>
          )}
        </div>

        {/* The hero — the group's face, profile-shaped (banner + overlapping
            avatar + name + about), the same shape as a user profile. The
            banner is ALWAYS present (the brand gradient when the group has
            no cover) so the page never collapses to a bare header. */}
        <div data-testid="group-detail-hero">
          {editing ? (
            <div className="px-4 py-4 sm:px-6" data-testid="group-detail-editing">
              <GroupEditMode
                groupId={detail.group_id}
                identity={identity}
                joinPolicy={detail.join_policy}
                discoverable={Boolean(detail.discoverable)}
                isDraft={identity.status === 'draft'}
                onUploadingChange={setUploading}
                onSave={handleEditSave}
                onCancel={handleEditCancel}
                slugTaken={slugTaken}
                onSlugTakenChange={setSlugTaken}
                onDelete={handleDeleteDraft}
                deleting={deletingDraft}
              />
            </div>
          ) : (
          <>
          <div
            role={canManage ? 'button' : undefined}
            tabIndex={canManage ? 0 : undefined}
            aria-label={canManage ? 'View cover' : undefined}
            data-testid="group-detail-banner"
            onClick={() => canManage && setFaceLightbox('banner')}
            onKeyDown={(e) => {
              if (canManage && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setFaceLightbox('banner');
              }
            }}
            className={cn(
              'relative h-32 w-full overflow-hidden sm:h-44',
              'bg-gradient-to-br from-brand/40 via-brand-muted to-background',
              canManage && 'group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
            )}
          >
            <div
              className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-brand/10"
              aria-hidden="true"
            />
            {bannerUrl && (
              <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" data-testid="group-detail-banner-img" />
            )}
            {canManage && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFaceLightbox('banner'); }}
                aria-label="Change cover"
                data-testid="group-edit-banner-button"
                className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-background/70 border border-border text-xs text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity backdrop-blur-sm hover:border-brand/30 hover:bg-background/90"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Cover
              </button>
            )}
          </div>
          <div className="px-4 sm:px-6">
            <div className="relative flex items-end justify-between gap-4 -mt-14">
              <div
                role={canManage ? 'button' : undefined}
                tabIndex={canManage ? 0 : undefined}
                aria-label={canManage ? 'View group photo' : undefined}
                data-testid="group-detail-avatar"
                onClick={() => canManage && setFaceLightbox('avatar')}
                onKeyDown={(e) => {
                  if (canManage && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setFaceLightbox('avatar');
                  }
                }}
                className={cn(
                  'shrink-0 rounded-full border-4 border-background',
                  canManage && 'group relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                )}
              >
                <Avatar className={cn('h-20 w-20', hashToColor(detail.group_id))}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" data-testid="group-detail-avatar-img" />
                  ) : (
                    <AvatarFallback className="text-foreground text-3xl font-semibold">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                {canManage && (
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 flex items-center justify-center h-7 w-7 rounded-full bg-background border border-border shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:border-brand/30"
                    aria-label="Change group photo"
                    data-testid="group-edit-avatar-button"
                    onClick={(e) => { e.stopPropagation(); setFaceLightbox('avatar'); }}
                  >
                    <Camera className="w-3.5 h-3.5 text-foreground" />
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-xl font-bold text-foreground" data-testid="group-detail-name">
                    {displayName}
                  </h1>
                  {identity.status === 'draft' && (
                    <Badge variant="outline" className="normal-case tracking-normal" data-testid="group-detail-draft">
                      Draft
                    </Badge>
                  )}
                  {detail.discoverable && (
                    <Badge variant="brand" className="normal-case tracking-normal" data-testid="group-detail-listed">
                      Listed
                    </Badge>
                  )}
                  {!detail.is_member && detail.posts_state === 'ok' && (
                    <Badge variant="outline" className="normal-case tracking-normal" data-testid="group-detail-public">
                      Public
                    </Badge>
                  )}
                  {!detail.is_member && detail.posts_state === 'join_to_view' && (
                    <Badge variant="outline" className="normal-case tracking-normal" data-testid="group-detail-private">
                      Private
                    </Badge>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      aria-label="Edit group"
                      className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="group-detail-edit"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="tabular-nums">{formatCount(detail.member_count)} members</span>
                  <span aria-hidden="true">·</span>
                  <span>by @{detail.owner}</span>
                </p>
              </div>
            </div>
            {hasAbout && (
              <div className="mt-3 pb-4">
                {identity.description && (
                  <p className="text-sm leading-relaxed text-foreground" data-testid="group-detail-description">
                    {identity.description}
                  </p>
                )}
                {identity.tags && identity.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {identity.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-brand/10 bg-brand-muted/60 px-2.5 py-1 text-xs text-brand-300">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                {identity.website && (
                  <a
                    href={identity.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-400 transition-colors duration-150"
                    data-testid="group-detail-website"
                  >
                    <Globe className="h-4 w-4" strokeWidth={1.5} />
                    {identity.website}
                  </a>
                )}
              </div>
            )}
            {!hasFace && canManage && (
              <button
                type="button"
                onClick={() => (identity.status === 'draft' ? setEditing(true) : setManageOpen(true))}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="group-detail-add-face"
              >
                <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
                Add a cover &amp; about
              </button>
            )}
            {!hasAbout && <div className="pb-4" />}
          </div>
          </>
          )}
        </div>

        {/* Join / Leave — the membership action, below the hero */}
        <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-3 md:px-0" data-testid="group-detail-actions">
          {detail.is_member ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border text-muted-foreground hover:border-danger/50 hover:text-danger hover:bg-danger-muted"
              onClick={handleLeave}
              disabled={joinState === 'working'}
              data-testid="group-detail-leave"
            >
              {joinState === 'working' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              <span className="hidden sm:inline">Leave</span>
            </Button>
          ) : canJoin ? (
            <Button
              variant="brand"
              size="sm"
              className="gap-1.5"
              onClick={handleJoin}
              disabled={joinState === 'working'}
              data-testid="group-detail-join"
            >
              {joinState === 'working' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : joinState === 'done' && detail.join_policy === 'request' ? (
                <>
                  <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="hidden sm:inline">Requested</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="hidden sm:inline">{detail.join_policy === 'request' ? 'Request' : 'Join'}</span>
                </>
              )}
            </Button>
          ) : (
            <div
              className="flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-muted-foreground"
              data-testid="group-detail-invite-only"
            >
              <Lock className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span className="hidden sm:inline">Invite only</span>
            </div>
          )}
        </div>

        {/* The tabs (G1): Feed (default, bare URL) | Media (?tab=media) — the
            profile's tab row with the order flipped (feed front and center,
            media second). The URL holds the active tab (deep-link rule). */}
        <div className="flex items-end border-b border-border" data-testid="group-detail-tabs">
          <button
            data-testid="group-tab-feed"
            aria-current={tab === 'feed' ? 'true' : undefined}
            className={cn(
              'flex-1 min-h-11 py-3 text-sm font-medium text-center transition-all duration-150 relative',
              tab === 'feed' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => selectTab('feed')}
          >
            Feed
            {tab === 'feed' && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-brand to-brand-600" />
            )}
          </button>
          <button
            data-testid="group-tab-media"
            aria-current={tab === 'media' ? 'true' : undefined}
            className={cn(
              'flex-1 min-h-11 py-3 text-sm font-medium text-center transition-all duration-150 relative',
              tab === 'media' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => selectTab('media')}
          >
            Media
            {tab === 'media' && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-brand to-brand-600" />
            )}
          </button>
          {/* Saved (a group is a profile) — the group's playlists. Manager:
              always present (even empty — the tab's empty state + a "New
              collection" affordance). Visitor / member: only when the group has
              ≥1 PUBLIC collection (a private one never surfaces — the D80
              by-group read returns only membership_visibility='public'). */}
           {collections !== null && (canManage || collections.length > 0) && (
             <button
               data-testid="group-tab-saved"
               aria-current={tab === 'saved' ? 'true' : undefined}
               className={cn(
                 'flex-1 min-h-11 py-3 text-sm font-medium text-center transition-all duration-150 relative',
                 tab === 'saved' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
               )}
               onClick={() => selectTab('saved')}
             >
               Saved
               {tab === 'saved' && (
                 <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-brand to-brand-600" />
               )}
             </button>
           )}
           {tab === 'feed' && (
             <div className="flex items-center shrink-0 pr-2 pb-2">
               <ProfileViewToggle value={feedView} onChange={selectView} />
             </div>
           )}
         </div>

        {/* The feed — the dominant surface (the reference feed card + composer) */}
        {tab === 'feed' && (
          <div className="flex-1 px-4 py-4 md:px-0">
            {detail.posts_state === 'ok' ? (
              <>
                {/* The composer is NOT inline (the operator: "it should be
                    invisible") — a member gets a "Post to this group" button
                    that opens the app-level New Post sheet scoped to this
                    group (the post attaches to the group, the old
                    group-composer behavior). */}
                {detail.is_member && (
                  <button
                    type="button"
                    data-testid="group-post-button"
                    onClick={() => openComposer({ groups: [detail.group_id] })}
                    className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-elevated px-4 py-3 text-sm font-medium text-foreground transition-colors duration-150 hover:border-brand/40 hover:bg-brand-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Plus className="w-4 h-4 text-brand" strokeWidth={2} />
                    Post to this group
                  </button>
                )}
                {postRecords.length > 0 ? (
                  feedView === 'grid' ? (
                    /* The grid lens (the profile's posts grid, mirrored — a
                       group is a profile): the insta-shaped 9:16 wall of
                       tiles, one per post (video-first, text tiles for
                       text-only posts). A tapped tile opens the post
                       lightbox. */
                    <div className="grid grid-cols-3 gap-0.5 sm:gap-2 lg:grid-cols-4" data-testid="group-detail-grid">
                      {postRecords.map((post) => {
                        const firstMedia = post.media_refs?.[0] ? mediaMap[mediaRefId(post.media_refs[0])] : null;
                        return (
                          <WallTile
                            key={post._id}
                            media={firstMedia ?? { _id: post._id, url: '', created_at: '' }}
                            testId="group-grid-cell"
                            title={post.title}
                            caption={post.text}
                            postId={post._id}
                            multiCount={post.media_refs?.length}
                            onClick={() => setGridLightboxPost(post)}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div data-testid="group-detail-posts">
                      {postRecords.map((p) => (
                        <GroupFeedPost
                          key={p._id || p.created_at}
                          post={p}
                          media={(p.media_refs || []).map((r) => mediaMap[mediaRefId(r)]).filter(Boolean)}
                          groupId={detail.group_id}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div
                    data-testid="group-detail-posts-empty"
                    className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-lg border border-border bg-card"
                  >
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted/50">
                      <Users className="h-6 w-6 text-brand-400" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-foreground">No posts yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Be the first to share something with the group.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div
                data-testid="group-detail-join-to-view"
                className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-lg border border-border bg-card"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted/50">
                  <Lock className="h-6 w-6 text-brand-400" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-foreground">Join to view posts</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  This group's content is only visible to members. Join the group
                  to see what's being shared.
                </p>
              </div>
            )}
          </div>
        )}

        {/* The media tab (G1): the paged insta grid of the group's media posts —
            infinite scroll appends the next page; the count shows "N photos". */}
        {tab === 'media' && (
          <div className="flex-1 px-4 py-4 md:px-0" data-testid="group-detail-media">
            {detail.posts_state === 'ok' ? (
              mediaLoading ? (
                <div className="grid grid-cols-3 gap-1" data-testid="group-media-skeleton">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-none" />
                  ))}
                </div>
              ) : mediaPosts.length > 0 ? (
                <>
                  <div className="mb-3 flex items-center justify-between" data-testid="group-media-count">
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {mediaTotal} {mediaTotal === 1 ? 'photo' : 'photos'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1" data-testid="group-media-grid">
                    {mediaPosts.flatMap((post) =>
                      (post.media_refs || []).map((ref) => {
                        const media = mediaGridMap[mediaRefId(ref)];
                        if (!media) return null;
                        return (
                          <div
                            key={mediaRefId(ref)}
                            role="button"
                            tabIndex={0}
                            aria-label="View post"
                            data-testid="group-media-cell"
                            onClick={() => setMediaLightboxPost(post)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setMediaLightboxPost(post);
                              }
                            }}
                            className="aspect-square bg-elevated overflow-hidden relative group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          >
                            {media.mime_type?.startsWith('video/') ? (
                              <div className="w-full h-full relative">
                                <video
                                  src={media.url}
                                  poster={media.thumbnail_url}
                                  className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                                  preload="metadata"
                                  playsInline
                                  muted
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm">
                                    <Play className="w-4 h-4 text-foreground ml-0.5" strokeWidth={2} />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <img
                                src={media.url}
                                alt={media.alt_text || ''}
                                className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                                loading="lazy"
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                          </div>
                        );
                      }),
                    )}
                  </div>
                  {/* The infinite-scroll sentinel (triggers loadMoreMedia when it scrolls in) */}
                  <div ref={mediaSentinelRef} className="flex items-center justify-center py-4" data-testid="group-media-sentinel">
                    {mediaLoadingMore ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : mediaHasMore ? (
                      <span className="text-xs text-muted-foreground">Loading more…</span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="py-16 text-center" data-testid="group-media-empty">
                  <p className="text-sm text-muted-foreground">No media yet</p>
                </div>
              )
            ) : (
              <div
                data-testid="group-detail-join-to-view"
                className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-lg border border-border bg-card"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted/50">
                  <Lock className="h-6 w-6 text-brand-400" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-foreground">Join to view posts</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  This group's content is only visible to members. Join the group
                  to see what's being shared.
                </p>
              </div>
            )}
          </div>
        )}

        {/* The Saved tab (a group is a profile): the group's playlists — the
            shared collections card grid. The manager gets a "New collection"
            affordance above the grid; a visitor / member sees the public
            collections read-only. */}
        {tab === 'saved' && (
          <div className="flex-1" data-testid="group-detail-saved">
            {canManage && (
              <div className="px-4 pt-4" data-testid="group-saved-new-container">
                {newCollectionOpen ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); void handleCreateCollection(); }}
                    className="flex items-center gap-2"
                    data-testid="group-saved-new-form"
                  >
                    <input
                      autoFocus
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      placeholder="Collection name"
                      aria-label="New collection name"
                      data-testid="group-saved-new-input"
                      className="min-w-0 flex-1 rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="submit"
                      disabled={!newCollectionName.trim() || creatingCollection}
                      className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-600 transition-colors disabled:opacity-50"
                      data-testid="group-saved-new-create"
                    >
                      {creatingCollection ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setNewCollectionOpen(false); setNewCollectionName(''); }}
                      aria-label="Cancel"
                      className="shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="group-saved-new-cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewCollectionOpen(true)}
                    className="flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2 text-sm font-medium text-foreground hover:border-brand/40 transition-colors"
                    data-testid="group-saved-new"
                  >
                    <Plus className="w-4 h-4 text-brand" strokeWidth={2} />
                    New collection
                  </button>
                )}
              </div>
            )}
            {collections === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 px-4 py-4" data-testid="group-saved-loading">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg bg-elevated animate-pulse">
                    <div className="aspect-[4/3]" />
                    <div className="p-3 space-y-1.5">
                      <div className="h-3.5 w-3/4 rounded" />
                      <div className="h-3 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <SavedCollectionsGrid
                collections={collections}
                onOpenCollection={openGroupCollection}
                emptyHint={canManage ? 'Create a collection to curate a playlist for the group.' : 'This group has no public collections yet.'}
              />
            )}
          </div>
        )}
      </div>

      {/* The management surface — manager-only, mounted at the screen root */}
      {canManage && (
        <ManageGroupSheet
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          groupId={detail.group_id}
          groupName={displayName}
          sections={manageSections}
        />
      )}

      {/* The media lightbox (G1): the tapped media post, the profile's lightbox */}
      {mediaLightboxPost && (
        <PostLightbox
          post={mediaLightboxPost}
          mediaMap={mediaGridMap}
          onClose={() => setMediaLightboxPost(null)}
          onReload={load}
          postAuthor={mediaLightboxPost.author_username}
          postService="posts"
          isOwner={getV3Client().readToken()?.username === mediaLightboxPost.author_username}
        />
      )}

      {/* The grid lightbox (the feed tab's grid lens): the tapped tile's post,
          with Instagram-style post nav through the group's posts (wrapping). */}
      {gridLightboxPost && (() => {
        const idx = postRecords.findIndex((p) => p._id === gridLightboxPost._id);
        const canNav = idx >= 0 && postRecords.length > 1;
        return (
          <PostLightbox
            post={gridLightboxPost}
            mediaMap={mediaMap}
            onClose={() => setGridLightboxPost(null)}
            onReload={load}
            postAuthor={gridLightboxPost.author_username}
            postService="posts"
            isOwner={getV3Client().readToken()?.username === gridLightboxPost.author_username}
            onPrevPost={canNav ? () => setGridLightboxPost(postRecords[(idx - 1 + postRecords.length) % postRecords.length]) : undefined}
            onNextPost={canNav ? () => setGridLightboxPost(postRecords[(idx + 1) % postRecords.length]) : undefined}
          />
        );
      })()}

      {/* The nav-away-mid-upload warning (G2, decision 3): leaving while a
          cover/avatar upload is in flight would cancel it. Stay / Leave. */}
      {uploadWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upload in progress"
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" aria-hidden="true" />
          <div className="relative w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-[0_8px_30px_rgb(0,0,0,0.35)]" data-testid="group-upload-warning">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-warning/15">
              <AlertTriangle className="h-5 w-5 text-warning" strokeWidth={1.75} />
            </div>
            <h3 className="font-display text-base font-semibold text-foreground">Upload in progress</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your upload will be canceled if you leave.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setUploadWarning(false)} data-testid="group-upload-warning-stay">
                Stay
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  setUploadWarning(false);
                  navigate(-1);
                }}
                data-testid="group-upload-warning-leave"
              >
                Leave
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quick face lightbox (shared with profile) */}
      {faceLightbox && (
        <ProfileMediaLightbox
          media={
            faceLightbox === 'avatar'
              ? avatarUrl
                ? { _id: identity.avatar_ref, url: avatarUrl, created_at: '' }
                : null
              : bannerUrl
                ? { _id: identity.banner_ref, url: bannerUrl, created_at: '' }
                : null
          }
          field={faceLightbox}
          onClose={() => setFaceLightbox(null)}
          isOwner={canManage}
          options={faceOptions}
          onCrop={(result) => handleFaceCrop(faceLightbox, result)}
          onUploadCrop={(result) => handleFaceCrop(faceLightbox, result)}
          saving={faceSaving}
          displayName={displayName}
          avatarLabel="Group photo"
          bannerLabel="Group cover"
        />
      )}
    </div>
  );
}
