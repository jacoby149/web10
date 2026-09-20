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
export async function createRepost(): Promise<unknown> { return {}; }
export async function updatePost(): Promise<unknown> { return {}; }
export async function deletePost(): Promise<void> {}
export async function movePostVisibility(): Promise<void> {}
export async function countFollowers(): Promise<number> { return PEERS.length; }
export async function countFollows(): Promise<number> { return PEERS.length; }
export async function countUserFollowing(): Promise<number> { return PEERS.length; }
export async function readUserPublicPosts(): Promise<unknown[]> { return PROFILE_POSTS; }
export async function countStagingPosts(): Promise<number> { return 0; }
export async function saveProfile(): Promise<void> {}
export async function readMyPosts(): Promise<unknown[]> { return PROFILE_POSTS; }
export async function readFollowsByUser(): Promise<unknown[]> { return []; }
export async function followUser(): Promise<unknown> { return {}; }
export async function unfollowUser(): Promise<void> {}
export async function uploadMedia(): Promise<{ url: string }> { return { url: '' }; }
export async function fanOutToFollowers(): Promise<void> {}
export async function readMyAds(): Promise<{ ads: unknown[]; albums: unknown[] }> { return { ads: [], albums: [] }; }
 export async function refreshMediaUrls<T>(records: T[]): Promise<T[]> { return records; }
 export async function readComments(): Promise<unknown[]> { return []; }
  export async function createComment(): Promise<unknown> { return {}; }
 // The thread seams (comments.md, the Facebook model): the shared thread reads
 // a PAGED top-level page (+ per-comment replyCounts) and a PAGED reply page
 // ("view more replies"), and writes top-level comments or replies (parentId).
 // Seed a small threaded conversation so the screenshot shows the thread shape.
 export async function readThreadComments(postId?: string): Promise<unknown> {
   if (postId === 'fp-0' || postId === 'fp-1' || postId === 'pp-1') {
     return {
       comments: [
         { _id: 'tc-1', post_id: postId, text: 'This is a great post!', author_username: 'alice', created_at: '2026-01-01T00:00:00Z', likeCount: 3, likedByMe: false },
         { _id: 'tc-2', post_id: postId, text: 'Another take on the mix.', author_username: 'carol', created_at: '2026-01-01T02:00:00Z', likeCount: 5, likedByMe: false },
       ],
       nextCursor: null,
       // tc-1 has 7 replies; the first page loads 5 → "view more replies" shows
       replyCounts: { 'tc-1': 7, 'tc-2': 0 },
     };
   }
   return { comments: [], nextCursor: null, replyCounts: {} };
 }
 export async function readThreadReplies(commentId?: string): Promise<unknown> {
   if (commentId === 'tc-1') {
     const r = (id: string, n: number, user: string) => ({
       _id: id, post_id: 'p', text: `Reply ${n} to the thread.`, author_username: user,
       created_at: `2026-01-01T01:0${n}:00Z`, parent_id: 'tc-1', likeCount: n, likedByMe: n === 2,
     });
     // first page of 5 (of 7) → nextCursor set → "view more replies" shows
     return {
       comments: [r('tr-1', 1, 'bob'), r('tr-2', 2, 'nova'), r('tr-3', 3, 'luna'), r('tr-4', 4, 'me'), r('tr-5', 5, 'zoe')],
       nextCursor: 'tr-5',
     };
   }
   return { comments: [], nextCursor: null };
 }
 export async function countRepliesByComment(): Promise<Record<string, number>> { return {}; }
 export async function createThreadComment(): Promise<unknown> { return {}; }
export async function deleteComment(): Promise<void> {}
// Photos in comments (3.113.0) — the harness has no upload pipeline; the stub
// returns a fake doc_id + url so the comment thread's attach control degrades
// cleanly offline.
export async function uploadCommentPhoto(_file: File): Promise<{
  docId: string;
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}> {
  return { docId: 'mock-comment-photo', url: 'http://x/mock-comment-photo.jpg', mimeType: 'image/jpeg' };
}
export async function countReactions(): Promise<number> { return 0; }
export async function countComments(postId?: string): Promise<number> {
  // The profile's feed view seeds real counts for its first two posts.
  if (postId === 'pp-1') return 3;
  if (postId === 'pp-2') return 1;
  return 0;
}
export async function toggleReaction(): Promise<unknown> { return {}; }
export async function readReactions(postId?: string): Promise<unknown[]> {
  // The profile's feed view seeds likes (incl. the reader's own — the filled
  // heart) for its first two posts; other ids (feed/discover) stay empty.
  if (postId === 'pp-1') {
    return [
      { _id: 'pr-1', type: 'like', author_username: 'alina', author_provider: 'web10', target_service: 'posts', target_id: 'pp-1', created_at: minsAgo(30) },
      { _id: 'pr-2', type: 'like', author_username: 'me', author_provider: 'web10', target_service: 'posts', target_id: 'pp-1', created_at: minsAgo(20) },
    ];
  }
  if (postId === 'pp-2') {
    return [
      { _id: 'pr-3', type: 'like', author_username: 'priya', author_provider: 'web10', target_service: 'posts', target_id: 'pp-2', created_at: minsAgo(100) },
    ];
  }
  return [];
}
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
// The v3 author_key → username helper (the Discover screen's own-reaction read
// matches the reader's reaction on this). Last path segment of the key.
export function extractUsername(authorKey: string): string {
  const parts = (authorKey || '').split('/');
  return parts[parts.length - 1] || authorKey;
}
export async function fetchDiscoveryPost(): Promise<unknown> { return null; }
export async function fetchSchema(): Promise<unknown> { return {}; }
export function getCachedSchema(): unknown { return null; }
export async function getReactionCounts(): Promise<unknown> { return {}; }
export function getWapi(): unknown { return null; }
// The v3 client seam — the Discover + Shorts screens' engagement count reads
// reactions + comments through it. Synthesizes the docs from the seeded
// discover posts (each post's `likes` → that many like reactions, `comments`
// → that many comment docs) so the heart/comment tallies render the seed.
export function getV3Client(): unknown {
  return {
    readToken: () => ({ provider: 'web10', username: 'nova' }),
    read: async (collection: string) => {
      const docs: unknown[] = [];
      for (const p of DISCOVER_POSTS) {
        const id = p._id as string;
        const authorKey = `web10/groups/users/${p.author_username}/profile`;
        if (collection === 'reactions') {
          for (let i = 0; i < ((p.likes as number) || 0); i++) {
            docs.push({ ref_value: id, author_key: authorKey, body: { type: 'like' } });
          }
        } else if (collection === 'comments') {
          for (let i = 0; i < ((p.comments as number) || 0); i++) {
            docs.push({ ref_value: id, author_key: authorKey, body: { text: 'seeded comment' } });
          }
        }
      }
      return docs;
    },
    readRefCounts: async () => ({}),
  };
}
export function getDiscoverGroupId(): string { return 'web10/groups/web10/discover'; }
export function groupByOrigin(): unknown { return {}; }
export async function listFollowers(): Promise<unknown[]> { return []; }
export function mapRawDiscoveryPost(): unknown { return null; }
export async function markInboxRead(): Promise<void> {}
export async function queryPublicEntries(): Promise<unknown[]> { return []; }
export async function readFollow(): Promise<unknown> { return null; }
export async function readFollowsByStatus(): Promise<unknown[]> { return []; }
export async function readMedia(): Promise<unknown> { return null; }
export async function readMediaRecord(): Promise<unknown> { return null; }
export async function readReplies(): Promise<unknown[]> { return []; }
export async function readStagingPosts(): Promise<unknown[]> { return []; }
export async function readTopLevelComments(): Promise<unknown[]> { return []; }
export async function readUserPosts(): Promise<unknown[]> { return []; }
export async function refreshMediaUrl(): Promise<string> { return ''; }
export function registerDefaultSchemas(): void {}
export function resetWapi(): void {}
export async function sendDmMulti(): Promise<unknown> { return {}; }
export async function updateComment(): Promise<void> {}
export async function updateFollowNotify(): Promise<void> {}
export async function setReaction(): Promise<null> { return null; }
export async function toggleReactionKind(): Promise<null> { return null; }
export async function toggleRepost(): Promise<boolean> { return true; }

// ── Groups (screenshot seed) ───────────────────────────────────────────────
// The Groups screen (My Groups + Discover) and its detail read these. Seeded
// so the PR shots render with realistic content and no backend.

interface SeedGroup {
  group_id: string;
  join_policy: string;
  my_role: string;
  member_count: number;
}

const MY_GROUPS: SeedGroup[] = [
  { group_id: 'web10/groups/users/nova/synthwave-sessions', join_policy: 'open', my_role: 'member', member_count: 128 },
  { group_id: 'web10/groups/users/luna/creator-backstage', join_policy: 'request', my_role: 'owner', member_count: 89 },
  { group_id: 'web10/groups/users/kai/lofi-study-room', join_policy: 'open', my_role: 'member', member_count: 512 },
];

interface SeedDirectoryEntry {
  group_id: string;
  name: string;
  owner: string;
  slug: string;
  join_policy: string;
  member_count: number;
  tags: string[];
  permission_summary: string;
}

const DIRECTORY: SeedDirectoryEntry[] = [
  { group_id: 'web10/groups/users/nova/synthwave-sessions', name: 'Synthwave Sessions', owner: 'nova', slug: 'synthwave-sessions', join_policy: 'open', member_count: 128, tags: ['music', 'synthwave'], permission_summary: 'member: readAll, create' },
  { group_id: 'web10/groups/users/pixel/retro-gaming-loft', name: 'Retro Gaming Loft', owner: 'pixel', slug: 'retro-gaming-loft', join_policy: 'open', member_count: 256, tags: ['gaming', 'retro'], permission_summary: 'member: readAll, create' },
  { group_id: 'web10/groups/users/luna/creator-backstage', name: 'Creator Backstage', owner: 'luna', slug: 'creator-backstage', join_policy: 'request', member_count: 89, tags: ['creators', 'behind-the-scenes'], permission_summary: 'member: readAll' },
  { group_id: 'web10/groups/users/kai/lofi-study-room', name: 'Lo-fi Study Room', owner: 'kai', slug: 'lofi-study-room', join_policy: 'open', member_count: 512, tags: ['music', 'study'], permission_summary: 'member: readAll, create' },
  { group_id: 'web10/groups/users/marco/street-photography', name: 'Street Photography', owner: 'marco', slug: 'street-photography', join_policy: 'request', member_count: 167, tags: ['photography', 'street'], permission_summary: 'member: readAll' },
  { group_id: 'web10/groups/users/vera/inner-circle', name: 'Inner Circle', owner: 'vera', slug: 'inner-circle', join_policy: 'invite_only', member_count: 24, tags: [], permission_summary: 'member: readAll' },
];

export async function getMyCommunityGroups(): Promise<SeedGroup[]> {
  return MY_GROUPS;
}
export async function readGroupDirectory(): Promise<SeedDirectoryEntry[]> {
  return DIRECTORY;
}
export async function readGroupDetail(groupId: string): Promise<unknown> {
  const entry = DIRECTORY.find((g) => g.group_id === groupId) ?? DIRECTORY[0];
  return {
    group_id: entry.group_id,
    name: entry.name,
    owner: entry.owner,
    slug: entry.slug,
    join_policy: entry.join_policy,
    discoverable: true,
    member_count: entry.member_count,
    roles: [],
    permission_summary: entry.permission_summary,
    description: 'A shared space on your node — content you co-create with the people you choose.',
    banner_ref: '',
    avatar_ref: '',
    website: '',
    tags: entry.tags,
    is_member: true,
    posts_state: 'ok',
    posts: [
      { doc_id: 'gp-1', author_key: entry.owner, collection_name: 'posts', body: { text: 'First drop of the week is live — feedback welcome 🎧' }, created_at: minsAgo(42), updated_at: minsAgo(42) },
      { doc_id: 'gp-2', author_key: 'kai', collection_name: 'posts', body: { text: 'Who is in for the Friday session?' }, created_at: minsAgo(60 * 5), updated_at: minsAgo(60 * 5) },
    ],
  };
}
export async function joinGroup(): Promise<unknown> { return { status: 'joined' }; }
export async function readGroupIdentity(groupId: string): Promise<unknown> {
  // Per-group faces so the My Groups list capture shows a mix of face states:
  // nova → banner + avatar, luna → banner only, kai → no face (gradient fallback).
  const faces: Record<string, unknown> = {
    'web10/groups/users/nova/synthwave-sessions': {
      name: 'Synthwave Sessions',
      description: 'A shared space on your node — content you co-create with the people you choose.',
      banner_ref: 'grp-banner-nova',
      avatar_ref: 'grp-avatar-nova',
      website: 'https://synthwave.example.com',
      tags: ['music', 'synthwave'],
    },
    'web10/groups/users/luna/creator-backstage': {
      name: 'Creator Backstage',
      description: 'Behind the scenes with the creators.',
      banner_ref: 'grp-banner-luna',
      avatar_ref: '',
      tags: ['creators', 'behind-the-scenes'],
    },
    'web10/groups/users/kai/lofi-study-room': {
      name: 'Lo-fi Study Room',
      description: 'Lo-fi beats for studying.',
      banner_ref: '',
      avatar_ref: '',
      tags: ['music', 'study'],
    },
  };
  return faces[groupId] ?? {};
}
export async function getGroupsManages(): Promise<unknown[]> {
  // The harness user manages the synthwave-sessions group → the detail screen
  // shows the manager-only "Manage" entry point in the capture.
  return [{ group_id: 'web10/groups/users/nova/synthwave-sessions', join_policy: 'open', my_role: 'owner', member_count: 128 }];
}
// The Manage-sheet sections import these from the @/data barrel — the harness
// aliases @/data to this file, so every named import must exist here or the
// page errors at module load. No-op stubs (the capture renders the detail
// screen, not the sheet's mutations).
export async function writeGroupIdentity(): Promise<void> { return; }
export async function updateGroup(): Promise<unknown> { return {}; }
export async function addGroupMember(): Promise<unknown> { return {}; }
export async function removeGroupMember(): Promise<unknown> { return {}; }
export async function deleteGroup(): Promise<unknown> { return { status: 'deleted' }; }
export async function getGroupMembers(): Promise<unknown[]> {
  return [
    { member_key: 'web10/users/nova', role: 'owner' },
    { member_key: 'web10/users/kai', role: 'member' },
    { member_key: 'anyone', role: 'reader' },
  ];
}
// ── Group chat (group-chat.md, D77) ──────────────────────────────────────────
// A seeded group chat so the Messages list + thread render with content. The
// harness user is 'nova' (the mock-wapi token).
const GROUP_CHAT_ID = 'web10/groups/users/nova/chat-the-crew';
export async function getMyGroupChats(): Promise<unknown[]> {
  return [{ groupId: GROUP_CHAT_ID, name: 'The Crew', avatarRef: undefined }];
}
export async function readGroupChatFace(): Promise<unknown> {
  return { name: 'The Crew', avatarRef: undefined };
}
export async function readGroupChatMessages(): Promise<unknown[]> {
  return [
    { _id: 'gc-1', message: 'crew — the new drop is almost ready', sent_at: minsAgo(90), sender_username: 'kai', sender_provider: 'web10', recipient_username: '', recipient_provider: '' },
    { _id: 'gc-2', message: 'sending you the rate card now', sent_at: minsAgo(42), sender_username: 'nova', sender_provider: 'web10', recipient_username: '', recipient_provider: '' },
    { _id: 'gc-3', message: 'the reach on that reel was unreal 🔥', sent_at: minsAgo(6), sender_username: 'luna', sender_provider: 'web10', recipient_username: '', recipient_provider: '' },
  ];
}
export async function sendGroupChatMessage(): Promise<unknown> {
  return { _id: 'gc-new', message: '', sent_at: new Date().toISOString(), sender_username: 'nova', sender_provider: 'web10', recipient_username: '', recipient_provider: '' };
}
export async function createGroupChat(): Promise<string> { return GROUP_CHAT_ID; }
export function groupChatRouteKey(groupId: string): string { return `group/${groupId}`; }
export function groupIdFromRouteKey(key: string): string | null {
  return key.startsWith('group/') ? key.slice('group/'.length) : null;
}
export async function getJoinRequests(): Promise<unknown[]> { return []; }
export async function approveJoinRequest(): Promise<unknown> { return { status: 'approved' }; }
export async function denyJoinRequest(): Promise<unknown> { return { status: 'declined' }; }
export async function inviteMember(): Promise<unknown> { return { status: 'invited' }; }
export async function requestJoinGroup(): Promise<unknown> { return { status: 'pending' }; }
export async function leaveGroup(): Promise<unknown> { return { status: 'left' }; }
// Media ref id (the group detail maps post media refs to resolved records).
export function mediaRefId(ref: string | { doc_id?: string }): string {
  return typeof ref === 'string' ? ref : ref.doc_id || '';
}
export function groupDisplayName(groupId: string, name?: string): string {
  if (name) return name;
  const parts = groupId.split('/');
  return parts[parts.length - 1] || groupId;
}

// ── Feed (screenshot seed) ───────────────────────────────────────────────────
// The Feed screen (the D36 knob rack + the follower feed) reads these.
// Seeded so the PR shots render with realistic content and no backend.

interface SeedFeedPost {
  _id: string;
  author_username: string;
  author_provider: string;
  text: string;
  created_at: string;
  tags?: string[];
  likes: number;
  comments: number;
  reposts: number;
  // A repost (reposts.md): the doc_id of the post this one reposts. The feed
  // renders it as a "reposted" card with the original embedded.
  repost_of?: string;
  // Carried ads (D55 + D57) — the screenshot seed shows the new ad block.
  ad?: unknown;
  node_ad?: unknown;
  // Media refs (doc_ids resolved against DISCOVER_MEDIA) — the feed's video
  // layout (the 9:16 cap) is exercised by fp-vid's portrait clip.
  media_refs?: string[];
}

// A self-contained SVG creative (renders offline, no network) — a gradient
// "product shot" so the ad's media density is visible in the PR shot.
function adCreative(label: string, from: string, to: string): unknown {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
    `</linearGradient></defs>` +
    `<rect width='800' height='450' fill='url(#g)'/>` +
    `<text x='40' y='250' font-family='sans-serif' font-size='44' font-weight='700' fill='white'>${label}</text>` +
    `</svg>`;
  return {
    doc_id: `media-${label}`,
    object_key: null,
    mime_type: 'image/svg+xml',
    filename: `${label}.svg`,
    size_bytes: 500,
    read_url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width: 800,
    height: 450,
    duration_seconds: null,
    thumbnail_url: null,
  };
}

const FEED_POSTS: SeedFeedPost[] = [
  {
    // A PORTRAIT (9:16) video post — the transcoded (hls) path, the case that
    // used to render a full-width 9:16 box in the feed (~1.78× the card tall).
    // The feed caps it to ≤60vh + centers it in a black letterbox (the PR shot
    // verifies the cap).
    _id: 'fp-vid',
    author_username: 'luna',
    author_provider: 'web10',
    text: 'Studio b-roll — the way it actually looks between takes.',
    created_at: minsAgo(2),
    tags: ['video'],
    likes: 156,
    comments: 19,
    reposts: 4,
    media_refs: ['dm-portrait2'],
  },
  {
    // A REPOST (reposts.md): the signed-in user ('me') amplifying luna's post
    // with a comment. Renders the "reposted" badge + the quote + the embedded
    // original (readPostById('fp-2')).
    _id: 'fp-repost',
    author_username: 'me',
    author_provider: 'web10',
    text: 'This is the pitch in one post. No algorithm between the creator and the fan — that is the whole thing.',
    created_at: minsAgo(4),
    repost_of: 'fp-2',
    likes: 12,
    comments: 3,
    reposts: 0,
  },
  {
    // The signed-in user's own post (token username 'me') — renders the
    // owner kebab menu (Share / Edit / Make private / Delete) on the card.
    _id: 'fp-0',
    author_username: 'me',
    author_provider: 'web10',
    text: 'Rack is finally quiet — swapped the PSUs and the whole thing idles cold. Server room, but make it cozy.',
    created_at: minsAgo(12),
    tags: ['homelab', 'server'],
    likes: 42,
    comments: 7,
    reposts: 0,
  },
  {
    _id: 'fp-1',
    author_username: 'nova',
    author_provider: 'web10',
    text: 'Late night synth session — the new drop is almost ready. Feedback welcome 🎧',
    created_at: minsAgo(38),
    tags: ['music', 'synthwave'],
    likes: 128,
    comments: 24,
    reposts: 0,
    // A creator ad (violet "Ad" dressing) with a media creative.
    ad: {
      _id: 'ad-nova-1',
      text: 'The analog synth I use for everything — linked below.',
      media_refs: [adCreative('NOVA-1S', '#8b5cf6', '#2e1065')],
      offer: {
        kind: 'affiliate',
        partner: 'SynthLab',
        link: 'https://synthlab.example/nova-1s?ref=nova',
        cta: 'Get it',
        disclosure: 'I may earn a commission from this link.',
      },
      status: 'active',
      author_username: 'nova',
      variant: 'creator',
    },
  },
  {
    _id: 'fp-2',
    author_username: 'luna',
    author_provider: 'web10',
    text: 'Behind the scenes from the studio day. The new series drops Friday — no algorithm between you and the post, it just arrives.',
    created_at: minsAgo(60 * 5),
    tags: ['creators', 'behind-the-scenes'],
    likes: 342,
    comments: 51,
    reposts: 0,
    // BOTH ads present (D57): the creator's pinned ad + the node's ad.
    ad: {
      _id: 'ad-luna-1',
      text: 'My favorite studio mic, on everything.',
      media_refs: [adCreative('AERO M2', '#7c3aed', '#4c1d95')],
      offer: {
        kind: 'affiliate',
        partner: 'Aero Audio',
        link: 'https://aero.example/m2?ref=luna',
        cta: 'Shop it',
        disclosure: 'I may earn a commission from this link.',
      },
      status: 'active',
      author_username: 'luna',
      variant: 'creator',
    },
    node_ad: {
      _id: 'node-ad-1',
      text: 'WorkflowCo — the tool our whole node runs on.',
      offer: {
        kind: 'direct',
        partner: 'WorkflowCo',
        link: 'https://workflowco.example?ref=node',
        cta: 'Learn more',
        disclosure: 'Sponsored by this node.',
      },
      status: 'active',
      author_username: 'nodeops',
      variant: 'node',
    },
  },
  {
    _id: 'fp-3',
    author_username: 'kai',
    author_provider: 'web10',
    text: 'Lo-fi study room is live. Headphones on, world off.',
    created_at: minsAgo(60 * 26),
    tags: ['music', 'study'],
    likes: 87,
    comments: 12,
    reposts: 0,
  },
];

export async function readFeed(): Promise<unknown[]> { return FEED_POSTS; }
// The cursor-paginated feed read (3.72.0) — FeedScreen's data source. Returns
// the seeded posts as a single page (no more). The real read serves
// media_refs PRE-RESOLVED (objects with read_url + dims + transcoding_settings
// — the feed filters out bare string refs), so the harness resolves string
// refs against DISCOVER_MEDIA here, the same way the node's read does.
export async function readFeedPage(): Promise<unknown> {
  const posts = FEED_POSTS.map((p) => {
    if (!p.media_refs?.length) return p;
    // The real read serves media_refs as ResolvedMediaRef objects (doc_id +
    // read_url + dims + transcoding_settings) — the feed's
    // fromResolvedMediaRef expects that shape, so map the media records
    // (which key on _id/url) onto it.
    const resolved = p.media_refs
      .map((id) => {
        const m = DISCOVER_MEDIA[id];
        if (!m) return null;
        return {
          doc_id: m._id,
          object_key: m.object_key ?? null,
          mime_type: m.mime_type,
          size_bytes: m.size_bytes ?? null,
          read_url: m.url,
          width: m.width ?? null,
          height: m.height ?? null,
          duration_seconds: m.duration_seconds ?? null,
          thumbnail_url: m.thumbnail_url ?? null,
          transcoding_settings: m.transcoding_settings ?? null,
        };
      })
      .filter(Boolean);
    return { ...p, media_refs: resolved };
  });
  return { posts, has_more: false, next_cursor: null };
}
export async function getFeedGroups(): Promise<string[]> {
  return FEED_POSTS.map((p) => `web10/groups/users/${p.author_username}/followers`);
}
export async function readFeedEngagement(): Promise<{ likes: Record<string, number>; comments: Record<string, number> }> {
  const likes: Record<string, number> = {};
  const comments: Record<string, number> = {};
  for (const p of FEED_POSTS) {
    likes[p._id] = p.likes;
    comments[p._id] = p.comments;
  }
  return { likes, comments };
}
// The reader's own like/dislike per feed post (the feed's initial-state load).
// Seeded so the PR shot shows a filled heart on the first post.
export async function readFeedReactions(postIds: string[]): Promise<{ liked: Record<string, boolean>; disliked: Record<string, boolean>; reposted: Record<string, boolean> }> {
  const liked: Record<string, boolean> = {};
  const disliked: Record<string, boolean> = {};
  const reposted: Record<string, boolean> = {};
  for (const id of postIds) {
    if (id === 'fp-1') liked[id] = true;
  }
  return { liked, disliked, reposted };
}

// ── Discover (screenshot seed) ───────────────────────────────────────────────
// The Discover screen (the D36 board: knob rack + ranked posts + the YouTube
// view toggle) reads these. Seeded so the PR shots render the real card +
// video layouts with no backend. Media are self-contained SVG creatives
// (offline, no network) — a landscape clip, a portrait clip (the 9:16 case
// that stresses the layout), and an image.

interface SeedDiscoverPost {
  _id: string;
  author: string;
  author_username: string;
  author_provider: string;
  text: string;
  created_at: string;
  tags?: string[];
  likes: number;
  comments: number;
  reposts: number;
  media_refs?: string[];
}

function creative(label: string, w: number, h: number, from: string, to: string, mime = 'video/mp4'): Record<string, unknown> {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
    `</linearGradient></defs>` +
    `<rect width='${w}' height='${h}' fill='url(#g)'/>` +
    `<text x='40' y='${Math.round(h / 2)}' font-family='sans-serif' font-size='${Math.round(h / 8)}' font-weight='700' fill='white'>${label}</text>` +
    `</svg>`;
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return {
    _id: `dm-${label}`,
    url: dataUrl,
    object_key: null,
    created_at: minsAgo(60),
    mime_type: mime,
    size_bytes: 500,
    width: w,
    height: h,
    duration_seconds: mime.startsWith('video/') ? 42 : null,
    thumbnail_url: dataUrl,
  };
}

// Media records keyed by the doc_id the post's media_refs point at. The _id
// must match the key (and the post's ref) — the discover screen filters
// resolved media by `m._id === the post's ref doc_id`.
const DISCOVER_MEDIA: Record<string, Record<string, unknown>> = {
  'dm-landscape': { ...creative('LIVE SET', 1280, 720, '#8b5cf6', '#2e1065'), _id: 'dm-landscape' },
  'dm-portrait': { ...creative('VERTICAL', 720, 1280, '#7c3aed', '#4c1d95'), _id: 'dm-portrait' },
  'dm-clip3': { ...creative('STILL', 1600, 900, '#a78bfa', '#1e1b4b'), _id: 'dm-clip3' },
  'dm-portrait2': {
    ...creative('STUDIO', 720, 1280, '#0ea5e9', '#0c4a6e'),
    _id: 'dm-portrait2',
    // Transcoded (D44) — the source the node serves for real uploads
    // (status done + a minted manifest_url → the hls path). The Shorts
    // capture must exercise this: it is the path that used to render the
    // full control rack in a 280px column instead of filling the slide.
    transcoding_settings: {
      status: 'done',
      manifest_url: '/v3/media/hls/manifest?doc_id=dm-portrait2&sig=harness',
      variants: [{ width: 540, height: 960 }],
    },
  },
  'dm-portrait3': { ...creative('BACKSTAGE', 720, 1280, '#f59e0b', '#78350f'), _id: 'dm-portrait3' },
};

// Profile face media (avatar + banner + the owner's posts' media) — the
// profile face lightbox's pick-from-your-posts grid. Image creatives (the
// picker renders <img> for image mime types).
const FACE_MEDIA: Record<string, Record<string, unknown>> = {
  'face-avatar': { ...creative('NOVA', 640, 640, '#8b5cf6', '#2e1065', 'image/png'), _id: 'face-avatar' },
  'face-banner': { ...creative('BANNER', 1600, 400, '#7c3aed', '#4c1d95', 'image/png'), _id: 'face-banner' },
  'face-post-1': { ...creative('DROP', 1280, 720, '#a78bfa', '#1e1b4b', 'image/png'), _id: 'face-post-1' },
  'face-post-2': { ...creative('STUDIO', 720, 1280, '#8b5cf6', '#3b0764', 'image/png'), _id: 'face-post-2' },
  'face-post-3': { ...creative('SET', 1600, 900, '#c4b5fd', '#312e81', 'image/png'), _id: 'face-post-3' },
  // Group faces (D60) for the My Groups list capture — a mix of face states so
  // the shot shows real cover+avatar, banner-only, and the gradient fallback.
  'grp-banner-nova': { ...creative('SYNTHWAVE', 1600, 400, '#7c3aed', '#1e1b4b', 'image/png'), _id: 'grp-banner-nova' },
  'grp-avatar-nova': { ...creative('SYNTH', 640, 640, '#8b5cf6', '#2e1065', 'image/png'), _id: 'grp-avatar-nova' },
  'grp-banner-luna': { ...creative('CREATOR', 1600, 400, '#f59e0b', '#78350f', 'image/png'), _id: 'grp-banner-luna' },
  'grp-banner-kai': { ...creative('LO-FI', 1600, 400, '#0ea5e9', '#0c4a6e', 'image/png'), _id: 'grp-banner-kai' },
};

const DISCOVER_POSTS: SeedDiscoverPost[] = [
  {
    _id: 'dp-1',
    author: 'nova',
    author_username: 'nova',
    author_provider: 'web10',
    text: 'Late night synth session — the new drop is almost ready. Feedback welcome 🎧',
    created_at: minsAgo(38),
    tags: ['music', 'synthwave', 'video'],
    likes: 128,
    comments: 24,
    reposts: 3,
    media_refs: ['dm-landscape'],
  },
  {
    _id: 'dp-2',
    author: 'luna',
    author_username: 'luna',
    author_provider: 'web10',
    text: 'Vertical cut from the studio day. The new series drops Friday — no algorithm between you and the post.',
    created_at: minsAgo(60 * 5),
    tags: ['creators', 'video'],
    likes: 342,
    comments: 51,
    reposts: 12,
    media_refs: ['dm-portrait'],
  },
  {
    _id: 'dp-3',
    author: 'kai',
    author_username: 'kai',
    author_provider: 'web10',
    text: 'Lo-fi study room is live. Headphones on, world off.',
    created_at: minsAgo(60 * 26),
    tags: ['study', 'video'],
    likes: 87,
    comments: 12,
    reposts: 0,
    media_refs: ['dm-clip3'],
  },
  {
    _id: 'dp-4',
    author: 'nova',
    author_username: 'nova',
    author_provider: 'web10',
    text: 'Three frames from the set — swipe through the full run.',
    created_at: minsAgo(12),
    tags: ['synthwave', 'video'],
    likes: 210,
    comments: 33,
    reposts: 8,
    media_refs: ['dm-landscape', 'dm-portrait', 'dm-clip3'],
  },
  {
    _id: 'dp-5',
    author: 'luna',
    author_username: 'luna',
    author_provider: 'web10',
    text: 'Studio b-roll — the way it actually looks between takes.',
    created_at: minsAgo(90),
    tags: ['short', 'video'],
    likes: 156,
    comments: 19,
    reposts: 4,
    media_refs: ['dm-portrait2'],
  },
  {
    _id: 'dp-6',
    author: 'kai',
    author_username: 'kai',
    author_provider: 'web10',
    text: 'Backstage before the stream. 3… 2… 1…',
    created_at: minsAgo(200),
    tags: ['short', 'video'],
    likes: 98,
    comments: 11,
    reposts: 2,
    media_refs: ['dm-portrait3'],
  },
];

export async function readDiscoverFeed(): Promise<unknown[]> { return DISCOVER_POSTS; }
// The Shorts feed (shorts.md): the discover board filtered to genuine shorts —
// a post whose single media is a REAL 9:16 video, re-derived from the resolved
// media (the render-time gate), not the client-asserted `short` tag.
export async function readShortsFeed(): Promise<{ post: unknown; media: unknown }[]> {
  const shorts: { post: unknown; media: unknown }[] = [];
  for (const p of DISCOVER_POSTS) {
    if (!p.media_refs?.length) continue;
    const media = p.media_refs.map((id) => DISCOVER_MEDIA[id]).filter(Boolean);
    const vertical = media.filter(
      (m) => (m.mime_type as string)?.startsWith('video/') && m.width && m.height && m.width < m.height,
    );
    if (vertical.length === 1 && p.media_refs.length === 1) {
      shorts.push({ post: p, media: vertical[0] });
    }
  }
  return shorts;
}
// The Discover screen resolves a post's media_refs to MediaRecords. The mock
// maps the seeded doc_ids to the creatives above (url + thumbnail + dims).
export async function resolveMediaRefs<T>(refs: T[]): Promise<T[]> {
  const out: T[] = [];
  for (const r of refs) {
    const id = typeof r === 'string' ? r : (r as { doc_id?: string }).doc_id || '';
    // PROFILE_MEDIA / FACE_MEDIA are declared later in the module (the profile
    // seed sections) — safe: the lookup runs at call time, after the module is
    // evaluated.
    const rec = DISCOVER_MEDIA[id] ?? PROFILE_MEDIA[id] ?? FACE_MEDIA[id];
    if (rec) out.push(rec as T);
  }
  return out;
}
export async function readUserProfile(): Promise<unknown> {
  return { display_name: 'Nova', username: 'nova', provider: 'web10', avatar_ref: '', bio: 'Synthwave producer' };
}
export async function lookupUserProfile(username?: string): Promise<unknown> {
  // Return a face for the seeded peers so the DM compose preview renders.
  const peer = PEERS.find((p) => p.username === username);
  if (peer) {
    return {
      username: peer.username,
      provider: peer.provider,
      display_name: peer.display_name,
      bio: 'Creator on web10',
      avatar_url: creative(peer.display_name.split(' ')[0].toUpperCase(), 400, 400, '#8b5cf6', '#2e1065', 'image/png').url,
    };
  }
  return null;
}
// A repost's embed (reposts.md) reads the original by doc_id. The harness
// returns the seeded feed post that the repost references (fp-2 = luna's post),
// so the "reposted" card renders the embedded original.
export async function readPostById(docId: string): Promise<unknown> {
  const p = FEED_POSTS.find((x) => x._id === docId);
  if (!p) return null;
  return {
    _id: p._id,
    text: p.text,
    created_at: p.created_at,
    author_username: p.author_username,
    author_provider: p.author_provider,
    profile: { display_name: p.author_username === 'luna' ? 'Luna Reyes' : p.author_username },
    media_refs: [],
    // The original's creator-pinned ad (D55) rides into the repost embed — the
    // seed shows the ad-in-embed path (luna's post fp-2 carries a creator ad).
    ad: p.ad,
  };
}
export async function readProfile(): Promise<unknown> {
  // The profile screen's owner path (the harness user is 'me') — a creator
  // page with a face + bio so the banner/avatar/stats render in the capture.
  // The face refs + the posts' media refs (PROFILE_POSTS) also feed the face
  // lightbox's pick-from-your-posts grid (dev 3.88.0) — one seed, both features.
  return {
    display_name: 'Nova',
    username: 'me',
    provider: 'web10',
    avatar_ref: 'pf-avatar',
    banner_ref: 'pf-banner',
    bio: 'Synthwave producer — new series drops Friday. No algorithm between you and the post.',
    location: 'Berlin',
    website: 'nova.example.com',
  };
}
export async function fetchSuggestedUsers(): Promise<unknown[]> {
  return [
    { username: 'luna', provider: 'web10', display_name: 'Luna Reyes', followers_count: 12400, bio: 'Creator · behind the scenes' },
    { username: 'kai', provider: 'web10', display_name: 'Kai Mori', followers_count: 5120, bio: 'Lo-fi study beats' },
    { username: 'pixel', provider: 'web10', display_name: 'Pixel', followers_count: 25600, bio: 'Retro gaming' },
  ];
}

// ── People (screenshot seed) ─────────────────────────────────────────────────
// The People screen (find profiles, sorted by mutuals) reads fetchPeople.
// Seeded with a mix of face states so the capture shows: banner+avatar,
// avatar-only (gradient banner), no-face (initial fallback), and the
// Following vs Follow button states.
export async function fetchPeople(_limit = 20): Promise<unknown[]> {
  return [
    {
      username: 'luna', provider: 'web10', display_name: 'Luna Reyes',
      bio: 'Creator · behind the scenes',
      avatar_ref: 'pp-avatar-luna', banner_ref: 'pp-banner-luna',
      avatar_url: creative('LUNA', 400, 400, '#8b5cf6', '#2e1065', 'image/png').url,
      banner_url: creative('LUNA BANNER', 1600, 400, '#7c3aed', '#4c1d95', 'image/png').url,
      followers_count: 12400, mutuals: 5, is_following: true,
    },
    {
      username: 'kai', provider: 'web10', display_name: 'Kai Mori',
      bio: 'Lo-fi study beats',
      avatar_ref: 'pp-avatar-kai',
      avatar_url: creative('KAI', 400, 400, '#0ea5e9', '#0c4a6e', 'image/png').url,
      followers_count: 5120, mutuals: 3, is_following: false,
    },
    {
      username: 'marco', provider: 'web10', display_name: 'Marco Silva',
      followers_count: 167, mutuals: 2, is_following: false,
    },
    {
      username: 'vera', provider: 'web10', display_name: 'Vera Costa',
      bio: 'Street photography',
      banner_ref: 'pp-banner-vera',
      banner_url: creative('VERA BANNER', 1600, 400, '#f59e0b', '#78350f', 'image/png').url,
      followers_count: 24, mutuals: 1, is_following: true,
    },
    {
      username: 'pixel', provider: 'web10', display_name: 'Pixel',
      bio: 'Retro gaming',
      avatar_ref: 'pp-avatar-pixel', banner_ref: 'pp-banner-pixel',
      avatar_url: creative('PIXEL', 400, 400, '#22c55e', '#14532d', 'image/png').url,
      banner_url: creative('PIXEL BANNER', 1600, 400, '#16a34a', '#052e16', 'image/png').url,
      followers_count: 25600, mutuals: 0, is_following: false,
    },
  ];
}

// The People screen imports sortPeople from the @/data barrel — provide a
// working implementation so the harness renders the correct sort order.
export function sortPeople(people: any[], sort: string): any[] {
  const arr = [...people];
  switch (sort) {
    case 'popular':
      arr.sort((a, b) => (b.followers_count - a.followers_count) || a.username.localeCompare(b.username));
      break;
    case 'az':
      arr.sort((a, b) => a.username.localeCompare(b.username));
      break;
    default:
      arr.sort((a, b) => (b.mutuals - a.mutuals) || (b.followers_count - a.followers_count) || a.username.localeCompare(b.username));
      break;
  }
  return arr;
}

// ── Profile (screenshot seed) ────────────────────────────────────────────────
// The profile screen (the creator page: banner + stats + the posts tab with
// its grid | feed view lens) reads these. Seeded so the PR shots render with
// realistic content and no backend — the feed view shows the facebook-shaped
// card stream (text + media + the engagement bar), the grid the insta tiles.
// The stubs above (readMyPosts / readReactions / countComments /
// resolveMediaRefs) read these seeds.

const PROFILE_MEDIA: Record<string, Record<string, unknown>> = {
  'pf-avatar': { ...creative('NOVA', 400, 400, '#8b5cf6', '#2e1065', 'image/png'), _id: 'pf-avatar' },
  'pf-banner': { ...creative('SYNTHWAVE', 1600, 500, '#7c3aed', '#1e1b4b', 'image/png'), _id: 'pf-banner' },
  'pf-media-1': { ...creative('LIVE SET', 1280, 720, '#8b5cf6', '#2e1065', 'image/png'), _id: 'pf-media-1' },
  'pf-media-2': { ...creative('VERTICAL', 720, 1280, '#7c3aed', '#4c1d95'), _id: 'pf-media-2' },
  'pf-media-3': { ...creative('STILL', 1000, 1000, '#a78bfa', '#1e1b4b', 'image/png'), _id: 'pf-media-3' },
};

const PROFILE_POSTS = [
  {
    _id: 'pp-1',
    author_username: 'me',
    author_provider: 'web10',
    text: 'Late night synth session — the new drop is almost ready. Feedback welcome 🎧',
    created_at: minsAgo(38),
    tags: ['music', 'synthwave'],
    media_refs: ['pf-media-1'],
  },
  {
    _id: 'pp-2',
    author_username: 'me',
    author_provider: 'web10',
    text: 'Vertical cut from the studio day. No algorithm between you and the post — it just arrives.',
    created_at: minsAgo(60 * 5),
    tags: ['creators', 'behind-the-scenes'],
    media_refs: ['pf-media-2', 'pf-media-3'],
  },
  {
    _id: 'pp-3',
    author_username: 'me',
    author_provider: 'web10',
    text: 'Headphones on, world off. Lo-fi study room is live.',
    created_at: minsAgo(60 * 26),
    tags: ['music', 'study'],
  },
];
