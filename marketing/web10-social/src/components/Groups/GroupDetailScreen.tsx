import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readGroupDetail,
  readGroupIdentity,
  joinGroup,
  requestJoinGroup,
  leaveGroup,
  resolveMediaRefs,
  mediaRefId,
  type GroupDetail,
  type GroupIdentity,
  type MediaRecord,
} from '@/data';
import { fromV3DocToPost } from '@/data/types';
import { getV3Client } from '@/data/v3';
import type { PostRecord } from '@/data/types';
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
  Send,
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

// ── Media renderer (images + video, natural ratio) ─────────────────────────

function PostMedia({ media }: { media: MediaRecord[] }) {
  if (!media.length) return null;
  const single = media.length === 1;
  return (
    <div className={cn('mt-3 grid gap-1.5', single ? 'grid-cols-1' : 'grid-cols-2')}>
      {media.map((m, i) => {
        const isVideo = (m.mime_type || '').startsWith('video/');
        const isImage = (m.mime_type || '').startsWith('image/');
        if (isVideo) {
          return (
            <video
              key={m._id || i}
              src={m.url}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-lg bg-background object-contain ring-1 ring-border max-h-[60vh]"
              data-testid="group-post-video"
            />
          );
        }
        if (isImage) {
          return (
            <img
              key={m._id || i}
              src={m.url}
              alt=""
              className={cn(
                'w-full rounded-lg object-cover ring-1 ring-border',
                single ? 'max-h-[60vh]' : 'aspect-square',
              )}
              data-testid="group-post-image"
            />
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Post card (member view) ────────────────────────────────────────────────

function GroupPostCard({ post, media }: { post: PostRecord; media: MediaRecord[] }) {
  const author = post.author_username || post.author || 'unknown';
  const displayName = author.charAt(0).toUpperCase() + author.slice(1);

  return (
    <article data-testid="group-post-card" className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar className={cn('h-9 w-9 shrink-0', hashToColor(author))}>
          <AvatarFallback className="text-foreground text-sm font-semibold">
            {author.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
          <p className="text-xs text-muted-foreground">{formatTimeAgo(post.created_at)}</p>
        </div>
      </div>
      {post.text && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{post.text}</p>
      )}
      <PostMedia media={media} />
    </article>
  );
}

// ── Composer (member only) ─────────────────────────────────────────────────

function GroupComposer({ groupId, onPosted }: { groupId: string; onPosted: () => void }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const username = useMemo(() => {
    try {
      return getV3Client().readToken()?.username || 'you';
    } catch {
      return 'you';
    }
  }, []);

  const handlePost = useCallback(async () => {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    LOG('composer — posting to', groupId);
    try {
      const w = getV3Client();
      await w.create('posts', { text: body }, { groups: [groupId] });
      LOG('composer — posted');
      setText('');
      onPosted();
    } catch (e) {
      LOG('composer — failed:', e);
    } finally {
      setPosting(false);
    }
  }, [text, posting, groupId, onPosted]);

  return (
    <div className="mb-4 flex items-start gap-3" data-testid="group-composer">
      <Avatar className={cn('h-9 w-9 shrink-0', hashToColor(username))}>
        <AvatarFallback className="text-foreground text-sm font-semibold">{username.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost();
          }}
          placeholder="Share with the group…"
          rows={2}
          disabled={posting}
          data-testid="group-composer-input"
          className="w-full resize-none rounded-lg border border-input bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="brand"
            size="sm"
            onClick={handlePost}
            disabled={posting || !text.trim()}
            className="gap-1.5"
            data-testid="group-composer-post"
          >
            {posting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            Post
          </Button>
        </div>
      </div>
    </div>
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

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    setNotFound(false);
    LOG('load — start', id);
    try {
      const [d, ident] = await Promise.all([
        readGroupDetail(id),
        readGroupIdentity(id),
      ]);
      LOG('load — got', d.name, { is_member: d.is_member, identity: ident.name });
      setDetail(d);
      setIdentity(ident);
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
      setJoinState('idle');
    }
  }, [detail, load]);

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

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="md:max-w-2xl md:mx-auto flex-1 flex flex-col">
        {/* Compact header — the group's identity, feed recedes behind it */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-3" data-testid="group-detail-card">
          <div className="flex items-center gap-3 px-4 py-3 md:px-0">
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
            <div className="shrink-0">
              <Avatar className={cn('h-10 w-10', hashToColor(detail.group_id))}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" data-testid="group-detail-avatar-img" />
                ) : (
                  <AvatarFallback className="text-foreground text-base font-semibold">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-base font-bold text-foreground" data-testid="group-detail-name">
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
            {/* Join / Leave (compact) */}
            <div className="shrink-0">
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
          </div>
        </div>

        {/* Slim banner (only when the group has a cover) */}
        {bannerUrl && (
          <div className="h-20 w-full overflow-hidden md:h-28" data-testid="group-detail-banner">
            <img src={bannerUrl} alt="" className="h-full w-full object-cover" data-testid="group-detail-banner-img" />
          </div>
        )}

        {/* Compact about (only when the group has a face) */}
        {hasAbout && (
          <div className="border-b border-border px-4 py-3 md:px-0">
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

        {/* The feed — the dominant surface */}
        <div className="flex-1 px-4 py-4 md:px-0">
          {detail.posts_state === 'ok' ? (
            <>
              {detail.is_member && <GroupComposer groupId={detail.group_id} onPosted={load} />}
              <div className="space-y-3" data-testid="group-detail-posts">
                {postRecords.length > 0 ? (
                  postRecords.map((p) => (
                    <GroupPostCard
                      key={p._id || p.created_at}
                      post={p}
                      media={(p.media_refs || []).map((r) => mediaMap[mediaRefId(r)]).filter(Boolean)}
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
      </div>
    </div>
  );
}
