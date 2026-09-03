import { getV3Client, readTokenCookie, type V3Group, type V3Document } from './v3';
import { extractUsername } from './types';
import { API_HOST, API_ORIGIN } from '../lib/origins';

const LOG = (...args: unknown[]) => console.log('[social:groups]', ...args);

// ── Group helpers ────────────────────────────────────────────────────────────
// v3 groups are the core primitive. Every social pattern (follows, discover,
// close friends, DMs, communities) is a group with different join policies
// and roles.

const DISCOVER_GROUP = 'web10.app/groups/web10/discover';

/**
 * The provider that mints this node's group IDs. The API derives a created
 * group's ID from the token's `provider` claim (`{provider}/groups/users/
 * {creator}/{slug}`), so the client must use the same provider to address a
 * group. The token's provider is the source of truth (it is exactly what the
 * API embeds); `API_HOST` is the fallback when no token is loaded yet (the
 * two always agree — the token's provider is the API's own hostname).
 */
function currentProvider(): string {
  try {
    const token = getV3Client().readToken();
    if (token?.provider) return token.provider;
  } catch {
    // No token yet — fall through to the API host.
  }
  return API_HOST;
}

/**
 * Get the followers group ID for a user.
 *
 * The deterministic ID the API derives for a user's followers group:
 * `{provider}/groups/users/{username}/followers`. The `provider` is the node's
 * (the token's provider), NOT a hardcoded host — followers groups are
 * user-created groups, so they live under the provider, unlike the well-known
 * discover board (`web10.app/groups/web10/discover`).
 */
export function followersGroupId(username: string, provider?: string): string {
  const p = provider || currentProvider();
  return `${p}/groups/users/${username}/followers`;
}

/**
 * Get the close-friends group ID for a user.
 *
 * Same derivation as the followers group (a user-created group under the
 * token's provider): `{provider}/groups/users/{username}/close-friends`.
 */
export function closeFriendsGroupId(username: string, provider?: string): string {
  const p = provider || currentProvider();
  return `${p}/groups/users/${username}/close-friends`;
}

/**
 * Get the DM group ID for two users (deterministic, sorted).
 */
export function dmGroupId(a: string, b: string): string {
  const [first, second] = [a, b].sort();
  return `web10.app/groups/${first}/dm-${second}`;
}

// ── Role definitions ─────────────────────────────────────────────────────────
// Each group contract declares its roles. The API assigns 'member' on open
// joins and on initial members without an explicit role (groups.py) — every
// role set below defines a 'member' role, and initial members always carry
// an explicit role.

const FOLLOWER_ROLES = [
  {
    name: 'owner',
    permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], 'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  },
  {
    name: 'member',
    permissions: { 'posts': ['readAll'] },
  },
];

const CLOSE_FRIENDS_ROLES = [
  {
    name: 'owner',
    permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], 'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  },
  {
    name: 'member',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
];

const COMMUNITY_ROLES = [
  {
    name: 'owner',
    permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], 'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  },
  {
    name: 'moderator',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll'], 'group': ['assignRoles', 'revokeRoles'] },
  },
  {
    name: 'page-curator',
    permissions: { 'web10-social-group-identity': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
  {
    name: 'member',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
];

const DM_ROLES = [
  {
    name: 'member',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
];

// ── Ensure groups ────────────────────────────────────────────────────────────

/**
 * Ensure the discover group exists. It's a system group, auto-joined on signup.
 * Returns the group ID (no-op if it exists).
 */
export async function ensureDiscover(): Promise<string> {
  // The discover group is a system group — it should always exist.
  // If it doesn't, the API will create it on first join.
  const w = getV3Client();
  try {
    await w.joinGroup(DISCOVER_GROUP);
  } catch {
    // Already a member — non-fatal
  }
  return DISCOVER_GROUP;
}

/**
 * Ensure the current user's followers group exists.
 * Open join policy — anyone can follow instantly.
 *
 * The group is created under the name `followers` (the API embeds the creator
 * in the derived ID: `{provider}/groups/users/{creator}/followers`), so the
 * result matches `followersGroupId(username)`. The owner's member_key is the
 * bare username — the same key format the API uses for joins and discover
 * auto-enrollment — so the owner is found by the membership checks the read
 * path runs.
 *
 * HEAL: a group created by the pre-3.25.1 code has a phantom member key
 * (`web10.app/users/{username}`) that the membership checks never match — the
 * group exists but its owner is NOT a member, so every group-scoped read of
 * it 403s (the profile screen's "nothing persists" state on real nodes).
 * getGroup doesn't require membership, so "the group exists" is not "I can
 * read it": after confirming existence, check membership via getMyGroups and
 * join if missing (open policy; join is idempotent — duplicate member rows
 * dedupe in the ReplacingMergeTree).
 */
export async function ensureFollowers(username: string, provider?: string): Promise<string> {
  const w = getV3Client();
  const groupId = followersGroupId(username, provider);
  try {
    await w.getGroup(groupId);
  } catch {
    // Group doesn't exist — create it (the creator is the owner member)
    await w.createGroup(
      'followers',
      'open',
      FOLLOWER_ROLES,
      [{ member_key: username, role: 'owner' }],
    );
    return groupId;
  }
  // Group exists — make sure the user is actually a member of it.
  const myGroups = await w.getMyGroups();
  if (!myGroups.some((g) => g.group_id === groupId)) {
    console.log('[groups] ensureFollowers — group exists but user is not a member; joining:', groupId);
    await w.joinGroup(groupId);
  }
  return groupId;
}

/**
 * Ensure the current user's close-friends group exists.
 * Request join policy — requires approval.
 */
export async function ensureCloseFriends(username: string): Promise<string> {
  const w = getV3Client();
  const groupId = closeFriendsGroupId(username);
  try {
    const group = await w.getGroup(groupId);
    return group.group_id;
  } catch {
    await w.createGroup(
      'close-friends',
      'request',
      CLOSE_FRIENDS_ROLES,
      [{ member_key: username, role: 'owner' }],
    );
    return groupId;
  }
}

/**
 * Ensure a DM group exists between two users.
 * Invite-only, both users are members.
 */
export async function ensureDmGroup(usernameA: string, usernameB: string): Promise<string> {
  const w = getV3Client();
  const groupId = dmGroupId(usernameA, usernameB);
  try {
    const group = await w.getGroup(groupId);
    return group.group_id;
  } catch {
    const [first, second] = [usernameA, usernameB].sort();
    await w.createGroup(
      `${first}/dm-${second}`,
      'invite_only',
      DM_ROLES,
      [
        { member_key: `web10.app/users/${usernameA}`, role: 'member' },
        { member_key: `web10.app/users/${usernameB}`, role: 'member' },
      ],
    );
    return groupId;
  }
}

/**
 * Ensure a community group exists. Creates it if not found.
 */
export async function ensureCommunity(
  name: string,
  joinPolicy: 'open' | 'request' | 'invite_only' = 'request',
  ownerUsername: string,
): Promise<string> {
  const w = getV3Client();
  const groupId = `web10.app/groups/${ownerUsername}/${name}`;
  try {
    const group = await w.getGroup(groupId);
    return group.group_id;
  } catch {
    await w.createGroup(
      name,
      joinPolicy,
      COMMUNITY_ROLES,
      [{ member_key: `web10.app/users/${ownerUsername}`, role: 'owner' }],
    );
    return groupId;
  }
}

// ── Group queries ────────────────────────────────────────────────────────────

/**
 * Get all groups the current user belongs to.
 */
export async function getMyGroups(): Promise<V3Group[]> {
  const w = getV3Client();
  return w.getMyGroups();
}

/**
 * Get groups the current user manages (owner/moderator role).
 */
export async function getGroupsManages(): Promise<V3Group[]> {
  const w = getV3Client();
  return w.getGroupsManages();
}

/**
 * Get feed groups — all groups minus discover.
 */
export async function getFeedGroups(): Promise<string[]> {
  const groups = await getMyGroups();
  const feedGroups = groups
    .filter((g) => g.group_id !== DISCOVER_GROUP)
    .map((g) => g.group_id);
  LOG('getFeedGroups —', groups.length, 'my groups →', feedGroups.length, 'feed groups (minus discover)');
  return feedGroups;
}

/**
 * Get followers groups — groups ending in /followers.
 */
export async function getFollowersGroups(): Promise<string[]> {
  const groups = await getMyGroups();
  return groups
    .filter((g) => g.group_id.endsWith('/followers'))
    .map((g) => g.group_id);
}

/**
 * Get discover group ID.
 */
export function getDiscoverGroupId(): string {
  return DISCOVER_GROUP;
}

// ── Group operations ─────────────────────────────────────────────────────────

/**
 * Join a group (open or request-based).
 */
export async function joinGroup(groupId: string): Promise<void> {
  const w = getV3Client();
  await w.joinGroup(groupId);
}

/**
 * Request to join a group (request/invite-only).
 */
export async function requestJoinGroup(groupId: string): Promise<void> {
  const w = getV3Client();
  await w.requestJoin(groupId);
}

/**
 * Leave a group.
 */
export async function leaveGroup(groupId: string): Promise<void> {
  const w = getV3Client();
  await w.leaveGroup(groupId);
}

/**
 * Get group members.
 */
export async function getGroupMembers(groupId: string) {
  const w = getV3Client();
  return w.getGroupMembers(groupId);
}

/**
 * Invite a member to a group.
 */
export async function inviteMember(groupId: string, memberKey: string, role: string) {
  const w = getV3Client();
  return w.inviteMember(groupId, memberKey, role);
}

/**
 * Accept a group invite.
 */
export async function acceptInvite(groupId: string) {
  const w = getV3Client();
  return w.acceptInvite(groupId);
}

/**
 * Decline a group invite.
 */
export async function declineInvite(groupId: string) {
  const w = getV3Client();
  return w.declineInvite(groupId);
}

/**
 * Get pending join requests for a group.
 */
export async function getJoinRequests(groupId: string) {
  const w = getV3Client();
  return w.getJoinRequests(groupId);
}

/**
 * Approve a join request.
 */
export async function approveJoinRequest(groupId: string, requesterKey: string) {
  const w = getV3Client();
  return w.approveJoinRequest(groupId, requesterKey);
}

/**
 * Deny a join request.
 */
export async function denyJoinRequest(groupId: string, requesterKey: string) {
  const w = getV3Client();
  return w.denyJoinRequest(groupId, requesterKey);
}

/**
 * Block a user in a group.
 */
export async function blockUserInGroup(blockedKey: string, groupId: string) {
  const w = getV3Client();
  return w.blockUserInGroup(blockedKey, groupId);
}

/**
 * Unblock a user in a group.
 */
export async function unblockUserInGroup(blockedKey: string, groupId: string) {
  const w = getV3Client();
  return w.unblockUserInGroup(blockedKey, groupId);
}

/**
 * Set sharing toggle for a group.
 */
export async function setSharing(groupId: string, enabled: boolean) {
  const w = getV3Client();
  return w.setSharing(groupId, enabled);
}

// ── Blocking ─────────────────────────────────────────────────────────────────

/**
 * Block a user globally.
 */
export async function blockUser(blockedKey: string) {
  const w = getV3Client();
  return w.blockUser(blockedKey);
}

/**
 * Unblock a user globally.
 */
export async function unblockUser(blockedKey: string) {
  const w = getV3Client();
  return w.unblockUser(blockedKey);
}

// ── The group directory + detail (D53) ────────────────────────────────────────
// The node's public group store: `GET /v3/groups/directory` (anon, the minimal
// list of discoverable groups) and `GET /v3/groups/detail?group_id=` (the
// flexible, principal-based read — metadata always, posts only for members,
// only a non-existent group 404s). These are public GET endpoints (the SDK's
// POST /v3/<action> pattern doesn't cover them), so they're fetched directly
// here — the data module keeps its API, the seam stays inside this file.

/** A row from `GET /v3/groups/directory` — the minimal canonical view.
 *  D60: the directory does NOT return tags (they are app data in the
 *  identity service) — the field is optional for forward-compat. */
export interface GroupDirectoryEntry {
  group_id: string;
  name: string;
  owner: string;
  slug: string;
  join_policy: string;
  member_count: number;
  tags?: string[];
  permission_summary: string;
}

/** The group detail (D53 unlisted-model) from `GET /v3/groups/detail`. */
export interface GroupDetail {
  group_id: string;
  name: string;
  owner: string;
  slug: string;
  join_policy: string;
  discoverable: boolean;
  member_count: number;
  roles: Record<string, unknown>[];
  permission_summary: string;
  is_member: boolean;
  posts_state: 'ok' | 'join_to_view';
  posts: V3Document[];
}

/** The group's face (D60: documents in an app-named service, not a table). */
export interface GroupIdentity {
  name?: string;
  description?: string;
  banner_ref?: string;
  avatar_ref?: string;
  website?: string;
  tags?: string[];
}

/**
 * Read the public group directory (discoverable groups, anon).
 */
export async function readGroupDirectory(
  limit = 50,
  offset = 0,
): Promise<GroupDirectoryEntry[]> {
  LOG('readGroupDirectory — start', { limit, offset });
  const res = await fetch(
    `${API_ORIGIN}/v3/groups/directory?limit=${limit}&offset=${offset}`,
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (!res.ok) {
    LOG('readGroupDirectory — failed', res.status);
    throw new Error(`Group directory read failed: ${res.status}`);
  }
  const data = (await res.json()) as { groups: GroupDirectoryEntry[] };
  LOG('readGroupDirectory — got', data.groups.length, 'groups');
  return data.groups;
}

/**
 * Read a group's detail (D53 principal-based read). Reads as the current
 * user when a token is present (posts come back for members), else as anon
 * (metadata only). Only a non-existent group 404s.
 */
export async function readGroupDetail(groupId: string): Promise<GroupDetail> {
  LOG('readGroupDetail — start', groupId);
  const token = readTokenCookie();
  const params = new URLSearchParams({ group_id: groupId });
  if (token) params.set('token', token);
  const res = await fetch(`${API_ORIGIN}/v3/groups/detail?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    LOG('readGroupDetail — failed', res.status, groupId);
    throw new Error(`Group detail read failed: ${res.status}`);
  }
  const data = (await res.json()) as GroupDetail;
  LOG('readGroupDetail — got', data.name, {
    is_member: data.is_member,
    posts_state: data.posts_state,
  });
  return data;
}

const GROUP_IDENTITY_SERVICE = 'web10-social-group-identity';

/**
 * Read a group's face (D60: documents in the `web10-social-group-identity`
 * service). Returns the latest identity doc's body, or an empty object if
 * the group has no face yet.
 */
export async function readGroupIdentity(groupId: string): Promise<GroupIdentity> {
  LOG('readGroupIdentity — start', groupId);
  try {
    const w = getV3Client();
    const docs = await w.read(GROUP_IDENTITY_SERVICE, { groups: [groupId] });
    if (!docs || docs.length === 0) {
      LOG('readGroupIdentity — no identity doc', groupId);
      return {};
    }
    const latest = docs[docs.length - 1];
    const body = (latest.body || {}) as GroupIdentity;
    LOG('readGroupIdentity — got', body.name, { tags: body.tags?.length });
    return body;
  } catch (e) {
    // A 403 (no permission) is expected — the viewer's app contract may not
    // include the identity service. Log without the error message (its "Request
    // failed: 403" text would trip the e2e console-error filter).
    const status = (e as { status?: number })?.status;
    if (status === 403) {
      LOG('readGroupIdentity — no access (expected)');
    } else {
      LOG('readGroupIdentity — unexpected error (non-fatal)', (e as Error)?.message ?? e);
    }
    return {};
  }
}

// ── Community-group filtering ─────────────────────────────────────────────────
// A user's raw group list is mostly infrastructure: their own followers
// group (the follow target), DM groups (the message threads), and the
// node-default discover board. The Groups screen shows the rest — the
// communities the user actually belongs to.

/** The node-default discover board (a board, not a community). */
export function isDiscoverGroup(groupId: string): boolean {
  return groupId === DISCOVER_GROUP;
}

/** A user's own followers group (the follow target, not a community). */
export function isFollowersGroup(groupId: string, username?: string): boolean {
  if (!groupId.endsWith('/followers')) return false;
  if (username && !groupId.includes(`/users/${username}/`)) return false;
  return true;
}

/** A DM group (the message threads live here). */
export function isDmGroup(groupId: string): boolean {
  return /\/dm-[^/]+$/.test(groupId);
}

/** True when the group is infrastructure, not a browsable community. */
export function isInfrastructureGroup(groupId: string, username?: string): boolean {
  return (
    isDiscoverGroup(groupId) ||
    isFollowersGroup(groupId, username) ||
    isDmGroup(groupId)
  );
}

/**
 * The user's community groups — `getMyGroups()` minus the infrastructure
 * (discover board, followers groups, DM groups).
 */
export async function getMyCommunityGroups(): Promise<V3Group[]> {
  const token = getV3Client().readToken();
  const groups = await getMyGroups();
  const visible = groups.filter(
    (g) => !isInfrastructureGroup(g.group_id, token?.username),
  );
  LOG('getMyCommunityGroups —', groups.length, 'total,', visible.length, 'visible');
  return visible;
}

/**
 * A display name for a group: the identity name if present, else the slug
 * (the last path segment of the group_id — `{provider}/groups/users/{owner}/{slug}`).
 */
export function groupDisplayName(groupId: string, name?: string): string {
  if (name) return name;
  const parts = groupId.split('/');
  return parts[parts.length - 1] || groupId;
}