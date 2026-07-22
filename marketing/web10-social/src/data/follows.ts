import { getWapi } from './wapi';
import type { FollowRecord, FollowStatus } from './types';

// ── Follows data layer ──────────────────────────────────────────────────────
// The `follows` service: bidirectional follow graph with status tracking.

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
 */
export async function followUser(username: string, provider: string): Promise<FollowRecord> {
  const wapi = getWapi();
  const existing = await readFollow(username, provider);

  if (existing?._id) {
    return wapi.update<FollowRecord>('follows', { _id: existing._id }, {
      $set: { status: 'active', followed_at: existing.followed_at || new Date().toISOString() },
    });
  }

  return wapi.create<FollowRecord>('follows', {
    username,
    provider,
    status: 'active',
    followed_at: new Date().toISOString(),
    notify: true,
  });
}

/**
 * Unfollow a user. Sets status to 'rejected'.
 */
export async function unfollowUser(username: string, provider: string): Promise<void> {
  const wapi = getWapi();
  const existing = await readFollow(username, provider);
  if (existing?._id) {
    await wapi.update<FollowRecord>('follows', { _id: existing._id }, { $set: { status: 'rejected' } });
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
 * Count active follows.
 */
export async function countFollows(): Promise<number> {
  const wapi = getWapi();
  const all = await wapi.read<FollowRecord>('follows');
  return all.filter((f) => f.status === 'active').length;
}