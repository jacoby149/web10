import { getV3Client } from './v3';
import { fromV3DocToReaction, type ReactionRecord } from './types';

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
  const targetGroups = groups || ['web10.app/groups/web10/discover'];
  const docs = await w.read('reactions', { groups: targetGroups });
  return docs
    .filter((d) => d.ref_value === actualTargetId)
    .map(fromV3DocToReaction);
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

  const targetGroups = Array.isArray(groupsOrPostAuthor) ? groupsOrPostAuthor : ['web10.app/groups/web10/discover'];
  // ref_value (the target's doc_id) is a top-level create field — the server
  // stores it in the ref_value column, which the ref read + counts key off.
  // Without this the reaction is orphaned (ref_value="" → never found).
  const doc = await w.create('reactions', body, { groups: targetGroups, ref_value: reaction.target_id });
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