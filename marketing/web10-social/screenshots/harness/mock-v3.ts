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

// The REAL getV3Client() is a module-level singleton (src/data/v3.ts:
// `let v3Client: V3Client | null` — create once, return the same object).
// Consumers rely on that identity: useFeedSources' `live` generation guard is
// `getV3Client() === client` with the client held in a useCallback dep, and
// feedSources' store `current()` re-checks the same comparison. A fresh
// object per call breaks the contract: `live` gets a new identity on every
// render, useFeedSources' load effect (whose dep array carries it) re-runs on
// every render, and its synchronous setState schedules the next render →
// React's "Maximum update depth exceeded" spam on every harness capture
// (31–322 warnings per music screen, seen 11.11.2026). One stable object.
const v3Client = {
  readToken: () => getWapi().readToken(),
  listPeopleDirectory: async () => ({ users: [
    { username: 'nova', profile: { display_name: 'Nova Lane' } },
    { username: 'noah', profile: { display_name: 'Noah Reed' } },
    { username: 'kai', profile: { display_name: 'Kai Moreno' } },
  ] }),
  getMyGroups: async () => [{ group_id: groupId, my_role: 'publisher' }],
  getGroup: async () => ({ group_id: groupId, roles: [{ name: 'publisher', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'] } }] }),
  read: async () => [{ doc_id: 'studio-face', author_key: 'me', body: { name: 'Northstar Studio' } }],
  query: async (sql: string) => ({ rows: sql.includes('FROM profile') ? [
    { author_key: 'nova', avatar_url: avatar('N', '#8b5cf6', '#2e1065') },
    { author_key: 'noah', avatar_url: avatar('NR', '#3b82f6', '#172554') },
    { author_key: 'kai', avatar_url: avatar('K', '#8b5cf6', '#2e1065') },
  ] : [{ group_id: groupId, avatar_url: avatar('NS', '#8b5cf6', '#2e1065') }], count: 1 }),
  documentAttachment: async (_docId: string, _groupId: string, opts?: { attached?: boolean }) => ({ attached: opts?.attached ?? true }),
};

export function getV3Client() {
  return v3Client;
}
