import { fetchPeoplePage, filterPeople, type PersonCard } from './people';
import { readGroupDirectory, type GroupDirectoryEntry } from './groups';
import { readDiscoverFeed, readShortsFeed, type ShortPost } from './feed';
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
  video: PostRecord[];
  shorts: ShortPost[];
  posts: PostRecord[];
}

/**
 * Is this post a video? The Video destination's render-time gate
 * (DiscoverScreen's `postHasVideo`, kept in lockstep): a post is a video if
 * it's tagged `video` OR its first resolved media is a video. The tag is
 * client-asserted (a direct API caller can fake it), so the resolved media
 * mime is the backstop — same logic, both surfaces.
 */
function postHasVideo(post: PostRecord): boolean {
  const refs = post.media_refs || [];
  const hasVideoRef = refs.some(
    (r) => typeof r === 'object' && r !== null && (r as { mime_type?: string }).mime_type?.startsWith('video/'),
  );
  return !!(post.tags?.includes('video') || hasVideoRef);
}

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Search people by username or display name.
 *
 * Data source: the node's public people directory (D0, discover-reorg) via
 * `fetchPeoplePage` — a paged, follower-ranked, I3-gated read. We pull one
 * pool page and filter it client-side with the D2 canonical `filterPeople`
 * (name or handle). The node multi-entity search endpoint is the scale fix
 * (follow-up, not v1).
 */
export async function searchPeople(query: string, limit = DEFAULT_LIMIT): Promise<PersonCard[]> {
  const q = query.trim();
  if (!q) return [];
  const { people: pool } = await fetchPeoplePage({ limit: POOL_SIZE, offset: 0 });
  const filtered = filterPeople(pool, q);
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
 * Search VIDEO posts (the `/video` destination) by text or author.
 *
 * v1: the same discover-board pool as `searchPosts`, additionally gated to
 * video posts (`postHasVideo` — the Video destination's render-time gate, so
 * the dropdown shows exactly what the destination will show).
 */
export async function searchVideo(query: string, limit = DEFAULT_LIMIT): Promise<PostRecord[]> {
  const q = normalize(query);
  if (!q) return [];
  const pool = await readDiscoverFeed(null, POOL_SIZE);
  const filtered = pool.filter(
    (p) =>
      postHasVideo(p) &&
      ((p.text && p.text.toLowerCase().includes(q)) ||
        (p.author_username && p.author_username.toLowerCase().includes(q))),
  );
  LOG('searchVideo —', q, '→', filtered.length, 'of', pool.length, 'pool');
  return filtered.slice(0, limit);
}

/**
 * Search SHORTS (the `/shorts` destination) by text or author.
 *
 * v1: `readShortsFeed` (the discover board filtered to genuine 9:16 shorts —
 * the render-time gate, shorts.md) filtered client-side by the short's text
 * or author.
 */
export async function searchShorts(query: string, limit = DEFAULT_LIMIT): Promise<ShortPost[]> {
  const q = normalize(query);
  if (!q) return [];
  const pool = await readShortsFeed(POOL_SIZE);
  const filtered = pool.filter(
    (s) =>
      (s.post.text && s.post.text.toLowerCase().includes(q)) ||
      (s.post.author_username && s.post.author_username.toLowerCase().includes(q)),
  );
  LOG('searchShorts —', q, '→', filtered.length, 'of', pool.length, 'pool');
  return filtered.slice(0, limit);
}

/**
 * The five-way fan-out: search people, groups, video, shorts, and posts in
 * parallel.
 *
 * Each section is independent — a failure in one read degrades that section
 * to an empty list, it never blanks the whole dropdown. The component uses
 * the individual `search*` functions for per-section loading (so the slowest
 * read doesn't block the others); this is the convenience wrapper for cases
 * that want all five at once (and for tests).
 */
export async function globalSearch(query: string, limit = DEFAULT_LIMIT): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { people: [], groups: [], video: [], shorts: [], posts: [] };

  const [people, groups, video, shorts, posts] = await Promise.all([
    searchPeople(q, limit).catch((e) => {
      LOG('people search failed (degrading to []):', e);
      return [] as PersonCard[];
    }),
    searchGroups(q, limit).catch((e) => {
      LOG('groups search failed (degrading to []):', e);
      return [] as GroupDirectoryEntry[];
    }),
    searchVideo(q, limit).catch((e) => {
      LOG('video search failed (degrading to []):', e);
      return [] as PostRecord[];
    }),
    searchShorts(q, limit).catch((e) => {
      LOG('shorts search failed (degrading to []):', e);
      return [] as ShortPost[];
    }),
    searchPosts(q, limit).catch((e) => {
      LOG('posts search failed (degrading to []):', e);
      return [] as PostRecord[];
    }),
  ]);

  return { people, groups, video, shorts, posts };
}
