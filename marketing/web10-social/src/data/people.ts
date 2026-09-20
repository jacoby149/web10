import { getV3Client } from './v3';
import { resolveMediaRefs } from './posts';

const LOG = (...args: unknown[]) => console.log('[social:people]', ...args);

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
  /** Whether the reader follows this person. */
  is_following: boolean;
}

export type PeopleSort = 'popular' | 'az';

/** The default sort (the server's follower ranking). */
export const DEFAULT_PEOPLE_SORT: PeopleSort = 'popular';

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
}

/**
 * Fetch one page of the People browser from the node's public directory (D0).
 *
 * The D0 read returns `{ username, follower_count, profile }` per user, paged
 * + follower-ranked + I3-gated. This wraps it with the per-card enrichment the
 * card needs: the reader's own follow flag (one my-follows read, shared across
 * the page) and the presigned face media (avatar/banner).
 */
export async function fetchPeoplePage(opts: {
  limit: number;
  offset: number;
}): Promise<PeoplePage> {
  const w = getV3Client();
  const token = w.readToken();
  const provider = token?.provider || 'web10';

  LOG('fetchPeoplePage — start, limit:', opts.limit, 'offset:', opts.offset);
  const page = await w.listPeopleDirectory({
    limit: opts.limit,
    offset: opts.offset,
  });
  LOG('fetchPeoplePage — got', page.users.length, 'user(s)');

  // My following set — follows are group membership, so it is exactly the set
  // of `/followers` groups I belong to (one read, shared across the page).
  // Anon (no token) has no following set — every card is is_following: false.
  let myFollowing = new Set<string>();
  if (token) {
    try {
      const myGroups = await w.getMyGroups();
      myFollowing = new Set(
        myGroups
          .filter((g) => g.group_id.endsWith('/followers'))
          .map((g) => g.group_id.split('/').slice(-2, -1)[0]),
      );
    } catch (e) {
      LOG('fetchPeoplePage — my-follows read failed (degrading to no follows):', e);
    }
  }

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
      is_following: myFollowing.has(u.username),
    };
  });

  // Resolve the face media (avatar + banner) per person — owner-scoped reads,
  // so one call per person. Failures degrade to the card's fallback face.
  await Promise.all(
    people.map(async (card) => {
      const refs = [card.avatar_ref, card.banner_ref].filter(Boolean) as string[];
      if (!refs.length) return;
      try {
        const media = await resolveMediaRefs(
          refs,
          { username: card.username, provider: card.provider },
          'public_media',
        );
        for (const m of media) {
          if (m._id === card.avatar_ref) card.avatar_url = m.url;
          else if (m._id === card.banner_ref) card.banner_url = m.url;
        }
      } catch (e) {
        LOG('fetchPeoplePage — face media failed for', card.username, ':', e);
      }
    }),
  );

  // A full page means there may be another; a short page is the last one.
  const hasMore = page.users.length >= opts.limit;
  LOG('fetchPeoplePage — returned', people.length, 'card(s), hasMore:', hasMore);
  return { people, hasMore };
}
