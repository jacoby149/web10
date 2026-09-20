import { getV3Client } from './v3';
import {
  followersGroupId,
  getGroupMembers,
  getDiscoverGroupId,
  isInfrastructureGroup,
} from './groups';
import { readUserProfile } from './profile';
import { resolveMediaRefs } from './posts';
import { extractUsername } from './types';

const LOG = (...args: unknown[]) => console.log('[social:people]', ...args);

// ── People discovery (find profiles) ─────────────────────────────────────────
// There is no user directory on the node, so candidates are derived from the
// social graph the client can already read:
//   1. authors of posts on the discover board (people actively publishing),
//   2. members of the communities the current user belongs to.
// "How much in common" is the mutual-follow count: for a candidate X,
// mutuals(X) = |followers(X) ∩ my-following| — people you follow who also
// follow them (the "N mutuals" signal). Follows ARE group membership, so a
// candidate's follower list is just the member list of their followers group
// (the same read the profile screen uses for follower counts) — no node
// changes are needed.

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
  followers_count: number;
  /** People you follow who also follow this user. */
  mutuals: number;
  is_following: boolean;
}

export type PeopleSort = 'mutuals' | 'popular' | 'az';

/**
 * How many of the candidate's followers you also follow (the "N mutuals").
 * Pure — unit-testable without a client.
 */
export function computeMutuals(
  theirFollowers: string[],
  myFollowing: ReadonlySet<string>,
): number {
  let n = 0;
  for (const u of theirFollowers) {
    if (myFollowing.has(u)) n += 1;
  }
  return n;
}

/**
 * Order a people list for display. Non-mutating; ties break by follower
 * count, then username, so the order is stable across reloads.
 */
export function sortPeople(people: PersonCard[], sort: PeopleSort): PersonCard[] {
  const arr = [...people];
  switch (sort) {
    case 'popular':
      arr.sort(
        (a, b) =>
          b.followers_count - a.followers_count || a.username.localeCompare(b.username),
      );
      break;
    case 'az':
      arr.sort((a, b) => a.username.localeCompare(b.username));
      break;
    case 'mutuals':
    default:
      arr.sort(
        (a, b) =>
          b.mutuals - a.mutuals ||
          b.followers_count - a.followers_count ||
          a.username.localeCompare(b.username),
      );
      break;
  }
  return arr;
}

/**
 * Fetch the people list for the current user.
 *
 * Candidate pool (deduped, self excluded, capped at `limit`):
 *   - authors of posts on the discover board, then
 *   - members of the current user's community groups.
 * Each candidate gets their profile face (display name, bio, avatar/banner),
 * their follower list, and the derived mutuals / is_following flags.
 */
export async function fetchPeople(limit = 20): Promise<PersonCard[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    LOG('fetchPeople — no token, returning []');
    return [];
  }
  const me = token.username;
  const provider = token.provider;

  // 1. My following set — follows are group membership, so it is exactly the
  //    set of `/followers` groups I belong to (same rule as readFollows).
  const myGroups = await w.getMyGroups();
  const myFollowing = new Set<string>(
    myGroups
      .filter((g) => g.group_id.endsWith('/followers'))
      .map((g) => g.group_id.split('/').slice(-2, -1)[0]),
  );
  LOG('fetchPeople — following', myFollowing.size, 'user(s)');

  // 2. Candidate pool: discover-board authors first (active publishers),
  //    then members of my community groups.
  const candidates: string[] = [];
  const seen = new Set<string>([me]);
  const add = (u?: string | null): void => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    candidates.push(u);
  };

  try {
    const docs = await w.read('posts', {
      groups: [getDiscoverGroupId()],
      limit: limit * 3,
    });
    for (const d of docs) add(extractUsername(d.author_key));
    LOG('fetchPeople — discover authors seen:', candidates.length);
  } catch (e) {
    LOG('fetchPeople — discover authors read failed (continuing):', e);
  }

  const communityGroups = myGroups.filter(
    (g) => !isInfrastructureGroup(g.group_id, me),
  );
  for (const g of communityGroups) {
    try {
      const members = await getGroupMembers(g.group_id);
      for (const m of members) add(extractUsername(m.member_key));
    } catch (e) {
      LOG('fetchPeople — community members failed for', g.group_id, ':', e);
    }
  }

  const pool = candidates.slice(0, limit);
  LOG('fetchPeople — pool size', pool.length, 'of', candidates.length, 'candidates');
  if (!pool.length) return [];

  // 3. Per candidate: profile face + follower list (parallel; each read
  //    degrades independently so one bad profile never blanks the list).
  const cards = await Promise.all(
    pool.map(async (username): Promise<PersonCard> => {
      let profile: Awaited<ReturnType<typeof readUserProfile>> = null;
      try {
        profile = await readUserProfile(username);
      } catch {
        // No profile doc yet — the card renders from the username alone.
      }
      let followers: string[] = [];
      try {
        const members = await getGroupMembers(followersGroupId(username, provider));
        followers = members.map((m) => extractUsername(m.member_key));
      } catch {
        // No followers group yet (or unreadable) — treat as zero followers.
      }
      return {
        username,
        provider,
        display_name: profile?.display_name || username,
        bio: profile?.bio,
        avatar_ref: profile?.avatar_ref,
        banner_ref: profile?.banner_ref,
        followers_count: followers.length,
        mutuals: computeMutuals(followers, myFollowing),
        is_following: myFollowing.has(username),
      };
    }),
  );

  // 4. Resolve the face media (avatar + banner) per author — owner-scoped
  //    reads, so one call per candidate. Failures degrade to the initial
  //    fallback in the card.
  for (const card of cards) {
    const refs = [card.avatar_ref, card.banner_ref].filter(Boolean) as string[];
    if (!refs.length) continue;
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
      LOG('fetchPeople — face media failed for', card.username, ':', e);
    }
  }

  LOG('fetchPeople — returned', cards.length, 'person card(s)');
  return cards;
}

/**
 * Fetch a page of the public people directory (D2, discover-reorg) — the D0
 * node read (`listPeopleDirectory`) as the data source, not the client-side
 * pool. One round-trip returns a paged, follower-ranked list of the users
 * whose profile face the reader can read (I3: anon = the public subset,
 * signed-in = more). Each card is enriched client-side with `mutuals` (read
 * their followers group ∩ my-following) and the resolved face media.
 *
 * `follower_count` is the node's unspoofable membership aggregate (the D0
 * read's `count(group_members)`), not a client-recomputed length.
 */
export async function fetchPeoplePage(offset = 0, limit = 20): Promise<PersonCard[]> {
  const w = getV3Client();
  const token = w.readToken();
  const provider = token?.provider || 'web10.app';

  // 1. The D0 read — paged, follower-ranked, I3-gated (faces + counts).
  const page = await w.listPeopleDirectory({ offset, limit });
  LOG('fetchPeoplePage — D0 read returned', page.users.length, 'user(s) @ offset', offset);
  if (!page.users.length) return [];

  // 2. My following set (for mutuals + is_following). Anon = empty (no mutuals).
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
      LOG('fetchPeoplePage — my-following read failed (no mutuals):', e);
    }
  }

  // 3. Per user: mutuals (read their followers group) — the face + count come
  //    from the D0 read. Each read degrades independently (one bad follower
  //    list never blanks the card).
  const cards = await Promise.all(
    page.users.map(async (u): Promise<PersonCard> => {
      const profile = (u.profile ?? {}) as Record<string, string | undefined>;
      let followers: string[] = [];
      try {
        const members = await getGroupMembers(followersGroupId(u.username, provider));
        followers = members.map((m) => extractUsername(m.member_key));
      } catch {
        // No followers group (or unreadable) — zero mutuals.
      }
      return {
        username: u.username,
        provider,
        display_name: profile.display_name || u.username,
        bio: profile.bio,
        avatar_ref: profile.avatar_ref,
        banner_ref: profile.banner_ref,
        followers_count: u.follower_count,
        mutuals: computeMutuals(followers, myFollowing),
        is_following: myFollowing.has(u.username),
      };
    }),
  );

  // 4. Resolve the face media (avatar + banner) per user — owner-scoped reads.
  //    Failures degrade to the initial fallback in the card.
  for (const card of cards) {
    const refs = [card.avatar_ref, card.banner_ref].filter(Boolean) as string[];
    if (!refs.length) continue;
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
  }

  LOG('fetchPeoplePage — returned', cards.length, 'person card(s)');
  return cards;
}
