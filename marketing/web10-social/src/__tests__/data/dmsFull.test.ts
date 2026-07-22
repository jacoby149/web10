import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as dms from '../../data/dms';

function mockWapi() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice' })),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
    getUploadUrl: vi.fn(),
    initP2P: vi.fn(),
    sendP2P: vi.fn(),
  };
  vi.spyOn(wapi, 'getWapi').mockReturnValue(mock as any);
  return mock;
}

describe('dms data layer (with wapi)', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('conversationKey', () => {
    it('produces deterministic key regardless of argument order', () => {
      const a = { provider: 'api.web10.app', username: 'alice' };
      const b = { provider: 'api.web10.app', username: 'bob' };

      const key1 = dms.conversationKey(a, b);
      const key2 = dms.conversationKey(b, a);

      expect(key1).toBe(key2);
      expect(key1).toBe('api.web10.app/alice--api.web10.app/bob');
    });

    it('works across different providers', () => {
      const a = { provider: 'node1.web10.app', username: 'alice' };
      const b = { provider: 'node2.web10.app', username: 'bob' };

      const key = dms.conversationKey(a, b);
      expect(key).toBe('node1.web10.app/alice--node2.web10.app/bob');
    });

    it('handles same provider different users', () => {
      const a = { provider: 'api.web10.app', username: 'zara' };
      const b = { provider: 'api.web10.app', username: 'amir' };

      const key = dms.conversationKey(a, b);
      expect(key).toBe('api.web10.app/amir--api.web10.app/zara');
    });
  });

  describe('sendDm', () => {
    it('creates a DM record with sender + recipient info', async () => {
      const dm = {
        _id: 'dm1',
        message: 'hello',
        sent_at: expect.any(String),
        sender_username: 'alice',
        sender_provider: 'api.web10.app',
        recipient_username: 'bob',
        recipient_provider: 'api.web10.app',
        media_refs: [],
      };
      mock.create.mockResolvedValue(dm);

      const result = await dms.sendDm('api.web10.app/alice--api.web10.app/bob', 'hello');
      expect(mock.create).toHaveBeenCalledWith(
        'dms',
        expect.objectContaining({
          message: 'hello',
          sender_username: 'alice',
          sender_provider: 'api.web10.app',
          recipient_username: 'bob',
          recipient_provider: 'api.web10.app',
        }),
      );
      expect(result).toEqual(dm);
    });

    it('throws when not authenticated', async () => {
      const unauthMock = { ...mock, readToken: vi.fn(() => null) };
      vi.spyOn(wapi, 'getWapi').mockReturnValue(unauthMock as any);
      await expect(dms.sendDm('api.web10.app/alice--api.web10.app/bob', 'hello')).rejects.toThrow('not authenticated');
    });
  });

  describe('readDms', () => {
    it('reads messages between two users', async () => {
      mock.read.mockResolvedValue([
        { _id: 'dm1', message: 'first', sent_at: '2026-07-17T00:00:00Z', sender_username: 'alice', sender_provider: 'api.web10.app', recipient_username: 'bob', recipient_provider: 'api.web10.app' },
        { _id: 'dm2', message: 'second', sent_at: '2026-07-18T00:00:00Z', sender_username: 'bob', sender_provider: 'api.web10.app', recipient_username: 'alice', recipient_provider: 'api.web10.app' },
      ]);
      const result = await dms.readDms('api.web10.app/alice--api.web10.app/bob');
      expect(result.length).toBe(2);
      expect(result[0]._id).toBe('dm1');
      expect(result[1]._id).toBe('dm2');
    });
  });

  describe('deleteDm', () => {
    it('deletes a DM by ID', async () => {
      mock.delete.mockResolvedValue(undefined);
      await dms.deleteDm('dm1');
      expect(mock.delete).toHaveBeenCalledWith('dms', { _id: 'dm1' });
    });
  });

  describe('listConversations', () => {
    it('derives conversation keys from contacts', async () => {
      // First read: existingDms check (non-empty, skips migration)
      mock.read.mockResolvedValueOnce([
        { _id: 'dm1', message: 'hi', sent_at: '2026-01-01T00:00:00Z', sender_username: 'alice', sender_provider: 'api.web10.app', recipient_username: 'bob', recipient_provider: 'api.web10.app' },
      ]);
      // Second read: contacts from contacts service
      mock.read.mockResolvedValueOnce([
        { username: 'bob', provider: 'api.web10.app' },
        { username: 'carol', provider: 'api.web10.app' },
      ]);
      // Third read: allDms
      mock.read.mockResolvedValueOnce([
        { _id: 'dm1', message: 'hi', sent_at: '2026-01-01T00:00:00Z', sender_username: 'alice', sender_provider: 'api.web10.app', recipient_username: 'bob', recipient_provider: 'api.web10.app' },
      ]);

      const result = await dms.listConversations();
      // bob from contacts + allDms (deduped), carol from contacts
      expect(result.length).toBe(2);
      expect(result).toContain('api.web10.app/alice--api.web10.app/bob');
      expect(result).toContain('api.web10.app/alice--api.web10.app/carol');
    });

    it('returns empty when no contacts and no messages', async () => {
      mock.read.mockResolvedValueOnce([]); // existingDms (triggers migration)
      // Migration reads
      mock.read.mockResolvedValueOnce([]); // message-inbox
      mock.read.mockResolvedValueOnce([]); // message-outbox
      // After migration: contacts
      mock.read.mockResolvedValueOnce([]); // contacts
      // After migration: allDms
      mock.read.mockResolvedValueOnce([]); // allDms
      const result = await dms.listConversations();
      expect(result).toEqual([]);
    });
  });

  describe('getLastDm', () => {
    it('returns the last message in a conversation', async () => {
      mock.read.mockResolvedValue([
        { _id: 'dm1', message: 'first', sent_at: '2026-07-17T00:00:00Z', sender_username: 'alice', sender_provider: 'api.web10.app', recipient_username: 'bob', recipient_provider: 'api.web10.app' },
        { _id: 'dm2', message: 'second', sent_at: '2026-07-18T00:00:00Z', sender_username: 'bob', sender_provider: 'api.web10.app', recipient_username: 'alice', recipient_provider: 'api.web10.app' },
      ]);
      const result = await dms.getLastDm('api.web10.app/alice--api.web10.app/bob');
      expect(result?._id).toBe('dm2');
    });

    it('returns null for empty conversation', async () => {
      mock.read.mockResolvedValue([]);
      const result = await dms.getLastDm('api.web10.app/alice--api.web10.app/nobody');
      expect(result).toBeNull();
    });
  });
});