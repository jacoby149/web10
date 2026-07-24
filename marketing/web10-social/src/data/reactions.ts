import { getWapi } from './wapi';
import { getCachedSchema, createPublicEntry } from './feed';
import type { ReactionRecord, ReactionTargetService } from './types';

// ── Reactions data layer ───────────────────────────────────────────────────
// Phase 5.5: reactions are written both to the legacy `reactions` service
// AND to the public ledger (/public/entries) so the marketing-ui FeedPreview
// can read engagement counts.

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
 * Phase 5.5: also writes to the public ledger if the Reaction schema is registered.
 */
export async function createReaction(reaction: Omit<ReactionRecord, '_id'>): Promise<ReactionRecord> {
  const wapi = getWapi();
  const record = await wapi.create<ReactionRecord>('reactions', reaction);

  // Also write to the public ledger
  const reactionSchema = getCachedSchema('Reaction');
  if (reactionSchema?._id) {
    createPublicEntry({
      schema_id: reactionSchema._id,
      target: `${reaction.target_service}:${reaction.target_id}`,
      payload: {
        action: reaction.type === 'like' ? 'like' : 'reaction',
        type: reaction.type,
        target: reaction.target_id,
        author_username: reaction.author_username,
        author_provider: reaction.author_provider,
      },
    }).catch(() => { /* non-fatal */ });
  }

  return record;
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