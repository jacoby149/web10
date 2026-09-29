// ── moderation.ts — the node-owner content-moderation data layer (D59) ───────
// The node-owner's moderation surface lives in the social app (not the
// authenticator — it's social-related). All the backend is built (D59):
//   - POST /v3/moderation/flags     — the review queue (admin-only)
//   - POST /v3/moderation/auto-hide — add/remove a username from auto_hide_users
//   - POST /config + /config/update — node_config (sensitive_words, toggles)
//   - POST /v3/groups/{hide,unhide} — board-level takedown of one post
// This module is the client seam. It reuses the raw-token + API_ORIGIN fetch
// pattern from ads-catalog.ts (the /am_admin + /config seams) — the admin
// endpoints are system endpoints, not the /v3 CRUD surface the SDK wraps.
//
// KB: knowledge/knowledge-base/web10-v3/social/content-moderation.md

import { API_ORIGIN } from '../lib/origins';
import { getDiscoverGroupId } from './groups';
import { readUserPublicProfile } from './posts';
import type { PostRecord } from './types';
import { lookupUserProfile, type UserFace } from './profile';

// ── Types ────────────────────────────────────────────────────────────────────

/** One row in the moderation review queue (one per flagged user). */
export interface ModerationFlag {
  username: string;
  flag_count: number;
  last_flagged: string;
  matched_words: string[];
}

/** The operator-curated moderation settings (a slice of node_config). */
export interface ModerationConfig {
  sensitive_words: string[];
  auto_moderate: boolean;
  moderation_enabled: boolean;
  auto_hide_users: string[];
}

/** A parsed web10 permalink (the operator pastes one in the Link tab). */
export interface ParsedWeb10Link {
  kind: 'post' | 'profile' | 'group';
  username?: string;
  postId?: string;
  groupId?: string;
}

// ── The raw-token + fetch seam (mirrors ads-catalog.ts) ──────────────────────

function readRawToken(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function adminPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const raw = readRawToken();
  if (!raw) throw new Error('not signed in');
  const resp = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: raw }),
  });
  if (!resp.ok) {
    let detail = `${path} ${resp.status}`;
    try {
      const d = (await resp.json()) as { detail?: string };
      if (d?.detail) detail = d.detail;
    } catch { /* keep the status */ }
    throw new Error(detail);
  }
  return (await resp.json()) as T;
}

// ── The review queue (D59) ───────────────────────────────────────────────────

/** The moderation review queue: users with flagged / auto-hidden posts. */
export async function readModerationFlags(): Promise<ModerationFlag[]> {
  const data = await adminPost<{ flags: ModerationFlag[] }>('/v3/moderation/flags', {});
  return data.flags ?? [];
}

/**
 * Add or remove a username from the node's `auto_hide_users` list — the
 * operator's "keep hiding their future posts" (the reversible board-curation
 * "ban"). `hide=true` adds, `hide=false` removes. Returns the new list.
 */
export async function setUserAutoHidden(username: string, hide: boolean): Promise<string[]> {
  const data = await adminPost<{ auto_hide_users: string[] }>(
    '/v3/moderation/auto-hide',
    { username, hide },
  );
  return data.auto_hide_users ?? [];
}

// ── The moderation config (node_config slice) ────────────────────────────────

/**
 * Save a slice of the moderation settings to node_config. The node's
 * /config/update merges the given keys over the existing config, so we send
 * only the moderation keys (the ad knobs in ads-catalog.ts are untouched).
 */
export async function saveModerationConfig(
  update: Partial<Pick<ModerationConfig, 'sensitive_words' | 'auto_moderate' | 'moderation_enabled'>>,
): Promise<void> {
  const raw = readRawToken();
  if (!raw) throw new Error('not signed in');
  const resp = await fetch(`${API_ORIGIN}/config/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: { token: raw }, update }),
  });
  if (!resp.ok) {
    let detail = `config/update ${resp.status}`;
    try {
      const d = (await resp.json()) as { detail?: string };
      if (d?.detail) detail = d.detail;
    } catch { /* keep the status */ }
    throw new Error(detail);
  }
}

// ── Board-level takedown of one post (the existing hide mechanism) ──────────

/**
 * Hide a single post from the Discover board (the operator's "hide this post").
 * Uses the existing board-moderation endpoint, gated by node-admin. The
 * author's own copy is untouched; the doc is restorable via unhidePostFromBoard.
 */
export async function hidePostFromBoard(docId: string): Promise<void> {
  await adminPost('/v3/groups/hide', { group_id: getDiscoverGroupId(), doc_id: docId });
}

/** Restore a previously hidden post to the Discover board. */
export async function unhidePostFromBoard(docId: string): Promise<void> {
  await adminPost('/v3/groups/unhide', { group_id: getDiscoverGroupId(), doc_id: docId });
}

/**
 * A doc currently hidden from the Discover board (the moderation takedown list).
 * `author_key` is the bare username (v3 same-node); `body` is the doc's body
 * (for a post, `body.text` is the post text).
 */
export interface HiddenPost {
  doc_id: string;
  author_key: string;
  hidden_at: string;
  moderator_key: string;
  body: Record<string, unknown>;
}

/**
 * List the docs currently hidden from the Discover board (the operator's
 * "hidden posts" restore list — the surface the authenticator's retired Board
 * Moderation card had). Gated by node-admin (the `/v3/groups/hidden` read).
 */
export async function readHiddenPosts(): Promise<HiddenPost[]> {
  const data = await adminPost<{ hidden: HiddenPost[] }>('/v3/groups/hidden', {
    group_id: getDiscoverGroupId(),
  });
  return data.hidden ?? [];
}

/**
 * Add or remove a username from the node's `banned_users` list (the node-level
 * ban, D59a). `ban=true` bans (the user's content is filtered out of every read
 * path); `ban=false` unbans (their content returns). Returns the new list.
 */
export async function setUserBanned(username: string, ban: boolean): Promise<string[]> {
  const data = await adminPost<{ banned_users: string[] }>('/v3/moderation/ban', {
    username,
    ban,
  });
  return data.banned_users ?? [];
}

/**
 * List the node's banned users (D59a). Reads from the `banned_users`
 * ClickHouse table (not node_config). Returns the active banned usernames.
 */
export async function getBannedUsers(): Promise<string[]> {
  const data = await adminPost<{ banned_users: { username: string }[] }>('/v3/moderation/banned', {});
  return (data.banned_users ?? []).map((u) => u.username);
}

// ── The web10 link parser (the operator pastes a permalink in the Link tab) ──

/**
 * Parse a web10 permalink into its components. Mirrors the regexes in
 * preview/server.mjs (the crawler-facing URL parser) + nginx.conf:
 *   /u/:username/p/:postId  → { kind: 'post', username, postId }
 *   /u/:username            → { kind: 'profile', username }
 *   /groups/:groupId        → { kind: 'group', groupId }
 *
 * Accepts a full URL (any origin) or a bare path. Returns null when the input
 * is not a recognizable web10 link (the UI degrades to a "not a web10 link"
 * state, never crashes).
 */
export function parseWeb10Link(input: string): ParsedWeb10Link | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  // Strip the origin (protocol + host) if present, keep the path.
  let path = raw;
  const urlMatch = raw.match(/^https?:\/\/[^/]+(\/.*)?$/);
  if (urlMatch) {
    path = urlMatch[1] || '/';
  }
  // Drop any query string / hash.
  path = path.split('?')[0].split('#')[0];

  const postMatch = path.match(/^\/u\/([^/]+)\/p\/([^/]+)$/);
  if (postMatch) {
    return { kind: 'post', username: decodeURIComponent(postMatch[1]), postId: decodeURIComponent(postMatch[2]) };
  }
  const groupMatch = path.match(/^\/groups\/([^/]+)$/);
  if (groupMatch) {
    return { kind: 'group', groupId: decodeURIComponent(groupMatch[1]) };
  }
  const profileMatch = path.match(/^\/u\/([^/]+)$/);
  if (profileMatch) {
    return { kind: 'profile', username: decodeURIComponent(profileMatch[1]) };
  }
  return null;
}

// ── The "see their posts" read (the People tab + the Link tab) ───────────────

/**
 * Read a user's public posts + face for the moderation surface. Reuses the
 * profile screen's viewer read (the D73 query-engine read, anon-capable,
 * I3-clean — a hidden/blocked post does not leak). Returns null when the
 * account has no readable profile.
 */
export async function readUserPostsForModeration(
  username: string,
  provider?: string,
): Promise<{ posts: PostRecord[]; face: UserFace | null }> {
  const [profile, face] = await Promise.all([
    readUserPublicProfile(username, provider),
    lookupUserProfile(username, provider),
  ]);
  return { posts: profile.posts, face };
}
