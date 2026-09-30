import { getV3Client } from './v3';
import {
  slugify,
  writeGroupIdentity,
  readGroupIdentity,
  addGroupMember,
  removeGroupMember,
  deleteGroup,
  getMyGroups,
  type GroupIdentity,
} from './groups';
import { readPostById, resolveMediaRefs } from './posts';
import type { PostRecord, MediaRecord, ResolvedMediaRef } from './types';

// ── Saved collections (D87) ─────────────────────────────────────────────────
// A saved collection (a.k.a. playlist) is a GROUP the app creates for the user
// — the same node primitive a community, a DM, and a group chat are — with
// `kind: 'saved'` on its `web10-social-group-identity` face and the platform
// tag `web10-social-saved`. A SAVED POST is a doc in the app-named `saved`
// service that `ref_value`s the target post's `doc_id` (a pointer, not a copy).
// Posts, videos, and shorts are all one `posts` doc (shorts.md), so one save
// covers all three.
//
// Privacy (the load-bearing part): publicness is a role grant to a principal
// class (D58), not a flag. A collection's membership IS the privacy boundary:
//   private (the default) = owner row only → a non-owner's content read 403s (I3)
//   public                = owner row + an `anyone` reader row → anyone can read
// Flipping public/private adds/removes the `anyone` reader row — the same
// `addGroupMember`/`removeGroupMember` call that makes a profile public.
//
// Zero node surface (D60): no new table, endpoint, column, or contract. This
// module is a client-side composition of groups + the identity face + a
// `ref_value` link.

const LOG = (...args: unknown[]) => console.log('[social:saved]', ...args);

// The app-named service a saved post lives in (D60 — the node stores
// {service, body} opaquely). A saved post is a tiny doc: { post_id, note? }
// whose `ref_value` is the target post's doc_id (the join).
const SAVED_SERVICE = 'saved';

// The platform tag that marks a group as a saved collection (D78 surface
// disjointness — the Saved tab selects its groups by this tag, so collections
// never leak into the Groups / Messages surfaces).
const SAVED_TAG = 'web10-social-saved';

// The collection's role set. `owner` (the creator) has full control; `reader`
// is the reserved read-grant role granted to the `anyone` principal when the
// collection is public (the D58 publicness-is-a-role-grant idiom, the same
// role name the community / followers groups use for their public read grant).
const SAVED_ROLES = [
  {
    name: 'owner',
    permissions: {
      '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'],
      group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
    },
  },
  {
    name: 'reader',
    permissions: { saved: ['readAll'], 'web10-social-group-identity': ['readAll'] },
  },
];

/** A collection's visibility (the app's intent; the node's membership rows enforce it). */
export type CollectionVisibility = 'private' | 'public';

/** The owner's username — the token's username (the collection belongs to the caller). */
function ownerUsername(): string {
  const token = getV3Client().readToken();
  if (!token) throw new Error('not authenticated');
  return token.username;
}

/**
 * The deterministic group_id for a saved collection: the `saved-`-prefixed
 * slug namespaced under the owner (`{provider}/groups/users/{owner}/saved-{slug}`).
 * The `saved-` prefix keeps it from colliding with a community or chat the user
 * names "Saved". The pretty name lives in the face; the slug is the identity.
 */
export function collectionGroupId(owner: string, slug: string, provider?: string): string {
  const p = provider || getV3Client().readToken()?.provider || 'web10.app';
  return `${p}/groups/users/${owner}/saved-${slug}`;
}

/** A saved collection (the card on the profile's Saved tab). */
export interface CollectionRecord {
  groupId: string;
  name: string;
  visibility: CollectionVisibility;
  coverRef?: string;
  itemCount: number;
  /** The collection's slug (the group_id's last segment, `saved-` stripped). */
  slug: string;
}

/** A saved post (a `saved` doc) — the pointer + the resolved target post. */
export interface SavedPost {
  /** The saved doc's own id (delete this to remove the save). */
  _id?: string;
  /** The target post's doc_id (the `ref_value`). */
  postId: string;
  /** The owner's optional note ("why I saved this"). */
  note?: string;
  /** When the save was made (the saved doc's created_at). */
  savedAt: string;
  /** The resolved target post, or null when it can no longer be read (dead ref). */
  post: PostRecord | null;
  /** True when the target post could not be resolved (deleted / no longer readable). */
  unavailable: boolean;
}

/** A collection's face + its saved posts + the resolved media map. */
export interface CollectionContents {
  face: GroupIdentity;
  posts: SavedPost[];
  /** doc_id → MediaRecord, for the resolved posts' media_refs. */
  mediaMap: Record<string, MediaRecord>;
}

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a saved collection. Creates the group (invite_only, owner-only,
 * `kind:'saved'` face, the `web10-social-saved` tag), writes the face, and —
 * when `visibility === 'public'` — adds the `anyone` reader row. Returns the
 * group_id.
 */
export async function createCollection(
  name: string,
  opts: { visibility?: CollectionVisibility; slug?: string } = {},
): Promise<string> {
  const w = getV3Client();
  const owner = ownerUsername();
  const visibility: CollectionVisibility = opts.visibility ?? 'private';
  const slug = opts.slug || slugify(name);
  LOG('createCollection — start', { name, slug, visibility, owner });

  const members: { member_key: string; role: string }[] = [
    { member_key: `web10.app/users/${owner}`, role: 'owner' },
  ];
  if (visibility === 'public') {
    members.push({ member_key: 'anyone', role: 'reader' });
  }

  const res = await w.createGroup(
    `saved-${slug}`,
    'invite_only',
    SAVED_ROLES,
    members,
    { discoverable: false, tags: [SAVED_TAG] },
  );
  const groupId = res.group_id;
  LOG('createCollection — created', groupId);

  await writeGroupIdentity(groupId, {
    name,
    kind: 'saved',
    visibility,
  });
  LOG('createCollection — face written', groupId);
  return groupId;
}

// ── List ─────────────────────────────────────────────────────────────────────

/**
 * Get the current user's saved collections (the Saved tab's cards). Selects by
 * the platform tag (D78 — one server-side read, I3-scoped to the user's
 * memberships), then reads each group's face + item count.
 */
export async function getMyCollections(): Promise<CollectionRecord[]> {
  const w = getV3Client();
  const groups = await getMyGroups({ tags: [SAVED_TAG] });
  LOG('getMyCollections —', groups.length, 'collections (by tag)');

  const records = await Promise.all(
    groups.map(async (g) => {
      const face = await readGroupIdentity(g.group_id);
      const itemCount = await countSaved(g.group_id);
      const slug = (g.group_id.split('/').pop() || '').replace(/^saved-/, '');
      return {
        groupId: g.group_id,
        name: face.name || slug,
        visibility: (face.visibility as CollectionVisibility) || 'private',
        coverRef: face.avatar_ref,
        itemCount,
        slug,
      } satisfies CollectionRecord;
    }),
  );
  LOG('getMyCollections — resolved', records.length, 'collections');
  return records;
}

/** The number of saved posts in a collection (the card's "N items"). */
async function countSaved(groupId: string): Promise<number> {
  const w = getV3Client();
  try {
    const docs = await w.read(SAVED_SERVICE, { groups: [groupId], limit: 1000 });
    return docs.length;
  } catch (e) {
    // A read failure degrades to 0 (the card shows "0 items") — never fail the list.
    LOG('countSaved — failed (degrading to 0)', groupId, (e as Error)?.message);
    return 0;
  }
}

// ── Read a collection ────────────────────────────────────────────────────────

/**
 * Read a collection's contents: its face + its saved posts (each resolved to
 * the full target post + media). A non-owner reading a PRIVATE collection 403s
 * (I3) — the read throws, the caller surfaces the "not found / no access"
 * state. A dead ref (a post that can no longer be read) degrades to an
 * `unavailable` entry, never failing the whole read.
 */
export async function readCollection(groupId: string): Promise<CollectionContents> {
  const w = getV3Client();
  LOG('readCollection — start', groupId);

  const [face, savedDocs] = await Promise.all([
    readGroupIdentity(groupId),
    w.read(SAVED_SERVICE, { groups: [groupId], limit: 1000 }),
  ]);

  // Newest save first (the saved doc's created_at).
  const ordered = [...savedDocs].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const posts: SavedPost[] = [];
  const mediaRefs: (string | ResolvedMediaRef)[] = [];
  for (const doc of ordered) {
    const body = (doc.body || {}) as Record<string, unknown>;
    const postId = doc.ref_value || (body.post_id as string) || '';
    const savedAt = doc.created_at || '';
    // Resolve the target post (its own read gate applies — a private post from
    // someone else the reader can't read degrades, never leaks).
    const post = postId ? await readPostById(postId) : null;
    if (post) {
      for (const ref of post.media_refs || []) mediaRefs.push(ref);
    }
    posts.push({
      _id: doc.doc_id,
      postId,
      note: (body.note as string) || undefined,
      savedAt,
      post,
      unavailable: !post,
    });
  }

  // Batch-resolve the resolved posts' media (the profile wall's resolve path).
  const mediaMap: Record<string, MediaRecord> = {};
  if (mediaRefs.length) {
    try {
      const media = await resolveMediaRefs(mediaRefs);
      for (const m of media) if (m._id) mediaMap[m._id] = m;
    } catch (e) {
      LOG('readCollection — media resolve failed (degrading)', (e as Error)?.message);
    }
  }

  LOG('readCollection — got', posts.length, 'saved posts,', mediaMap.length, 'media');
  return { face, posts, mediaMap };
}

// ── Save / remove a post ─────────────────────────────────────────────────────

/**
 * Save a post into a collection. A no-op when the post is already in the
 * collection (the self-heal idiom — one save per (collection, post)). Returns
 * true when a new save was written, false when it was already saved.
 */
export async function savePostToCollection(
  groupId: string,
  postId: string,
  note?: string,
): Promise<boolean> {
  const w = getV3Client();
  if (!postId) throw new Error('cannot save a post without an id');
  LOG('savePostToCollection — start', { groupId, postId });

  const existing = await findSavedDoc(groupId, postId);
  if (existing) {
    LOG('savePostToCollection — already saved, no-op', postId);
    return false;
  }
  const body: Record<string, unknown> = { post_id: postId };
  if (note) body.note = note;
  await w.create(SAVED_SERVICE, body, { groups: [groupId], ref_value: postId });
  LOG('savePostToCollection — saved', postId);
  return true;
}

/**
 * Remove a post from a collection (delete the `saved` doc). A no-op when the
 * post is not in the collection.
 */
export async function removePostFromCollection(groupId: string, postId: string): Promise<void> {
  const w = getV3Client();
  LOG('removePostFromCollection — start', { groupId, postId });
  const existing = await findSavedDoc(groupId, postId);
  if (!existing) {
    LOG('removePostFromCollection — not saved, no-op', postId);
    return;
  }
  await w.delete(existing.doc_id);
  LOG('removePostFromCollection — removed', postId);
}

/** Find the `saved` doc in a collection whose `ref_value` is `postId`, or null. */
async function findSavedDoc(groupId: string, postId: string) {
  const w = getV3Client();
  const docs = await w.read(SAVED_SERVICE, { groups: [groupId], limit: 1000 });
  return docs.find((d) => d.ref_value === postId || (d.body as Record<string, unknown>)?.post_id === postId) || null;
}

// ── Visibility / rename / delete ─────────────────────────────────────────────

/**
 * Set a collection's visibility. `public` adds the `anyone` reader row (anyone
 * can read the contents); `private` removes it (owner-only). Also updates the
 * face's `visibility` field (the app's intent).
 */
export async function setCollectionVisibility(
  groupId: string,
  visibility: CollectionVisibility,
): Promise<void> {
  const w = getV3Client();
  LOG('setCollectionVisibility — start', groupId, visibility);

  const members = await w.getGroupMembers(groupId);
  const hasAnyone = members.some((m) => m.member_key === 'anyone');
  if (visibility === 'public' && !hasAnyone) {
    await addGroupMember(groupId, 'anyone', 'reader');
  } else if (visibility === 'private' && hasAnyone) {
    await removeGroupMember(groupId, 'anyone');
  }

  // Update the face's visibility field (read the current face, set the field).
  const face = await readGroupIdentity(groupId);
  await writeGroupIdentity(groupId, { ...face, visibility });
  LOG('setCollectionVisibility — done', groupId, visibility);
}

/** Rename a collection (update the face's `name`). */
export async function renameCollection(groupId: string, name: string): Promise<void> {
  const face = await readGroupIdentity(groupId);
  await writeGroupIdentity(groupId, { ...face, name });
  LOG('renameCollection — done', groupId, name);
}

/** Delete a collection (owner only — the group's `deleteGroup` op). */
export async function deleteCollection(groupId: string): Promise<void> {
  await deleteGroup(groupId);
  LOG('deleteCollection — done', groupId);
}

/**
 * The set of post doc_ids the reader has saved into a collection (the "I saved
 * this" fill for the Save affordance). A failure degrades to an empty set.
 */
export async function readSavedPostIds(groupId: string): Promise<Set<string>> {
  const w = getV3Client();
  const ids = new Set<string>();
  try {
    const docs = await w.read(SAVED_SERVICE, { groups: [groupId], limit: 1000 });
    for (const d of docs) {
      const id = d.ref_value || (d.body as Record<string, unknown>)?.post_id;
      if (id) ids.add(String(id));
    }
  } catch (e) {
    LOG('readSavedPostIds — failed (degrading to empty)', (e as Error)?.message);
  }
  return ids;
}
