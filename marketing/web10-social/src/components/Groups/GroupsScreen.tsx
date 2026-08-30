import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getMyCommunityGroups,
  readGroupDirectory,
  joinGroup,
  requestJoinGroup,
  leaveGroup,
  groupDisplayName,
  type GroupDirectoryEntry,
} from '@/data';
import type { V3Group } from '@/data';
import {
  Users,
  Search,
  X,
  UserPlus,
  UserCheck,
  LogOut,
  Loader2,
  ChevronRight,
  Lock,
  AlertTriangle,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateGroupDialog } from './CreateGroupDialog';

const LOG = (...args: unknown[]) => console.log('[social:groups]', ...args);

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
  onOpen: () => void;
  onLeave: () => void;
  leaving: boolean;
}

function MyGroupRow({ group, onOpen, onLeave, leaving }: MyGroupRowProps) {
  const name = groupDisplayName(group.group_id);
  const initial = name.charAt(0).toUpperCase();
  const isOwner = group.my_role === 'owner' || group.my_role === 'admin';

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
        'group flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left cursor-pointer transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_0_24px_-8px_var(--color-glow)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none',
      )}
    >
      <Avatar className={cn('h-11 w-11 shrink-0', hashToColor(group.group_id))}>
        <AvatarFallback className="text-foreground text-base font-semibold">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
          {isOwner && (
            <Badge variant="brand" className="normal-case tracking-normal" data-testid="groups-my-role-owner">
              Owner
            </Badge>
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatCount(group.member_count)} members</span>
          <span aria-hidden="true">·</span>
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
          Leave
        </Button>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5" />
    </div>
  );
}

function MyGroupRowSkeleton() {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-8 w-16 rounded-md" />
    </div>
  );
}

// ── Discover: a single card ────────────────────────────────────────────────

type JoinState = 'idle' | 'joining' | 'joined' | 'requested';

interface DiscoverGroupCardProps {
  entry: GroupDirectoryEntry;
  joinState: JoinState;
  onJoin: () => void;
  onOpen: () => void;
}

function DiscoverGroupCard({ entry, joinState, onJoin, onOpen }: DiscoverGroupCardProps) {
  const initial = entry.name.charAt(0).toUpperCase();
  const canJoin = entry.join_policy !== 'invite_only';

  return (
    <div
      data-testid="groups-discover-card"
      className={cn(
        'group relative flex flex-col rounded-lg border border-border bg-card p-4 transition-all duration-150',
        'hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_0_24px_-8px_var(--color-glow)]',
        'motion-reduce:transform-none',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View ${entry.name}`}
        >
          <Avatar className={cn('h-11 w-11', hashToColor(entry.group_id))}>
            <AvatarFallback className="text-foreground text-base font-semibold">{initial}</AvatarFallback>
          </Avatar>
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            data-testid="groups-discover-card-name"
          >
            {entry.name}
          </button>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">by @{entry.owner}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCount(entry.member_count)} members
        </span>
        <span aria-hidden="true" className="text-muted-foreground/40">·</span>
        <JoinPolicyBadge policy={entry.join_policy} />
      </div>

      {entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-brand/10 bg-brand-muted/60 px-2.5 py-1 text-xs text-brand-300"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant={joinState === 'joined' ? 'outline' : 'brand_subtle'}
          size="sm"
          className={cn('flex-1 gap-1.5', joinState === 'joined' && 'border-border text-muted-foreground')}
          disabled={!canJoin || joinState === 'joining' || joinState === 'joined' || joinState === 'requested'}
          onClick={onJoin}
          data-testid="groups-join-button"
        >
          {joinState === 'joining' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              Joining…
            </>
          ) : joinState === 'joined' ? (
            <>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              Joined
            </>
          ) : joinState === 'requested' ? (
            <>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              Requested
            </>
          ) : entry.join_policy === 'invite_only' ? (
            <>
              <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
              Invite only
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              {entry.join_policy === 'request' ? 'Request' : 'Join'}
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpen}
          className="shrink-0 gap-1 text-muted-foreground hover:text-foreground"
          aria-label={`View ${entry.name}`}
          data-testid="groups-discover-card-open"
        >
          View
        </Button>
      </div>
    </div>
  );
}

function DiscoverGroupCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="mt-3 h-3 w-32" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 w-14 rounded-md" />
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

type GroupsTab = 'my' | 'discover';

export default function GroupsScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: active tab from ?tab= (refresh-safe, shareable).
  const tab: GroupsTab = searchParams.get('tab') === 'discover' ? 'discover' : 'my';
  const setTab = useCallback((next: GroupsTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'my') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params);
    LOG('tab —', next);
  }, [searchParams, setSearchParams]);

  // Deep-link: discover search from ?q=
  const searchQuery = searchParams.get('q') || '';
  // Deep-link: discover tag filter from ?tag=
  const activeTag = searchParams.get('tag') || '';

  // ── My groups ────────────────────────────────────────────────────────────
  const [myGroups, setMyGroups] = useState<V3Group[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState(false);
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const loadMyGroups = useCallback(async () => {
    setMyLoading(true);
    setMyError(false);
    LOG('loadMyGroups — start');
    try {
      const groups = await getMyCommunityGroups();
      LOG('loadMyGroups — got', groups.length, 'community groups');
      setMyGroups(groups);
    } catch (e) {
      LOG('loadMyGroups — failed:', e);
      setMyError(true);
    } finally {
      setMyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyGroups();
  }, [loadMyGroups]);

  const handleLeave = useCallback(async (groupId: string) => {
    setLeaving((prev) => ({ ...prev, [groupId]: true }));
    try {
      LOG('leave —', groupId);
      await leaveGroup(groupId);
      LOG('leave — done', groupId);
      setMyGroups((prev) => prev.filter((g) => g.group_id !== groupId));
    } catch (e) {
      LOG('leave — failed:', e);
    } finally {
      setLeaving((prev) => ({ ...prev, [groupId]: false }));
    }
  }, []);

  // ── Discover (the directory) ─────────────────────────────────────────────
  const [directory, setDirectory] = useState<GroupDirectoryEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(true);
  const [dirError, setDirError] = useState(false);
  const [joinStates, setJoinStates] = useState<Record<string, JoinState>>({});

  const loadDirectory = useCallback(async () => {
    setDirLoading(true);
    setDirError(false);
    LOG('loadDirectory — start');
    try {
      const groups = await readGroupDirectory();
      LOG('loadDirectory — got', groups.length, 'discoverable groups');
      setDirectory(groups);
    } catch (e) {
      LOG('loadDirectory — failed:', e);
      setDirError(true);
    } finally {
      setDirLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const handleJoin = useCallback(async (entry: GroupDirectoryEntry) => {
    setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'joining' }));
    try {
      if (entry.join_policy === 'open') {
        LOG('join —', entry.group_id);
        await joinGroup(entry.group_id);
        setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'joined' }));
        loadMyGroups();
      } else {
        LOG('request join —', entry.group_id);
        await requestJoinGroup(entry.group_id);
        setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'requested' }));
      }
    } catch (e) {
      LOG('join — failed:', e);
      setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'idle' }));
    }
  }, [loadMyGroups]);

  // Topic chips from the directory's tags
  const topics = useMemo(() => {
    const all = new Set<string>();
    for (const g of directory) for (const t of g.tags) all.add(t);
    return Array.from(all).sort();
  }, [directory]);

  const visibleDirectory = useMemo(() => {
    let filtered = directory;
    if (activeTag) {
      filtered = filtered.filter((g) => g.tags.includes(activeTag));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.owner.toLowerCase().includes(q) ||
          g.slug.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [directory, activeTag, searchQuery]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams);
    if (val.trim()) {
      params.set('q', val.trim());
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  }

  function handleTagToggle(t: string) {
    const params = new URLSearchParams(searchParams);
    if (activeTag === t) {
      params.delete('tag');
    } else {
      params.set('tag', t);
    }
    setSearchParams(params);
  }

  const openGroup = useCallback(
    (groupId: string) => {
      LOG('open group —', groupId);
      navigate(`/groups/${encodeURIComponent(groupId)}`);
    },
    [navigate],
  );

  const isMyInitialLoad = myLoading && myGroups.length === 0;
  const isDirInitialLoad = dirLoading && directory.length === 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="md:max-w-2xl md:mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
          <div className="flex items-center justify-between px-4 py-3 md:px-0 gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Users className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
              <h1 className="font-display text-lg font-bold text-foreground">Groups</h1>
            </div>
            <div className="flex items-center gap-1" data-testid="groups-tab-toggle" role="tablist" aria-label="Groups view">
              {([
                ['my', 'My Groups'],
                ['discover', 'Discover'],
              ] as [GroupsTab, string][]).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  data-testid={`groups-tab-${t}`}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    tab === t
                      ? 'bg-brand-muted text-brand-300'
                      : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* My Groups */}
        {tab === 'my' && (
          <div className="flex-1 px-4 py-4 md:px-0" data-testid="groups-my-view">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">My groups</span>
              <Button
                variant="brand"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  LOG('create group — dialog opened');
                  setCreateOpen(true);
                }}
                data-testid="groups-create-button"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Create group
              </Button>
            </div>
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
                  onClick={() => setTab('discover')}
                  data-testid="groups-my-empty-cta"
                >
                  <Search className="h-4 w-4" strokeWidth={1.75} />
                  Discover groups
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Discover */}
        {tab === 'discover' && (
          <div className="flex-1" data-testid="groups-discover-view">
            {/* Search */}
            <div className="px-4 py-3 md:px-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search groups…"
                  data-testid="groups-discover-search"
                  className="w-full h-9 pl-8 pr-7 rounded-full border border-input bg-surface text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.delete('q');
                      setSearchParams(params);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-elevated transition-colors duration-150"
                    aria-label="Clear search"
                    data-testid="groups-discover-search-clear"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Tag filter chips */}
            {topics.length > 0 && (
              <div className="px-4 py-3 md:px-0">
                <div
                  className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  role="tablist"
                  aria-label="Filter by topic"
                >
                  {topics.map((t) => {
                    const active = t === activeTag;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid="groups-discover-topic"
                        onClick={() => handleTagToggle(t)}
                        className={cn(
                          'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          active
                            ? 'border-brand bg-brand-muted text-brand-300'
                            : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                        )}
                      >
                        #{t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grid */}
            <div className="px-4 py-4 md:px-0">
              {dirError ? (
                <GroupsErrorState onRetry={loadDirectory} />
              ) : isDirInitialLoad ? (
                <div className="grid grid-cols-1 gap-4" data-testid="groups-discover-skeleton">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <DiscoverGroupCardSkeleton key={i} />
                  ))}
                </div>
              ) : visibleDirectory.length > 0 ? (
                <div className="grid grid-cols-1 gap-4" data-testid="groups-discover-grid">
                  {visibleDirectory.map((entry) => (
                    <DiscoverGroupCard
                      key={entry.group_id}
                      entry={entry}
                      joinState={joinStates[entry.group_id] || 'idle'}
                      onJoin={() => handleJoin(entry)}
                      onOpen={() => openGroup(entry.group_id)}
                    />
                  ))}
                </div>
              ) : (
                <div
                  data-testid="groups-discover-empty"
                  className="flex flex-col items-center justify-center py-16 px-8 text-center"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
                    <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
                  </div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    {searchQuery || activeTag ? 'No groups match' : 'No groups listed yet'}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    {searchQuery || activeTag
                      ? 'Try a different search or clear the topic filter.'
                      : 'Groups opt in to the directory. When a creator lists a group, it shows up here for everyone to find.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create group (the D42 consent flow — the GCR goes to the authenticator) */}
        <CreateGroupDialog
          open={createOpen}
          onClose={() => {
            LOG('create group — dialog closed');
            setCreateOpen(false);
          }}
          onCreated={() => {
            LOG('create group — approved, reloading my groups');
            setCreateOpen(false);
            loadMyGroups();
          }}
        />
      </div>
    </div>
  );
}
