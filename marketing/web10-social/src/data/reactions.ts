import { getV3Client } from './v3';
import { getDiscoverGroupId } from './groups';
import { fromV3DocToReaction, type ReactionRecord } from './types';
import { sendNotification } from './notifications';
import { readPostById } from './posts';

// ── Reactions data layer (v3) ────────────────────────────────────────────────
// Reactions are documents in the `reactions` collection with `ref_value`
// pointing to the target post or comment. No public ledger mirror needed.

/**
 * Read all reactions for a target (post or comment).
 * @param targetServiceOrId - target service ('posts'|'comments') or targetId string (v2 compat)
 * @param targetId - target ID (only used if first arg is targetService)
 * @param groups - optional groups
 */
export async function readReactions(
  targetServiceOrId: 'posts' | 'comments' | string,
  targetId?: string,
  groups?: string[],
): Promise<ReactionRecord[]> {
  const actualTargetId = targetId || targetServiceOrId;
  const w = getV3Client();
  const targetGroups = groups || [getDiscoverGroupId()];
  // The ref filter (the flexible read, phase 1): the server returns only the
  // reactions whose ref_value = targetId (via the safe-query engine), not all
  // reactions in the group. No client-side filter needed.
  const docs = await w.read('reactions', { groups: targetGroups, ref: actualTargetId });
  return docs.map(fromV3DocToReaction);
}

/**
 * Create a new reaction.
 * @param reaction - reaction body
 * @param groupsOrPostAuthor - groups array or postAuthor string (v2 compat)
 * @param postService - v2 compat, ignored
 */
export async function createReaction(
  reaction: Omit<ReactionRecord, '_id'>,
  groupsOrPostAuthor?: string[] | string,
  postService?: string,
): Promise<ReactionRecord> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const body: Record<string, unknown> = {
    type: reaction.type,
    target_service: reaction.target_service,
    target_id: reaction.target_id,
    author_username: token.username,
    author_provider: token.provider,
  };

  const targetGroups = Array.isArray(groupsOrPostAuthor) ? groupsOrPostAuthor : [getDiscoverGroupId()];
  // ref_value (the target's doc_id) is a top-level create field — the server
  // stores it in the ref_value column, which the ref read + counts key off.
  // Without this the reaction is orphaned (ref_value="" → never found).
  const doc = await w.create('reactions', body, { groups: targetGroups, ref_value: reaction.target_id });
  // The write side (D69): nudge the post author (best-effort, fire-and-forget —
  // a resolve failure never affects the reaction).
  if (reaction.target_service === 'posts') {
    readPostById(reaction.target_id)
      .then((post) => {
        if (post?.author_username) {
          sendNotification(
            { username: post.author_username, provider: post.author_provider || token.provider },
            { type: 'reaction', from: token.username, ref_doc_id: reaction.target_id },
          );
        }
      })
      .catch(() => {});
  }
  return fromV3DocToReaction(doc);
}

/**
 * Toggle a reaction: add if not present, remove if already reacted.
 * Returns true if added, false if removed.
 * Signature supports both v2 (targetService, targetId, type, authorUsername, authorProvider, postAuthor, postService)
 * and v3 (targetId, type, authorUsername, authorProvider, groups)
 */
export async function toggleReaction(
  targetServiceOrId: 'posts' | 'comments' | string,
  targetIdOrType?: string,
  typeOrAuthorUsername?: string,
  authorProviderOrAuthorProvider?: string,
  postAuthor?: string,
  postService?: string,
  groups?: string[],
): Promise<boolean> {
  // Detect v2 signature (7 args, first is targetService)
  if (targetServiceOrId === 'posts' || targetServiceOrId === 'comments') {
    // v2: (targetService, targetId, type, authorUsername, authorProvider, postAuthor, postService)
    const actualTargetId = targetIdOrType!;
    const actualType = typeOrAuthorUsername!;
    const actualAuthorUsername = authorProviderOrAuthorProvider!;
    const actualAuthorProvider = postAuthor || '';
    const existing = await readReactions(targetServiceOrId, actualTargetId);
    const mine = existing.find(
      (r) =>
        r.author_username === actualAuthorUsername &&
        r.author_provider === actualAuthorProvider &&
        r.type === actualType,
    );
    if (mine?._id) {
      await deleteReaction(mine._id);
      return false;
    }
    await createReaction({
      target_service: targetServiceOrId,
      target_id: actualTargetId,
      type: actualType,
      created_at: new Date().toISOString(),
      author_username: actualAuthorUsername,
      author_provider: actualAuthorProvider,
    });
    return true;
  }
  // v3: (targetId, type, authorUsername, authorProvider, groups)
  const actualTargetId = targetServiceOrId;
  const actualType = targetIdOrType!;
  const actualAuthorUsername = typeOrAuthorUsername!;
  const actualAuthorProvider = authorProviderOrAuthorProvider!;
  const existing = await readReactions(actualTargetId, undefined, groups);
  const mine = existing.find(
    (r) =>
      r.author_username === actualAuthorUsername &&
      r.author_provider === actualAuthorProvider &&
      r.type === actualType,
  );
  if (mine?._id) {
    await deleteReaction(mine._id);
    return false;
  }
  await createReaction({
    target_service: 'posts',
    target_id: actualTargetId,
    type: actualType,
    created_at: new Date().toISOString(),
    author_username: actualAuthorUsername,
    author_provider: actualAuthorProvider,
  });
  return true;
}

/**
 * Delete a reaction by ID.
 */
export async function deleteReaction(id: string): Promise<void> {
  const w = getV3Client();
  await w.delete(id);
}

export type ReactionKind = 'like' | 'dislike';

/**
 * Set the user's reaction on a target to exactly `kind` ('like' | 'dislike')
 * or clear it (null). Enforces the one-reaction-per-user invariant (like XOR
 * dislike, post-actions.md): reads the user's existing reaction on the target,
 * deletes whichever of the two is present, and creates the new one when
 * kind !== null.
 *
 * `toggleReaction` stays for the single-type case — it only toggles the type
 * you pass and would let a user hold a like AND a dislike. This composes
 * readReactions + deleteReaction + createReaction so the mutual exclusion is
 * a property of the data layer, not a per-surface discipline.
 *
 * Returns the reaction the user holds after the call (kind, or null).
 */
export async function setReaction(
  targetId: string,
  kind: ReactionKind | null,
  groups?: string[],
): Promise<ReactionKind | null> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const existing = await readReactions(targetId, undefined, groups);
  // v3 ownership is by username alone: a reaction's author_key is the bare
  // username (the node's provider is implicit), so author_provider is the
  // v2 fallback ('web10') and never equals the token's real provider —
  // comparing it made "mine" unfindable, so every tap CREATED a new
  // reaction instead of toggling (the 28-likes bug; same class as the
  // feed's isOwnPost fix, 3.79.3).
  //
  // filter, not find: the 28-likes bug stacked N reaction docs for the same
  // user on the same target. find() would see the first one and leave the
  // rest; filter() sees all of them so the self-heal below can collapse the
  // duplicates to one.
  const mine = existing.filter(
    (r) =>
      r.author_username === token.username &&
      (r.type === 'like' || r.type === 'dislike'),
  );

  // Self-heal: collapse duplicate reactions for the same user + type down to
  // the single newest doc. The 28-likes bug (pre-3.87.2) stacked N docs per
  // tap; the fix prevents new stacking, but docs already in the DB survive
  // until the user next interacts with the post. This is that interaction:
  // the moment setReaction runs, the duplicates are gone. Idempotent — with
  // zero or one doc per type the filter is a no-op.
  const byType = new Map<ReactionKind, typeof mine>();
  for (const r of mine) {
    const k = r.type as ReactionKind;
    const arr = byType.get(k) || [];
    arr.push(r);
    byType.set(k, arr);
  }
  const toDelete: string[] = [];
  for (const arr of byType.values()) {
    if (arr.length > 1) {
      arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      for (let i = 1; i < arr.length; i++) {
        if (arr[i]._id) toDelete.push(arr[i]._id);
      }
    }
  }
  if (toDelete.length > 0) {
    await Promise.all(toDelete.map((id) => deleteReaction(id)));
  }

  const primary = mine[0];
  if (primary && primary.type !== kind) {
    await deleteReaction(primary._id!);
  }
  if (kind && (!primary || primary.type !== kind)) {
    await createReaction({
      target_service: 'posts',
      target_id: targetId,
      type: kind,
      created_at: new Date().toISOString(),
      author_username: token.username,
      author_provider: token.provider,
    }, groups);
  }
  return kind;
}

/**
 * Toggle the user's reaction of `kind` on a target: if the user already holds
 * `kind`, clear it (null); otherwise set it (swapping out the other kind —
 * like XOR dislike, post-actions.md). This is the tap handler's call: the
 * component says "the user tapped the heart" / "the user tapped the thumb",
 * and the data layer resolves it against the user's current reaction.
 *
 * Returns the reaction the user holds after the call (kind, or null).
 */
export async function toggleReactionKind(
  targetId: string,
  kind: ReactionKind,
  groups?: string[],
): Promise<ReactionKind | null> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const existing = await readReactions(targetId, undefined, groups);
  // filter, not find — same self-heal rationale as setReaction: with
  // duplicates the first match might be the wrong type, and the toggle
  // decision (clear vs set) must see the full picture.
  const mine = existing.filter(
    (r) =>
      r.author_username === token.username &&
      (r.type === 'like' || r.type === 'dislike'),
  );

  const next: ReactionKind | null = mine.length > 0 && mine[0].type === kind ? null : kind;
  return setReaction(targetId, next, groups);
}

/**
 * Toggle the user's repost on a target: if the user has already reposted,
 * clear it; otherwise create it. Returns true if the user now has the post
 * reposted, false if it was cleared.
 *
 * Independent of like / dislike (reposts.md): a user can like AND repost the
 * same post, so this looks only at `type === 'repost'` docs — never the
 * like/dislike pair. That is why it is a separate primitive from
 * `toggleReactionKind` (which only considers `type === 'like' | 'dislike'`
 * when deciding "is this mine?").
 *
 * The "mine" match is username-alone (the v3 ownership rule, the 3.87.2
 * class): a reaction's author_key is the bare username and author_provider is
 * the v2 fallback, so matching on provider would make "mine" unfindable and
 * every tap would stack a new repost doc.
 *
 * Self-heal: collapse stacked duplicate reposts (a pre-fix artifact) to the
 * single newest doc — a filter, not a find, so the toggle decision sees the
 * full picture. Idempotent with zero or one doc.
 *
 * No author nudge: a repost is a silent amplification signal (a "X reposted
 * your post" notification is an open follow-up — see reposts.md). The doc is
 * written directly, not through `createReaction` (which fires the D69
 * reaction nudge).
 */
export async function toggleRepost(
  targetId: string,
  groups?: string[],
): Promise<boolean> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const existing = await readReactions(targetId, undefined, groups);
  const mine = existing.filter(
    (r) => r.author_username === token.username && r.type === 'repost',
  );

  // Self-heal: keep the newest, delete the rest (the 28-likes class).
  if (mine.length > 1) {
    mine.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const toDelete = mine.slice(1).map((r) => r._id).filter((id): id is string => !!id);
    await Promise.all(toDelete.map((id) => deleteReaction(id)));
  }

  if (mine.length > 0) {
    await deleteReaction(mine[0]._id!);
    return false;
  }

  const targetGroups = groups || [getDiscoverGroupId()];
  await w.create(
    'reactions',
    {
      type: 'repost',
      target_service: 'posts',
      target_id: targetId,
      author_username: token.username,
      author_provider: token.provider,
    },
    { groups: targetGroups, ref_value: targetId },
  );
  return true;
}

/**
 * Count reactions on a target.
 * @param targetServiceOrId - target service or targetId (v2 compat)
 * @param targetId - target ID (v2 compat)
 */
export async function countReactions(
  targetServiceOrId: 'posts' | 'comments' | string,
  targetId?: string,
): Promise<number> {
  const reactions = await readReactions(targetServiceOrId, targetId);
  return reactions.length;
}

/**
 * Get reaction counts grouped by type for a target.
 * @param targetServiceOrId - target service or targetId (v2 compat)
 * @param targetId - target ID (v2 compat)
 */
export async function getReactionCounts(
  targetServiceOrId: 'posts' | 'comments' | string,
  targetId?: string,
): Promise<Record<string, number>> {
  const reactions = await readReactions(targetServiceOrId, targetId);
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.type] = (counts[r.type] || 0) + 1;
  }
  return counts;
}