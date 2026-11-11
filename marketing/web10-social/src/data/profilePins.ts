import { getV3Client, type V3Document } from './v3';
import { fromV3DocToPost, dropAdPosts, type PostRecord, type ProfileRecord } from './types';
import { saveProfile } from './profile';
import { followersGroupId, closeFriendsGroupId, getDiscoverGroupId } from './groups';

// ── Profile pins (social/profile-pins.md) ───────────────────────────────────
// The owner holds up to MAX_PROFILE_PINS posts at the top of their profile's
// Posts tab. The pin state lives on the face doc (the `profile` service, the
// owner's followers group) — the one public read surface there (D58 point 7:
// the followers group's `anyone` grant is `profile`-only, so a separate
// service would be invisible to visitors). The list is doc_ids only: a pin is
// a pointer, never an access grant — every pinned post still passes its own
// read gate (I3).
//
// D60: all of this is app data on an app-owned service, written through the
// normal CRUD path. The node learns nothing about "pinned post".

const LOG = (...args: unknown[]) => console.log('[social:pins]', ...args);
const LOG_WARN = (...args: unknown[]) => console.warn('[social:pins]', ...args);

/** The pin slots (Instagram parity). The data layer enforces; the UI hides
 *  the pin item when the slots are full. */
export const MAX_PROFILE_PINS = 3;

/**
 * Normalize a stored pin list to its trusted shape: string ids only, no
 * empties, no dupes, capped at MAX_PROFILE_PINS, stored order preserved.
 * (types.ts' fromV3DocToProfile carries a behavior twin that stays
 * dependency-free — keep the two in step, pinned by tests both ways.)
 */
export function normalizePinnedPostIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== 'string' || !v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length === MAX_PROFILE_PINS) break;
  }
  return out;
}

/**
 * Toggle one pin. Unpin = remove (order of the rest preserved). Pin = APPEND —
 * display order is pin order (index 0 = the top slot), so a fresh pin lands
 * at the bottom of the pinned block and re-pinning after an unpin moves it
 * there again. No separate sort key: pin/unpin is the whole editing model.
 * Throws when a pin would exceed the slots (the caller's UI should have
 * hidden the item — this is the backstop).
 */
export function togglePinnedPostIds(current: string[], postId: string, wantPin: boolean): string[] {
  const ids = normalizePinnedPostIds(current);
  if (wantPin) {
    if (ids.includes(postId)) return ids; // already pinned — idempotent
    if (ids.length >= MAX_PROFILE_PINS) {
      throw new Error(`Profile pins are full (${MAX_PROFILE_PINS}). Unpin one first.`);
    }
    return [...ids, postId];
  }
  return ids.filter((id) => id !== postId);
}

/**
 * Move one pin to its slot above (dir -1) or below (dir +1) — the
 * "Pinned posts" manage screen's up/down arrows. A no-op at either end (there
 * is nothing to swap with) and for ids not on the list. The move is the whole
 * ordering model for pins: pin-order IS display order (index 0 = the top
 * slot), so swapping with the neighbor is a reorder.
 */
export function movePinnedPostId(ids: string[], id: string, dir: -1 | 1): string[] {
  const list = normalizePinnedPostIds(ids);
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  next[i] = list[j];
  next[j] = list[i];
  return next;
}

/**
 * The display order: pinned posts first (in pin order, only those the reader
 * actually has — a dead / unreadable pinned id drops out, it renders
 * nowhere), then the rest in the given order. Dedupes by _id.
 */
export function orderPinnedPosts(posts: PostRecord[], pinnedIds: string[]): PostRecord[] {
  const byId = new Map<string, PostRecord>();
  for (const p of posts) if (p._id && !byId.has(p._id)) byId.set(p._id, p);
  const pinned = normalizePinnedPostIds(pinnedIds)
    .map((id) => byId.get(id))
    .filter((p): p is PostRecord => Boolean(p));
  const pinnedIdsOut = new Set(pinned.map((p) => p._id));
  const rest = posts.filter((p) => p._id && !pinnedIdsOut.has(p._id));
  return [...pinned, ...rest];
}

/**
 * Persist the pin list on the owner's face doc — a saveProfile that only
 * touches `pinned_post_ids` (the caller spreads the live profile state, so
 * every other face field round-trips). The node's update is a full-body
 * replacement, so this MUST carry the current list — the screen does.
 * Requires the owner's token (only the owner writes their own pins).
 */
export async function savePinnedPostIds(profile: ProfileRecord | null, ids: string[]): Promise<ProfileRecord> {
  if (!profile) throw new Error('no profile face yet — cannot save pins');
  const next = { ...profile, pinned_post_ids: normalizePinnedPostIds(ids) };
  LOG('savePinnedPostIds —', next.pinned_post_ids?.length ?? 0, 'pin(s)');
  return saveProfile(next);
}

/**
 * Read pinned posts by exact doc_id that the profile's main read did not load
 * (pins older than the first-50 page). One bounded D73 query — the app writes
 * its own SELECT over `posts` (5.9.2's exact-id case), scoped to the same
 * groups the profile's main read uses, author-filtered, ad/product excluded,
 * prepared (media + ads) so the tiles render like the rest of the wall,
 * `surface: 'profile'` so the D86 delivery logging treats them as the
 * profile's own views.
 *
 * Two-valued result (the screen treats them differently):
 *  - `PostRecord[]` — the read SUCCEEDED. Fewer rows than ids means those
 *    posts are dead or unreadable by THIS reader (a visitor hitting a
 *    private pin). The owner self-heals the doc from this; a visitor heals
 *    in-session only.
 *  - `null` — the read itself FAILED (node error, malformed). Unknown: the
 *    caller must not self-heal from this.
 */
export async function readPinnedPosts(opts: {
  username: string;
  provider?: string;
  /** The pinned doc_ids NOT on the loaded page (already normalized + deduped). */
  docIds: string[];
  /** Owner read (followers + close-friends groups) vs visitor read
   *  (followers + discover, the profile's public scope). */
  isOwn: boolean;
}): Promise<PostRecord[] | null> {
  const ids = normalizePinnedPostIds(opts.docIds);
  if (!ids.length) return [];
  const w = getV3Client();
  // Owner: the owner's own groups (a private pin still resolves for them).
  // Visitor: the profile's public read scope — the node's I3 gate decides
  // what of the pinned set the visitor may actually see.
  const groups = opts.isOwn
    ? [followersGroupId(opts.username, opts.provider), closeFriendsGroupId(opts.username, opts.provider)]
    : [followersGroupId(opts.username, opts.provider), getDiscoverGroupId()];
  // Defensive quoting (doc ids are uuid-ish, but the SQL is a literal).
  const idList = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  const escaped = (opts.username || '').replace(/'/g, "''");
  const sql =
    'SELECT p.doc_id AS doc_id, p.author_key AS author_key, p.posted_by AS posted_by, p.body AS body, p.tags AS tags, ' +
    'p.created_at AS created_at, p.ref_value AS ref_value, p.ad_mode AS ad_mode, p.ad_target AS ad_target ' +
    `FROM posts p WHERE p.author_key = '${escaped}' AND p.doc_id IN (${idList}) ` +
    "AND NOT has(p.tags, 'ad') AND NOT has(p.tags, 'product') " +
    'ORDER BY toUnixTimestamp64Milli(p.created_at) DESC ' +
    `LIMIT ${ids.length}`;
  try {
    const result = await w.query(sql, {
      groups,
      prepare: { media: true, ads: true },
      surface: 'profile',
      contentService: 'posts',
    });
    const rows = dropAdPosts(result.rows.map((r) => fromV3DocToPost(r as unknown as V3Document)));
    LOG('readPinnedPosts —', ids.length, 'requested,', rows.length, 'returned (isOwn:', opts.isOwn, ')');
    return rows;
  } catch (e) {
    LOG_WARN('readPinnedPosts — read failed (unknown; no self-heal):', e);
    return null;
  }
}
