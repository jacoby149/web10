// ── notifications.ts — the app-wide notification store (D69) ─────────────────
// Notifications are derived events the social app owns (D69): CRUD is the
// source of truth, the P2P data channel is the nudge. This module is the
// app-wide singleton (the p2p.ts listener-set idiom) that holds the live
// unread count + recent items and fans out to subscribers so the badge /
// banner update from ANY screen — the operator's "whatever app state they are
// in."
//
// The store has two input paths:
//   1. Seed (source of truth): on sign-in, `initNotifications` reads the
//      `notifications` collection from the user's followers group (the D60
//      app-owned-service pattern — the same group the settings doc lives in).
//   2. Nudge (fast path): a subscription to `onP2PInbound` (the app-wide P2P
//      bus) appends a notification the moment a nudge arrives, from any screen.
//      The nudge payload is a nudge ({type, from, ref_doc_id}) — the recipient
//      re-reads from CRUD for the full record; here we append a lightweight row
//      so the badge bumps instantly (the screen re-reads for detail).
//
// Unread = the count of rows with `read: false`. `markAllRead` flips them on
// screen open. This is the durable history + the badge, with no node table.

import { getV3Client } from './v3';
import { followersGroupId, ensureFollowers, getMyGroups } from './groups';
import { extractUsername } from './types';
import { listConversations, getLastDm } from './dms';
import { onP2PInbound, sendP2P, type P2PInboundConn } from './p2p';

const LOG = (...args: unknown[]) => console.log('[notifications]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[notifications]', ...args);

// The app-named service the notification docs live in (D60: app concepts in
// app-named services + role grants, no platform table).
const NOTIFICATIONS_SERVICE = 'notifications';

export type NotificationType =
  | 'reaction'
  | 'comment'
  | 'reply'
  | 'dm'
  | 'follow_request'
  | 'group_join';

export interface Notification {
  // A stable client id: the doc_id when seeded from CRUD, a generated id when
  // appended from a live nudge (the nudge has no doc_id — CRUD is re-read for
  // the durable record).
  id: string;
  type: NotificationType;
  // The actor's username (who did the thing).
  from: string;
  // The post/comment the event targets (absent for some types).
  ref_doc_id?: string;
  read: boolean;
  // ISO timestamp of when the event happened.
  created_at: string;
}

// The shape of a P2P nudge payload (the write side pushes this; see the
// per-action nudges in reactions.ts / comments.ts / dms.ts / follows.ts).
interface NudgePayload {
  type: NotificationType;
  from: string;
  ref_doc_id?: string;
  sent_at?: string;
}

/**
 * The write side (D69): the actor pushes a nudge to the target over P2P.
 * Best-effort + fire-and-forget — a failure never affects the action (the
 * recipient re-reads from CRUD for the durable record). No durable write here
 * (the actor can't write to the target's space) — the live nudge bumps the
 * target's badge; the target derives the durable record from reads (the read
 * side). Doesn't nudge the actor themselves (reacting to / commenting on your
 * own post is not a notification).
 */
export function sendNotification(
  target: { username: string; provider: string },
  n: { type: NotificationType; from?: string; ref_doc_id?: string },
): void {
  if (!target.username || !target.provider) return;
  const token = getV3Client().readToken();
  const from = n.from || token?.username || '';
  if (from && from === target.username) return; // no self-notification
  const payload: NudgePayload = {
    type: n.type,
    from,
    ref_doc_id: n.ref_doc_id,
    sent_at: new Date().toISOString(),
  };
  LOG('sendNotification —', n.type, 'to', `${target.provider}/${target.username}`, 'from', from);
  sendP2P(target.provider, target.username, payload);
}

type NotificationListener = () => void;

// ── Module state (the singleton) ─────────────────────────────────────────────
let items: Notification[] = [];
const listeners = new Set<NotificationListener>();
let inboundUnsub: (() => void) | null = null;
let initialized = false;

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      LOG_ERR('notification listener threw:', e);
    }
  }
}

/** The current unread count (the badge number). */
export function unreadCount(): number {
  return items.reduce((n, it) => n + (it.read ? 0 : 1), 0);
}

/** A snapshot of the current notification items (most recent first). */
export function getNotifications(): readonly Notification[] {
  return items;
}

/**
 * Subscribe to notification-store changes. Returns an unsubscribe function.
 * The listener is called (with no args) whenever the store changes — a new
 * nudge, a seed, or a mark-read — so a component re-reads unreadCount() /
 * getNotifications() and re-renders.
 */
export function onNotificationChange(listener: NotificationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Is a raw inbound payload a notification nudge (vs. the DM message nudge,
// which DmsScreen consumes)? The nudge carries a `type` that is one of the
// notification types. DM message nudges carry `doc_id` + `message` instead.
function isNudge(data: unknown): data is NudgePayload {
  if (!data || typeof data !== 'object') return false;
  const t = (data as Record<string, unknown>).type;
  return (
    t === 'reaction' ||
    t === 'comment' ||
    t === 'reply' ||
    t === 'dm' ||
    t === 'follow_request' ||
    t === 'group_join'
  );
}

// Append a notification (from a live nudge). Dedupes on (type, from,
// ref_doc_id) within a short window so a double-nudge (or a nudge + the seed
// racing) doesn't double-count the badge.
function appendNudge(n: NudgePayload): void {
  const id = `${n.type}:${n.from}:${n.ref_doc_id || ''}:${n.sent_at || Date.now()}`;
  const dup = items.some(
    (it) =>
      it.type === n.type &&
      it.from === n.from &&
      (it.ref_doc_id || '') === (n.ref_doc_id || ''),
  );
  if (dup) {
    LOG('nudge — duplicate, skipping:', id);
    return;
  }
  const item: Notification = {
    id,
    type: n.type,
    from: n.from,
    ref_doc_id: n.ref_doc_id,
    read: false,
    created_at: n.sent_at || new Date().toISOString(),
  };
  items = [item, ...items];
  LOG('nudge — appended:', id, 'unread:', unreadCount());
  notify();
}

// The app-wide P2P inbound handler: a nudge bumps the badge from any screen.
function onInbound(_conn: P2PInboundConn, data: unknown): void {
  if (!isNudge(data)) return; // a DM message nudge — DmsScreen's, not ours
  LOG('inbound nudge:', JSON.stringify(data));
  appendNudge(data);
}

/**
 * Initialize the notification store (sign-in). Subscribes to the app-wide P2P
 * inbound bus + seeds from a CRUD read (the source of truth). Idempotent — a
 * second call while initialized is a no-op.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) {
    LOG('initNotifications — already initialized, no-op');
    return;
  }
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    LOG('initNotifications — no token, skipping (not signed in)');
    return;
  }
  // Subscribe to the app-wide P2P bus first, so a nudge that arrives while the
  // seed read is in flight is not lost.
  if (!inboundUnsub) {
    inboundUnsub = onP2PInbound(onInbound);
  }
  initialized = true;
  LOG('initNotifications — subscribed to P2P bus, seeding from CRUD');
  await seed();
}

// ── The read side (D69): derive notifications from reads ─────────────────────
// The source of truth. The app computes "what happened that targets me" from
// reads it already has permission for — no node table, no new endpoint. The
// unread cursor (`last_seen`) is a single doc in the user's followers group
// (the D60 app-owned pattern); unread = derived events with created_at after
// it. Opening /notifications advances the cursor (markAllRead).

// Read the last-seen cursor (ISO string, '' when absent).
async function readLastSeen(): Promise<string> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return '';
  try {
    const groupId = await ensureFollowers(token.username, token.provider);
    const docs = await w.read(NOTIFICATIONS_SERVICE, { groups: [groupId] });
    if (docs.length > 0) {
      return ((docs[0].body as Record<string, unknown>).last_seen as string) || '';
    }
  } catch {
    // No cursor yet — treat everything as unread.
  }
  return '';
}

// Advance the last-seen cursor (the durable "I looked" record). Best-effort.
async function writeLastSeen(iso: string): Promise<void> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return;
  try {
    const groupId = await ensureFollowers(token.username, token.provider);
    const docs = await w.read(NOTIFICATIONS_SERVICE, { groups: [groupId] });
    if (docs.length > 0 && docs[0].doc_id) {
      await w.update(docs[0].doc_id, { last_seen: iso });
    } else {
      await w.create(NOTIFICATIONS_SERVICE, { last_seen: iso }, { groups: [groupId] });
    }
    LOG('writeLastSeen — advanced to', iso);
  } catch (e) {
    LOG_ERR('writeLastSeen — persist failed (local badge still cleared):', e);
  }
}

// Derive the notification list from reads: reactions + comments on my posts
// (from others) + the latest DM from each other party. Best-effort per source
// — one failing read never blanks the whole list.
async function deriveNotifications(): Promise<Notification[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return [];
  const me = token.username;
  const out: Notification[] = [];

  // My post ids (posts I authored, across my groups).
  let myPostIds: string[] = [];
  let groupIds: string[] = [];
  try {
    const groups = await getMyGroups();
    groupIds = groups.map((g) => g.group_id);
    const posts = await w.read('posts', { groups: groupIds });
    myPostIds = posts
      .filter((p) => extractUsername(p.author_key) === me)
      .map((p) => p.doc_id);
  } catch {
    // No posts / no groups — skip the post-engagement derivation.
  }

  if (myPostIds.length) {
    // Reactions on my posts (from others).
    try {
      const reactions = await w.read('reactions', { groups: groupIds, ref: myPostIds });
      for (const r of reactions) {
        const author = extractUsername(r.author_key);
        if (author === me) continue;
        const b = r.body as Record<string, unknown>;
        out.push({
          id: `reaction:${author}:${r.doc_id}`,
          type: 'reaction',
          from: author,
          ref_doc_id: b.target_id as string | undefined,
          read: false,
          created_at: (b.created_at as string) || new Date().toISOString(),
        });
      }
    } catch {
      // Best-effort.
    }
    // Comments on my posts (from others).
    try {
      const comments = await w.read('comments', { groups: groupIds, ref: myPostIds });
      for (const c of comments) {
        const author = extractUsername(c.author_key);
        if (author === me) continue;
        const b = c.body as Record<string, unknown>;
        out.push({
          id: `comment:${author}:${c.doc_id}`,
          type: 'comment',
          from: author,
          ref_doc_id: b.post_id as string | undefined,
          read: false,
          created_at: (b.created_at as string) || new Date().toISOString(),
        });
      }
    } catch {
      // Best-effort.
    }
  }

  // DMs: the latest message FROM the other party in each conversation.
  try {
    const convs = await listConversations();
    for (const conv of convs) {
      const last = await getLastDm(conv);
      if (!last || last.sender_username === me) continue; // only messages from others
      out.push({
        id: `dm:${last.sender_username}:${last._id}`,
        type: 'dm',
        from: last.sender_username,
        ref_doc_id: last._id,
        read: false,
        created_at: last.sent_at,
      });
    }
  } catch {
    // Best-effort.
  }

  return out;
}

// Seed the store: derive from reads (the source of truth) + apply the
// last-seen cursor (unread = created_at after the cursor). Best-effort — a
// failure leaves the store as-is (live nudges still append), never throws.
async function seed(): Promise<void> {
  const token = getV3Client().readToken();
  if (!token) return;
  try {
    const [derived, lastSeen] = await Promise.all([deriveNotifications(), readLastSeen()]);
    // Apply the cursor: an event is read if it happened at/before last_seen.
    const seeded = derived.map((n) => ({
      ...n,
      read: lastSeen !== '' && new Date(n.created_at).getTime() <= new Date(lastSeen).getTime(),
    }));
    // Merge with any live nudges that arrived before the seed finished (a nudge
    // for an event the derivation already covers is dropped in favor of the
    // derived row).
    const derivedKeys = new Set(
      seeded.map((s) => `${s.type}:${s.from}:${s.ref_doc_id || ''}`),
    );
    const liveOnly = items.filter(
      (it) => !derivedKeys.has(`${it.type}:${it.from}:${it.ref_doc_id || ''}`),
    );
    items = [...liveOnly, ...seeded];
    LOG('seed — derived', seeded.length, 'notification(s), unread:', unreadCount());
    notify();
  } catch (e) {
    LOG('seed — derivation failed:', String(e));
  }
}

/**
 * Mark every notification read (screen open). Flips `read: true` on all rows +
 * notifies subscribers (the badge clears) + advances the last-seen cursor
 * (the durable "I looked" record, so the next seed marks them read).
 */
export async function markAllRead(): Promise<void> {
  if (items.every((it) => it.read)) {
    LOG('markAllRead — nothing to mark');
    return;
  }
  const now = new Date().toISOString();
  items = items.map((it) => (it.read ? it : { ...it, read: true }));
  LOG('markAllRead — all read, unread:', unreadCount());
  notify();
  await writeLastSeen(now);
}

/**
 * Tear down the store (sign-out). Unsubscribes from the P2P bus + clears the
 * items so a subsequent sign-in as a different user starts clean.
 */
export function teardownNotifications(): void {
  if (inboundUnsub) {
    inboundUnsub();
    inboundUnsub = null;
  }
  initialized = false;
  if (items.length > 0) {
    items = [];
    notify();
  }
  LOG('teardownNotifications — torn down');
}
