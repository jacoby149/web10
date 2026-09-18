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
    it('returns only the groups whose face has kind:chat (not communities / DMs / infra)', async () => {
      mock.getMyGroups.mockResolvedValue([
        // a group chat (kind:chat)
        { group_id: 'api.localhost/groups/users/me/chat-crew', join_policy: 'invite_only', my_role: 'owner', member_count: 3 },
        // a community (no kind)
        { group_id: 'api.localhost/groups/users/bob/synthwave', join_policy: 'open', my_role: 'member', member_count: 42 },
        // a DM (infra — filtered before the identity read)
        { group_id: 'api.localhost/groups/users/me/dm-alice-me', join_policy: 'invite_only', my_role: 'member', member_count: 2 },
        // my followers group (infra)
        { group_id: 'api.localhost/groups/users/me/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
      ]);
      // readGroupIdentity reads the identity service per group; return the face
      // keyed by the group in the request.
      mock.read.mockImplementation(async (_service: string, opts: { groups: string[] }) => {
        const g = opts.groups[0];
        if (g === 'api.localhost/groups/users/me/chat-crew') {
          return [{ doc_id: 'id1', body: { kind: 'chat', name: 'The Crew' } }];
        }
        if (g === 'api.localhost/groups/users/bob/synthwave') {
          return [{ doc_id: 'id2', body: { name: 'Synthwave Sessions' } }];
        }
        return [];
      });

      const chats = await getMyGroupChats();
      expect(chats).toHaveLength(1);
      expect(chats[0].groupId).toBe('api.localhost/groups/users/me/chat-crew');
      expect(chats[0].name).toBe('The Crew');
      // The identity read is only attempted for non-infra groups (the chat + the
      // community) — never the DM or followers group.
      const readGroups = mock.read.mock.calls.map((c) => (c[1] as { groups: string[] }).groups[0]);
      expect(readGroups).toContain('api.localhost/groups/users/me/chat-crew');
      expect(readGroups).toContain('api.localhost/groups/users/bob/synthwave');
      expect(readGroups).not.toContain('api.localhost/groups/users/me/dm-alice-me');
      expect(readGroups).not.toContain('api.localhost/groups/users/me/followers');
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
