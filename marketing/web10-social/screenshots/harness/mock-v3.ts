import { getWapi } from './mock-wapi';
export * from '../../src/data/v3';

const groupId = 'web10/groups/users/me/studio';

// A self-contained SVG avatar (renders offline, no network) — the identity
// picker's face-prepare rows carry it so the menu shows a real profile picture.
function avatar(label: string, from: string, to: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
    `</linearGradient></defs>` +
    `<rect width='128' height='128' fill='url(#g)'/>` +
    `<text x='64' y='82' text-anchor='middle' font-family='sans-serif' font-size='56' font-weight='700' fill='white'>${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Match the real client's stable identity: ownership effects key on this object.
// A fresh object on every read creates an endless effect/reset loop in previews.
const client = {
    trackContentEvent: async () => ({ recorded: true }),
    readToken: () => getWapi().readToken(),
    trackContentEvent: async () => ({ recorded: true }),
    listPeopleDirectory: async () => ({ users: [
      { username: 'nova', profile: { display_name: 'Nova Lane' } },
      { username: 'noah', profile: { display_name: 'Noah Reed' } },
      { username: 'kai', profile: { display_name: 'Kai Moreno' } },
    ] }),
    getMyGroups: async () => new URLSearchParams(location.search).has('realFollowing') ? [
      ...['luna', 'vera', 'luna', 'nova'].map(username => ({ group_id: `web10/groups/users/${username}/followers`, my_role: 'member' })),
      { group_id: groupId, my_role: 'publisher' },
    ] : [{ group_id: groupId, my_role: 'publisher' }],
    // The real Followers loader/count helper can run against this synthetic
    // membership seam; unrelated preview modes never request it.
    getGroupMembers: async (id: string, opts?: { offset?: number }) => {
      if (opts?.offset) return [];
      const username = id.split('/').at(-2);
      if (username === 'me') return Array.from({ length: 13 }, (_, i) => ({
        member_key: ['luna', 'vera', 'nova'][i] || `fan-${i}`, role: 'member',
      }));
      const count = username === 'luna' ? 2 : username === 'vera' ? 7 : 0;
      return [
        { member_key: username, role: 'owner' },
        { member_key: 'anyone', role: 'reader' },
        ...Array.from({ length: count }, (_, i) => ({ member_key: `audience-${i}`, role: 'member' })),
      ];
    },
    getGroup: async () => ({ group_id: groupId, roles: [{ name: 'publisher', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'] } }] }),
    read: async () => [{ doc_id: 'studio-face', author_key: 'me', body: { name: 'Northstar Studio' } }],
    query: async (sql: string) => {
      if (sql.includes('AS post_count') && sql.includes("'hashtags'")) {
        const params = new URLSearchParams(location.search);
        const state = params.get('hashtagState');
        if (state === 'loading') await new Promise(resolve => setTimeout(resolve, 1500));
        if (state === 'error') throw new Error('Synthetic hashtag transport failure');
        const q = /position\(hashtag, '([^']*)'\)/.exec(sql)?.[1] || '';
        const rank = (tag: string) => !q || tag === q ? 0 : tag.startsWith(q) ? 1 : 2;
        const rows = [
          { hashtag: 'music', post_count: 100000 }, { hashtag: 'musician', post_count: 220000 },
          { hashtag: 'livemusic', post_count: 500000 }, { hashtag: 'musicvideo', post_count: 7200 },
          { hashtag: 'music_production', post_count: 1400 }, { hashtag: 'music_lovers', post_count: 1 },
        ].filter(row => row.hashtag.includes(q) && state !== 'empty')
          .sort((a, b) => rank(a.hashtag) - rank(b.hashtag) || b.post_count - a.post_count || a.hashtag.localeCompare(b.hashtag));
        return { rows, count: rows.length };
      }
      return { rows: sql.includes('FROM profile') ? [
      { author_key: 'nova', avatar_url: avatar('N', '#8b5cf6', '#2e1065') },
      { author_key: 'noah', avatar_url: avatar('NR', '#3b82f6', '#172554') },
      { author_key: 'kai', avatar_url: avatar('K', '#8b5cf6', '#2e1065') },
    ] : [{ group_id: groupId, avatar_url: avatar('NS', '#8b5cf6', '#2e1065') }], count: 1 };
    },
    documentAttachment: async (_docId: string, _groupId: string, opts?: { attached?: boolean }) => ({ attached: opts?.attached ?? true }),
};

export function getV3Client() {
  return client;
}
