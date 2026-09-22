import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getMyCommunityGroups,
  readGroupIdentity,
  resolveMediaRefs,
  leaveGroup,
  groupDisplayName,
  createDraftGroup,
  type MediaRecord,
} from '@/data';
import { getV3Client } from '@/data/v3';
import type { V3Group } from '@/data';
import { toast, errorMessage } from '@/components/shared/Toast';
import {
  Users,
  LogOut,
  Loader2,
  ChevronRight,
  Plus,
  Search,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:groups]', ...args);

// ── Helpers ────────────────────────────────────────────────────────────────

// Deterministic rich gradient per entity — the fallback "face" when a group
// has no uploaded cover/avatar. Gradients read as designed, not as a flat
// color strip (design.md §1: the screenshot test).
function hashToGradient(str: string): string {
  const gradients = [
    'bg-gradient-to-br from-rose-600 to-pink-900',
    'bg-gradient-to-br from-sky-600 to-indigo-900',
    'bg-gradient-to-br from-amber-600 to-orange-900',
    'bg-gradient-to-br from-emerald-600 to-teal-900',
    'bg-gradient-to-br from-violet-600 to-purple-900',
    'bg-gradient-to-br from-pink-600 to-rose-900',
    'bg-gradient-to-br from-indigo-600 to-violet-900',
    'bg-gradient-to-br from-orange-600 to-red-900',
    'bg-gradient-to-br from-teal-600 to-cyan-900',
    'bg-gradient-to-br from-red-600 to-rose-900',
  ];
  let hash = 0;
  for (let i = 0; str.length > i; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

// The resolved face of a group for the list card (D60 identity doc).
interface GroupFace {
  banner_url?: string;
  avatar_url?: string;
  name?: string;
  /** Draft state (group-as-profile G0): the owner's drafts are marked "Draft". */
  status?: 'draft' | 'published';
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function JoinPolicyBadge({ policy }: { policy: string }) {
  const variant = policy === 'open' ? 'success' : policy === 'request' ? 'warning' : 'outline';
  const label = policy === 'open' ? 'Open' : policy === 'request' ? 'Request' : 'Invite only';
  return (
    <Badge variant={variant} data-testid="group-join-policy" className="normal-case tracking-normal">
      {label}
    </Badge>
  );
}

// ── My Groups: a single row ────────────────────────────────────────────────

interface MyGroupRowProps {
  group: V3Group;
  face?: GroupFace;
  onOpen: () => void;
  onLeave: () => void;
  leaving: boolean;
}

function MyGroupRow({ group, face, onOpen, onLeave, leaving }: MyGroupRowProps) {
  const name = face?.name || groupDisplayName(group.group_id);
  const initial = name.charAt(0).toUpperCase();
  const isOwner = group.my_role === 'owner' || group.my_role === 'admin';
  const gradient = hashToGradient(group.group_id);

  return (
    <div
      data-testid="groups-my-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left cursor-pointer transition-all duration-200',
        'hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none',
      )}
    >
      {/* Cover — the group's real banner (D60 face) or its gradient */}
      <div className="h-24 w-full overflow-hidden" aria-hidden="true">
        {face?.banner_url ? (
          <img
            src={face.banner_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
          />
        ) : (
          <div className={cn('h-full w-full', gradient)} />
        )}
      </div>
      <div className="flex items-end gap-3 p-4 pt-0">
        {/* Avatar overlapping the cover — the group's real face or its initial */}
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Avatar className={cn('h-16 w-16', !face?.avatar_url && gradient)}>
            {face?.avatar_url ? (
              <AvatarImage src={face.avatar_url} alt={name} />
            ) : (
              <AvatarFallback className="text-foreground text-xl font-semibold">{initial}</AvatarFallback>
            )}
          </Avatar>
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{name}</h3>
            {face?.status === 'draft' && (
              <Badge variant="outline" className="normal-case tracking-normal" data-testid="groups-my-draft">
                Draft
              </Badge>
            )}
            {isOwner && (
              <Badge variant="brand" className="normal-case tracking-normal" data-testid="groups-my-role-owner">
                Owner
              </Badge>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="tabular-nums">{formatCount(group.member_count)} members</span>
            <span aria-hidden="true" className="text-muted-foreground/40">·</span>
            <JoinPolicyBadge policy={group.join_policy} />
          </p>
        </div>
        {!isOwner && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="groups-leave-button"
            disabled={leaving}
            onClick={(e) => {
              e.stopPropagation();
              onLeave();
            }}
            className="shrink-0 gap-1.5 text-muted-foreground hover:text-danger hover:bg-danger-muted"
            aria-label={`Leave ${name}`}
          >
            {leaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span className="hidden sm:inline">Leave</span>
          </Button>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5" />
      </div>
    </div>
  );
}

function MyGroupRowSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-24 w-full" />
      <div className="flex items-end gap-3 p-4 pt-0">
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Skeleton className="h-16 w-16 rounded-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 pb-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>
    </div>
  );
}

// ── Error state ────────────────────────────────────────────────────────────

function GroupsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="groups-error"
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
        <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">Couldn't load groups</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Something went wrong talking to the node. Check your connection and try again.
      </p>
      <Button variant="brand" size="sm" className="mt-6 gap-2" onClick={onRetry} data-testid="groups-retry">
        <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
        Try again
      </Button>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
// /groups is now My Groups only (discover-reorg D3). The directory browser
// moved to the Discover/Groups subtab (DiscoverGroupsTab) — old links +
// notification deep links to /groups?tab=discover redirect there.

export default function GroupsScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // The "New group" flow (group-as-profile G4): creating a group is
  // configuring a page, not a form. The button creates a DRAFT group (inert —
  // unlisted, owner-only, face status:'draft') and opens the group page in
  // edit mode for it (?edit=1). Changes auto-save; Publish goes live, Delete
  // discards.
  const [creating, setCreating] = useState(false);

  const handleNewGroup = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    LOG('new group — creating draft');
    try {
      const username = getV3Client().readToken()?.username || '';
      const groupId = await createDraftGroup(username);
      LOG('new group — draft created, opening edit mode', groupId);
      navigate(`/groups/${encodeURIComponent(groupId)}?edit=1`);
    } catch (e) {
      LOG('new group — failed:', e);
      toast.error(errorMessage(e, 'Could not create the group. Try again.'));
      setCreating(false);
    }
  }, [creating, navigate]);

  // ── My groups ────────────────────────────────────────────────────────────
  const [myGroups, setMyGroups] = useState<V3Group[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState(false);
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const [groupFaces, setGroupFaces] = useState<Record<string, GroupFace>>({});

  // The Discover tab moved out — /groups?tab=discover redirects to the new
  // home. Skip the my-groups fetch while redirecting (the component unmounts).
  const isRedirecting = searchParams.get('tab') === 'discover';

  const loadMyGroups = useCallback(async () => {
    setMyLoading(true);
    setMyError(false);
    LOG('loadMyGroups — start');
    try {
      const groups = await getMyCommunityGroups();
      LOG('loadMyGroups — got', groups.length, 'community groups');
      setMyGroups(groups);
      // Resolve each group's face (D60 identity) so the card can show a real
      // cover + avatar. A per-group failure just leaves that card faceless.
      const faceEntries = await Promise.all(
        groups.map(async (g): Promise<[string, GroupFace]> => {
          try {
            const identity = await readGroupIdentity(g.group_id);
            const refs: string[] = [];
            if (identity.banner_ref) refs.push(identity.banner_ref);
            if (identity.avatar_ref) refs.push(identity.avatar_ref);
            let banner_url: string | undefined;
            let avatar_url: string | undefined;
            if (refs.length) {
              const resolved = await resolveMediaRefs(refs);
              const map: Record<string, MediaRecord> = {};
              for (const m of resolved) if (m._id) map[m._id] = m;
              if (identity.banner_ref) banner_url = map[identity.banner_ref]?.url;
              if (identity.avatar_ref) avatar_url = map[identity.avatar_ref]?.url;
            }
            return [g.group_id, { banner_url, avatar_url, name: identity.name, status: identity.status }];
          } catch (e) {
            LOG('loadMyGroups — face failed for', g.group_id, ':', e);
            return [g.group_id, {}];
          }
        }),
      );
      setGroupFaces(Object.fromEntries(faceEntries));
    } catch (e) {
      LOG('loadMyGroups — failed:', e);
      setMyError(true);
    } finally {
      setMyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isRedirecting) loadMyGroups();
  }, [loadMyGroups, isRedirecting]);

  const handleLeave = useCallback(async (groupId: string) => {
    setLeaving((prev) => ({ ...prev, [groupId]: true }));
    try {
      LOG('leave —', groupId);
      await leaveGroup(groupId);
      LOG('leave — done', groupId);
      setMyGroups((prev) => prev.filter((g) => g.group_id !== groupId));
    } catch (e) {
      LOG('leave — failed:', e);
      toast.error(errorMessage(e, 'Could not leave the group.'));
    } finally {
      setLeaving((prev) => ({ ...prev, [groupId]: false }));
    }
  }, []);

  const openGroup = useCallback(
    (groupId: string) => {
      LOG('open group —', groupId);
      navigate(`/groups/${encodeURIComponent(groupId)}`);
    },
    [navigate],
  );

  // The Discover tab moved to the Discover/Groups subtab (discover-reorg D3).
  // Old links + notification deep links to /groups?tab=discover redirect to the
  // new home, carrying the ?q= / ?tag= filters over.
  if (isRedirecting) {
    const params = new URLSearchParams();
    params.set('tab', 'groups');
    const q = searchParams.get('q');
    if (q) params.set('q', q);
    const tag = searchParams.get('tag');
    if (tag) params.set('tag', tag);
    return <Navigate to={`/discover?${params.toString()}`} replace />;
  }

  const isMyInitialLoad = myLoading && myGroups.length === 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="w-full md:max-w-3xl md:mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
          <div className="flex items-center justify-between px-4 py-3 md:px-0 gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Users className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
              <h1 className="font-display text-lg font-bold text-foreground">Groups</h1>
            </div>
          </div>
        </div>

        {/* My Groups */}
        <div className="flex-1 px-4 py-4 md:px-0" data-testid="groups-my-view">
          <Button
            variant="brand"
            className="mb-4 w-full gap-2"
            onClick={handleNewGroup}
            disabled={creating}
            data-testid="groups-new-button"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2} />
            )}
            {creating ? 'Creating…' : 'New group'}
          </Button>
          {myError ? (
            <GroupsErrorState onRetry={loadMyGroups} />
          ) : isMyInitialLoad ? (
            <div className="space-y-3" data-testid="groups-my-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <MyGroupRowSkeleton key={i} />
              ))}
            </div>
          ) : myGroups.length > 0 ? (
            <div className="space-y-3" data-testid="groups-my-list">
              {myGroups.map((g) => (
                <MyGroupRow
                  key={g.group_id}
                  group={g}
                  face={groupFaces[g.group_id]}
                  onOpen={() => openGroup(g.group_id)}
                  onLeave={() => handleLeave(g.group_id)}
                  leaving={!!leaving[g.group_id]}
                />
              ))}
            </div>
          ) : (
            <div
              data-testid="groups-my-empty"
              className="flex flex-col items-center justify-center py-16 px-8 text-center"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
                <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-xl font-semibold text-foreground">
                You're not in any groups yet
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Groups are shared spaces on your node — communities you join,
                people you invite, content you co-create. Find one to join.
              </p>
              <Button
                variant="brand"
                size="sm"
                className="mt-6 gap-2"
                onClick={() => navigate('/discover?tab=groups')}
                data-testid="groups-my-empty-cta"
              >
                <Search className="h-4 w-4" strokeWidth={1.75} />
                Discover groups
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
