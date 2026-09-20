import { fetchPeople, type PersonCard } from './people';
import { readGroupDirectory, type GroupDirectoryEntry } from './groups';
import { readDiscoverFeed } from './feed';
import type { PostRecord } from './types';

const LOG = (...args: unknown[]) => console.log('[social:search]', ...args);

// The per-section cap (the plan: "top ~5 each").
const DEFAULT_LIMIT = 5;
// The pool size to pull before client-side filtering. Larger than the cap so
// the filter has something to work with; small enough to stay cheap (v1 floor
// — the node multi-entity search endpoint is the scale fix, not v1).
const POOL_SIZE = 50;

export interface SearchResults {
  people: PersonCard[];
  groups: GroupDirectoryEntry[];
  posts: PostRecord[];
}

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Search people by username or display name.
 *
 * v1 floor: `fetchPeople` builds a candidate pool (discover-board authors +
 * community members), and we filter it client-side. This is NOT a node-wide
 * search — it only covers the candidate pool. The node multi-entity search
 * endpoint is the scale fix (follow-up, not v1).
 */
export async function searchPeople(query: string, limit = DEFAULT_LIMIT): Promise<PersonCard[]> {
  const q = normalize(query);
  if (!q) return [];
  const pool = await fetchPeople(POOL_SIZE);
  const filtered = pool.filter(
    (p) =>
      p.username.toLowerCase().includes(q) ||
      (p.display_name && p.display_name.toLowerCase().includes(q)),
  );
  LOG('searchPeople —', q, '→', filtered.length, 'of', pool.length, 'pool');
  return filtered.slice(0, limit);
}

/**
 * Search groups by name, owner, or tags.
 *
 * v1: `readGroupDirectory` (the D53 public directory, anon) filtered
 * client-side. The directory already excludes non-discoverable groups, so
 * drafts never leak.
 */
export async function searchGroups(query: string, limit = DEFAULT_LIMIT): Promise<GroupDirectoryEntry[]> {
  const q = normalize(query);
  if (!q) return [];
  const pool = await readGroupDirectory(POOL_SIZE);
  const filtered = pool.filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      g.owner.toLowerCase().includes(q) ||
      (g.tags && g.tags.some((t) => t.toLowerCase().includes(q))),
  );
  LOG('searchGroups —', q, '→', filtered.length, 'of', pool.length, 'pool');
  return filtered.slice(0, limit);
}

/**
 * Search posts by text or author username.
 *
 * v1: `readDiscoverFeed` (the discover board) filtered client-side. This is
 * the app's existing `?q=` post search shape.
 */
export async function searchPosts(query: string, limit = DEFAULT_LIMIT): Promise<PostRecord[]> {
  const q = normalize(query);
  if (!q) return [];
  const pool = await readDiscoverFeed(null, POOL_SIZE);
  const filtered = pool.filter(
    (p) =>
      (p.text && p.text.toLowerCase().includes(q)) ||
      (p.author_username && p.author_username.toLowerCase().includes(q)),
  );
  LOG('searchPosts —', q, '→', filtered.length, 'of', pool.length, 'pool');
  return filtered.slice(0, limit);
}

/**
 * The three-way fan-out: search people, groups, and posts in parallel.
 *
 * Each section is independent — a failure in one read degrades that section
 * to an empty list, it never blanks the whole dropdown. The component uses
 * the individual `search*` functions for per-section loading (so the slowest
 * read doesn't block the others); this is the convenience wrapper for cases
 * that want all three at once (and for tests).
 */
export async function globalSearch(query: string, limit = DEFAULT_LIMIT): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { people: [], groups: [], posts: [] };

  const [people, groups, posts] = await Promise.all([
    searchPeople(q, limit).catch((e) => {
      LOG('people search failed (degrading to []):', e);
      return [] as PersonCard[];
    }),
    searchGroups(q, limit).catch((e) => {
      LOG('groups search failed (degrading to []):', e);
      return [] as GroupDirectoryEntry[];
    }),
    searchPosts(q, limit).catch((e) => {
      LOG('posts search failed (degrading to []):', e);
      return [] as PostRecord[];
    }),
  ]);

  return { people, groups, posts };
}
