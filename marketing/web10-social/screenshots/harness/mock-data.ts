// Screenshot harness — mock of the `@/data` barrel (exact-match aliased by
// screenshots/vite.config.ts). Provides seeded, in-memory implementations of
// every data-layer function the messages views import, so Chat / Mail / CRM
// render with realistic content and no backend. See screenshots/README.md.
import type { DmRecord, ContactRecord } from '@/data/types';

const ME = 'web10/me';

// Deterministic conversation key — mirrors data/dms.ts conversationKey().
export function conversationKey(
  a: { provider: string; username: string },
  b: { provider: string; username: string },
): string {
  const idA = `${a.provider}/${a.username}`;
  const idB = `${b.provider}/${b.username}`;
  const [first, second] = [idA, idB].sort();
  return `${first}--${second}`;
}

const minsAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

interface Peer {
  username: string;
  provider: string;
  display_name: string;
  note?: string;
  added_at: string;
  msgs: Array<{ from: 'me' | 'them'; text: string; ago: number }>;
}

const PEERS: Peer[] = [
  {
    username: 'alina', provider: 'web10', display_name: 'Alina Vex',
    note: 'Top collab — wants a Q3 brand deal. Follow up re: rate card + exclusivity window.',
    added_at: minsAgo(60 * 24 * 40),
    msgs: [
      { from: 'them', text: 'Loved the last drop 🔥 the reach on that reel was unreal', ago: 190 },
      { from: 'me', text: 'thank you!! it hit 2.1M with zero suppression — no shadow ban here', ago: 182 },
      { from: 'them', text: 'ok that settles it. can we talk a Q3 collab?', ago: 96 },
      { from: 'me', text: 'yes — sending you the rate card now', ago: 42 },
    ],
  },
  {
    username: 'priya', provider: 'web10', display_name: 'Priya Sharma',
    note: 'Fan → paid subscriber last week. Extremely active in comments, great amplifier.',
    added_at: minsAgo(60 * 24 * 12),
    msgs: [
      { from: 'them', text: 'just subscribed! been here since the 500-follower days ❤️', ago: 60 * 20 },
      { from: 'me', text: 'that means a lot Priya 🙏 early supporters get first dibs on the merch', ago: 60 * 19 },
      { from: 'them', text: 'yes!! count me in', ago: 60 * 18 },
    ],
  },
  {
    username: 'marcus', provider: 'web10', display_name: 'Marcus Lee',
    added_at: minsAgo(60 * 24 * 5),
    msgs: [
      { from: 'them', text: 'hey are the stream VODs staying up?', ago: 60 * 26 },
      { from: 'me', text: 'yep — your data, your node. they never expire', ago: 60 * 25 },
    ],
  },
  {
    username: 'jordan', provider: 'web10', display_name: 'Jordan Kim',
    note: 'Manager for @bigcreator. Warm intro — potential roster deal.',
    added_at: minsAgo(60 * 24 * 3),
    msgs: [
      { from: 'them', text: 'Repping a few creators looking to leave the algo grind. Coffee?', ago: 60 * 50 },
      { from: 'me', text: 'absolutely. the pitch is simple: you own the audience, we take a small %', ago: 60 * 49 },
    ],
  },
  {
    username: 'sam', provider: 'web10', display_name: 'Sam Rivera',
    added_at: minsAgo(60 * 24),
    msgs: [
      { from: 'them', text: 'gm 👋', ago: 60 * 3 },
    ],
  },
];

const contacts: ContactRecord[] = PEERS.map((p, i) => ({
  _id: `contact-${i}`,
  username: p.username,
  provider: p.provider,
  display_name: p.display_name,
  note: p.note,
  added_at: p.added_at,
  spam_flagged: p.username === 'sam',
  crm_status: i % 3 === 0 ? 'green' : i % 3 === 1 ? 'yellow' : 'red',
}));

const threads: Record<string, DmRecord[]> = {};
PEERS.forEach((p, i) => {
  const conv = conversationKey({ provider: 'web10', username: 'me' }, { provider: p.provider, username: p.username });
  threads[conv] = p.msgs.map((m, j) => ({
    _id: `dm-${i}-${j}`,
    message: m.text,
    sent_at: minsAgo(m.ago),
    sender_username: m.from === 'me' ? 'me' : p.username,
    sender_provider: 'web10',
    recipient_username: m.from === 'me' ? p.username : 'me',
    recipient_provider: 'web10',
    ...(i === 0 && j === 0 ? { subject: 'Q3 collab — rate card + exclusivity' } : {}),
    ...(i === 1 && j === 0 ? { subject: 'Just subscribed! 🎉' } : {}),
  }));
});

export async function listConversations(): Promise<string[]> {
  return Object.keys(threads);
}
export async function readDms(conversation: string): Promise<DmRecord[]> {
  return threads[conversation] ?? [];
}
export async function getLastDm(conversation: string): Promise<DmRecord | null> {
  const t = threads[conversation] ?? [];
  return t[t.length - 1] ?? null;
}
export async function readContacts(): Promise<ContactRecord[]> {
  return contacts;
}
export async function readContactsForCrm(): Promise<ContactRecord[]> {
  return contacts;
}
export async function readFollows(): Promise<unknown[]> {
  return [];
}
export async function updateContactNote(id: string, note: string): Promise<ContactRecord> {
  const c = contacts.find((x) => x._id === id);
  if (c) c.note = note;
  return c ?? ({ _id: id, username: '', provider: 'web10', note } as ContactRecord);
}
export async function updateContactStatus(id: string, status: string | undefined): Promise<ContactRecord> {
  const c = contacts.find((x) => x._id === id);
  if (c) c.crm_status = status as any;
  return c ?? ({ _id: id, username: '', provider: 'web10', crm_status: status } as ContactRecord);
}
export async function sendDm(): Promise<DmRecord> {
  return { _id: 'new', message: '', sent_at: new Date().toISOString(), sender_username: 'me', sender_provider: 'web10', recipient_username: '', recipient_provider: 'web10' };
}
export async function startConversation() {
  return { conversation: '', message: {} };
}
export async function addContact(): Promise<ContactRecord> {
  return { _id: 'new', username: '', provider: 'web10' };
}
export async function spamFlagUser(username: string, provider: string): Promise<void> {
  const c = contacts.find((x) => x.username === username && x.provider === provider);
  if (c) c.spam_flagged = true;
}
export async function unspamFlagUser(username: string, provider: string): Promise<void> {
  const c = contacts.find((x) => x.username === username && x.provider === provider);
  if (c) c.spam_flagged = false;
}
export async function toggleSpamFlag(id: string, flagged: boolean): Promise<void> {
  const c = contacts.find((x) => x._id === id);
  if (c) c.spam_flagged = flagged;
}
export async function readSpamFlaggedContacts(): Promise<ContactRecord[]> {
  return contacts.filter((c) => c.spam_flagged);
}
export function classifyThread(
  lastMsg: DmRecord | null,
  me: { provider: string; username: string },
  otherSpamFlagged: boolean,
): 'inbox' | 'sent' | 'spam' {
  if (otherSpamFlagged) return 'spam';
  if (!lastMsg) return 'inbox';
  const senderKey = `${lastMsg.sender_provider}/${lastMsg.sender_username}`;
  const meKey = `${me.provider}/${me.username}`;
  return senderKey === meKey ? 'sent' : 'inbox';
}

// ── Generic safe stubs ───────────────────────────────────────────────────
// The `@/data` barrel is `export *` over every data module, so any component
// the harness mounts (Layout / DmsScreen / SettingsScreen, transitively) may
// import names beyond the seeded ones above. These no-op stubs keep the page
// rendering; if capture.mjs errors with "No matching export named X", the
// barrel grew again — add X here in the same shape.
export async function deleteConversation(): Promise<void> {}
export async function deleteDm(): Promise<void> {}
export async function updateDm(): Promise<DmRecord> {
  return { _id: 'stub', message: '', sent_at: new Date().toISOString(), sender_username: 'me', sender_provider: 'web10', recipient_username: '', recipient_provider: 'web10' };
}
export async function searchContacts(): Promise<ContactRecord[]> { return contacts; }
export async function readContact(): Promise<ContactRecord | null> { return contacts[0] || null; }
export async function updateContact(): Promise<ContactRecord> { return contacts[0] || ({ _id: '', username: '', provider: 'web10' } as ContactRecord); }
export async function deleteContact(): Promise<void> {}
export async function readPost(): Promise<unknown> { return {}; }
export async function readPosts(): Promise<unknown[]> { return []; }
export async function createPost(): Promise<unknown> { return {}; }
export async function updatePost(): Promise<unknown> { return {}; }
export async function deletePost(): Promise<void> {}
export async function movePostVisibility(): Promise<void> {}
export async function countFollowers(): Promise<number> { return PEERS.length; }
export async function countFollows(): Promise<number> { return PEERS.length; }
export async function countStagingPosts(): Promise<number> { return 0; }
export async function readProfile(): Promise<unknown> { return {}; }
export async function saveProfile(): Promise<void> {}
export async function readMyPosts(): Promise<unknown[]> { return []; }
export async function readFollowsByUser(): Promise<unknown[]> { return []; }
export async function followUser(): Promise<unknown> { return {}; }
export async function unfollowUser(): Promise<void> {}
export async function uploadMedia(): Promise<{ url: string }> { return { url: '' }; }
export async function fanOutToFollowers(): Promise<void> {}
export async function refreshMediaUrls<T>(records: T[]): Promise<T[]> { return records; }
export async function resolveMediaRefs<T>(records: T[]): Promise<T[]> { return records; }
export async function readComments(): Promise<unknown[]> { return []; }
export async function createComment(): Promise<unknown> { return {}; }
export async function deleteComment(): Promise<void> {}
export async function countReactions(): Promise<number> { return 0; }
export async function countComments(): Promise<number> { return 0; }
export async function toggleReaction(): Promise<unknown> { return {}; }
export async function readReactions(): Promise<unknown[]> { return []; }
export async function readServiceTerms(): Promise<unknown> { return {}; }
export async function grantSelfTerms(): Promise<void> {}
export async function readStaging(): Promise<unknown[]> { return []; }
export async function movePostToPublic(): Promise<void> {}
export async function movePostToPrivate(): Promise<void> {}
export async function deleteStaging(): Promise<void> {}
export function replyAllTargets(): unknown[] { return []; }
export type AppSettings = { defaultVisibility?: 'public' | 'private' };
export async function readSettings(): Promise<AppSettings> { return { defaultVisibility: 'public' }; }
export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> { return { defaultVisibility: partial.defaultVisibility || 'public' }; }

// --- drift stubs (added 30.07.2026 unbrick — barrel grew; harness views don't
// call these, they exist so the Vite pre-bundler finds every named export) ---
export async function blockUser(): Promise<void> {}
export function buildCommentTarget(): unknown { return {}; }
export function buildReactionTarget(): unknown { return {}; }
export function buildSocialServiceSirs(): unknown { return {}; }
export async function bulkDeleteStagingPosts(): Promise<void> {}
export async function bulkMovePosts(): Promise<void> {}
export function clearReadUrlCache(): void {}
export function clearSchemaCache(): void {}
export function clearSettingsCache(): void {}
export async function countUnread(): Promise<number> { return 0; }
export async function createPublicEntry(): Promise<unknown> { return {}; }
export async function createReaction(): Promise<unknown> { return {}; }
export function createWapiWrapper(): unknown { return {}; }
export async function deleteFollow(): Promise<void> {}
export async function deleteMedia(): Promise<void> {}
export async function deletePublicEntry(): Promise<void> {}
export async function deleteReaction(): Promise<void> {}
export async function deleteStagingPost(): Promise<void> {}
export function deriveObjectKey(): string { return ''; }
export async function fetchDiscoveryPost(): Promise<unknown> { return null; }
export async function fetchSchema(): Promise<unknown> { return {}; }
export async function fetchSuggestedUsers(): Promise<unknown[]> { return []; }
export function getCachedSchema(): unknown { return null; }
export async function getReactionCounts(): Promise<unknown> { return {}; }
export function getWapi(): unknown { return null; }
export function groupByOrigin(): unknown { return {}; }
export async function listFollowers(): Promise<unknown[]> { return []; }
export function mapRawDiscoveryPost(): unknown { return null; }
export async function markInboxRead(): Promise<void> {}
export async function queryPublicEntries(): Promise<unknown[]> { return []; }
export async function readDiscoverFeed(): Promise<unknown[]> { return []; }
export async function readFeed(): Promise<unknown[]> { return []; }
export async function readFollow(): Promise<unknown> { return null; }
export async function readFollowsByStatus(): Promise<unknown[]> { return []; }
export async function readMedia(): Promise<unknown> { return null; }
export async function readMediaRecord(): Promise<unknown> { return null; }
export async function readReplies(): Promise<unknown[]> { return []; }
export async function readStagingPosts(): Promise<unknown[]> { return []; }
export async function readTopLevelComments(): Promise<unknown[]> { return []; }
export async function readUserPosts(): Promise<unknown[]> { return []; }
export async function readUserProfile(): Promise<unknown> { return null; }
export async function recordRepost(): Promise<void> {}
export async function refreshMediaUrl(): Promise<string> { return ''; }
export function registerDefaultSchemas(): void {}
export function resetWapi(): void {}
export async function sendDmMulti(): Promise<unknown> { return {}; }
export async function updateComment(): Promise<void> {}
export async function updateFollowNotify(): Promise<void> {}
