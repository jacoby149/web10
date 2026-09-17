import { type APIRequestContext, type Page } from '@playwright/test';
import { v3Post, v3Login, v3Signup } from '../../../v3-helpers';

/**
 * The gauntlet shared fixtures (gauntlets/README.md, the code space). Every
 * gauntlet spec imports these instead of copy-pasting its own — the drift the
 * per-spec helpers were accumulating (16 copies of signupAndLogin, 17 of
 * setTokenCookie) is the same disease the gauntlet space exists to kill.
 *
 * The constants mirror the e2e stack's vhosts (api.localhost / social.localhost
 * behind the nginx proxy, E2E_HTTP_PORT). The app contract grants the full
 * social surface (posts + reactions + comments + profile + settings + media) —
 * the D73 feed is a query over all four, so a posts-only contract 403s the
 * whole query and the feed renders empty.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
export const API_BASE = `http://api.localhost${p}`;
export const SOCIAL_BASE = `http://social.localhost${p}`;
// The origin that makes the API calls — the API matches the request Origin
// header against the app contract's allowed_origin exactly.
export const SOCIAL_ORIGIN = `http://social.localhost${p}`;
export const PROVIDER = 'api.localhost';
export const SERVICE = 'posts';
// The node-default discover group — a well-known constant, NOT provider-derived.
// Reactions are written here (the default reaction group); the feed excludes it.
export const DISCOVER_GROUP_ID = `${PROVIDER}/groups/web10/discover`;
export const PASSWORD = 'TestPass123!';

// A followers group: the creator (owner) posts; followers (member) are read-only.
export const FOLLOWERS_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: [SERVICE], permissions: ['readAll'] },
];

export const uniqueUser = (prefix: string) =>
  `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Signup + login, returning the username + JWT token. */
export async function signupAndLogin(
  request: APIRequestContext,
  prefix: string,
): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, PASSWORD, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, PASSWORD);
  return { username, token };
}

/**
 * The full social app contract (posts + reactions + comments + profile +
 * settings + media). The D73 feed query touches all four of posts/reactions/
 * comments/profile, so a partial contract 403s the whole query.
 */
export async function addAppContract(
  request: APIRequestContext,
  token: string,
  allowedOrigin: string = SOCIAL_ORIGIN,
): Promise<void> {
  await v3Post(request, `${API_BASE}/v3/app-contracts/add`, {
    token,
    allowed_origin: allowedOrigin,
    permissions: {
      posts: ['create', 'readAll', 'updateOwn', 'deleteOwn'],
      profile: ['readAll', 'create', 'updateOwn'],
      settings: ['readAll', 'create', 'updateOwn'],
      reactions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
      comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
      media: ['readAll'],
      public_media: ['readAll'],
    },
  });
}

/**
 * Create the creator's followers group (open join — following is an instant
 * join). The API derives the deterministic ID `{provider}/groups/users/
 * {creator}/followers` from the name `followers` + the token's creator.
 */
export async function createFollowersGroup(
  request: APIRequestContext,
  token: string,
  creator: string,
): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name: 'followers',
    join_policy: 'open',
    roles: FOLLOWERS_ROLES,
    members: [{ member_key: creator, role: 'owner' }],
  });
  if (!res.ok()) throw new Error(`create followers group failed (${res.status})`);
  return (await res.json()).group_id as string;
}

/** Post to a group, returning the post's doc_id. */
export async function postToGroup(
  request: APIRequestContext,
  token: string,
  groupId: string,
  text: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token, service: SERVICE,
      body: { text, date: new Date().toISOString() },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create post failed (${res.status})`);
  return (await res.json()).doc_id as string;
}

/**
 * Create a reaction (the API floor's reaction write). Mirrors the client's
 * `createReaction` (src/data/reactions.ts): service `reactions`, body carries
 * the type + target, `ref_value` is the target post's doc_id, and the group is
 * the discover group (the default reaction group — where reactions are written).
 */
export async function createReaction(
  request: APIRequestContext,
  token: string,
  postId: string,
  type: 'like' | 'dislike',
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: 'reactions',
      body: { type, target_service: 'posts', target_id: postId },
      groups,
      ref_value: postId,
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create reaction failed (${res.status})`);
  return (await res.json()).doc_id as string;
}

/**
 * Delete a reaction by doc_id (the API floor's reaction delete). Retries on
 * 404 (the "doc not committed yet" case — ClickHouse is eventually consistent,
 * so a delete racing a parallel create can 404 before the create lands). A
 * persistent 404 (the doc is genuinely gone) throws after the retry window.
 */
export async function deleteReaction(
  request: APIRequestContext,
  token: string,
  reactionId: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request.post(`${API_BASE}/v3/delete`, {
      data: JSON.stringify({ token, doc_id: reactionId }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
    if (res.ok()) return;
    if (res.status() !== 404 || Date.now() >= deadline) {
      throw new Error(`delete reaction failed (${res.status})`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * Read the reaction docs for a target post by ref_value (the truth read). The
 * same read path the app uses (POST /v3/read with `ref`). Returns the raw docs
 * (doc_id, author_key, body.type) — the truth primitive derives the counts from
 * these. The limit is 1000 (not the default 50) so the scale tests (the like
 * storm, 100 reactions) see every doc, not a capped 50.
 */
export async function readReactionsByRef(
  request: APIRequestContext,
  token: string,
  postId: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<{ doc_id: string; author_key: string; body: { type?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'reactions', groups, ref: postId, limit: 1000 }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read reactions failed (${res.status})`);
  return (await res.json()) as { doc_id: string; author_key: string; body: { type?: string } }[];
}

/** Set the token cookie on a browser context (pre-auth, no login popup). */
export function setTokenCookie(context: any, domain: string, token: string): Promise<void> {
  return context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

/** Capture console logs matching a prefix (the diagnostic dump's app side). */
export function captureConsoleLogs(page: Page, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes(prefix)) logs.push(text);
  });
  return logs;
}

// ── Group ID helpers (the deterministic IDs the API derives) ────────────────

/** The user's followers group ID (`{provider}/groups/users/{username}/followers`). */
export const followersGroupId = (username: string, provider: string = PROVIDER) =>
  `${provider}/groups/users/${username}/followers`;

/** The user's close-friends group ID. */
export const closeFriendsGroupId = (username: string, provider: string = PROVIDER) =>
  `${provider}/groups/users/${username}/close-friends`;

/** The DM group NAME between two users (deterministic, sorted). The app finds
 *  the group by this name suffix (the creator-embedded group_id is not
 *  derivable by the recipient). Member keys are bare usernames. */
export const dmGroupName = (a: string, b: string): string =>
  `dm-${[a, b].sort().join('-')}`;

/**
 * Create the DM group between two users (the app-exact shape from dms.ts):
 * name `dm-{a}-{b}`, invite_only, both as bare-username members. Returns the
 * group_id (the API derives it, creator-embedded).
 */
export async function createDmGroup(
  request: APIRequestContext,
  token: string,
  userA: string,
  userB: string,
): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name: dmGroupName(userA, userB),
    join_policy: 'invite_only',
    roles: [
      { name: 'member', services: [SERVICE, 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    ],
    members: [
      { member_key: userA, role: 'member' },
      { member_key: userB, role: 'member' },
    ],
  });
  if (!res.ok()) throw new Error(`create DM group failed (${res.status})`);
  return (await res.json()).group_id as string;
}

// ── Comments ─────────────────────────────────────────────────────────────────

/** Create a comment on a post (service `comments`, `ref_value` = the post). */
export async function createComment(
  request: APIRequestContext,
  token: string,
  postId: string,
  text: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<string> {
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: 'comments',
      body: { text, target_service: 'posts', target_id: postId },
      groups,
      ref_value: postId,
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create comment failed (${res.status})`);
  return (await res.json()).doc_id as string;
}

/** Read the comment docs for a post by ref_value (the truth read). */
export async function readCommentsByRef(
  request: APIRequestContext,
  token: string,
  postId: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<{ doc_id: string; author_key: string; body: { text?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'comments', groups, ref: postId }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read comments failed (${res.status})`);
  return (await res.json()) as { doc_id: string; author_key: string; body: { text?: string } }[];
}

// ── Posts ───────────────────────────────────────────────────────────────────

/** Read a single post by doc_id (the truth read). Returns null if not found. */
export async function readPostById(
  request: APIRequestContext,
  token: string,
  postId: string,
): Promise<{ doc_id: string; author_key: string; body: Record<string, unknown> } | null> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, doc_id: postId }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) return null;
  return (await res.json()) as { doc_id: string; author_key: string; body: Record<string, unknown> };
}

/** Update a post by doc_id (the body is merged). */
export async function updatePost(
  request: APIRequestContext,
  token: string,
  postId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await request.post(`${API_BASE}/v3/update`, {
    data: JSON.stringify({ token, doc_id: postId, body }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`update post failed (${res.status})`);
}

/** Delete a post by doc_id (tombstone). */
export async function deletePost(
  request: APIRequestContext,
  token: string,
  postId: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/v3/delete`, {
    data: JSON.stringify({ token, doc_id: postId }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`delete post failed (${res.status})`);
}

// ── Feed ─────────────────────────────────────────────────────────────────────

/**
 * The app's exact feed read (readFeed in src/data/feed.ts): the user's groups
 * minus discover, read as ONE multi-group posts read. Returns the post texts.
 * This is the read the follow/unfollow delta is asserted against.
 */
export async function appFeedRead(request: APIRequestContext, token: string): Promise<string[]> {
  const groupsRes = await v3Post(request, `${API_BASE}/v3/groups/list`, { token });
  if (!groupsRes.ok()) throw new Error(`groups/list failed (${groupsRes.status})`);
  const groups = (await groupsRes.json()) as { group_id: string }[];
  const feedGroups = groups.filter((g) => g.group_id !== DISCOVER_GROUP_ID).map((g) => g.group_id);
  if (!feedGroups.length) return [];
  const readRes = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: feedGroups }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!readRes.ok()) throw new Error(`feed read failed (${readRes.status})`);
  const docs = (await readRes.json()) as { body: { text?: string } }[];
  return docs.map((d) => d.body.text).filter((t): t is string => t !== undefined);
}

// ── Discover ─────────────────────────────────────────────────────────────────

/** Read the discover board (the public board, the discover group). */
export async function readDiscoverBoard(
  request: APIRequestContext,
  token: string,
): Promise<{ doc_id: string; body: { text?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [DISCOVER_GROUP_ID] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read discover board failed (${res.status})`);
  return (await res.json()) as { doc_id: string; body: { text?: string } }[];
}

// ── Groups ──────────────────────────────────────────────────────────────────

/** Create a group, returning the group_id. */
export async function createGroup(
  request: APIRequestContext,
  token: string,
  name: string,
  joinPolicy: string,
  roles: Record<string, unknown>[],
  members: { member_key: string; role: string }[],
): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token, name, join_policy: joinPolicy, roles, members,
  });
  if (!res.ok()) throw new Error(`create group failed (${res.status})`);
  return (await res.json()).group_id as string;
}

/** Read the group's members (the truth read). */
export async function readGroupMembers(
  request: APIRequestContext,
  token: string,
  groupId: string,
): Promise<{ member_key: string; role: string }[]> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/members/list`, { token, group_id: groupId });
  if (!res.ok()) throw new Error(`members/list failed (${res.status})`);
  return (await res.json()) as { member_key: string; role: string }[];
}

/** Join a group (open policy → instant; request policy → pending). */
export async function joinGroup(request: APIRequestContext, token: string, groupId: string): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/join`, { token, group_id: groupId });
  if (!res.ok()) throw new Error(`join group failed (${res.status})`);
}

/** Leave a group. */
export async function leaveGroup(request: APIRequestContext, token: string, groupId: string): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/leave`, { token, group_id: groupId });
  if (!res.ok()) throw new Error(`leave group failed (${res.status})`);
}

/** Remove a member from a group (owner/moderator). */
export async function removeGroupMember(
  request: APIRequestContext,
  token: string,
  groupId: string,
  memberKey: string,
): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/members/remove`, {
    token, group_id: groupId, member_key: memberKey,
  });
  if (!res.ok()) throw new Error(`members/remove failed (${res.status})`);
}

/** Block a user in a group (the group-scoped blacklist). */
export async function blockUserInGroup(
  request: APIRequestContext,
  token: string,
  groupId: string,
  blockedKey: string,
): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/block`, {
    token, group_id: groupId, blocked_key: blockedKey,
  });
  if (!res.ok()) throw new Error(`block failed (${res.status})`);
}

/** Unblock a user in a group. */
export async function unblockUserInGroup(
  request: APIRequestContext,
  token: string,
  groupId: string,
  blockedKey: string,
): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/unblock`, {
    token, group_id: groupId, blocked_key: blockedKey,
  });
  if (!res.ok()) throw new Error(`unblock failed (${res.status})`);
}

/** Set the sharing toggle for a group (pause/resume sharing). */
export async function setGroupSharing(
  request: APIRequestContext,
  token: string,
  groupId: string,
  enabled: boolean,
): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/sharing/set`, {
    token, group_id: groupId, enabled,
  });
  if (!res.ok()) throw new Error(`sharing/set failed (${res.status})`);
}

/** Hide a post from a group's discover (moderator/node admin). */
export async function hidePostInGroup(
  request: APIRequestContext,
  token: string,
  groupId: string,
  docId: string,
): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/hide`, {
    token, group_id: groupId, doc_id: docId,
  });
  if (!res.ok()) throw new Error(`hide failed (${res.status})`);
}

/** Restore a previously hidden post to a group's discover. */
export async function unhidePostInGroup(
  request: APIRequestContext,
  token: string,
  groupId: string,
  docId: string,
): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/unhide`, {
    token, group_id: groupId, doc_id: docId,
  });
  if (!res.ok()) throw new Error(`unhide failed (${res.status})`);
}

/** Read a group's posts (the group feed). */
export async function readGroupPosts(
  request: APIRequestContext,
  token: string,
  groupId: string,
): Promise<{ doc_id: string; author_key: string; body: { text?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [groupId] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read group posts failed (${res.status})`);
  return (await res.json()) as { doc_id: string; author_key: string; body: { text?: string } }[];
}

// ── Messages (DMs) ───────────────────────────────────────────────────────────
// (createDmGroup + dmGroupName live above, in the Group ID helpers section —
// the app-exact shape from dms.ts: name `dm-{a}-{b}`, bare-username members.)

/** Read the messages in a DM group (the CRUD source of truth). */
export async function readDmMessages(
  request: APIRequestContext,
  token: string,
  dmGroupId: string,
): Promise<{ doc_id: string; author_key: string; body: { text?: string; message?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [dmGroupId] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read DM messages failed (${res.status})`);
  return (await res.json()) as { doc_id: string; author_key: string; body: { text?: string; message?: string } }[];
}

// ── Profile ──────────────────────────────────────────────────────────────────

/** Read the current user's profile (POST /v3/profile). */
export async function readProfile(
  request: APIRequestContext,
  token: string,
): Promise<{ doc_id?: string; body: Record<string, unknown> } | null> {
  const res = await v3Post(request, `${API_BASE}/v3/profile`, { token });
  if (!res.ok()) return null;
  return (await res.json()) as { doc_id?: string; body: Record<string, unknown> };
}

/** Save the current user's profile (create the profile doc in the followers group). */
export async function saveProfile(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
  username: string,
): Promise<void> {
  // The profile doc is attached to the user's followers group (the home group).
  const res = await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({ token, service: 'profile', body, groups: [followersGroupId(username)] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`save profile failed (${res.status})`);
}

/** Read a user's own posts (the followers + close-friends groups). */
export async function readMyPosts(
  request: APIRequestContext,
  token: string,
  username: string,
): Promise<{ doc_id: string; body: { text?: string } }[]> {
  const groups = [followersGroupId(username), closeFriendsGroupId(username)];
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read my posts failed (${res.status})`);
  return (await res.json()) as { doc_id: string; body: { text?: string } }[];
}

/** Read a user's public posts (their followers group). */
export async function readUserPosts(
  request: APIRequestContext,
  token: string,
  username: string,
): Promise<{ doc_id: string; body: { text?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [followersGroupId(username)] }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`read user posts failed (${res.status})`);
  return (await res.json()) as { doc_id: string; body: { text?: string } }[];
}
