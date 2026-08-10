import { getV3Client } from './v3';
import { followersGroupId, getGroupMembers, blockUser, unblockUser } from './groups';
import { extractUsername } from './types';

// ── Follows data layer (v3) ──────────────────────────────────────────────────
// Follows ARE group membership. Following a user = joining their followers group.
// Unfollowing = leaving their followers group. No follows table, no ledger mirror.

/**
 * Follow a user (join their followers group).
 */
export async function followUser(username: string): Promise<void> {
  const w = getV3Client();
  await w.joinGroup(followersGroupId(username));
}

/**
 * Unfollow a user (leave their followers group).
 */
export async function unfollowUser(username: string): Promise<void> {
  const w = getV3Client();
  await w.leaveGroup(followersGroupId(username));
}

/**
 * Check if the current user follows a given user.
 */
export async function isFollowing(username: string): Promise<boolean> {
  const w = getV3Client();
  try {
    const group = await w.getGroup(followersGroupId(username));
    return group.my_role !== undefined && group.my_role !== '';
  } catch {
    return false;
  }
}

/**
 * Get the number of followers for a user.
 */
export async function getFollowersCount(username: string): Promise<number> {
  const members = await getGroupMembers(followersGroupId(username));
  return members.length;
}

/**
 * Get the number of users the current user follows.
 */
export async function getFollowingCount(): Promise<number> {
  const w = getV3Client();
  const groups = await w.getMyGroups();
  return groups.filter((g) => g.group_id.endsWith('/followers')).length;
}

/**
 * List followers of a user (member keys).
 */
export async function listFollowers(username: string): Promise<{ username: string; provider: string }[]> {
  const members = await getGroupMembers(followersGroupId(username));
  return members.map((m) => ({
    username: extractUsername(m.member_key),
    provider: m.member_key.split('/')[0] || 'web10',
  }));
}

// ── Backward compat aliases ──────────────────────────────────────────────────

/** @deprecated use isFollowing */
export async function readFollow(username: string, _provider?: string): Promise<{ status: 'active' | 'rejected' } | null> {
  const following = await isFollowing(username);
  return following ? { status: 'active' } : { status: 'rejected' };
}

/** @deprecated use getFollowingCount */
export async function countFollows(): Promise<number> {
  return getFollowingCount();
}

/** @deprecated use getFollowersCount */
export async function countFollowers(username: string, _provider?: string): Promise<number> {
  return getFollowersCount(username);
}

/** @deprecated use getFollowingCount */
export async function countUserFollowing(username: string, _provider?: string): Promise<number> {
  const members = await getGroupMembers(followersGroupId(username));
  return members.filter((m) => m.role === 'member').length;
}

/** @deprecated use getMyGroups filtered for /followers */
export async function readFollows(): Promise<{ username: string; status: 'active' }[]> {
  const w = getV3Client();
  const groups = await w.getMyGroups();
  return groups
    .filter((g) => g.group_id.endsWith('/followers'))
    .map((g) => ({
      username: extractUsername(g.group_id),
      status: 'active' as const,
    }));
}

/** @deprecated use readFollows filtered */
export async function readFollowsByStatus(status: string): Promise<{ username: string; status: string }[]> {
  const follows = await readFollows();
  return follows.filter((f) => f.status === status);
}

/** @deprecated use blockUser from groups.ts */
export { blockUser, unblockUser } from './groups';