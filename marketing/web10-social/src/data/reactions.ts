import { getV3Client } from './v3';
import { fromV3DocToReaction, type ReactionRecord } from './types';

// ── Reactions data layer (v3) ────────────────────────────────────────────────
// Reactions are documents in the `reactions` collection with `ref_value`
// pointing to the target post or comment. No public ledger mirror needed.

/**
 * Read all reactions for a target (post or comment).
 */
export async function readReactions(
  targetId: string,
  groups?: string[],
): Promise<ReactionRecord[]> {
  const w = getV3Client();
  const targetGroups = groups || ['web10.app/groups/web10/discover'];
  const docs = await w.read('reactions', { groups: targetGroups });
  return docs
    .filter((d) => d.ref_value === targetId)
    .map(fromV3DocToReaction);
}

/**
 * Create a new reaction.
 */
export async function createReaction(
  reaction: Omit<ReactionRecord, '_id'>,
  groups?: string[],
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

  const targetGroups = groups || ['web10.app/groups/web10/discover'];
  const doc = await w.create('reactions', body, { groups: targetGroups });
  doc.ref_value = reaction.target_id;
  return fromV3DocToReaction(doc);
}

/**
 * Toggle a reaction: add if not present, remove if already reacted.
 * Returns true if added, false if removed.
 */
export async function toggleReaction(
  targetId: string,
  type: string,
  authorUsername: string,
  authorProvider: string,
  groups?: string[],
): Promise<boolean> {
  const existing = await readReactions(targetId, groups);
  const mine = existing.find(
    (r) =>
      r.author_username === authorUsername &&
      r.author_provider === authorProvider &&
      r.type === type,
  );

  if (mine?._id) {
    await deleteReaction(mine._id);
    return false;
  }

  await createReaction({
    target_service: 'posts',
    target_id: targetId,
    type,
    created_at: new Date().toISOString(),
    author_username: authorUsername,
    author_provider: authorProvider,
  }, groups);
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
 */
export async function countReactions(targetId: string, groups?: string[]): Promise<number> {
  const reactions = await readReactions(targetId, groups);
  return reactions.length;
}

/**
 * Get reaction counts grouped by type for a target.
 */
export async function getReactionCounts(targetId: string, groups?: string[]): Promise<Record<string, number>> {
  const reactions = await readReactions(targetId, groups);
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.type] = (counts[r.type] || 0) + 1;
  }
  return counts;
}