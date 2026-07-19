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

  describe('sendDm', () => {
    it('creates a DM record with sender info', async () => {
      const dm = { _id: 'dm1', message: 'hello', sent_at: expect.any(String), sender_username: 'alice', sender_provider: 'api.web10.app', media_refs: [] };
      mock.create.mockResolvedValue(dm);

      const result = await dms.sendDm('dm-api.web10.app/alice--api.web10.app/bob', 'hello');
      expect(mock.create).toHaveBeenCalledWith(
        'dm-api.web10.app/alice--api.web10.app/bob',
        expect.objectContaining({
          message: 'hello',
          sender_username: 'alice',
          sender_provider: 'api.web10.app',
        }),
      );
      expect(result).toEqual(dm);
    });

    it('throws when not authenticated', async () => {
      const unauthMock = { ...mock, readToken: vi.fn(() => null) };
      vi.spyOn(wapi, 'getWapi').mockReturnValue(unauthMock as any);
      await expect(dms.sendDm('dm-conv', 'hello')).rejects.toThrow('not authenticated');
    });
  });

  describe('deleteDm', () => {
    it('deletes a DM from the conversation', async () => {
      mock.delete.mockResolvedValue(undefined);
      await dms.deleteDm('dm-conv', 'dm1');
      expect(mock.delete).toHaveBeenCalledWith('dm-conv', { _id: 'dm1' });
    });
  });

  describe('listConversations', () => {
    it('derives conversation names from contacts', async () => {
      mock.read.mockResolvedValue([
        { username: 'bob', provider: 'api.web10.app' },
        { username: 'carol', provider: 'api.web10.app' },
      ]);
      const result = await dms.listConversations();
      expect(result.length).toBe(2);
      expect(result).toContain('dm-api.web10.app/alice--api.web10.app/bob');
      expect(result).toContain('dm-api.web10.app/alice--api.web10.app/carol');
    });

    it('returns empty when no contacts', async () => {
      mock.read.mockResolvedValue([]);
      const result = await dms.listConversations();
      expect(result).toEqual([]);
    });
  });

  describe('getLastDm', () => {
    it('returns the last message in a conversation', async () => {
      mock.read.mockResolvedValue([
        { _id: 'dm1', message: 'first', sent_at: '2026-07-17T00:00:00Z', sender_username: 'alice', sender_provider: 'api.web10.app' },
        { _id: 'dm2', message: 'second', sent_at: '2026-07-18T00:00:00Z', sender_username: 'bob', sender_provider: 'api.web10.app' },
      ]);
      const result = await dms.getLastDm('dm-conv');
      expect(result?._id).toBe('dm2');
    });

    it('returns null for empty conversation', async () => {
      mock.read.mockResolvedValue([]);
      const result = await dms.getLastDm('dm-empty');
      expect(result).toBeNull();
    });
  });
});