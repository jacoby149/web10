import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  fetchPeoplePage,
  sortPeople,
  filterPeople,
  fetchMyFollowersCards,
  fetchMyFollowingCards,
  DEFAULT_PEOPLE_SORT,
  type PersonCard,
  type PeopleSort,
  type PeopleFilter,
} from '@/data';
import {
  readGroupDirectory,
  joinGroup,
  requestJoinGroup,
  getMyCommunityGroups,
  leaveGroup,
  type GroupDirectoryEntry,
  type V3Group,
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
  MyGroupRow,
  MyGroupRowSkeleton,
  resolveGroupFace,
  type MyGroupFace,
} from './DiscoverGroupsTab';
import {
  Users,
  Hash,
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

// The People view filters (the "easy filters" the operator asked for — the
// social graph, not just discovery). `all` is the bare URL (the public
// directory); `following` / `followers` are the reader's own graph; `mutuals`
// is the directory filtered to people you have in common.
const PEOPLE_FILTERS: [PeopleFilter, string][] = [
  ['all', 'All'],
  ['following', 'Following'],
  ['mutuals', 'Mutuals'],
  ['followers', 'Followers'],
];

// The Groups view filters. `all` is the bare URL (the public directory);
// `mine` is the groups you're a member of; `discover` is the public directory
// (the same as `all`'s list, but the explicit "find new groups" framing).
type GroupFilter = 'all' | 'mine' | 'discover';

const GROUP_FILTERS: [GroupFilter, string][] = [
  ['all', 'All'],
  ['mine', 'My Groups'],
  ['discover', 'Discover'],
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
//
// Each section has a filter chip row (the "easy filters"): People =
// All | Following | Mutuals | Followers (?personFilter=); Groups =
// All | My Groups | Discover (?groupFilter=). The chips are the operator's
// "easy filters for that kind of stuff" — the social graph (who you follow /
// who follows you / who you have in common) + the groups you're in vs. new
// ones to find.

export default function DiscoverExploreTab({ query }: DiscoverExploreTabProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── People filter (?personFilter=, deep-linkable) ──────────────────────────
  const personFilter: PeopleFilter = useMemo(() => {
    const raw = searchParams.get('personFilter');
    return raw === 'following' || raw === 'mutuals' || raw === 'followers' ? raw : 'all';
  }, [searchParams]);
  const setPersonFilter = useCallback(
    (next: PeopleFilter) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'all') params.delete('personFilter');
      else params.set('personFilter', next);
      setSearchParams(params);
      LOG('personFilter —', next);
    },
    [searchParams, setSearchParams],
  );

  // ── Groups filter (?groupFilter=, deep-linkable) ───────────────────────────
  const groupFilter: GroupFilter = useMemo(() => {
    const raw = searchParams.get('groupFilter');
    return raw === 'mine' || raw === 'discover' ? raw : 'all';
  }, [searchParams]);
  const setGroupFilter = useCallback(
    (next: GroupFilter) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'all') params.delete('groupFilter');
      else params.set('groupFilter', next);
      setSearchParams(params);
      LOG('groupFilter —', next);
    },
    [searchParams, setSearchParams],
  );

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

  // ── People: own-graph filters (Following / Followers) ──────────────────────
  // `mutuals` reuses the directory (filtered to mutuals > 0) — no separate
  // read. `following` + `followers` are the reader's own graph (the directory
  // can't express them), so they're separate reads, cached once loaded.
  const [myFollowing, setMyFollowing] = useState<PersonCard[] | null>(null);
  const [myFollowers, setMyFollowers] = useState<PersonCard[] | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  useEffect(() => {
    if (personFilter !== 'following' && personFilter !== 'followers') return;
    if (personFilter === 'following' && myFollowing) return;
    if (personFilter === 'followers' && myFollowers) return;
    let cancelled = false;
    setGraphLoading(true);
    LOG('load graph —', personFilter);
    (async () => {
      try {
        if (personFilter === 'following') {
          const cards = await fetchMyFollowingCards();
          if (!cancelled) setMyFollowing(cards);
        } else {
          const cards = await fetchMyFollowersCards();
          if (!cancelled) setMyFollowers(cards);
        }
      } catch (e) {
        LOG('load graph — failed:', e);
        if (!cancelled) setMyFollowing(personFilter === 'following' ? [] : myFollowing);
        if (!cancelled) setMyFollowers(personFilter === 'followers' ? [] : myFollowers);
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personFilter]);

  const handlePeopleFollow = useCallback(async (person: PersonCard) => {
    setPeopleFollowLoading((prev) => ({ ...prev, [person.username]: true }));
    try {
      await followUser(person.username, person.provider);
      const flip = (list: PersonCard[]) =>
        list.map((p) => (p.username === person.username ? { ...p, is_following: true } : p));
      setPeople((prev) => flip(prev));
      setMyFollowing((prev) => (prev ? flip(prev) : prev));
      setMyFollowers((prev) => (prev ? flip(prev) : prev));
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
      const flip = (list: PersonCard[]) =>
        list.map((p) => (p.username === person.username ? { ...p, is_following: false } : p));
      setPeople((prev) => flip(prev));
      setMyFollowing((prev) => (prev ? flip(prev) : prev));
      setMyFollowers((prev) => (prev ? flip(prev) : prev));
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
    LOG('loadPage — offset:', offset, 'append:', append);
    try {
      const page = await readGroupDirectory(PAGE_SIZE, offset);
      LOG('loadPage — got', page.length, 'group(s)');
      groupsNextOffsetRef.current = offset + page.length;
      setGroups((prev) => (append ? [...prev, ...page] : page));
      setGroupsHasMore(page.length === PAGE_SIZE);
    } catch (e) {
      LOG('loadPage — failed:', e);
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
        LOG('request join —', entry.group_id);
        await requestJoinGroup(entry.group_id);
        setJoinStates((prev) => ({ ...prev, [entry.group_id]: 'requested' }));
      } else {
        LOG('join —', entry.group_id);
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

  // ── Groups: My Groups (the groups you're a member of, the "mine" filter) ──
  const [myGroups, setMyGroups] = useState<V3Group[]>([]);
  const [myGroupsLoading, setMyGroupsLoading] = useState(false);
  const [leavingGroups, setLeavingGroups] = useState<Record<string, boolean>>({});

  const loadMyGroups = useCallback(async () => {
    setMyGroupsLoading(true);
    LOG('loadMyGroups — start');
    try {
      const gs = await getMyCommunityGroups();
      LOG('loadMyGroups — got', gs.length, 'group(s)');
      setMyGroups(gs);
      const entries = await Promise.all(
        gs.map(async (g): Promise<[string, MyGroupFace]> => [g.group_id, await resolveGroupFace(g.group_id)]),
      );
      setGroupFaces((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    } catch (e) {
      LOG('loadMyGroups — failed:', e);
    } finally {
      setMyGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (groupFilter === 'mine' && myGroups.length === 0 && !myGroupsLoading) {
      loadMyGroups();
    }
  }, [groupFilter, myGroups.length, myGroupsLoading, loadMyGroups]);

  const handleLeaveGroup = useCallback(async (groupId: string) => {
    setLeavingGroups((prev) => ({ ...prev, [groupId]: true }));
    try {
      LOG('leave —', groupId);
      await leaveGroup(groupId);
      setMyGroups((prev) => prev.filter((g) => g.group_id !== groupId));
    } catch (e) {
      LOG('leave — failed:', e);
      toast.error(errorMessage(e, 'Could not leave the group.'));
    } finally {
      setLeavingGroups((prev) => ({ ...prev, [groupId]: false }));
    }
  }, []);

  // ── The active ?q= filter (from the top bar's search) ─────────────────────
  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
    LOG('query cleared');
  }, [searchParams, setSearchParams]);

  // ── The People / Groups visibility toggle (?show=) ────────────────────────
  // The Explore tab mashes people + groups into one browser. On a node with a
  // lot of people, the people list would drown out the (usually far fewer)
  // groups — so each section can be shown or hidden independently. `?show=`
  // holds the visible set: `both` (the default, the bare URL) | `people` |
  // `groups` | `none`. Both-off is a real state (a neutral empty state) — the
  // operator wanted "both selected, neither, or one or the other." Deep-
  // linkable + refresh-safe (the ?tab= / ?sort= / ?q= idiom).
  type ShowFilter = 'both' | 'people' | 'groups' | 'none';
  const show: ShowFilter = useMemo(() => {
    const raw = searchParams.get('show');
    return raw === 'people' || raw === 'groups' || raw === 'none' ? raw : 'both';
  }, [searchParams]);
  const showPeople = show === 'both' || show === 'people';
  const showGroups = show === 'both' || show === 'groups';

  const setSectionVisible = useCallback(
    (section: 'people' | 'groups', visible: boolean) => {
      // Toggling a section recomputes the visible set from the two booleans.
      const nextPeople = section === 'people' ? visible : showPeople;
      const nextGroups = section === 'groups' ? visible : showGroups;
      const next: ShowFilter =
        nextPeople && nextGroups ? 'both' : nextPeople ? 'people' : nextGroups ? 'groups' : 'none';
      const params = new URLSearchParams(searchParams);
      if (next === 'both') params.delete('show');
      else params.set('show', next);
      setSearchParams(params);
      LOG('show —', next, `(people:${nextPeople}, groups:${nextGroups})`);
    },
    [searchParams, setSearchParams, showPeople, showGroups],
  );

  // ── People display (per filter) ────────────────────────────────────────────
  const sortedPeople = useMemo(() => sortPeople(people, sort), [people, sort]);
  const filteredPeople = useMemo(() => filterPeople(sortedPeople, query), [sortedPeople, query]);
  // "Mutuals" = the directory filtered to people you have in common.
  const mutualPeople = useMemo(
    () => filteredPeople.filter((p) => p.mutuals > 0),
    [filteredPeople],
  );
  const sortedFollowing = useMemo(() => sortPeople(myFollowing ?? [], sort), [myFollowing, sort]);
  const sortedFollowers = useMemo(() => sortPeople(myFollowers ?? [], sort), [myFollowers, sort]);

  const peopleQuiet = peopleFirstPageCountRef.current !== null && peopleFirstPageCountRef.current < 10;

  // ── Groups display (per filter) ────────────────────────────────────────────
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

  const peopleNoResults =
    query.trim() !== '' &&
    ((personFilter === 'all' && filteredPeople.length === 0) ||
      (personFilter === 'mutuals' && mutualPeople.length === 0) ||
      (personFilter === 'following' && !graphLoading && sortedFollowing.length === 0) ||
      (personFilter === 'followers' && !graphLoading && sortedFollowers.length === 0));
  const groupsNoResults = query.trim() !== '' && groups.length > 0 && filteredGroups.length === 0;

  // The combined no-results state: a query that matches nothing in any VISIBLE
  // section (a hidden section can't be "empty" — it's just not shown).
  const peopleEffectivelyEmpty =
    !peopleLoading &&
    ((personFilter === 'all' && (peopleNoResults || peopleQuiet || filteredPeople.length === 0)) ||
      (personFilter === 'mutuals' && (peopleNoResults || mutualPeople.length === 0)) ||
      (personFilter === 'following' && !graphLoading && sortedFollowing.length === 0) ||
      (personFilter === 'followers' && !graphLoading && sortedFollowers.length === 0));
  const groupsEffectivelyEmpty =
    !groupsLoading &&
    (groupFilter === 'mine'
      ? !myGroupsLoading && myGroups.length === 0
      : groupsNoResults || filteredGroups.length === 0);
  const bothEmpty =
    query.trim() !== '' &&
    (showPeople || showGroups) &&
    (!showPeople || peopleEffectivelyEmpty) &&
    (!showGroups || groupsEffectivelyEmpty);

  const peopleList =
    personFilter === 'mutuals'
      ? mutualPeople
      : personFilter === 'following'
        ? sortedFollowing
        : personFilter === 'followers'
          ? sortedFollowers
          : filteredPeople;
  const peopleListLoading =
    personFilter === 'following' || personFilter === 'followers' ? graphLoading : peopleLoading;

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

      {/* The People / Groups visibility toggle (?show=) — chunky icon+label
          chips so a flood of people can't drown out the groups. Each section
          shows/hides independently: both (default) / people / groups / none. */}
      <div className="px-4 pt-3 md:px-0">
        <div className="flex items-center gap-2" data-testid="explore-show-toggle" role="group" aria-label="Show sections">
          {(['people', 'groups'] as const).map((section) => {
            const active = section === 'people' ? showPeople : showGroups;
            const Icon = section === 'people' ? Users : Hash;
            return (
              <button
                key={section}
                type="button"
                aria-pressed={active}
                onClick={() => setSectionVisible(section, !active)}
                data-testid={`explore-show-${section}`}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'bg-brand-muted text-brand-300'
                    : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {section === 'people' ? 'People' : 'Groups'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mashed list — people and groups render as one stream, each with its
          own filter chips + pagination (each section honors the ?show=
          toggle). (The operator: "people are groups in web10.") The desktop
          gutter (md:px-4 lg:px-6) matches the Trending content column. */}
      <div className="flex-1 px-4 pb-4 md:px-4 lg:px-6 space-y-6" data-testid="explore-view">
        {/* People */}
        {showPeople && (
        <section data-testid="explore-people-section">
          <div className="flex items-center justify-between gap-2 pb-2">
            <h2 className="px-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
              People
            </h2>
            {/* The People filter chips (?personFilter=) — the "easy filters". */}
            <div className="flex items-center gap-1" data-testid="explore-people-filter" role="tablist" aria-label="Filter people">
              {PEOPLE_FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={personFilter === f}
                  onClick={() => setPersonFilter(f)}
                  data-testid={`explore-people-filter-${f}`}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    personFilter === f
                      ? 'bg-brand-muted text-brand-300'
                      : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort toggle (people only — the groups directory is member-ranked
              server-side, so a client sort would be a lie). Shown for the
              directory-backed filters (all / mutuals) + the own-graph filters. */}
          <div className="px-1 pb-2">
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
          ) : peopleListLoading ? (
            <div className="space-y-3" data-testid="explore-people-skeleton">
              {Array.from({ length: 3 }).map((_, i) => (
                <PersonCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              {peopleList.length > 0 ? (
                <div className="space-y-3" data-testid="explore-people-list">
                  {peopleList.map((p) => (
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
              ) : peopleNoResults ? (
                <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-people-no-results">
                  No people match “{query.trim()}”.
                </p>
              ) : personFilter === 'all' && peopleQuiet ? (
                <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-people-quiet">
                  It's quiet here — follow a few people to get started.
                </p>
              ) : personFilter === 'following' ? (
                <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-people-following-empty">
                  You're not following anyone yet. Find people in “All” or “Mutuals”.
                </p>
              ) : personFilter === 'followers' ? (
                <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-people-followers-empty">
                  No one follows you yet. Share your profile to get your first followers.
                </p>
              ) : personFilter === 'mutuals' ? (
                <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-people-mutuals-empty">
                  No mutuals yet — follow a few people and the ones you have in common show up here.
                </p>
              ) : null}
              {personFilter === 'all' && peopleHasMore && (
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
        )}

        {/* Groups */}
        {showGroups && (
        <section data-testid="explore-groups-section">
          <div className="flex items-center justify-between gap-2 pb-2">
            <h2 className="px-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Groups
            </h2>
            {/* The Groups filter chips (?groupFilter=) — the "easy filters". */}
            <div className="flex items-center gap-1" data-testid="explore-groups-filter" role="tablist" aria-label="Filter groups">
              {GROUP_FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={groupFilter === f}
                  onClick={() => setGroupFilter(f)}
                  data-testid={`explore-groups-filter-${f}`}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    groupFilter === f
                      ? 'bg-brand-muted text-brand-300'
                      : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {groupFilter === 'mine' ? (
            /* My Groups — the groups you're a member of */
            <div data-testid="explore-groups-mine">
              {myGroupsLoading ? (
                <div className="space-y-3" data-testid="explore-groups-mine-skeleton">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <MyGroupRowSkeleton key={i} />
                  ))}
                </div>
              ) : myGroups.length > 0 ? (
                <div className="space-y-3" data-testid="explore-groups-mine-list">
                  {myGroups.map((g) => (
                    <MyGroupRow
                      key={g.group_id}
                      group={g}
                      face={groupFaces[g.group_id]}
                      onOpen={() => navigate(`/groups/${encodeURIComponent(g.group_id)}`)}
                      onLeave={() => handleLeaveGroup(g.group_id)}
                      leaving={!!leavingGroups[g.group_id]}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="explore-groups-mine-empty">
                  You're not in any groups yet. Find some in “Discover”.
                </p>
              )}
            </div>
          ) : groupsError ? (
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
        )}

        {/* Both sections hidden (?show=none) — a neutral empty state. */}
        {!showPeople && !showGroups && (
          <div
            data-testid="explore-show-none"
            className="flex flex-col items-center justify-center py-16 px-8 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
              <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Nothing to show</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Both sections are hidden. Turn People or Groups back on above.
            </p>
          </div>
        )}

        {/* The combined no-results state (a query that matches neither). */}
        {bothEmpty && (
          <div
            data-testid="explore-no-results"
            className="flex flex-col items-center justify-center py-16 px-8 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
              <Search className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
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
