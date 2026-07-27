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
export async function sendDm(): Promise<DmRecord> {
  return { _id: 'new', message: '', sent_at: new Date().toISOString(), sender_username: 'me', sender_provider: 'web10', recipient_username: '', recipient_provider: 'web10' };
}
export async function startConversation() {
  return { conversation: '', message: {} };
}
export async function addContact(): Promise<ContactRecord> {
  return { _id: 'new', username: '', provider: 'web10' };
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
export async function countFollowers(): Promise<number> { return PEERS.length; }
export async function countFollows(): Promise<number> { return PEERS.length; }
export async function countStagingPosts(): Promise<number> { return 0; }
export async function readProfile(): Promise<null> { return null; }
export async function saveProfile(): Promise<void> {}
export async function readMyPosts(): Promise<unknown[]> { return []; }
export async function createPost(): Promise<Record<string, never>> { return {}; }
export async function uploadMedia(): Promise<{ url: string }> { return { url: '' }; }
export async function fanOutToFollowers(): Promise<void> {}
export async function refreshMediaUrls<T>(records: T[]): Promise<T[]> { return records; }
export async function resolveMediaRefs<T>(records: T[]): Promise<T[]> { return records; }
export async function readComments(): Promise<unknown[]> { return []; }
export async function createComment(): Promise<Record<string, never>> { return {}; }
