import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  fetchPeoplePage,
  sortPeople,
  filterPeople,
  DEFAULT_PEOPLE_SORT,
  type PersonCard,
  type PeopleSort,
} from '@/data';
import {
  readGroupDirectory,
  joinGroup,
  requestJoinGroup,
  type GroupDirectoryEntry,
} from '@/data';
import { followUser, unfollowUser } from '@/data';
import { toast, errorMessage } from '@/components/shared/Toast';
import {
  PersonCardRow,
  PersonCardSkeleton,
} from './DiscoverPeopleTab';
import {
  DiscoverGroupCard,
  DiscoverGroupCardSkeleton,
  resolveGroupFace,
  type MyGroupFace,
} from './DiscoverGroupsTab';
import {
  Users,
  Search,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:explore-tab]', ...args);

// The page size for the paged reads (the "view more" increment).
const PAGE_SIZE = 20;

const SORT_OPTIONS: [PeopleSort, string][] = [
  ['popular', 'Popular'],
  ['az', 'A–Z'],
];

type JoinState = 'idle' | 'joining' | 'joined' | 'requested';

interface DiscoverExploreTabProps {
  /** The active query from ?q= (set by the top bar's search, which opens this tab). */
  query: string;
}

// ── The Explore browser (Discover's second tab) ──────────────────────────────
// People + groups mashed into ONE browser (the operator: "people are groups in
// web10"). Both directories are paged; the lists render independently (each
// keeps its own "View more"), so the two never block each other. The top bar's
// search opens this tab with ?q= — the query chip shows + clears it. There is
// no search field of its own (search is the top bar).

export default function DiscoverExploreTab({ query }: DiscoverExploreTabProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── People (the D0 public directory, paged) ────────────────────────────────
  const [sort, setSort] = useState<PeopleSort>(DEFAULT_PEOPLE_SORT);
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleLoadingMore, setPeopleLoadingMore] = useState(false);
  const [peopleError, setPeopleError] = useState(false);
  const [peopleHasMore, setPeopleHasMore] = useState(false);
  const [peopleFollowLoading, setPeopleFollowLoading] = useState<Record<string, boolean>>({});
  const peopleNextOffsetRef = useRef(0);
  const peopleFirstPageCountRef = useRef<number | null>(null);

  const loadPeoplePage = useCallback(async (offset: number, append: boolean) => {
    if (append) setPeopleLoadingMore(true);
    else {
      setPeopleLoading(true);
      setPeopleError(false);
    }
    LOG('loadPeoplePage — offset:', offset, 'append:', append);
    try {
      const { people: page, hasMore } = await fetchPeoplePage({ limit: PAGE_SIZE, offset });
      if (!append) peopleFirstPageCountRef.current = page.length;
      peopleNextOffsetRef.current = offset + page.length;
      setPeople((prev) => (append ? [...prev, ...page] : page));
      setPeopleHasMore(hasMore);
    } catch (e) {
      LOG('loadPeoplePage — failed:', e);
      if (!append) setPeopleError(true);
    } finally {
      setPeopleLoading(false);
      setPeopleLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPeoplePage(0, false);
  }, [loadPeoplePage]);

  const handlePeopleFollow = useCallback(async (person: PersonCard) => {
    setPeopleFollowLoading((prev) => ({ ...prev, [person.username]: true }));
    try {
      await followUser(person.username, person.provider);
      setPeople((prev) => prev.map((p) => (p.username === person.username ? { ...p, is_following: true } : p)));
    } catch (e) {
      toast.error(errorMessage(e, `Could not follow ${person.username}.`));
    } finally {
      setPeopleFollowLoading((prev) => ({ ...prev, [person.username]: false }));
    }
  }, []);

  const handlePeopleUnfollow = useCallback(async (person: PersonCard) => {
    setPeopleFollowLoading((prev) => ({ ...prev, [person.username]: true }));
    try {
      await unfollowUser(person.username, person.provider);
      setPeople((prev) => prev.map((p) => (p.username === person.username ? { ...p, is_following: false } : p)));
    } catch (e) {
      toast.error(errorMessage(e, `Could not unfollow ${person.username}.`));
    } finally {
      setPeopleFollowLoading((prev) => ({ ...prev, [person.username]: false }));
    }
  }, []);

  const openProfile = useCallback((person: PersonCard) => {
    navigate(`/u/${person.username}`, { state: { provider: person.provider } });
  }, [navigate]);

  // ── Groups (the D53 public directory, paged) ───────────────────────────────
  const [groups, setGroups] = useState<GroupDirectoryEntry[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsLoadingMore, setGroupsLoadingMore] = useState(false);
  const [groupsError, setGroupsError] = useState(false);
  const [groupsHasMore, setGroupsHasMore] = useState(false);
  const [joinStates, setJoinStates] = useState<Record<string, JoinState>>({});
  const [groupFaces, setGroupFaces] = useState<Record<string, MyGroupFace>>({});
  const groupsNextOffsetRef = useRef(0);

  const loadGroupsPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setGroupsLoadingMore(true);
    else {
      setGroupsLoading(true);
      setGroupsError(false);
    }
    LOG('loadGroupsPage — offset:', offset, 'append:', append);
    try {
      const page = await readGroupDirectory(PAGE_SIZE, offset);
      groupsNextOffsetRef.current = offset + page.length;
      setGroups((prev) => (append ? [...prev, ...page] : page));
      setGroupsHasMore(page.length === PAGE_SIZE);
    } catch (e) {
      LOG('loadGroupsPage — failed:', e);
      if (!append) setGroupsError(true);
    } finally {
      setGroupsLoading(false);
      setGroupsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadGroupsPage(0, false);
  }, [loadGroupsPage]);

  // Resolve each group's face (banner + avatar) so the card matches the
  // directory card shape. A per-group failure just leaves that card
  // faceless (the gradient fallback).
  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = groups.filter((g) => !(g.group_id in groupFaces));
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (g): Promise<[string, MyGroupFace]> => [g.group_id, await resolveGroupFace(g.group_id)]),
      );
      if (cancelled) return;
      setGroupFaces((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
  }, [groups, groupFaces]);

  const handleGroupJoin = useCallback(async (entry: GroupDirectoryEntry) => {
    if (entry.join_policy === 'invite_only') return;
    setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'joining' }));
    try {
      if (entry.join_policy === 'request') {
        await requestJoinGroup(entry.group_id);
        setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'requested' }));
      } else {
        await joinGroup(entry.group_id);
        setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'joined' }));
      }
    } catch (e) {
      LOG('join — failed:', e);
      toast.error(errorMessage(e, 'Could not join the group.'));
      setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'idle' }));
    }
  }, []);

  const openGroup = useCallback((entry: GroupDirectoryEntry) => {
    navigate(`/groups/${encodeURIComponent(entry.group_id)}`);
  }, [navigate]);

  // ── The active ?q= filter (from the top bar's search) ─────────────────────
  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
    LOG('query cleared');
  }, [searchParams, setSearchParams]);

  const sortedPeople = useMemo(() => sortPeople(people, sort), [people, sort]);
  const filteredPeople = useMemo(() => filterPeople(sortedPeople, query), [sortedPeople, query]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.owner.toLowerCase().includes(q) ||
        (g.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [groups, query]);

  const peopleQuiet = peopleFirstPageCountRef.current !== null && peopleFirstPageCountRef.current < 10;
  const peopleNoResults = query.trim() !== '' && !peopleQuiet && filteredPeople.length === 0;
  const groupsNoResults = query.trim() !== '' && groups.length > 0 && filteredGroups.length === 0;
  const bothEmpty =
    query.trim() !== '' &&
    (peopleNoResults || !peopleLoading) &&
    (groupsNoResults || !groupsLoading) &&
    filteredPeople.length === 0 &&
    filteredGroups.length === 0;

  return (
    <div data-testid="discover-explore-tab" className="flex flex-col">
      {/* The active ?q= filter (from the top bar's search) — a chip that shows
          the query + clears it. No search field of its own (search is the
          top bar). */}
      {query.trim() !== '' && (
        <div className="px-4 pt-3 md:px-0">
          <span
            data-testid="discover-explore-tab-query"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-muted/40 px-3 py-1 text-xs text-brand-300"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            {query.trim()}
            <button
              type="button"
              onClick={clearQuery}
              data-testid="discover-explore-tab-query-clear"
              aria-label="Clear search"
              className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-muted transition-colors duration-150"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        </div>
      )}

      {/* Sort toggle (people only — the groups directory is member-ranked
          server-side, so a client sort would be a lie). */}
      <div className="px-4 py-3 md:px-0">
        <div className="flex items-center gap-1" data-testid="explore-sort-toggle" role="tablist" aria-label="Sort people">
          {SORT_OPTIONS.map(([s, label]) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={sort === s}
              onClick={() => setSort(s)}
              data-testid={`explore-sort-${s}`}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                sort === s
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Mashed list — people and groups render as one stream, each with its
          own pagination. (The operator: "people are groups in web10.") */}
      <div className="flex-1 px-4 pb-4 md:px-0 space-y-6" data-testid="explore-view">
        {/* People */}
        <section data-testid="explore-people-section">
          <h2 className="px-1 pb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
            People
          </h2>
          {peopleError ? (
            <div
              data-testid="explore-people-error"
              className="flex flex-col items-center justify-center py-10 px-8 text-center"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-muted">
                <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-muted-foreground">Couldn't load people.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => loadPeoplePage(0, false)} data-testid="explore-people-retry">
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Retry
              </Button>
            </div>
          ) : peopleLoading ? (
            <div className="space-y-3" data-testid="explore-people-skeleton">
              {Array.from({ length: 3 }).map((_, i) => (
                <PersonCardSkeleton key={i} />
              ))}
            </div>
          ) : peopleQuiet ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-people-quiet">
              It's quiet here — follow a few people to get started.
            </p>
          ) : peopleNoResults ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-people-no-results">
              No people match “{query.trim()}”.
            </p>
          ) : (
            <>
              <div className="space-y-3" data-testid="explore-people-list">
                {filteredPeople.map((p) => (
                  <PersonCardRow
                    key={p.username}
                    person={p}
                    followLoading={!!peopleFollowLoading[p.username]}
                    onFollow={() => handlePeopleFollow(p)}
                    onUnfollow={() => handlePeopleUnfollow(p)}
                    onOpen={() => openProfile(p)}
                  />
                ))}
              </div>
              {peopleHasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="explore-people-view-more"
                    onClick={() => loadPeoplePage(peopleNextOffsetRef.current, true)}
                    disabled={peopleLoadingMore}
                    className="gap-2"
                  >
                    {peopleLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                    View more people
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Groups */}
        <section data-testid="explore-groups-section">
          <h2 className="px-1 pb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Groups
          </h2>
          {groupsError ? (
            <div
              data-testid="explore-groups-error"
              className="flex flex-col items-center justify-center py-10 px-8 text-center"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-muted">
                <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-muted-foreground">Couldn't load groups.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => loadGroupsPage(0, false)} data-testid="explore-groups-retry">
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Retry
              </Button>
            </div>
          ) : groupsLoading ? (
            <div className="space-y-3" data-testid="explore-groups-skeleton">
              {Array.from({ length: 3 }).map((_, i) => (
                <DiscoverGroupCardSkeleton key={i} />
              ))}
            </div>
          ) : groupsNoResults ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-groups-no-results">
              No groups match “{query.trim()}”.
            </p>
          ) : filteredGroups.length === 0 && !query.trim() ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-groups-empty">
              No groups listed yet — when a creator lists a group, it shows up here.
            </p>
          ) : (
            <>
              <div className="space-y-3" data-testid="explore-groups-list">
                {filteredGroups.map((g) => (
                  <DiscoverGroupCard
                    key={g.group_id}
                    entry={g}
                    face={groupFaces[g.group_id]}
                    joinState={joinStates[g.group_id] || 'idle'}
                    onJoin={() => handleGroupJoin(g)}
                    onOpen={() => openGroup(g)}
                  />
                ))}
              </div>
              {groupsHasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="explore-groups-view-more"
                    onClick={() => loadGroupsPage(groupsNextOffsetRef.current, true)}
                    disabled={groupsLoadingMore}
                    className="gap-2"
                  >
                    {groupsLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                    View more groups
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* The combined no-results state (a query that matches neither). */}
        {bothEmpty && (
          <div
            data-testid="explore-no-results"
            className="flex flex-col items-center justify-center py-16 px-8 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
              <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              No one or nothing matches
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              No people or groups match “{query.trim()}”. Try a different name,
              handle, or topic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
