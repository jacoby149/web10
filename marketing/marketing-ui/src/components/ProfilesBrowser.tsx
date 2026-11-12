import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { mediaReadFetch } from '@web10/discover/media-recovery';
import { useSearchParams } from 'react-router-dom';
import { User, Hash, Search, X, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { PersonCard, PersonCardSkeleton, GroupCard, GroupCardSkeleton, type DiscoverPerson, type DiscoverGroup, type DiscoverGroupFace, resolveFaceMedia, peopleFaceSql, GROUP_FACE_SQL, type FaceQueryTransport } from '@web10/discover';
import { API_ORIGIN, API_HOST, SOCIAL_ORIGIN } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';
import { usePublicSources } from '@/lib/publicSources';
import { DirectoryControls, directorySort } from '@web10/discover/directory-controls';
import { useDirectoryMixer } from '@web10/discover/use-directory-mixer';
import type { DirectorySort, DirectoryRead } from '@web10/discover/directory-mixer';

// ── The Profiles browser (discover-ia-consistency C3) ────────────────────────
// The marketing Discover "Profiles" tab — the SAME Profiles | Groups tab row
// the social app's People destination renders (the `?section=` tab, Profiles
// first then Groups, each paged, the shared banner+avatar cards from C1).
// Anon (no token) — the public subset (I3).
//
// The cards are the SHARED @web10/discover PersonCard + GroupCard (remote
// mode: link-out to web10 social, no follow/join). The social app renders the
// same cards in interactive mode, so the two apps read as one surface.
//
// Tabs, not a mash: the old `?show=` visibility toggle (both / people /
// groups / none) retires — the active destination is a tab in the URL
// (`?section=`), so each section renders one-at-a-time and the "both hidden"
// state class disappears (the same restructure as the social app's
// DiscoverExploreTab, the operator's 05.10.2026 "look like Discover |
// Following" pass).

const PAGE_SIZE = 24;

// ── People (the D0 public directory, paged) ──────────────────────────────────

interface PeopleFace {
  display_name?: string;
  avatar_ref?: string;
  banner_ref?: string;
}

interface PeopleEntry {
  username: string;
  created_at?: string;
  follower_count: number;
  profile: PeopleFace;
}

async function fetchPeoplePage(limit: number, offset: number, sort: DirectorySort): Promise<{ users: PeopleEntry[]; hasMore: boolean }> {
  const resp = await fetch(`${API_ORIGIN}/v3/users/directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
    body: JSON.stringify({ limit, offset, sort }),
  });
  if (!resp.ok) throw Error('People directory unavailable');
  const data = await resp.json();
  if (data.sort !== sort) throw Error('Unsupported directory sort');
  const users: PeopleEntry[] = data.users || [];
  return { users, hasMore: users.length >= limit };
}

// The deterministic followers-group id the node derives for a user:
// `{provider}/groups/users/{username}/followers`. The marketing site reads
// anon (no token), so the provider is the node's API host — the same fallback
// the social app's `currentProvider()` uses when no token is loaded.
function followersGroupId(username: string): string {
  return `${API_HOST}/groups/users/${username}/followers`;
}

// The marketing site's face-prepare transport: a `fetch` to `/v3/query` (anon —
// no token). The SQL builders + the row reduction live in the shared resolver
// (@web10/discover) — the transport is the only app-specific seam.
const faceQueryTransport: FaceQueryTransport = async (sql, groups, prepare) => {
  try {
    const resp = await mediaReadFetch(`${API_ORIGIN}/v3/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, groups, prepare }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data.rows) ? data.rows : [];
  } catch {
    return [];
  }
};

// Resolve a page of people's face media (avatar + banner) to presigned URLs via
// the shared resolver's author-scoped face-prepare (D73), scoped to each user's
// followers group (the I3 gate). A face the reader can't read (a private
// profile) is absent → that card keeps the gradient fallback. A failure
// degrades the page to faceless cards, never a throw.
async function resolvePeopleFaces(users: PeopleEntry[]): Promise<Map<string, { avatar_url?: string; banner_url?: string }>> {
  const withRefs = users.filter((u) => u.profile?.avatar_ref || u.profile?.banner_ref);
  if (withRefs.length === 0) return new Map();
  const groups = withRefs.map((u) => followersGroupId(u.username));
  const sql = peopleFaceSql(withRefs.map((u) => u.username));
  return resolveFaceMedia(faceQueryTransport, sql, groups, 'author_key');
}

// ── Groups (the D53 public directory, paged) ─────────────────────────────────

interface GroupEntry {
  group_id: string;
  source_origin?: string;
  source_key?: string;
  created_at?: string;
  name: string;
  owner: string;
  join_policy: string;
  member_count: number;
}

async function fetchGroupsPage(limit: number, offset: number, sort: DirectorySort): Promise<{ groups: GroupEntry[]; hasMore: boolean }> {
  const resp = await fetch(`${API_ORIGIN}/v3/groups/directory?limit=${limit}&offset=${offset}&sort=${sort}`, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
  if (!resp.ok) throw Error('Group directory unavailable');
  const data = await resp.json();
  if (data.sort !== sort) throw Error('Unsupported directory sort');
  const groups: GroupEntry[] = data.groups || [];
  return { groups, hasMore: groups.length >= limit };
}

// Resolve a page of groups' face media (avatar + banner) to presigned URLs via
// the shared resolver's author-scoped face-prepare (D73), scoped to the groups
// (the I3 gate — anon reads a public group via its `anyone` grant). The rich
// name comes off the identity body. A group with no readable face (private, or
// no identity doc) is absent → that card keeps the directory name + gradient
// fallback. A failure degrades the page to faceless cards, never a throw.
async function resolveGroupFaces(groups: GroupEntry[]): Promise<Map<string, DiscoverGroupFace>> {
  if (groups.length === 0) return new Map();
  const groupIds = groups.map((g) => g.group_id);
  return resolveFaceMedia(faceQueryTransport, GROUP_FACE_SQL, groupIds, 'group_id');
}

// ── The browser ──────────────────────────────────────────────────────────────

// The two destinations (the Profiles tab's tab row, the operator 05.10.2026 —
// the same `?section=` contract as the social app's People destination):
// **Profiles** (individual profiles, the one-person glyph) | **Groups** (the
// hash glyph). The URL holds the active tab: bare = Profiles (the default),
// `?section=groups` = the groups browser.
type ExploreSection = 'profiles' | 'groups';

function sectionFromParam(raw: string | null): ExploreSection {
  return raw === 'groups' ? 'groups' : 'profiles';
}

export function ProfilesBrowser({ query }: { query: string }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // The active tab (?section=, deep-linkable) — the social Explore tab's
  // pattern. Profiles is the default (the bare URL); Groups is ?section=groups.
  const section: ExploreSection = useMemo(
    () => sectionFromParam(searchParams.get('section')),
    [searchParams],
  );
  const setSection = useCallback(
    (next: ExploreSection) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'profiles') params.delete('section');
      else params.set('section', next);
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const sourceControl = usePublicSources();
  const peopleSort = directorySort(searchParams, 'profiles'), groupSort = directorySort(searchParams, 'groups');
  const mixing = sourceControl.sources.length !== 1 || sourceControl.sources[0]?.origin !== sourceControl.home || sourceControl.sources[0]?.weight === 0;
  const homeRead: DirectoryRead = async (kind, sort, limit, offset) => {
    if (kind === 'profiles') {
      const { users } = await fetchPeoplePage(limit, offset, sort);
      const faces = await resolvePeopleFaces(users);
      return { people: users.map(user => ({ username: user.username, provider: API_HOST, created_at: user.created_at, followers_count: user.follower_count,
        display_name: user.profile?.display_name, ...faces.get(user.username) })), groups: [] };
    }
    const { groups } = await fetchGroupsPage(limit, offset, sort);
    const faces = await resolveGroupFaces(groups);
    return { people: [], groups: groups.map(group => ({ ...group, face: faces.get(group.group_id) })) };
  };
  const mixed = useDirectoryMixer({ enabled: mixing, sources: sourceControl.sources, home: sourceControl.home, credential: null,
    scope: sourceControl.scope, kind: section, sort: section === 'profiles' ? peopleSort : groupSort, homeRead, isCurrent: () => true, pageSize: PAGE_SIZE });
  const peopleGeneration = useRef(0), groupsGeneration = useRef(0);

  // ── People ─────────────────────────────────────────────────────────────────
  const [people, setPeople] = useState<(DiscoverPerson & { source_origin?: string; source_key?: string })[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleLoadingMore, setPeopleLoadingMore] = useState(false);
  const [peopleError, setPeopleError] = useState(false);
  const [peopleHasMore, setPeopleHasMore] = useState(false);
  const peopleNextOffset = useRef(0);

  const loadPeoplePage = useCallback(async (offset: number, append: boolean) => {
    if (mixing) return;
    const generation = append ? peopleGeneration.current : ++peopleGeneration.current;
    if (append) setPeopleLoadingMore(true);
    else {
      setPeopleLoading(true);
      setPeopleError(false);
    }
    try {
      const { users, hasMore } = await fetchPeoplePage(PAGE_SIZE, offset, peopleSort);
      if (generation !== peopleGeneration.current) return;
      peopleNextOffset.current = offset + users.length;
      const faces = await resolvePeopleFaces(users);
      if (generation !== peopleGeneration.current) return;
      const cards: DiscoverPerson[] = users.map((u) => ({
        username: u.username,
        display_name: u.profile?.display_name || u.username,
        avatar_url: faces.get(u.username)?.avatar_url,
        banner_url: faces.get(u.username)?.banner_url,
        followers_count: u.follower_count,
      }));
      setPeople((prev) => (append ? [...prev, ...cards] : cards));
      setPeopleHasMore(hasMore);
    } catch {
      if (generation === peopleGeneration.current && !append) setPeopleError(true);
    } finally {
      if (generation === peopleGeneration.current) { setPeopleLoading(false); setPeopleLoadingMore(false); }
    }
  }, [mixing, peopleSort]);

  useEffect(() => {
    loadPeoplePage(0, false);
    trackFunnel('trending_people_view');
    return () => { peopleGeneration.current += 1; };
  }, [loadPeoplePage]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = mixing ? mixed.people : people;
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.display_name?.toLowerCase().includes(q) || p.username.toLowerCase().includes(q),
    );
  }, [people, mixed.people, mixing, query]);

  const peopleNoResults = query.trim() !== '' && filteredPeople.length === 0;

  // ── Groups ─────────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [groupFaces, setGroupFaces] = useState<Record<string, DiscoverGroupFace>>({});
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsLoadingMore, setGroupsLoadingMore] = useState(false);
  const [groupsError, setGroupsError] = useState(false);
  const [groupsHasMore, setGroupsHasMore] = useState(false);
  const groupsNextOffset = useRef(0);

  const loadGroupsPage = useCallback(async (offset: number, append: boolean) => {
    if (mixing) return;
    const generation = append ? groupsGeneration.current : ++groupsGeneration.current;
    if (append) setGroupsLoadingMore(true);
    else {
      setGroupsLoading(true);
      setGroupsError(false);
    }
    try {
      const { groups: page, hasMore } = await fetchGroupsPage(PAGE_SIZE, offset, groupSort);
      if (generation !== groupsGeneration.current) return;
      groupsNextOffset.current = offset + page.length;
      setGroups((prev) => (append ? [...prev, ...page] : page));
      setGroupsHasMore(hasMore);
    } catch {
      if (generation === groupsGeneration.current && !append) setGroupsError(true);
    } finally {
      if (generation === groupsGeneration.current) { setGroupsLoading(false); setGroupsLoadingMore(false); }
    }
  }, [mixing, groupSort]);

  useEffect(() => {
    loadGroupsPage(0, false);
    trackFunnel('trending_groups_view');
    return () => { groupsGeneration.current += 1; };
  }, [loadGroupsPage]);

  // Resolve each group's face (banner + avatar + rich name) in one batched
  // query-engine pass so the card matches the social card. A group with no
  // readable face is absent — that card keeps the directory name + gradient.
  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = groups.filter((g) => !(g.group_id in groupFaces));
      if (missing.length === 0) return;
      const faces = await resolveGroupFaces(missing);
      if (cancelled) return;
      // A missing/denied face is a settled fallback too, not an endless retry.
      setGroupFaces((prev) => ({ ...prev, ...Object.fromEntries(missing.map(group => [group.group_id, faces.get(group.group_id) ?? {}])) }));
    })();
    return () => { cancelled = true; };
  }, [groups, groupFaces]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = mixing ? mixed.groups : groups;
    if (!q) return rows;
    return rows.filter(
      (g) =>
        g.name.toLowerCase().includes(q) || g.owner.toLowerCase().includes(q),
    );
  }, [groups, mixed.groups, mixing, query]);

  const groupsNoResults = query.trim() !== '' && groups.length > 0 && filteredGroups.length === 0;

  return (
    <div data-testid="discover-profiles-browser" className="mx-auto w-full max-w-2xl">
      {/* The tab row — X/Threads-style: Profiles | Groups (the same idiom the
          social app's People destination + the Posts screen's Discover |
          Following row use). Centered, bold, with the brand underline. The
          URL holds the tab (?section=), so refresh restores it + it's
          shareable. Profiles is the default (the bare URL). */}
      <div
        className="border-b border-border"
        role="tablist"
        aria-label="People"
        data-testid="discover-profiles-tab-row"
      >
        <div className="flex">
          {([
            ['profiles', 'Profiles', User],
            ['groups', 'Groups', Hash],
          ] as const).map(([id, label, Icon]) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(id)}
                data-testid={`discover-profiles-tab-${id}`}
                className={[
                  'relative flex flex-1 items-center justify-center gap-2 py-3.5 text-[0.9375rem] transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <Icon className={active ? 'h-[18px] w-[18px] text-brand' : 'h-[18px] w-[18px]'} strokeWidth={active ? 2.25 : 1.75} />
                <span>{label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-px left-1/2 h-[3px] w-14 -translate-x-1/2 rounded-full bg-brand"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <DirectoryControls kind={section} control={sourceControl} errors={mixed.errors} allocations={mixed.allocations} onRetry={mixed.retry} pageSize={PAGE_SIZE} />
      {mixing && sourceControl.sources.every(row => row.weight === 0) && <p role="status" className="pb-3 text-sm text-muted-foreground">Directory paused. Turn up a server to discover people and groups.</p>}

      {/* The active ?q= filter — a chip that shows the query + clears it.
          Rendered on both tabs so the search can be X'd from either. */}
      {query.trim() !== '' && (
        <div className="pt-3 pb-3">
          <span
            data-testid="discover-profiles-query"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-muted/40 px-3 py-1 text-xs text-brand-300"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            {query.trim()}
            <button
              type="button"
              onClick={clearQuery}
              data-testid="discover-profiles-query-clear"
              aria-label="Clear search"
              className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-muted transition-colors duration-150"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        </div>
      )}

      {section === 'profiles' ? (
        /* Profiles — the people browser (the paged D0 directory). */
        <section data-testid="discover-profiles-people-section" className="pt-3">
          {!mixing && peopleError ? (
            <div data-testid="discover-profiles-people-error" className="flex flex-col items-center justify-center py-10 px-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-muted">
                <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-muted-foreground">Couldn't load people.</p>
              <button
                type="button"
                onClick={() => loadPeoplePage(0, false)}
                data-testid="discover-profiles-people-retry"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Retry
              </button>
            </div>
          ) : (mixing ? mixed.loading && mixed.people.length === 0 : peopleLoading) ? (
            <div className="space-y-3" data-testid="discover-profiles-people-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <PersonCardSkeleton key={i} testId="discover-profiles-person-skeleton" />
              ))}
            </div>
          ) : peopleNoResults ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="discover-profiles-people-no-results">
              No people match “{query.trim()}”.
            </p>
          ) : filteredPeople.length === 0 && !query.trim() ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="discover-profiles-people-empty">
              No people listed yet.
            </p>
          ) : (
            <>
              <div className="space-y-3" data-testid="discover-profiles-people-list">
                {filteredPeople.map((p) => (
                  <div key={p.source_key ?? p.username} className="space-y-1">
                  {p.source_origin && <p className="break-all text-xs text-muted-foreground">{new URL(p.source_origin).host}{p.source_origin !== sourceControl.home ? ' · read-only' : ''}</p>}
                  <PersonCard
                    person={p}
                    profileHref={!p.source_origin || p.source_origin === sourceControl.home ? `${SOCIAL_ORIGIN}/u/${p.username}` : undefined}
                    testId="trending-person-card"
                  />
                  </div>
                ))}
              </div>
              {(mixing ? mixed.hasMore : peopleHasMore) && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => mixing ? mixed.loadMore() : loadPeoplePage(peopleNextOffset.current, true)}
                    disabled={mixing ? mixed.loading : peopleLoadingMore}
                    data-testid="discover-profiles-people-view-more"
                    className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand-muted px-5 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {peopleLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                    View more people
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        /* Groups — the groups browser (the paged D53 directory). */
        <section data-testid="discover-profiles-groups-section" className="pt-3">
          {!mixing && groupsError ? (
            <div data-testid="discover-profiles-groups-error" className="flex flex-col items-center justify-center py-10 px-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-muted">
                <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-muted-foreground">Couldn't load groups.</p>
              <button
                type="button"
                onClick={() => loadGroupsPage(0, false)}
                data-testid="discover-profiles-groups-retry"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Retry
              </button>
            </div>
          ) : (mixing ? mixed.loading && mixed.groups.length === 0 : groupsLoading) ? (
            <div className="space-y-3" data-testid="discover-profiles-groups-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <GroupCardSkeleton key={i} testId="discover-profiles-group-skeleton" />
              ))}
            </div>
          ) : groupsNoResults ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="discover-profiles-groups-no-results">
              No groups match “{query.trim()}”.
            </p>
          ) : filteredGroups.length === 0 && !query.trim() ? (
            <p className="px-1 py-2 text-sm text-muted-foreground" data-testid="discover-profiles-groups-empty">
              No groups listed yet — when a creator lists a group, it shows up here.
            </p>
          ) : (
            <>
              <div className="space-y-3" data-testid="discover-profiles-groups-list">
                {filteredGroups.map((g) => (
                  <div key={g.source_key ?? g.group_id} className="space-y-1">
                  {g.source_origin && <p className="break-all text-xs text-muted-foreground">{new URL(g.source_origin).host}{g.source_origin !== sourceControl.home ? ' · read-only' : ''}</p>}
                  <GroupCard
                    entry={g}
                    face={mixing ? mixed.groups.find(row => row.source_key === g.source_key)?.face : groupFaces[g.group_id]}
                    groupHref={!g.source_origin || g.source_origin === sourceControl.home ? `${SOCIAL_ORIGIN}/groups/${encodeURIComponent(g.group_id)}` : undefined}
                    testId="trending-group-card"
                  />
                  </div>
                ))}
              </div>
              {(mixing ? mixed.hasMore : groupsHasMore) && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => mixing ? mixed.loadMore() : loadGroupsPage(groupsNextOffset.current, true)}
                    disabled={mixing ? mixed.loading : groupsLoadingMore}
                    data-testid="discover-profiles-groups-view-more"
                    className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand-muted px-5 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {groupsLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                    View more groups
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
