import { getWapi } from './wapi';
import type { ReactionRecord, ReactionTargetService } from './types';

// ── Reactions data layer ───────────────────────────────────────────────────

/**
 * Read all reactions for a target (post or comment).
 */
export async function readReactions(
  targetService: ReactionTargetService,
  targetId: string,
): Promise<ReactionRecord[]> {
  const wapi = getWapi();
  return wapi.read<ReactionRecord>('reactions', {
    target_service: targetService,
    target_id: targetId,
  });
}

/**
 * Create a new reaction.
 */
export async function createReaction(reaction: Omit<ReactionRecord, '_id'>): Promise<ReactionRecord> {
  const wapi = getWapi();
  return wapi.create<ReactionRecord>('reactions', reaction);
}

/**
 * Toggle a reaction: add if not present, remove if already reacted.
 * Returns true if added, false if removed.
 */
export async function toggleReaction(
  targetService: ReactionTargetService,
  targetId: string,
  type: string,
  authorUsername: string,
  authorProvider: string,
): Promise<boolean> {
  const existing = await readReactions(targetService, targetId);
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
    target_service: targetService,
    target_id: targetId,
    type,
    created_at: new Date().toISOString(),
    author_username: authorUsername,
    author_provider: authorProvider,
  });
  return true;
}

/**
 * Delete a reaction by ID.
 */
export async function deleteReaction(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('reactions', { _id: id });
}

/**
 * Count reactions on a target.
 */
export async function countReactions(
  targetService: ReactionTargetService,
  targetId: string,
): Promise<number> {
  const wapi = getWapi();
  const records = await wapi.read<ReactionRecord>('reactions', {
    target_service: targetService,
    target_id: targetId,
  });
  return records.length;
}

/**
 * Get reaction counts grouped by type for a target.
 */
export async function getReactionCounts(
  targetService: ReactionTargetService,
  targetId: string,
): Promise<Record<string, number>> {
  const wapi = getWapi();
  const results = await wapi.aggregate<{ _id: string; count: number }>(
    'reactions',
    [
      { $match: { target_service: targetService, target_id: targetId } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ],
  );
  const counts: Record<string, number> = {};
  for (const r of results) {
    counts[r._id] = r.count;
  }
  return counts;
}