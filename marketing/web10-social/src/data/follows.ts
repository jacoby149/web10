import { getV3Client } from './v3';
import { followersGroupId, getGroupMembers, blockUser, unblockUser } from './groups';
import { extractUsername } from './types';

// ── Follows data layer (v3) ──────────────────────────────────────────────────
// Follows ARE group membership. Following a user = joining their followers group.
// Unfollowing = leaving their followers group. No follows table, no ledger mirror.

/**
 * Follow a user (join their followers group).
 * @param username - the user to follow
 * @param provider - the node provider (defaults to the token's provider)
 */
export async function followUser(username: string, provider?: string): Promise<{ username: string; status: 'active' }> {
  const w = getV3Client();
  await w.joinGroup(followersGroupId(username, provider));
  return { username, status: 'active' };
}

/**
 * Unfollow a user (leave their followers group).
 * @param username - the user to unfollow
 * @param provider - the node provider (defaults to the token's provider)
 */
export async function unfollowUser(username: string, provider?: string): Promise<void> {
  const w = getV3Client();
  await w.leaveGroup(followersGroupId(username, provider));
}

/**
 * Check if the current user follows a given user.
 *
 * Following IS group membership, so the check is: is the user's followers
 * group in the current user's group list? (The API's `groups/get` does not
 * return `my_role`, so a per-group lookup can't answer this — `groups/list`
 * is the membership surface the feed itself reads.)
 */
export async function isFollowing(username: string, provider?: string): Promise<boolean> {
  const w = getV3Client();
  try {
    const groups = await w.getMyGroups();
    return groups.some((g) => g.group_id === followersGroupId(username, provider));
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
export async function readFollow(username: string, _provider?: string): Promise<{ _id?: string; status: 'active' | 'rejected' } | null> {
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
export async function readFollows(): Promise<{ username: string; provider: string; status: 'active' }[]> {
  const w = getV3Client();
  const groups = await w.getMyGroups();
  return groups
    .filter((g) => g.group_id.endsWith('/followers'))
    .map((g) => {
      const parts = g.group_id.split('/');
      const username = parts[parts.length - 2] || '';
      const provider = parts[0] || 'web10';
      return { username, provider, status: 'active' as const };
    });
}

/** @deprecated use readFollows filtered */
export async function readFollowsByStatus(status: string): Promise<{ username: string; provider: string; status: string }[]> {
  const follows = await readFollows();
  return follows.filter((f) => f.status === status);
}

/** @deprecated use blockUser from groups.ts */
export { blockUser, unblockUser } from './groups';

/** @deprecated use unfollowUser */
export async function deleteFollow(username: string, _provider?: string): Promise<void> {
  await unfollowUser(username);
}

/** @deprecated no-op, v3 doesn't use follow notifications */
export async function updateFollowNotify(_username: string, _provider: string, _notify: boolean): Promise<unknown> {
  return {};
}