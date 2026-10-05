import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Hash, Search, X, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { PersonCard, PersonCardSkeleton, GroupCard, GroupCardSkeleton, type DiscoverPerson, type DiscoverGroup, type DiscoverGroupFace } from '@web10/discover';
import { API_ORIGIN, API_HOST, SOCIAL_ORIGIN } from '@/lib/origins';
import { trackFunnel } from '@/lib/analytics';

// ── The Profiles browser (discover-ia-consistency C3) ────────────────────────
// The marketing Discover "Profiles" tab — the SAME mashed People + Groups
// browser the social app's Discover "Profiles" tab renders (the `?show=`
// People/Groups toggle, People first then Groups, each paged, the shared
// banner+avatar cards from C1). Anon (no token) — the public subset (I3).
//
// The cards are the SHARED @web10/discover PersonCard + GroupCard (remote
// mode: link-out to web10 social, no follow/join). The social app renders the
// same cards in interactive mode, so the two apps read as one surface.

const PAGE_SIZE = 24;

// ── People (the D0 public directory, paged) ──────────────────────────────────

interface PeopleFace {
  display_name?: string;
  avatar_ref?: string;
  banner_ref?: string;
}

interface PeopleEntry {
  username: string;
  follower_count: number;
  profile: PeopleFace;
}

async function fetchPeoplePage(limit: number, offset: number): Promise<{ users: PeopleEntry[]; hasMore: boolean }> {
  const resp = await fetch(`${API_ORIGIN}/v3/users/directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, offset }),
  });
  if (!resp.ok) return { users: [], hasMore: false };
  const data = await resp.json();
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

// Resolve a page of people's face media (avatar + banner) to presigned URLs in
// TWO batched query-engine reads (one per face field), using the author-scoped
// face-prepare (D73). The D0 directory returns each user's profile face
// (incl. `avatar_ref` / `banner_ref`), but those are media doc_ids, not URLs.
// Minting a URL requires a presign SCOPED TO THE AUTHOR (the media owner) — not
// the reader. The owner-scoped media endpoints (`/v3/media/list`,
// `/v3/media/read-url`) can't do that: they're scoped to the reader's own
// `author_key`, so another user's face 404s (anon) or is filtered out
// (signed-in) — the "people show a gradient + initial" bug. The query engine's
// face-prepare (`prepare.face`) mints the face URL author-scoped (bound to the
// row's `author_key`, not the viewer), so it works for any reader — anon
// included. The read is scoped to the users' followers groups (the I3 gate:
// only readable faces return). A face the reader can't read (a private
// profile) is absent → that card keeps the gradient fallback. A failure
// degrades the whole page to faceless cards, never a throw.
async function resolvePeopleFaces(users: PeopleEntry[]): Promise<Map<string, { avatar_url?: string; banner_url?: string }>> {
  const out = new Map<string, { avatar_url?: string; banner_url?: string }>();
  const withRefs = users.filter((u) => u.profile?.avatar_ref || u.profile?.banner_ref);
  if (withRefs.length === 0) return out;

  const groups = withRefs.map((u) => followersGroupId(u.username));
  const inList = withRefs.map((u) => `'${u.username.replace(/'/g, "''")}'`).join(', ');
  const faceSql = `SELECT author_key AS author_key, body AS body FROM profile WHERE author_key IN (${inList})`;

  const empty: { rows: Record<string, unknown>[] } = { rows: [] };
  const [avatarRes, bannerRes] = await Promise.all([
    withRefs.some((u) => u.profile?.avatar_ref)
      ? runFaceQuery(faceSql, groups, 'avatar_ref', 'avatar_url')
      : Promise.resolve(empty),
    withRefs.some((u) => u.profile?.banner_ref)
      ? runFaceQuery(faceSql, groups, 'banner_ref', 'banner_url')
      : Promise.resolve(empty),
  ]);

  const upsert = (row: Record<string, unknown>) => {
    const author = String(row.author_key ?? '');
    if (!author) return;
    const entry = out.get(author) ?? {};
    if (typeof row.avatar_url === 'string') entry.avatar_url = row.avatar_url;
    if (typeof row.banner_url === 'string') entry.banner_url = row.banner_url;
    out.set(author, entry);
  };
  for (const row of avatarRes.rows) upsert(row);
  for (const row of bannerRes.rows) upsert(row);
  return out;
}

// One face-prepare read: SELECT the profile rows for the page's authors,
// scoped to their followers groups, and let the engine mint the presigned URL
// for `mediaField` (author-scoped) onto `urlField`. Anon-capable (no token).
async function runFaceQuery(
  sql: string,
  groups: string[],
  mediaField: string,
  urlField: string,
): Promise<{ rows: Record<string, unknown>[] }> {
  try {
    const resp = await fetch(`${API_ORIGIN}/v3/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql,
        groups,
        prepare: { face: { bodyField: 'body', mediaField, urlField } },
      }),
    });
    if (!resp.ok) return { rows: [] };
    const data = await resp.json();
    return { rows: Array.isArray(data.rows) ? data.rows : [] };
  } catch {
    return { rows: [] };
  }
}

// ── Groups (the D53 public directory, paged) ─────────────────────────────────

interface GroupEntry {
  group_id: string;
  name: string;
  owner: string;
  join_policy: string;
  member_count: number;
}

async function fetchGroupsPage(limit: number, offset: number): Promise<{ groups: GroupEntry[]; hasMore: boolean }> {
  const resp = await fetch(`${API_ORIGIN}/v3/groups/directory?limit=${limit}&offset=${offset}`);
  if (!resp.ok) return { groups: [], hasMore: false };
  const data = await resp.json();
  const groups: GroupEntry[] = data.groups || [];
  return { groups, hasMore: groups.length >= limit };
}

// The group's face (D60 identity) — the rich name. Read anon (the `anyone`
// grant on public groups). A failure leaves the card nameless (the directory
// name is the fallback).
//
// The banner + avatar are NOT resolved here: a group's face media is a bare
// `public_media` doc owned by the group owner (not attached to any group), so
// there is no anon presign path for it — the owner-scoped media endpoints
// (`/v3/media/list`, `/v3/media/read-url`) require a token, and the
// anon-capable `/v3/media/thumbnail` 404s on a media doc with no group
// attachment. The card therefore renders the gradient fallback until the node
// attaches `public_media` docs to the discover board (the anon presign seam).
const GROUP_IDENTITY_SERVICE = 'web10-social-group-identity';
async function readGroupFace(groupId: string): Promise<DiscoverGroupFace> {
  try {
    const resp = await fetch(`${API_ORIGIN}/v3/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: GROUP_IDENTITY_SERVICE, groups: [groupId], limit: 5 }),
    });
    if (!resp.ok) return {};
    const docs = await resp.json();
    if (!Array.isArray(docs) || docs.length === 0) return {};
    const body = docs[docs.length - 1].body || {};
    return body.name ? { name: body.name } : {};
  } catch {
    return {};
  }
}

// ── The browser ──────────────────────────────────────────────────────────────

type ShowFilter = 'both' | 'people' | 'groups' | 'none';

export function ProfilesBrowser({ query }: { query: string }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // The People / Groups visibility toggle (?show=) — the social Explore tab's
  // pattern. Each section shows/hides independently; both (default) / one /
  // neither. Deep-linkable + refresh-safe.
  const show: ShowFilter = useMemo(() => {
    const raw = searchParams.get('show');
    return raw === 'people' || raw === 'groups' || raw === 'none' ? raw : 'both';
  }, [searchParams]);
  const showPeople = show === 'both' || show === 'people';
  const showGroups = show === 'both' || show === 'groups';

  const setSectionVisible = useCallback(
    (section: 'people' | 'groups', visible: boolean) => {
      const nextPeople = section === 'people' ? visible : showPeople;
      const nextGroups = section === 'groups' ? visible : showGroups;
      const next: ShowFilter =
        nextPeople && nextGroups ? 'both' : nextPeople ? 'people' : nextGroups ? 'groups' : 'none';
      const params = new URLSearchParams(searchParams);
      if (next === 'both') params.delete('show');
      else params.set('show', next);
      setSearchParams(params);
    },
    [searchParams, setSearchParams, showPeople, showGroups],
  );

  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('q');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // ── People ─────────────────────────────────────────────────────────────────
  const [people, setPeople] = useState<DiscoverPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleLoadingMore, setPeopleLoadingMore] = useState(false);
  const [peopleError, setPeopleError] = useState(false);
  const [peopleHasMore, setPeopleHasMore] = useState(false);
  const peopleNextOffset = useRef(0);

  const loadPeoplePage = useCallback(async (offset: number, append: boolean) => {
    if (append) setPeopleLoadingMore(true);
    else {
      setPeopleLoading(true);
      setPeopleError(false);
    }
    try {
      const { users, hasMore } = await fetchPeoplePage(PAGE_SIZE, offset);
      peopleNextOffset.current = offset + users.length;
      const faces = await resolvePeopleFaces(users);
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
      if (!append) setPeopleError(true);
    } finally {
      setPeopleLoading(false);
      setPeopleLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPeoplePage(0, false);
    trackFunnel('trending_people_view');
  }, [loadPeoplePage]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.display_name?.toLowerCase().includes(q) || p.username.toLowerCase().includes(q),
    );
  }, [people, query]);

  const peopleNoResults = query.trim() !== '' && filteredPeople.length === 0;
  const peopleEffectivelyEmpty =
    !peopleLoading && (peopleNoResults || filteredPeople.length === 0);

  // ── Groups ─────────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [groupFaces, setGroupFaces] = useState<Record<string, DiscoverGroupFace>>({});
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsLoadingMore, setGroupsLoadingMore] = useState(false);
  const [groupsError, setGroupsError] = useState(false);
  const [groupsHasMore, setGroupsHasMore] = useState(false);
  const groupsNextOffset = useRef(0);

  const loadGroupsPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setGroupsLoadingMore(true);
    else {
      setGroupsLoading(true);
      setGroupsError(false);
    }
    try {
      const { groups: page, hasMore } = await fetchGroupsPage(PAGE_SIZE, offset);
      groupsNextOffset.current = offset + page.length;
      setGroups((prev) => (append ? [...prev, ...page] : page));
      setGroupsHasMore(hasMore);
    } catch {
      if (!append) setGroupsError(true);
    } finally {
      setGroupsLoading(false);
      setGroupsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadGroupsPage(0, false);
    trackFunnel('trending_groups_view');
  }, [loadGroupsPage]);

  // Resolve each group's face (banner + avatar + rich name) so the card
  // matches the social card. A per-group failure leaves that card faceless.
  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = groups.filter((g) => !(g.group_id in groupFaces));
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (g): Promise<[string, DiscoverGroupFace]> => [g.group_id, await readGroupFace(g.group_id)]),
      );
      if (cancelled) return;
      setGroupFaces((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
  }, [groups, groupFaces]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) || g.owner.toLowerCase().includes(q),
    );
  }, [groups, query]);

  const groupsNoResults = query.trim() !== '' && groups.length > 0 && filteredGroups.length === 0;
  const groupsEffectivelyEmpty = !groupsLoading && (groupsNoResults || filteredGroups.length === 0);

  const bothEmpty =
    query.trim() !== '' &&
    (showPeople || showGroups) &&
    (!showPeople || peopleEffectivelyEmpty) &&
    (!showGroups || groupsEffectivelyEmpty);

  return (
    <div data-testid="discover-profiles-browser" className="mx-auto w-full max-w-2xl">
      {/* The active ?q= filter — a chip that shows the query + clears it. */}
      {query.trim() !== '' && (
        <div className="pt-1 pb-3">
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

      {/* The People / Groups visibility toggle (?show=) — chunky icon+label
          chips so a flood of people can't drown out the groups. */}
      <div className="pb-3">
        <div className="flex items-center gap-2" data-testid="discover-show-toggle" role="group" aria-label="Show sections">
          {(['people', 'groups'] as const).map((section) => {
            const active = section === 'people' ? showPeople : showGroups;
            const Icon = section === 'people' ? Users : Hash;
            return (
              <button
                key={section}
                type="button"
                aria-pressed={active}
                onClick={() => setSectionVisible(section, !active)}
                data-testid={`discover-show-${section}`}
                className={[
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'bg-brand-muted text-brand-300'
                    : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {section === 'people' ? 'People' : 'Groups'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6" data-testid="discover-profiles-view">
        {/* People */}
        {showPeople && (
          <section data-testid="discover-profiles-people-section">
            <h2 className="px-1 pb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
              People
            </h2>
            {peopleError ? (
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
            ) : peopleLoading ? (
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
                    <PersonCard
                      key={p.username}
                      person={p}
                      profileHref={`${SOCIAL_ORIGIN}/u/${p.username}`}
                      testId="trending-person-card"
                    />
                  ))}
                </div>
                {peopleHasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => loadPeoplePage(peopleNextOffset.current, true)}
                      disabled={peopleLoadingMore}
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
        )}

        {/* Groups */}
        {showGroups && (
          <section data-testid="discover-profiles-groups-section">
            <h2 className="px-1 pb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Groups
            </h2>
            {groupsError ? (
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
            ) : groupsLoading ? (
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
                    <GroupCard
                      key={g.group_id}
                      entry={g}
                      face={groupFaces[g.group_id]}
                      groupHref={`${SOCIAL_ORIGIN}/groups/${encodeURIComponent(g.group_id)}`}
                      testId="trending-group-card"
                    />
                  ))}
                </div>
                {groupsHasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => loadGroupsPage(groupsNextOffset.current, true)}
                      disabled={groupsLoadingMore}
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

        {/* Both sections hidden (?show=none) — a neutral empty state. */}
        {!showPeople && !showGroups && (
          <div data-testid="discover-profiles-show-none" className="flex flex-col items-center justify-center py-16 px-8 text-center">
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
          <div data-testid="discover-profiles-no-results" className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted/50">
              <Users className="h-8 w-8 text-brand-400" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">No one or nothing matches</h2>
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
