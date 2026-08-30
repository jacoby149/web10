import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readGroupDetail,
  joinGroup,
  requestJoinGroup,
  leaveGroup,
  type GroupDetail,
} from '@/data';
import { fromV3DocToPost } from '@/data/types';
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
  Image as ImageIcon,
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

// ── Post card (member view) ────────────────────────────────────────────────

function GroupPostCard({ post }: { post: PostRecord }) {
  const author = post.author_username || post.author || 'unknown';
  const displayName = author.charAt(0).toUpperCase() + author.slice(1);
  const mediaCount = post.media_refs?.length || 0;

  return (
    <article
      data-testid="group-post-card"
      className="rounded-lg border border-border bg-card p-4"
    >
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
        <p className="mt-3 text-sm leading-relaxed text-foreground">{post.text}</p>
      )}
      {mediaCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-elevated px-3 py-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <span className="text-xs text-muted-foreground">
            {mediaCount} {mediaCount === 1 ? 'attachment' : 'attachments'}
          </span>
        </div>
      )}
    </article>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4" data-testid="group-detail-skeleton">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="mt-4 h-9 w-full rounded-md" />
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [joinState, setJoinState] = useState<JoinState>('idle');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    setNotFound(false);
    LOG('load — start', id);
    try {
      const d = await readGroupDetail(id);
      LOG('load — got', d.name, { is_member: d.is_member });
      setDetail(d);
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
      // Re-read to pick up any posts the server now grants.
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

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="md:max-w-2xl md:mx-auto">
        {/* Back header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
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
            <h1 className="font-display text-lg font-bold text-foreground truncate">Group</h1>
          </div>
        </div>

        <div className="px-4 py-4 md:px-0 space-y-4">
          {/* Identity card */}
          <div className="rounded-lg border border-border bg-card p-4" data-testid="group-detail-card">
            <div className="flex items-start gap-4">
              <Avatar className={cn('h-16 w-16 shrink-0', hashToColor(detail.group_id))}>
                <AvatarFallback className="text-foreground text-2xl font-semibold">
                  {detail.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-display text-xl font-bold text-foreground" data-testid="group-detail-name">
                    {detail.name}
                  </h2>
                  {detail.discoverable && (
                    <Badge variant="brand" className="normal-case tracking-normal" data-testid="group-detail-listed">
                      Listed
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">by @{detail.owner}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 tabular-nums">
                    <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {formatCount(detail.member_count)} members
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-medium',
                      detail.join_policy === 'open' && 'bg-success/15 text-success',
                      detail.join_policy === 'request' && 'bg-warning/15 text-warning',
                      detail.join_policy === 'invite_only' && 'bg-elevated text-muted-foreground',
                    )}
                  >
                    {detail.join_policy === 'open' ? 'Open' : detail.join_policy === 'request' ? 'Request' : 'Invite only'}
                  </span>
                </div>
              </div>
            </div>

            {detail.description && (
              <p className="mt-4 text-sm leading-relaxed text-foreground" data-testid="group-detail-description">
                {detail.description}
              </p>
            )}

            {detail.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {detail.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-brand/10 bg-brand-muted/60 px-2.5 py-1 text-xs text-brand-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {detail.website && (
              <a
                href={detail.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-400 transition-colors duration-150"
                data-testid="group-detail-website"
              >
                <Globe className="h-4 w-4" strokeWidth={1.5} />
                {detail.website}
              </a>
            )}

            {/* Join / Leave action */}
            <div className="mt-4">
              {detail.is_member ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-border text-muted-foreground hover:border-danger/50 hover:text-danger hover:bg-danger-muted"
                  onClick={handleLeave}
                  disabled={joinState === 'working'}
                  data-testid="group-detail-leave"
                >
                  {joinState === 'working' ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <LogOut className="h-4 w-4" strokeWidth={1.75} />
                  )}
                  Leave group
                </Button>
              ) : canJoin ? (
                <Button
                  variant="brand"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleJoin}
                  disabled={joinState === 'working'}
                  data-testid="group-detail-join"
                >
                  {joinState === 'working' ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : joinState === 'done' && detail.join_policy === 'request' ? (
                    <>
                      <UserCheck className="h-4 w-4" strokeWidth={1.75} />
                      Request sent
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" strokeWidth={1.75} />
                      {detail.join_policy === 'request' ? 'Request to join' : 'Join group'}
                    </>
                  )}
                </Button>
              ) : (
                <div
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-elevated px-4 py-2 text-sm text-muted-foreground"
                  data-testid="group-detail-invite-only"
                >
                  <Lock className="h-4 w-4" strokeWidth={1.5} />
                  Invite only — ask the owner to add you
                </div>
              )}
            </div>
          </div>

          {/* Posts */}
          {detail.posts_state === 'ok' ? (
            <div className="space-y-3" data-testid="group-detail-posts">
              {postRecords.length > 0 ? (
                postRecords.map((p) => <GroupPostCard key={p._id || p.created_at} post={p} />)
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
