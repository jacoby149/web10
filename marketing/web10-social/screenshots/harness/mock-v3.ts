import { getWapi } from './mock-wapi';
export * from '../../src/data/v3';

const groupId = 'web10/groups/users/me/studio';
export function getV3Client() {
  return {
    readToken: () => getWapi().readToken(),
    getMyGroups: async () => [{ group_id: groupId, my_role: 'publisher' }],
    getGroup: async () => ({ group_id: groupId, roles: [{ name: 'publisher', permissions: { '*': ['readAll', 'create', 'updateOwn', 'deleteOwn'] } }] }),
    read: async () => [{ doc_id: 'studio-face', author_key: 'me', body: { name: 'Northstar Studio' } }],
    query: async () => ({ rows: [], count: 0 }),
    documentAttachment: async (_docId: string, _groupId: string, opts?: { attached?: boolean }) => ({ attached: opts?.attached ?? true }),
  };
}
