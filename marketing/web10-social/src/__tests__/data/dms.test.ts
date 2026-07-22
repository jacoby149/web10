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

describe('dms', () => {
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

  describe('legacy migration', () => {
    let mock: ReturnType<typeof mockWapi>;

    beforeEach(() => {
      mock = mockWapi();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('migrates message-inbox records to dms on empty read', async () => {
      // First read: dms is empty (triggers migration)
      mock.read.mockResolvedValueOnce([]);
      // Migration: message-inbox legacy data
      mock.read.mockResolvedValueOnce([
        { _id: 'legacy1', message: 'hey alice', sentTime: '2026-01-01T00:00:00Z', web10: 'api.web10.app/bob' },
      ]);
      // Migration: message-outbox (empty)
      mock.read.mockResolvedValueOnce([]);
      // Second read: contacts
      mock.read.mockResolvedValueOnce([]);
      // Third read: allDms (now has migrated data)
      mock.read.mockResolvedValueOnce([]);

      await dms.listConversations();

      expect(mock.create).toHaveBeenCalledWith('dms', expect.objectContaining({
        message: 'hey alice',
        sent_at: '2026-01-01T00:00:00Z',
        sender_username: 'bob',
        sender_provider: 'api.web10.app',
        recipient_username: 'alice',
        recipient_provider: 'api.web10.app',
      }));
    });

    it('migrates message-outbox records to dms', async () => {
      // First read: dms empty
      mock.read.mockResolvedValueOnce([]);
      // Migration: message-inbox empty
      mock.read.mockResolvedValueOnce([]);
      // Migration: message-outbox
      mock.read.mockResolvedValueOnce([
        { _id: 'legacy2', message: 'hello bob', sentTime: '2026-02-01T00:00:00Z', web10: 'api.web10.app/bob' },
      ]);
      // Second read: contacts
      mock.read.mockResolvedValueOnce([]);
      // Third read: allDms
      mock.read.mockResolvedValueOnce([]);

      await dms.listConversations();

      expect(mock.create).toHaveBeenCalledWith('dms', expect.objectContaining({
        message: 'hello bob',
        sender_username: 'alice',
        recipient_username: 'bob',
      }));
    });
  });
});