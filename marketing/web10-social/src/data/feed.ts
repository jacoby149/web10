import { getWapi } from './wapi';
import type { InboxRecord, FeedSort } from './types';

// ── Feed data layer ────────────────────────────────────────────────────────
// The feed reads from the `inbox` service (fan-out on write).
// Sort options: newest, oldest, most_reacted.
// "most_reacted" uses aggregate to count reactions per post_id.

/**
 * Read inbox records sorted by the given order.
 * newest = descending delivered_at (chronological, newest first)
 * oldest = ascending delivered_at
 * most_reacted = sorted by reaction count (requires aggregate)
 */
export async function readFeed(sort: FeedSort = 'newest'): Promise<InboxRecord[]> {
  const wapi = getWapi();

  if (sort === 'most_reacted') {
    return readFeedByReactions();
  }

  const direction = sort === 'newest' ? -1 : 1;
  const records = await wapi.read<InboxRecord>('inbox');

  return records.sort((a, b) => {
    const tA = new Date(a.delivered_at).getTime();
    const tB = new Date(b.delivered_at).getTime();
    return (tA - tB) * direction;
  });
}

/**
 * Read feed sorted by reaction count (most reacted first).
 * Uses the aggregate pipeline to count reactions per post_id.
 */
async function readFeedByReactions(): Promise<InboxRecord[]> {
  const wapi = getWapi();
  const records = await wapi.read<InboxRecord>('inbox');

  // Build a map of post_id -> reaction count using aggregate on reactions
  const reactionCounts = await wapi.aggregate<{ _id: string; count: number }>(
    'reactions',
    [
      { $match: { target_service: 'posts' } },
      { $group: { _id: '$target_id', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
  );

  const countMap = new Map<string, number>();
  for (const r of reactionCounts) {
    countMap.set(r._id, r.count);
  }

  return records.sort((a, b) => {
    const countA = countMap.get(a.post_id) || 0;
    const countB = countMap.get(b.post_id) || 0;
    return countB - countA;
  });
}

/**
 * Mark an inbox item as read.
 */
export async function markInboxRead(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.update('inbox', { _id: id }, { $set: { read: true } });
}

/**
 * Count unread inbox items.
 */
export async function countUnread(): Promise<number> {
  const wapi = getWapi();
  const records = await wapi.read<InboxRecord>('inbox', { read: { $ne: true } });
  return records.length;
}