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

/** Delete a reaction by doc_id (the API floor's reaction delete). */
export async function deleteReaction(
  request: APIRequestContext,
  token: string,
  reactionId: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/v3/delete`, {
    data: JSON.stringify({ token, doc_id: reactionId }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`delete reaction failed (${res.status})`);
}

/**
 * Read the reaction docs for a target post by ref_value (the truth read). The
 * same read path the app uses (POST /v3/read with `ref`). Returns the raw docs
 * (doc_id, author_key, body.type) — the truth primitive derives the counts from
 * these.
 */
export async function readReactionsByRef(
  request: APIRequestContext,
  token: string,
  postId: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<{ doc_id: string; author_key: string; body: { type?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'reactions', groups, ref: postId }),
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
