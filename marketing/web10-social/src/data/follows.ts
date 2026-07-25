import { getWapi } from './wapi';
import { getCachedSchema, createPublicEntry, queryPublicEntries, deletePublicEntry } from './feed';
import type { FollowRecord, FollowStatus } from './types';

// ── Follows data layer ──────────────────────────────────────────────────────
// The `follows` service: bidirectional follow graph with status tracking.
// Per D34: follows also mirror to the public ledger (/public/entries) so
// follower counts can be read without cross-collection access (I3).
// The mirror is unconditional — collection-level terms is the lock.

/**
 * Build a ledger target key for a follow relationship.
 * The target identifies the followed user so we can count followers.
 */
function followTargetKey(username: string, provider: string): string {
  return `follow:${username}@${provider}`;
}

/**
 * Read all follows for the current user (people they follow).
 */
export async function readFollows(): Promise<FollowRecord[]> {
  const wapi = getWapi();
  return wapi.read<FollowRecord>('follows');
}

/**
 * Read follows with a specific status.
 */
export async function readFollowsByStatus(status: FollowStatus): Promise<FollowRecord[]> {
  const wapi = getWapi();
  return wapi.read<FollowRecord>('follows', { status });
}

/**
 * Read a specific follow record by username+provider.
 */
export async function readFollow(username: string, provider: string): Promise<FollowRecord | null> {
  const wapi = getWapi();
  const records = await wapi.read<FollowRecord>('follows', { username, provider });
  return records[0] || null;
}

/**
 * Follow a user. Creates a new follow record with 'active' status.
 * Also mirrors to the public ledger (D34: follows are public discourse).
 */
export async function followUser(username: string, provider: string): Promise<FollowRecord> {
  const wapi = getWapi();
  const existing = await readFollow(username, provider);
  const token = wapi.readToken();

  if (existing?._id) {
    const record = await wapi.update<FollowRecord>('follows', { _id: existing._id }, {
      $set: { status: 'active', followed_at: existing.followed_at || new Date().toISOString() },
    });

    // Mirror to the public ledger
    const followSchema = getCachedSchema('Follow');
    if (followSchema?._id) {
      createPublicEntry({
        schema_id: followSchema._id,
        target: followTargetKey(username, provider),
        payload: {
          action: 'follow',
          target_username: username,
          target_provider: provider,
          author_username: token?.username,
          author_provider: token?.provider,
        },
      }).catch(() => { /* non-fatal */ });
    }

    return record;
  }

  const record = await wapi.create<FollowRecord>('follows', {
    username,
    provider,
    status: 'active',
    followed_at: new Date().toISOString(),
    notify: true,
  });

  // Mirror to the public ledger
  const followSchema = getCachedSchema('Follow');
  if (followSchema?._id) {
    createPublicEntry({
      schema_id: followSchema._id,
      target: followTargetKey(username, provider),
      payload: {
        action: 'follow',
        target_username: username,
        target_provider: provider,
        author_username: token?.username,
        author_provider: token?.provider,
      },
    }).catch(() => { /* non-fatal */ });
  }

  return record;
}

/**
 * Unfollow a user. Sets status to 'rejected' and removes the
 * public ledger entry so the follower count decrements.
 */
export async function unfollowUser(username: string, provider: string): Promise<void> {
  const wapi = getWapi();
  const existing = await readFollow(username, provider);
  if (existing?._id) {
    await wapi.update<FollowRecord>('follows', { _id: existing._id }, { $set: { status: 'rejected' } });

    // Remove the public ledger entry
    const target = followTargetKey(username, provider);
    const token = wapi.readToken();
    const entries = await queryPublicEntries({ target });
    const matching = entries.filter(
      (e) =>
        e.payload &&
        (e.payload as Record<string, unknown>).action === 'follow' &&
        (e.payload as Record<string, unknown>).author_username === token?.username,
    );
    for (const entry of matching) {
      if (entry._id) {
        await deletePublicEntry(entry._id);
      }
    }
  }
}

/**
 * Block a user. Sets status to 'blocked'.
 */
export async function blockUser(username: string, provider: string): Promise<void> {
  const wapi = getWapi();
  const existing = await readFollow(username, provider);
  if (existing?._id) {
    await wapi.update<FollowRecord>('follows', { _id: existing._id }, { $set: { status: 'blocked' } });
  } else {
    await wapi.create<FollowRecord>('follows', {
      username,
      provider,
      status: 'blocked',
      followed_at: new Date().toISOString(),
      notify: false,
    });
  }
}

/**
 * Delete a follow record entirely.
 */
export async function deleteFollow(username: string, provider: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('follows', { username, provider });
}

/**
 * Update follow notification preference.
 */
export async function updateFollowNotify(username: string, provider: string, notify: boolean): Promise<FollowRecord> {
  const wapi = getWapi();
  const existing = await readFollow(username, provider);
  if (!existing?._id) throw new Error('follow not found');
  return wapi.update<FollowRecord>('follows', { _id: existing._id }, { $set: { notify } });
}

/**
 * Count active follows (people you follow).
 */
export async function countFollows(): Promise<number> {
  const wapi = getWapi();
  const all = await wapi.read<FollowRecord>('follows');
  return all.filter((f) => f.status === 'active').length;
}

/**
 * List all followers of a user by reading the public ledger.
 * Returns the username + provider of each follower (deduped per author).
 * Same ledger query as countFollowers, but returns the full list.
 */
export async function listFollowers(username: string, provider: string): Promise<{ username: string; provider: string }[]> {
  const target = followTargetKey(username, provider);
  const entries = await queryPublicEntries({ target });
  const followers = entries.filter(
    (e) =>
      e.payload &&
      (e.payload as Record<string, unknown>).action === 'follow',
  );
  // Dedupe: a user might have mirrored multiple times; keep unique (username, provider) pairs.
  const seen = new Set<string>();
  const unique: { username: string; provider: string }[] = [];
  for (const e of followers) {
    const author = (e.payload as Record<string, unknown>).author_username as string | undefined;
    const authProvider = (e.payload as Record<string, unknown>).author_provider as string | undefined;
    if (!author || !authProvider) continue;
    const key = `${author}@${authProvider}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ username: author, provider: authProvider });
  }
  return unique;
}

/**
 * Count followers of a user by reading the public ledger.
 * Because I3 forbids cross-collection reads, the count comes from
 * ledger entries where payload.action='follow' and target points to
 * the given user.
 */
export async function countFollowers(username: string, provider: string): Promise<number> {
  const target = followTargetKey(username, provider);
  const entries = await queryPublicEntries({ target });
  return entries.filter(
    (e) =>
      e.payload &&
      (e.payload as Record<string, unknown>).action === 'follow',
  ).length;
}