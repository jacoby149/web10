import { getV3Client } from './v3';
import { followersGroupId, getGroupMembers } from './groups';
import { listFollowers } from './follows';
import { extractUsername } from './types';
import { peopleFaceSql, reduceFaceRows, facePrepare } from '@web10/discover/face';

const LOG = (...args: unknown[]) => console.log('[social:people]', ...args);

/**
 * Resolve the presigned face media (avatar + banner) for a set of people via
 * the query engine's author-scoped face-prepare (D73).
 *
 * The D0 directory / follow reads return each user's profile face (incl.
 * `avatar_ref` / `banner_ref`), but those are media doc_ids, not URLs. Minting
 * a URL requires a presign SCOPED TO THE AUTHOR (the media owner) — not the
 * reader. The owner-scoped `listMedia` read can't do that: it's scoped to the
 * reader's own `author_key`, so another user's face 404s (anon) or is filtered
 * out (signed-in) — the "people show a gradient + initial" bug. The query
 * engine's face-prepare (`prepare.face`) mints the face URL author-scoped
 * (bound to the row's `author_key`, not the viewer), so it works for any
 * reader — anon included.
 *
 * Two batched queries (one per face field) over the set's authors, scoped to
 * their followers groups (the I3 gate: only readable faces return). A face the
 * reader can't read (a private profile) is absent → that card keeps the
 * gradient fallback.
 */
async function resolveFaces(
  w: ReturnType<typeof getV3Client>,
  people: PersonCard[],
): Promise<void> {
  const withRefs = people.filter((p) => p.avatar_ref || p.banner_ref);
  if (!withRefs.length) return;

  // The SQL + the row reduction are the shared face resolver (@web10/discover)
  // — the same builders the marketing site uses, so both apps resolve a face
  // identically. The transport is the app's wapi `w.query` (token-scoped).
  const groups = withRefs.map((p) => followersGroupId(p.username, p.provider));
  const sql = peopleFaceSql(withRefs.map((p) => p.username));

  const empty: { rows: Record<string, unknown>[]; count: number } = { rows: [], count: 0 };
  const [avatarRes, bannerRes] = await Promise.all([
    withRefs.some((p) => p.avatar_ref)
      ? w.query(sql, { groups, prepare: { face: facePrepare('avatar_ref', 'avatar_url') } })
      : Promise.resolve(empty),
    withRefs.some((p) => p.banner_ref)
      ? w.query(sql, { groups, prepare: { face: facePrepare('banner_ref', 'banner_url') } })
      : Promise.resolve(empty),
  ]);

  const byAuthor = reduceFaceRows([...avatarRes.rows, ...bannerRes.rows], 'author_key');

  for (const p of withRefs) {
    const face = byAuthor.get(p.username);
    if (face?.avatar_url) p.avatar_url = face.avatar_url;
    if (face?.banner_url) p.banner_url = face.banner_url;
  }
}

// ── People browser (discover-reorg D2) ───────────────────────────────────────
// The data source is the node's public people directory (D0): one server-side
// composition that returns a paged, follower-ranked list of the users whose
// profile face the reader can read (I3). `follower_count` is the unspoofable
// membership aggregate (count of the user's followers group) — not a stored
// field, so a user can't fake it. Principal-based: anon sees the public
// subset, a signed-in reader sees more (their follows + the public subset).
//
// The client's only job on top of the D0 read is per-card enrichment: the
// reader's own follow flag (is the person in my following set?) and the
// presigned face media (avatar/banner). No per-user profile reads — D0
// returns the face, so the client never fans out to N profile reads.

/** One row in the People list. */
export interface PersonCard {
  username: string;
  provider: string;
  display_name?: string;
  bio?: string;
  /** Raw profile media refs (kept for callers that want them). */
  avatar_ref?: string;
  banner_ref?: string;
  /** Presigned URLs for the card's face media (may be undefined). */
  avatar_url?: string;
  banner_url?: string;
  /** The unspoofable follower count (D0: count of the followers group). */
  followers_count: number;
  /** How many of this user's followers the reader also follows (the "N mutuals"). */
  mutuals: number;
  /** Whether the reader follows this person. */
  is_following: boolean;
}

export type PeopleSort = 'popular' | 'az';

/** The default sort (the server's follower ranking). */
export const DEFAULT_PEOPLE_SORT: PeopleSort = 'popular';

/**
 * The People browser's view filter (the "easy filters" the operator asked for —
 * the social graph, not just discovery). `all` is the bare URL (the public
 * directory, the D0 read); `following` = the people you follow; `mutuals` =
 * people you have in common (mutuals > 0, the D0 read filtered); `followers`
 * = the people who follow you. Deep-linkable via `?personFilter=`.
 */
export type PeopleFilter = 'all' | 'following' | 'mutuals' | 'followers';

/** The default filter (the public directory — the bare URL). */
export const DEFAULT_PEOPLE_FILTER: PeopleFilter = 'all';

/**
 * Order a people list for display. Non-mutating; ties break by username so the
 * order is stable across reloads. `popular` is the server's follower ranking
 * (the D0 order); `az` is alphabetical.
 */
export function sortPeople(people: PersonCard[], sort: PeopleSort): PersonCard[] {
  const arr = [...people];
  switch (sort) {
    case 'az':
      arr.sort((a, b) => a.username.localeCompare(b.username));
      break;
    case 'popular':
    default:
      arr.sort(
        (a, b) =>
          b.followers_count - a.followers_count || a.username.localeCompare(b.username),
      );
      break;
  }
  return arr;
}

/**
 * Client-side `?q=` filter (name or handle, case-insensitive). The D0 read is
 * server-paged + follower-ranked and takes no query, so the query filters the
 * loaded pages; "view more" reveals more.
 */
export function filterPeople(people: PersonCard[], query: string): PersonCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  return people.filter(
    (p) =>
      p.display_name?.toLowerCase().includes(q) || p.username.toLowerCase().includes(q),
  );
}

export interface PeoplePage {
  people: PersonCard[];
  /** True when the page came back full — there may be another page. */
  hasMore: boolean;
  /**
   * The reader's following set (usernames) — follows are group membership, so
   * it is exactly the set of `/followers` groups the reader belongs to. Returned
   * so the background mutuals enrichment (`enrichPeopleMutuals`) can reuse it
   * instead of re-reading `getMyGroups`. Anon (no token) → empty set.
   */
  myFollowing: Set<string>;
}

/**
 * Fetch one page of the People browser from the node's public directory (D0) —
 * the BASE read (paint-on-read, 3.224.0).
 *
 * The D0 read returns `{ username, follower_count, profile }` per user, paged
 * + follower-ranked + I3-gated. This wraps it with ONLY the enrichment that is
 * a single read (the reader's own follow flag, from one `getMyGroups` read, run
 * in parallel with the directory read so the base is one round-trip). The
 * per-card enrichment that is a FAN-OUT — the presigned face media
 * (`enrichPeopleFaces`) and the "N mutuals" signal (`enrichPeopleMutuals`, an
 * N-way `getGroupMembers` fan-out, one per person) — is NOT here: it runs in
 * the background after the list paints (the profile's model, 3.223.0). Holding
 * the list's first paint behind the N-way mutuals fan-out was the "People tab
 * stuck on skeleton" bug — the fan-out grows linearly with the page size.
 */
export async function fetchPeoplePage(opts: {
  limit: number;
  offset: number;
}): Promise<PeoplePage> {
  const w = getV3Client();
  const token = w.readToken();
  const provider = token?.provider || 'web10';

  LOG('fetchPeoplePage — start, limit:', opts.limit, 'offset:', opts.offset);
  // The base read: the D0 directory + the reader's following set (for
  // is_following). Both are single reads (no fan-out) — run them in parallel
  // so the base is one round-trip. Anon (no token) has no following set.
  const [page, myGroups] = await Promise.all([
    w.listPeopleDirectory({ limit: opts.limit, offset: opts.offset }),
    token
      ? w.getMyGroups().catch((e) => {
          LOG('fetchPeoplePage — my-follows read failed (degrading to no follows):', e);
          return [];
        })
      : Promise.resolve([]),
  ]);
  LOG('fetchPeoplePage — got', page.users.length, 'user(s)');

  const myFollowing = new Set(
    myGroups
      .filter((g) => g.group_id.endsWith('/followers'))
      .map((g) => g.group_id.split('/').slice(-2, -1)[0]),
  );

  const people: PersonCard[] = page.users.map((u) => {
    const profile = (u.profile || {}) as Record<string, unknown>;
    return {
      username: u.username,
      provider,
      display_name: (profile.display_name as string) || u.username,
      bio: (profile.bio as string) || undefined,
      avatar_ref: (profile.avatar_ref as string) || undefined,
      banner_ref: (profile.banner_ref as string) || undefined,
      followers_count: u.follower_count,
      // The mutuals badge is a background enrichment (enrichPeopleMutuals) —
      // 0 until it lands. The list paints without it.
      mutuals: 0,
      is_following: myFollowing.has(u.username),
    };
  });

  // A full page means there may be another; a short page is the last one.
  const hasMore = page.users.length >= opts.limit;
  LOG('fetchPeoplePage — returned', people.length, 'card(s), hasMore:', hasMore, '(faces + mutuals enrich in the background)');
  return { people, hasMore, myFollowing };
}

/**
 * The per-card face enrichment (avatar + banner) — a BACKGROUND pass (the list
 * paints after the base read, the faces patch in). One batched author-scoped
 * face-prepare over the page (I3-gated; see `resolveFaces`). Mutates the cards
 * in place (sets `avatar_url` / `banner_url`); the caller re-sets the list to
 * force the re-render. A failure degrades the page to faceless cards (the
 * gradient fallback), never a throw.
 */
export async function enrichPeopleFaces(
  w: ReturnType<typeof getV3Client>,
  people: PersonCard[],
): Promise<void> {
  try {
    await resolveFaces(w, people);
  } catch (e) {
    LOG('enrichPeopleFaces — face media failed (degrading to faceless cards):', e);
  }
}

/**
 * The per-card mutuals enrichment (the "N mutuals" badge) — a BACKGROUND pass.
 * Mutuals are derived CLIENT-side from the generic membership primitive: a
 * user's followers = the member list of their followers group
 * (`getGroupMembers`), intersected with the reader's own following set — the
 * node stays generic (D60), it never computes an app's social signal. This is
 * the N-way fan-out (one `getGroupMembers` per person) that used to hold the
 * list's first paint; now it runs after the list is up. `myFollowing` is the
 * reader's following set from `fetchPeoplePage` (reused, not re-read). Anon /
 * no-follows → mutuals stay 0 (no fan-out). Mutates the cards in place (sets
 * `mutuals`); the caller re-sets the list to force the re-render.
 */
export async function enrichPeopleMutuals(
  people: PersonCard[],
  myFollowing: Set<string>,
): Promise<void> {
  if (myFollowing.size === 0) return;
  await Promise.all(
    people.map(async (card) => {
      try {
        const members = await getGroupMembers(followersGroupId(card.username, card.provider));
        card.mutuals = members.filter((m) => myFollowing.has(extractUsername(m.member_key))).length;
      } catch (e) {
        LOG('enrichPeopleMutuals — mutuals read failed for', card.username, '(degrading to 0):', e);
      }
    }),
  );
}

/**
 * The reader's own followers (who follow you) as PersonCards, for the People
 * browser's "Followers" filter. The `Followers` view is the one the D0
 * directory can't express (the reader's followers aren't necessarily
 * discoverable public people), so it's a separate read: `listFollowers(me)`
 * (the members of the reader's own followers group) enriched with each
 * person's face (display name + presigned avatar/banner). Each read degrades
 * independently — a missing profile just leaves that card faceless (the
 * username renders). Follower count is the reader's own group size (shared).
 */
export async function fetchMyFollowersCards(): Promise<PersonCard[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    LOG('fetchMyFollowersCards — no token, returning []');
    return [];
  }
  const me = token.username;
  const provider = token.provider;

  let followers: { username: string; provider: string }[] = [];
  try {
    followers = await listFollowers(me);
  } catch (e) {
    LOG('fetchMyFollowersCards — listFollowers failed:', e);
    return [];
  }
  LOG('fetchMyFollowersCards — got', followers.length, 'follower(s)');

  // The reader's own follower count (the size of their followers group) — the
  // same figure every follower card shares (a display figure, not per-person).
  let ownFollowerCount = followers.length;
  try {
    const members = await getGroupMembers(followersGroupId(me, provider));
    ownFollowerCount = members.length;
  } catch {
    // Degrade to the list length.
  }

  const myFollowing = new Set<string>(followers.map((f) => f.username));

  const cards = await Promise.all(
    followers.map(async (f): Promise<PersonCard> => {
      const card: PersonCard = {
        username: f.username,
        provider: f.provider || provider,
        display_name: f.username,
        followers_count: ownFollowerCount,
        mutuals: 0,
        is_following: myFollowing.has(f.username),
      };
      // Resolve the face (display name + avatar/banner) — degrades to the
      // username + gradient fallback when the profile is unreadable.
      try {
        const docs = await w.read('profile', { groups: [followersGroupId(f.username, f.provider)] });
        if (docs.length > 0) {
          const latest = docs.reduce((a, b) => ((a.updated_at ?? '') >= (b.updated_at ?? '') ? a : b));
          const body = latest.body as Record<string, unknown>;
          card.display_name = (body.display_name as string) || f.username;
          card.bio = (body.bio as string) || undefined;
          card.avatar_ref = (body.avatar_ref as string) || undefined;
          card.banner_ref = (body.banner_ref as string) || undefined;
        }
      } catch {
        // No readable face — the card renders from the username alone.
      }
      return card;
    }),
  );

  // Face media (avatar + banner) — one batched author-scoped face-prepare over
  // the followers (I3-gated; a face the reader can't read keeps the gradient
  // fallback).
  try {
    await resolveFaces(w, cards);
  } catch (e) {
    LOG('fetchMyFollowersCards — face media failed (degrading to faceless cards):', e);
  }

  LOG('fetchMyFollowersCards — returned', cards.length, 'card(s)');
  return cards;
}

/**
 * The reader's own following (the people you follow) as PersonCards, for the
 * People browser's "Following" filter. Following IS group membership, so the
 * set is exactly the `/followers` groups the reader belongs to (one read);
 * each is enriched with the followed person's face. Same shape + degradation
 * as {@link fetchMyFollowersCards}.
 */
export async function fetchMyFollowingCards(): Promise<PersonCard[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    LOG('fetchMyFollowingCards — no token, returning []');
    return [];
  }
  const me = token.username;
  const provider = token.provider;

  // My following set — follows are group membership (the /followers groups I'm
  // in). The followed user is the group's owner (the username segment).
  let following: { username: string; provider: string }[] = [];
  try {
    const myGroups = await w.getMyGroups();
    following = myGroups
      .filter((g) => g.group_id.endsWith('/followers'))
      .map((g) => {
        const parts = g.group_id.split('/');
        return { username: parts[parts.length - 2] || '', provider: parts[0] || provider };
      })
      .filter((f) => f.username && f.username !== me);
  } catch (e) {
    LOG('fetchMyFollowingCards — my-follows read failed:', e);
    return [];
  }
  LOG('fetchMyFollowingCards — got', following.length, 'following');

  const cards = await Promise.all(
    following.map(async (f): Promise<PersonCard> => {
      const card: PersonCard = {
        username: f.username,
        provider: f.provider || provider,
        display_name: f.username,
        followers_count: 0,
        mutuals: 0,
        is_following: true,
      };
      try {
        const docs = await w.read('profile', { groups: [followersGroupId(f.username, f.provider)] });
        if (docs.length > 0) {
          const latest = docs.reduce((a, b) => ((a.updated_at ?? '') >= (b.updated_at ?? '') ? a : b));
          const body = latest.body as Record<string, unknown>;
          card.display_name = (body.display_name as string) || f.username;
          card.bio = (body.bio as string) || undefined;
          card.avatar_ref = (body.avatar_ref as string) || undefined;
          card.banner_ref = (body.banner_ref as string) || undefined;
        }
      } catch {
        // No readable face — the card renders from the username alone.
      }
      return card;
    }),
  );

  // Face media (avatar + banner) — one batched author-scoped face-prepare over
  // the following (I3-gated; a face the reader can't read keeps the gradient
  // fallback).
  try {
    await resolveFaces(w, cards);
  } catch (e) {
    LOG('fetchMyFollowingCards — face media failed (degrading to faceless cards):', e);
  }

  LOG('fetchMyFollowingCards — returned', cards.length, 'card(s)');
  return cards;
}
