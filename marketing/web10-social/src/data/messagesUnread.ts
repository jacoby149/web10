// ── messagesUnread.ts — the Messages unread badge (the purple count) ─────────
// DMs are NOT a notification (the operator's call: "messages in the
// notifications is crazy, better if a little purple circle with a number next
// to the messages icon"). They have their OWN unread badge on the Messages nav
// icon (mobile bottom bar + desktop sidebar), separate from the notifications
// bell.
//
// Model (the settings.ts cursor pattern, per-conversation): a conversation is
// unread when its latest message is FROM the other party and newer than the
// user's read cursor for that conversation. The cursor is persisted in the
// settings doc (`dmReadCursors`, keyed by conversation key → ISO timestamp), so
// the badge survives across sessions/devices — the same pattern as the
// notifications `last_seen` cursor.
//
// Two input paths (the p2p.ts / notifications.ts listener-set idiom):
//   1. Seed (source of truth): on sign-in, `initMessagesUnread` reads the
//      cursors from settings + the last message of every conversation (CRUD).
//   2. Nudge (fast path): a subscription to `onP2PInbound` re-reads the
//      conversation the moment a DM nudge arrives, so the badge bumps in real
//      time from any screen.
//
// `markConversationRead(conv)` advances the cursor when the user opens a
// conversation (DmsScreen calls it on open + on each inbound while the thread
// is open, so new messages in the open thread don't count as unread).

import { getV3Client } from './v3';
import { readSettings, saveSettings } from './settings';
import { listConversations, getLastDm, conversationKey } from './dms';
import { onP2PInbound, type P2PInboundConn } from './p2p';
import type { DmRecord } from './types';

const LOG = (...args: unknown[]) => console.log('[messages-unread]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[messages-unread]', ...args);

type Listener = () => void;

// cursors: conversation key → ISO timestamp of the last message the user has
// read. Empty/absent = nothing read yet (the conversation is unread if it has
// a message from the other party).
let cursors: Record<string, string> = {};
// lastMessages: conversation key → the latest message (null when the
// conversation is empty). Cached so the badge count is synchronous.
let lastMessages: Record<string, DmRecord | null> = {};
const listeners = new Set<Listener>();
let inboundUnsub: (() => void) | null = null;
let initialized = false;

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      LOG_ERR('listener threw:', e);
    }
  }
}

function currentUsername(): string | null {
  return getV3Client().readToken()?.username ?? null;
}

// Is a conversation unread? Its latest message is from the other party and
// newer than the read cursor.
function conversationUnread(conv: string): boolean {
  const last = lastMessages[conv];
  if (!last) return false;
  const me = currentUsername();
  if (me && last.sender_username === me) return false; // my own message
  const cursor = cursors[conv] || '';
  if (!cursor) return true; // never read
  return new Date(last.sent_at).getTime() > new Date(cursor).getTime();
}

/** The number of conversations with an unread message (the badge count). */
export function unreadMessagesCount(): number {
  let count = 0;
  for (const conv of Object.keys(lastMessages)) {
    if (conversationUnread(conv)) count++;
  }
  return count;
}

/** Whether a specific conversation has an unread message. */
export function isConversationUnread(conv: string): boolean {
  return conversationUnread(conv);
}

/** Subscribe to unread-count changes. Returns an unsubscribe function. */
export function onMessagesUnreadChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Is a raw inbound payload a DM message nudge (vs. a notification nudge)?
// DmsScreen's DM nudge carries `doc_id` + `message` (the persisted body); a
// notification nudge carries a `type` that is one of the notification types.
function isDmNudge(data: unknown): data is { doc_id: string; message: string; from: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.doc_id === 'string' && typeof d.message === 'string' && typeof d.from === 'string';
}

// The app-wide P2P inbound handler: a DM nudge re-reads that conversation so
// the badge bumps in real time (from any screen).
function onInbound(_conn: P2PInboundConn, data: unknown): void {
  if (!isDmNudge(data)) return; // a notification nudge — not ours
  const token = getV3Client().readToken();
  if (!token) return;
  LOG('inbound DM nudge — from', data.from);
  const conv = conversationKey(
    { provider: token.provider, username: token.username },
    { provider: token.provider, username: data.from },
  );
  getLastDm(conv)
    .then((last) => {
      lastMessages[conv] = last;
      notify();
    })
    .catch((e) => LOG_ERR('inbound re-read failed:', e));
}

// Read the last message of every conversation (the source of truth for the
// badge). Best-effort — a failure leaves the cache as-is.
async function recomputeAll(): Promise<void> {
  try {
    const convs = await listConversations();
    const last: Record<string, DmRecord | null> = {};
    for (const conv of convs) {
      last[conv] = await getLastDm(conv);
    }
    lastMessages = last;
    notify();
  } catch (e) {
    LOG_ERR('recompute failed:', e);
  }
}

/**
 * Initialize the unread store (sign-in). Seeds the cursors from settings + the
 * last message of every conversation, and subscribes to the P2P bus for live
 * bumps. Idempotent — a second call while initialized is a no-op.
 */
export async function initMessagesUnread(): Promise<void> {
  if (initialized) {
    LOG('initMessagesUnread — already initialized, no-op');
    return;
  }
  const token = getV3Client().readToken();
  if (!token) {
    LOG('initMessagesUnread — no token, skipping (not signed in)');
    return;
  }
  // Seed the cursors from settings (the persisted read state).
  try {
    const s = await readSettings();
    cursors = { ...(s.dmReadCursors || {}) };
  } catch {
    // No settings yet — everything is unread.
  }
  // Subscribe to the P2P bus first, so a nudge that arrives while the seed
  // read is in flight is not lost.
  if (!inboundUnsub) {
    inboundUnsub = onP2PInbound(onInbound);
  }
  initialized = true;
  LOG('initMessagesUnread — subscribed to P2P bus, seeding from CRUD');
  await recomputeAll();
}

/**
 * Mark a conversation read (screen open). Advances its cursor to the latest
 * message (or now, when empty), never backwards, and persists. DmsScreen calls
 * this on open + on each inbound while the thread is open, so new messages in
 * the open thread don't count as unread. `latestSentAt` (the newest message the
 * caller has actually seen) wins over the cached last message, so a freshly
 * loaded thread marks read to its real latest, not a stale cache.
 */
export async function markConversationRead(conv: string, latestSentAt?: string): Promise<void> {
  const last = lastMessages[conv];
  const latest = latestSentAt || (last ? last.sent_at : new Date().toISOString());
  const existing = cursors[conv] || '';
  const next = latest > existing ? latest : existing;
  if (next === existing) {
    LOG('markConversationRead — no advance for', conv);
    return;
  }
  cursors[conv] = next;
  LOG('markConversationRead —', conv, '→', next, 'unread:', unreadMessagesCount());
  notify();
  // Persist (best-effort — the local badge is already clear).
  saveSettings({ dmReadCursors: { ...cursors } }).catch((e) => {
    LOG_ERR('markConversationRead — persist failed (local badge still cleared):', e);
  });
}

/**
 * Tear down the store (sign-out). Unsubscribes from the P2P bus + clears the
 * state so a subsequent sign-in as a different user starts clean.
 */
export function teardownMessagesUnread(): void {
  if (inboundUnsub) {
    inboundUnsub();
    inboundUnsub = null;
  }
  initialized = false;
  if (Object.keys(cursors).length > 0 || Object.keys(lastMessages).length > 0) {
    cursors = {};
    lastMessages = {};
    notify();
  }
  LOG('teardownMessagesUnread — torn down');
}
