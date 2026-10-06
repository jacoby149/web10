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
import { mediaRefId, type PostRecord, type MediaRecord, type ResolvedMediaRef } from './types';

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

/** The last path segment of a group_id (its slug). */
function groupSlug(groupId: string): string {
  return (groupId.split('/').pop() || '').replace(/^saved-/, '');
}

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
  /** The cover media's doc_id (the face's `avatar_ref`) — the collection's thumbnail. */
  coverRef?: string;
  /** The cover media's displayable URL (resolved from `coverRef`); absent when the cover can't be resolved (the card falls back to the brand-tinted placeholder). */
  coverUrl?: string;
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
  /**
   * The item's position in the collection (0-based, the owner's curated order —
   * "playlist" order). Set by `reorderCollection`; absent until the owner has
   * reordered, in which case the collection renders newest-save-first.
   */
  position?: number;
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
    {
      discoverable: false,
      tags: [SAVED_TAG],
      // D80: the by-user enumeration's visibility policy. A public collection
      // is enumerable by-user (a visitor's profile can list it); a private one
      // is not (it never surfaces on someone else's profile).
      membership_visibility: visibility === 'public' ? 'public' : 'hidden',
    },
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
    groups.map(async (g): Promise<CollectionRecord | null> => {
      const face = await readGroupIdentity(g.group_id);
      // A group collection (a group's playlist) is not a personal collection —
      // it surfaces on the group's Saved tab, not the manager's personal one.
      if (face.owner_group) return null;
      const itemCount = await countSaved(g.group_id);
      const slug = groupSlug(g.group_id);
      return {
        groupId: g.group_id,
        name: face.name || slug,
        visibility: (face.visibility as CollectionVisibility) || 'private',
        coverRef: face.avatar_ref,
        itemCount,
        slug,
      };
    }),
  );
  const out = records.filter((r): r is CollectionRecord => r !== null);
  LOG('getMyCollections — resolved', out.length, 'collections');
  return resolveCoverUrls(out);
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

/**
 * Resolve a set of collection cover media doc_ids to displayable URLs (ONE
 * batched media read for the whole grid — the profile wall's resolve idiom). A
 * cover that can't be resolved keeps no `coverUrl` (the card falls back to the
 * brand-tinted placeholder). Never throws.
 */
async function resolveCoverUrls(records: CollectionRecord[]): Promise<CollectionRecord[]> {
  const refs = [...new Set(records.map((r) => r.coverRef).filter((r): r is string => !!r))];
  if (!refs.length) return records;
  let urlByRef: Record<string, string> = {};
  try {
    const media = await resolveMediaRefs(refs);
    for (const m of media) if (m._id && m.url) urlByRef[m._id] = m.url;
  } catch (e) {
    LOG('resolveCoverUrls — failed (degrading to placeholders)', (e as Error)?.message);
  }
  return records.map((r) => (r.coverRef && urlByRef[r.coverRef] ? { ...r, coverUrl: urlByRef[r.coverRef] } : r));
}

/**
 * Read a user's PUBLIC saved collections (the visitor's profile Saved tab).
 * The node's D80 `by-user` read (tag `web10-social-saved`) returns only groups
 * with `membership_visibility == 'public'` — a private collection never
 * surfaces, so a visitor can never enumerate what someone saved privately.
 * Each returned group is resolved to its face (name) + item count. A per-
 * collection failure degrades that card (never the list).
 */
export async function readUserPublicCollections(username: string, provider?: string): Promise<CollectionRecord[]> {
  const w = getV3Client();
  const memberKey = provider ? `${provider}/${username}` : username;
  LOG('readUserPublicCollections — start', memberKey);
  const page = await w.byUserGroups(memberKey, { tag: SAVED_TAG, limit: 100 });
  LOG('readUserPublicCollections —', page.groups.length, 'public collections (by-user)');

  const records = await Promise.all(
    page.groups.map(async (g): Promise<CollectionRecord | null> => {
      const slug = groupSlug(g.group_id);
      let face: GroupIdentity = {};
      try {
        face = await readGroupIdentity(g.group_id);
      } catch (e) {
        // A face-read failure degrades the card to the slug (never the list).
        LOG('readUserPublicCollections — face read failed (degrading)', g.group_id, (e as Error)?.message);
      }
      // A group collection (a group's playlist) is not a personal collection —
      // it surfaces on the group's Saved tab, not the user's profile.
      if (face.owner_group) return null;
      const itemCount = await countSaved(g.group_id);
      return {
        groupId: g.group_id,
        name: face.name || slug,
        visibility: 'public' as CollectionVisibility,
        coverRef: face.avatar_ref,
        itemCount,
        slug,
      };
    }),
  );
  const out = records.filter((r): r is CollectionRecord => r !== null);
  LOG('readUserPublicCollections — resolved', out.length, 'collections');
  return resolveCoverUrls(out);
}

// ── Group collections (a group's playlists — a group is a profile) ──────────
// A group collection is the same primitive as a personal collection (a
// `kind:'saved'` group, the `web10-social-saved` tag, a `saved` doc per saved
// post, the D58 `anyone` reader row for publicness) — the one difference is
// WHO OWNS IT: the owner member is the GROUP (its group_id, used as a
// member_key), not a user. The face carries `owner_group: <group_id>` — the
// classifier that separates a group collection from a personal one (an
// ownership/render hint only, never a security boundary). The by-group read is
// the D80 by-user read pointed at the group's group_id (the group is its
// collections' owner member); the manager's read (public + private) is the tag
// read filtered to `owner_group === <group_id>`. Zero node surface (D60).

/**
 * Create a collection for a group (the group's manager curating a playlist for
 * the group's audience). The owner member is the group's group_id (so the D80
 * by-user read enumerates it on the group's page); the manager is also an
 * owner member (the node's `ensure_creator_owner`) — that's what lets them
 * manage it. The face carries `owner_group` so it's excluded from the manager's
 * personal Saved tab. The slug embeds the group's slug so two groups the
 * manager runs never collide. Returns the group_id.
 */
export async function createGroupCollection(
  groupId: string,
  name: string,
  opts: { visibility?: CollectionVisibility; slug?: string } = {},
): Promise<string> {
  const w = getV3Client();
  const visibility: CollectionVisibility = opts.visibility ?? 'private';
  const slug = opts.slug || slugify(name);
  const groupSlug = (groupId.split('/').pop() || '');
  LOG('createGroupCollection — start', { groupId, name, slug, visibility });

  const members: { member_key: string; role: string }[] = [
    // The group is the collection's owner (the by-group read enumerates it).
    { member_key: groupId, role: 'owner' },
  ];
  if (visibility === 'public') {
    members.push({ member_key: 'anyone', role: 'reader' });
  }

  const res = await w.createGroup(
    `saved-${groupSlug}-${slug}`,
    'invite_only',
    SAVED_ROLES,
    members,
    {
      discoverable: false,
      tags: [SAVED_TAG],
      // D80: the by-group enumeration's visibility policy (a public collection
      // is enumerable on the group's page; a private one is not).
      membership_visibility: visibility === 'public' ? 'public' : 'hidden',
    },
  );
  const collectionId = res.group_id;
  LOG('createGroupCollection — created', collectionId);

  await writeGroupIdentity(collectionId, {
    name,
    kind: 'saved',
    visibility,
    owner_group: groupId,
  });
  LOG('createGroupCollection — face written', collectionId);
  return collectionId;
}

/**
 * Read a group's collections (the manager's read — public AND private). The
 * manager is an owner member of the group's collections, so they're in the
 * manager's group list; select by the tag + filter to `owner_group === groupId`
 * (a personal collection the manager owns has no `owner_group`, so it's
 * excluded). Each is resolved to its face + item count.
 */
export async function readGroupCollections(groupId: string): Promise<CollectionRecord[]> {
  const groups = await getMyGroups({ tags: [SAVED_TAG] });
  LOG('readGroupCollections —', groups.length, 'tagged collections (by tag)');

  const records = await Promise.all(
    groups.map(async (g): Promise<CollectionRecord | null> => {
      const face = await readGroupIdentity(g.group_id);
      // Only this group's collections (the `owner_group` classifier).
      if (face.owner_group !== groupId) return null;
      const itemCount = await countSaved(g.group_id);
      const slug = groupSlug(g.group_id);
      return {
        groupId: g.group_id,
        name: face.name || slug,
        visibility: (face.visibility as CollectionVisibility) || 'private',
        coverRef: face.avatar_ref,
        itemCount,
        slug,
      };
    }),
  );
  const out = records.filter((r): r is CollectionRecord => r !== null);
  LOG('readGroupCollections — resolved', out.length, 'collections');
  return resolveCoverUrls(out);
}

/**
 * Read a group's PUBLIC collections (the visitor's read — the group page's
 * Saved tab for a non-manager). The D80 by-user read pointed at the group's
 * group_id returns only the group's `membership_visibility == 'public'`
 * collections (a private one never surfaces). Filtered to `owner_group ===
 * groupId` (defensive — the group is only ever an owner member of its own
 * collections). A face-read failure degrades the card to the slug (never the
 * list).
 */
export async function readGroupPublicCollections(groupId: string): Promise<CollectionRecord[]> {
  const w = getV3Client();
  LOG('readGroupPublicCollections — start', groupId);
  const page = await w.byUserGroups(groupId, { tag: SAVED_TAG, limit: 100 });
  LOG('readGroupPublicCollections —', page.groups.length, 'public collections (by-group)');

  const records = await Promise.all(
    page.groups.map(async (g): Promise<CollectionRecord | null> => {
      const slug = groupSlug(g.group_id);
      let face: GroupIdentity = {};
      try {
        face = await readGroupIdentity(g.group_id);
      } catch (e) {
        LOG('readGroupPublicCollections — face read failed (degrading)', g.group_id, (e as Error)?.message);
      }
      // Only this group's collections (the `owner_group` classifier).
      if (face.owner_group !== groupId) return null;
      const itemCount = await countSaved(g.group_id);
      return {
        groupId: g.group_id,
        name: face.name || slug,
        visibility: 'public' as CollectionVisibility,
        coverRef: face.avatar_ref,
        itemCount,
        slug,
      };
    }),
  );
  const out = records.filter((r): r is CollectionRecord => r !== null);
  LOG('readGroupPublicCollections — resolved', out.length, 'collections');
  return resolveCoverUrls(out);
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

  // The owner's curated order (playlist order) wins when any item carries a
  // `position` (set by `reorderCollection`); otherwise newest-save-first (the
  // saved doc's created_at). A mixed state (some positioned, some not) keeps
  // the positioned items first, in position order, then the rest newest-first.
  const anyPositioned = savedDocs.some((d) => (d.body as Record<string, unknown>)?.position != null);
  const ordered = [...savedDocs].sort((a, b) => {
    const pa = (a.body as Record<string, unknown>)?.position;
    const pb = (b.body as Record<string, unknown>)?.position;
    if (anyPositioned && pa != null && pb != null) return Number(pa) - Number(pb);
    if (anyPositioned && pa != null) return -1;
    if (anyPositioned && pb != null) return 1;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

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
      position: body.position != null ? Number(body.position) : undefined,
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
  // The collection's thumbnail defaults to the first thing saved into it (the
  // owner can later pin any item via "Set as cover"). Best-effort — it never
  // fails the save.
  await ensureCollectionCover(groupId, postId);
  return true;
}

/**
 * Auto-set a collection's cover to a saved post's first media (best-effort) —
 * the collection's thumbnail defaults to the first thing saved into it. A
 * no-op when the collection already has a cover (the owner's explicit choice
 * wins) or the post has no media (a text-only post can't be a cover). Never
 * throws — a cover failure degrades to the brand-tinted placeholder.
 */
async function ensureCollectionCover(groupId: string, postId: string): Promise<void> {
  try {
    const face = await readGroupIdentity(groupId);
    if (face.avatar_ref) return; // an explicit cover already — don't clobber it
    const post = await readPostById(postId);
    const firstRef = post?.media_refs?.[0];
    if (!firstRef) return; // a text-only post can't be a cover
    const mediaId = mediaRefId(firstRef);
    if (!mediaId) return;
    await writeGroupIdentity(groupId, { ...face, avatar_ref: mediaId });
    LOG('ensureCollectionCover — set cover', groupId, mediaId);
  } catch (e) {
    LOG('ensureCollectionCover — failed (degrading)', groupId, (e as Error)?.message);
  }
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
 * face's `visibility` field (the app's intent) AND the group's D80
 * `membership_visibility` — the by-user enumeration only returns
 * `membership_visibility == 'public'` groups, so a public collection is
 * enumerable on a visitor's profile and a private one is absent.
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

  // D80: the by-user enumeration's visibility policy follows the face — a
  // public collection is enumerable by-user, a private one is not.
  await w.updateGroup(groupId, {
    membership_visibility: visibility === 'public' ? 'public' : 'hidden',
  });
  LOG('setCollectionVisibility — done', groupId, visibility);
}

/** Rename a collection (update the face's `name`). */
export async function renameCollection(groupId: string, name: string): Promise<void> {
  const face = await readGroupIdentity(groupId);
  await writeGroupIdentity(groupId, { ...face, name });
  LOG('renameCollection — done', groupId, name);
}

/**
 * Set a collection's cover (its thumbnail) to a saved post's first media (the
 * owner's explicit "Set as cover" choice). Writes the face's `avatar_ref` to
 * the post's first media doc_id. A no-op when the post has no media.
 */
export async function setCollectionCover(groupId: string, postId: string): Promise<void> {
  const post = await readPostById(postId);
  const firstRef = post?.media_refs?.[0];
  if (!firstRef) throw new Error('that post has no media to use as a cover');
  const mediaId = mediaRefId(firstRef);
  if (!mediaId) throw new Error('that post has no media to use as a cover');
  const face = await readGroupIdentity(groupId);
  await writeGroupIdentity(groupId, { ...face, avatar_ref: mediaId });
  LOG('setCollectionCover — done', groupId, mediaId);
}

/**
 * Reorder a collection's items (the owner's "playlist" order). Rewrites each
 * `saved` doc's `body.position` (0-based, in the new order) so `readCollection`
 * renders in the owner's chosen sequence. The `update` merges the body, so the
 * doc's `post_id` / `note` are preserved. A best-effort no-op when a doc is
 * already gone (a removed item).
 */
export async function reorderCollection(groupId: string, orderedPostIds: string[]): Promise<void> {
  const w = getV3Client();
  LOG('reorderCollection — start', groupId, orderedPostIds.length, 'items');
  const docs = await w.read(SAVED_SERVICE, { groups: [groupId], limit: 1000 });
  const byPostId = new Map<string, string>(); // postId → saved doc_id
  for (const d of docs) {
    const pid = d.ref_value || (d.body as Record<string, unknown>)?.post_id;
    if (pid) byPostId.set(String(pid), d.doc_id);
  }
  await Promise.all(
    orderedPostIds.map(async (postId, index) => {
      const docId = byPostId.get(postId);
      if (!docId) return; // already removed — skip
      await w.update(docId, { position: index });
    }),
  );
  LOG('reorderCollection — done', groupId);
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
