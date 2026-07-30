import { getWapi } from './wapi';
import { getCachedSchema, createPublicEntry, queryPublicEntries, deletePublicEntry } from './feed';
import type { ReactionRecord, ReactionTargetService } from './types';

// ── Reactions data layer ───────────────────────────────────────────────────
// Phase 5.5: reactions are written both to the legacy `reactions` service
// AND to the public ledger (/public/entries) so the marketing-ui FeedPreview
// can read engagement counts.

/**
 * Build the canonical ledger target: `{author}/{service}/{post_id}`.
 * Falls back to the legacy `{target_service}:{target_id}` if author/service unknown.
 */
export function buildReactionTarget(
  targetId: string,
  postAuthor?: string,
  postService?: string,
): string {
  if (postAuthor && postService) {
    return `${postAuthor}/${postService}/${targetId}`;
  }
  return `posts:${targetId}`;
}

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
export async function createReaction(
  reaction: Omit<ReactionRecord, '_id'>,
  postAuthor?: string,
  postService?: string,
): Promise<ReactionRecord> {
  const wapi = getWapi();
  const record = await wapi.create<ReactionRecord>('reactions', reaction);

  // Also write to the public ledger
  const reactionSchema = getCachedSchema('Reaction');
  if (reactionSchema?._id) {
    createPublicEntry({
      schema_id: reactionSchema._id,
      target: buildReactionTarget(reaction.target_id, postAuthor, postService),
      payload: {
        action: reaction.type === 'like' ? 'like' : 'reaction',
        type: reaction.type,
        target: reaction.target_id,
        author_username: reaction.author_username,
        author_provider: reaction.author_provider,
      },
    }).catch((e) => {
      console.error('ledger mirror failed (reaction create):', e);
    });
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
  postAuthor?: string,
  postService?: string,
): Promise<boolean> {
  const existing = await readReactions(targetService, targetId);
  const mine = existing.find(
    (r) =>
      r.author_username === authorUsername &&
      r.author_provider === authorProvider &&
      r.type === type,
  );

  if (mine?._id) {
    await deleteReaction(mine._id, targetId, postAuthor, postService);
    return false;
  }

  await createReaction({
    target_service: targetService,
    target_id: targetId,
    type,
    created_at: new Date().toISOString(),
    author_username: authorUsername,
    author_provider: authorProvider,
  }, postAuthor, postService);
  return true;
}

/**
 * Delete a reaction by ID.
 * Also removes the corresponding public ledger entry so engagement counts stay accurate.
 */
export async function deleteReaction(
  id: string,
  targetId?: string,
  postAuthor?: string,
  postService?: string,
): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('reactions', { _id: id });

  // Remove the mirrored ledger entry so the engagement count decrements
  const reactionSchema = getCachedSchema('Reaction');
  if (reactionSchema?._id && targetId && postAuthor && postService) {
    const target = buildReactionTarget(targetId, postAuthor, postService);
    const entries = await queryPublicEntries({ schema_id: reactionSchema._id, target });
    const token = wapi.readToken();
    const mine = entries.find(
      (e) =>
        e.author_username === token?.username &&
        e.author_provider === token?.provider,
    );
    if (mine?._id) {
      await deletePublicEntry(mine._id).catch((e) => {
        console.error('ledger mirror failed (reaction delete):', e);
      });
    }
  }
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

/**
 * Record a share/repost in the public ledger so the engagement count increments.
 */
export async function recordRepost(
  targetId: string,
  postAuthor: string,
  postService: string,
): Promise<void> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) return;

  const reactionSchema = getCachedSchema('Reaction');
  if (!reactionSchema?._id) return;

  const target = buildReactionTarget(targetId, postAuthor, postService);
  await createPublicEntry({
    schema_id: reactionSchema._id,
    target,
    payload: {
      action: 'repost',
      type: 'repost',
      target: targetId,
      author_username: token.username,
      author_provider: token.provider,
    },
  }).catch((e) => {
    console.error('ledger mirror failed (repost):', e);
  });
}