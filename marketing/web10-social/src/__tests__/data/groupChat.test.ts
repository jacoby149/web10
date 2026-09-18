import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import {
  createGroupChat,
  getMyGroupChats,
  readGroupChatMessages,
  sendGroupChatMessage,
  groupChatRouteKey,
  groupIdFromRouteKey,
} from '../../data/groupChat';

const IDENTITY = 'web10-social-group-identity';

function mockV3Client(username = 'me') {
  const mock = {
    readToken: vi.fn(() => ({ provider: 'api.localhost', username })),
    getMyGroups: vi.fn(),
    createGroup: vi.fn(),
    create: vi.fn(),
    read: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('groupChat v3 data layer (group-chat.md, D77)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client('me');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createGroupChat', () => {
    it('creates an invite_only group (creator=owner, added=member) + a kind:chat face', async () => {
      mock.createGroup.mockResolvedValue({ group_id: 'api.localhost/groups/users/me/chat-test-crew' });
      mock.create.mockResolvedValue({ doc_id: 'identity-doc' });

      const groupId = await createGroupChat('Test Crew', ['alice', 'bob']);

      expect(groupId).toBe('api.localhost/groups/users/me/chat-test-crew');
      const [name, joinPolicy, _roles, members] = mock.createGroup.mock.calls[0];
      expect(name).toBe('test-crew');
      expect(joinPolicy).toBe('invite_only');
      expect(members).toEqual([
        { member_key: 'me', role: 'owner' },
        { member_key: 'alice', role: 'member' },
        { member_key: 'bob', role: 'member' },
      ]);
      // The face carries kind:'chat' + the pretty name (the slug loses it).
      expect(mock.create).toHaveBeenCalledWith(
        IDENTITY,
        expect.objectContaining({ kind: 'chat', name: 'Test Crew' }),
        { groups: ['api.localhost/groups/users/me/chat-test-crew'] },
      );
      // D78: the group is tagged as a chat (the Messages surface selection key).
      expect(mock.createGroup.mock.calls[0][4]).toEqual(
        expect.objectContaining({ tags: ['web10-social-chat'] }),
      );
    });

    it('excludes the creator from the added members (no duplicate owner row)', async () => {
      mock.createGroup.mockResolvedValue({ group_id: 'g' });
      mock.create.mockResolvedValue({ doc_id: 'x' });
      await createGroupChat('Solo', ['me', 'alice']);
      const members = mock.createGroup.mock.calls[0][3];
      expect(members).toEqual([
        { member_key: 'me', role: 'owner' },
        { member_key: 'alice', role: 'member' },
      ]);
    });
  });

  describe('getMyGroupChats', () => {
    it('selects by the chat tag (server-side, D78) + reads each face for the name', async () => {
      // The server does the tag filter — the mock simulates it: only the
      // web10-social-chat-tagged groups come back. Communities / DMs /
      // followers are tagged differently and never reach the list.
      const all = [
        { group_id: 'api.localhost/groups/users/me/chat-crew', tags: ['web10-social-chat'], join_policy: 'invite_only', my_role: 'owner', member_count: 3 },
        { group_id: 'api.localhost/groups/users/bob/synthwave', tags: ['web10-social-group'], join_policy: 'open', my_role: 'member', member_count: 42 },
        { group_id: 'api.localhost/groups/users/me/dm-alice-me', tags: ['web10-social-dm'], join_policy: 'invite_only', my_role: 'member', member_count: 2 },
        { group_id: 'api.localhost/groups/users/me/followers', tags: ['web10-social-followers'], join_policy: 'open', my_role: 'owner', member_count: 10 },
      ];
      mock.getMyGroups.mockImplementation(async (opts?: { tags?: string[] }) => {
        if (!opts?.tags) return all;
        return all.filter((g: { tags?: string[] }) => opts.tags!.every((t) => g.tags?.includes(t)));
      });
      // readGroupIdentity reads the identity service per group for the name.
      mock.read.mockImplementation(async (_service: string, opts: { groups: string[] }) => {
        const g = opts.groups[0];
        if (g === 'api.localhost/groups/users/me/chat-crew') {
          return [{ doc_id: 'id1', body: { kind: 'chat', name: 'The Crew' } }];
        }
        return [];
      });

      const chats = await getMyGroupChats();
      // The selection is the server-side tag filter, not a client-side blocklist.
      expect(mock.getMyGroups).toHaveBeenCalledWith({ tags: ['web10-social-chat'] });
      expect(chats).toHaveLength(1);
      expect(chats[0].groupId).toBe('api.localhost/groups/users/me/chat-crew');
      expect(chats[0].name).toBe('The Crew');
      // The identity read is only for the chat (the tag already excluded the rest).
      const readGroups = mock.read.mock.calls.map((c) => (c[1] as { groups: string[] }).groups[0]);
      expect(readGroups).toEqual(['api.localhost/groups/users/me/chat-crew']);
    });
  });

  describe('readGroupChatMessages', () => {
    it('reads posts in the group, oldest first', async () => {
      mock.read.mockResolvedValue([
        { doc_id: 'm2', author_key: 'api.localhost/alice', created_at: '2026-01-01T02:00:00Z', body: { message: 'second', sender_username: 'alice' } },
        { doc_id: 'm1', author_key: 'api.localhost/me', created_at: '2026-01-01T01:00:00Z', body: { message: 'first', sender_username: 'me' } },
      ]);
      const msgs = await readGroupChatMessages('api.localhost/groups/users/me/chat-crew');
      expect(mock.read).toHaveBeenCalledWith('posts', { groups: ['api.localhost/groups/users/me/chat-crew'] });
      expect(msgs.map((m) => m.message)).toEqual(['first', 'second']);
    });
  });

  describe('sendGroupChatMessage', () => {
    it('writes a posts doc in the group carrying the sender', async () => {
      mock.create.mockResolvedValue({ doc_id: 'm9', author_key: 'api.localhost/me', created_at: '2026-01-01T03:00:00Z', body: { message: 'hey' } });
      const msg = await sendGroupChatMessage('api.localhost/groups/users/me/chat-crew', 'hey');
      expect(mock.create).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ message: 'hey', sender_username: 'me', sender_provider: 'api.localhost' }),
        { groups: ['api.localhost/groups/users/me/chat-crew'] },
      );
      expect(msg.message).toBe('hey');
    });
  });

  describe('route key helpers', () => {
    it('round-trips the group/ prefix', () => {
      const key = groupChatRouteKey('api.localhost/groups/users/me/chat-crew');
      expect(key).toBe('group/api.localhost/groups/users/me/chat-crew');
      expect(groupIdFromRouteKey(key)).toBe('api.localhost/groups/users/me/chat-crew');
      // A DM key (no group/ prefix) is not a group chat.
      expect(groupIdFromRouteKey('api.localhost/me--api.localhost/alice')).toBeNull();
    });
  });
});
