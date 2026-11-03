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

export function getV3Client() {
  return {
    readToken: () => getWapi().readToken(),
    getMyGroups: async () => [{ group_id: groupId, my_role: 'publisher' }],
    getGroup: async () => ({ group_id: groupId, roles: [{ name: 'publisher', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'] } }] }),
    read: async () => [{ doc_id: 'studio-face', author_key: 'me', body: { name: 'Northstar Studio' } }],
    query: async () => ({ rows: [{ group_id: groupId, avatar_url: avatar('NS', '#8b5cf6', '#2e1065') }], count: 1 }),
  };
}
