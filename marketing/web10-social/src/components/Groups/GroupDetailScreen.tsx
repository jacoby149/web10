import { useState, useEffect, useCallback, useRef } from 'react';
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
  toggleRepost,
  type ReactionKind,
  type GroupDetail,
  type GroupIdentity,
  type MediaRecord,
} from '@/data';
import { fromV3DocToPost } from '@/data/types';
import { getV3Client } from '@/data/v3';
import type { PostRecord } from '@/data/types';
import ManageGroupSheet, { type ManageSection } from '@/components/Groups/ManageGroup/ManageGroupSheet';
import ManageProfileSection from '@/components/Groups/ManageGroup/ProfileSection';
import ManageSettingsSection from '@/components/Groups/ManageGroup/SettingsSection';
import ManageMembersSection from '@/components/Groups/ManageGroup/MembersSection';
import ManageRolesSection from '@/components/Groups/ManageGroup/RolesSection';
import { toast, errorMessage } from '@/components/shared/Toast';
import { PostCard } from '@/components/Feed/FeedScreen';
import PostComposer from '@/components/Feed/PostComposer';
import { PostLightbox } from '@/components/Bio/PostLightbox';
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
  Settings,
  ImagePlus,
  Play,
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
  const token = getV3Client().readToken();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      countComments(post._id || '', [groupId]),
      token ? readReactions(post._id || '', undefined, [groupId]) : Promise.resolve([]),
    ]).then(([cCount, reactions]) => {
      if (cancelled) return;
      setCommentCount(cCount);
      if (!token) return;
      // v3 ownership is by username alone (a reaction's author_key is the
      // bare username — the provider compare was the v2 rule, 3.79.3 class).
      setLiked(!!reactions.find(
        r => r.author_username === token.username && r.type === 'like',
      ));
      setDisliked(!!reactions.find(
        r => r.author_username === token.username && r.type === 'dislike',
      ));
      // Repost (reposts.md): independent of like/dislike, group-scoped like the
      // rest of the engagement.
      setReposted(!!reactions.find(
        r => r.author_username === token.username && r.type === 'repost',
      ));
      // Likes and dislikes are counted separately (the heart and the thumb
      // each show their own tally — post-actions.md). The repost is a separate
      // tally too.
      setLikeCount(reactions.filter((r) => r.type === 'like').length);
      setDislikeCount(reactions.filter((r) => r.type === 'dislike').length);
      setRepostCount(reactions.filter((r) => r.type === 'repost').length);
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

  // Repost (reposts.md): independent of like/dislike, group-scoped. Optimistic
  // update of the reader's own repost flag + the repost count, rollback on
  // error. The data layer (toggleRepost) enforces one-repost-per-user.
  async function handleToggleRepost() {
    if (!token) return;
    const wasReposted = reposted;
    const nextReposted = !wasReposted;
    const delta = nextReposted ? 1 : -1;
    setReposted(nextReposted);
    setRepostCount(prev => Math.max(0, prev + delta));
    try {
      await toggleRepost(post._id || '', [groupId]);
    } catch (e) {
      console.error('Failed to toggle repost:', e);
      toast.error(errorMessage(e, 'Could not update your repost.'));
      setReposted(wasReposted);
      setRepostCount(prev => Math.max(0, prev - delta));
    }
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
      liked={liked}
      disliked={disliked}
      reposted={reposted}
      repostCount={repostCount}
      onToggleRepost={handleToggleRepost}
      timestamp={post.created_at}
      onToggleReaction={handleToggleReaction}
      onCommentCountChange={setCommentCount}
      onAuthorClick={(username) => navigate(`/u/${username}`)}
      postAuthor={post.author_username}
      groups={[groupId]}
      isOwnPost={token ? post.author_username === token.username : false}
      onPostUpdated={() => {}}
      testId="group-post-card"
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

  // The tabs (G1): Feed (default, bare URL) | Media (?tab=media). The URL holds
  // the active tab (the deep-link rule) — refresh restores it, back/forward
  // work, and a shared link carries it. The group page is the profile page with
  // the tab order flipped (feed first, media second).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: 'feed' | 'media' = searchParams.get('tab') === 'media' ? 'media' : 'feed';
  const selectTab = useCallback((next: 'feed' | 'media') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'media') params.set('tab', 'media');
    else params.delete('tab');
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
  const mediaOffsetRef = useRef(0);
  const mediaInitializedRef = useRef(false);
  const mediaSentinelRef = useRef<HTMLDivElement>(null);

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

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <div className="md:max-w-2xl md:mx-auto px-4 py-4 md:px-0">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <div className="md:max-w-2xl md:mx-auto px-4 py-4 md:px-0">
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
        <div className="md:max-w-2xl md:mx-auto px-4 py-4 md:px-0">
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

  // The Manage sheet's sections. Profile + Settings are live; Members / Roles
  // are the remaining bites that drop their content in. Until a section lands,
  // it renders the placeholder.
  const manageSections: ManageSection[] = [
    { id: 'profile', label: 'Profile', icon: ImagePlus, content: <ManageProfileSection groupId={detail.group_id} onSaved={load} /> },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      content: (
        <ManageSettingsSection
          groupId={detail.group_id}
          joinPolicy={detail.join_policy}
          discoverable={Boolean(detail.discoverable)}
          onSaved={load}
        />
      ),
    },
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
      <div className="md:max-w-2xl md:mx-auto flex-1 flex flex-col">
        {/* Sticky top bar — back + (managers) the Manage entry point */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-2 py-2 backdrop-blur-md md:static md:border-0 md:bg-transparent md:px-0 md:py-1" data-testid="group-detail-topbar">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Back"
            data-testid="group-detail-back"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </Button>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setManageOpen(true)}
              data-testid="group-detail-manage"
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Manage</span>
            </Button>
          )}
        </div>

        {/* The hero — the group's face, profile-shaped (banner + overlapping
            avatar + name + about), the same shape as a user profile. The
            banner is ALWAYS present (the brand gradient when the group has
            no cover) so the page never collapses to a bare header. */}
        <div data-testid="group-detail-hero">
          <div
            className={cn(
              'relative h-32 w-full overflow-hidden sm:h-44',
              'bg-gradient-to-br from-brand/40 via-brand-muted to-background',
            )}
            data-testid="group-detail-banner"
          >
            <div
              className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-brand/10"
              aria-hidden="true"
            />
            {bannerUrl && (
              <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" data-testid="group-detail-banner-img" />
            )}
          </div>
          <div className="px-4 sm:px-6">
            <div className="flex items-end justify-between gap-4 -mt-14">
              <div className="shrink-0 rounded-full border-4 border-background">
                <Avatar className={cn('h-20 w-20', hashToColor(detail.group_id))}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" data-testid="group-detail-avatar-img" />
                  ) : (
                    <AvatarFallback className="text-foreground text-3xl font-semibold">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-xl font-bold text-foreground" data-testid="group-detail-name">
                    {displayName}
                  </h1>
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
                onClick={() => setManageOpen(true)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="group-detail-add-face"
              >
                <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
                Add a cover &amp; about
              </button>
            )}
            {!hasAbout && <div className="pb-4" />}
          </div>
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
        </div>

        {/* The feed — the dominant surface (the reference feed card + composer) */}
        {tab === 'feed' && (
          <div className="flex-1 px-4 py-4 md:px-0">
            {detail.posts_state === 'ok' ? (
              <>
                {detail.is_member && (
                  <div data-testid="group-composer" className="mb-4">
                    <PostComposer groups={[detail.group_id]} onPostCreated={load} />
                  </div>
                )}
                <div data-testid="group-detail-posts">
                  {postRecords.length > 0 ? (
                    postRecords.map((p) => (
                      <GroupFeedPost
                        key={p._id || p.created_at}
                        post={p}
                        media={(p.media_refs || []).map((r) => mediaMap[mediaRefId(r)]).filter(Boolean)}
                        groupId={detail.group_id}
                      />
                    ))
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
                </div>
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
    </div>
  );
}
