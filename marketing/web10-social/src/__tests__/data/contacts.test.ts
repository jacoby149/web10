import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as contacts from '../../data/contacts';

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

describe('contacts data layer', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readContacts', () => {
    it('reads all contacts', async () => {
      const list = [
        { _id: 'c1', username: 'bob', provider: 'api.web10.app', display_name: 'Bob' },
      ];
      mock.read.mockResolvedValue(list);
      const result = await contacts.readContacts();
      expect(mock.read).toHaveBeenCalledWith('contacts');
      expect(result).toEqual(list);
    });
  });

  describe('readContact', () => {
    it('returns contact found by username+provider', async () => {
      const c = { _id: 'c1', username: 'bob', provider: 'api.web10.app' };
      mock.read.mockResolvedValue([c]);
      const result = await contacts.readContact('bob', 'api.web10.app');
      expect(mock.read).toHaveBeenCalledWith('contacts', { username: 'bob', provider: 'api.web10.app' });
      expect(result).toEqual(c);
    });

    it('returns null when not found', async () => {
      mock.read.mockResolvedValue([]);
      const result = await contacts.readContact('nobody', 'api.web10.app');
      expect(result).toBeNull();
    });
  });

  describe('addContact', () => {
    it('creates a contact with added_at', async () => {
      const input = { username: 'bob', provider: 'api.web10.app', display_name: 'Bob' };
      const created = { _id: 'c1', ...input, added_at: expect.any(String) };
      mock.create.mockResolvedValue(created);

      const result = await contacts.addContact(input);
      expect(mock.create).toHaveBeenCalledWith('contacts', expect.objectContaining({
        username: 'bob',
        provider: 'api.web10.app',
        added_at: expect.any(String),
      }));
      expect(result).toEqual(created);
    });
  });

  describe('updateContact', () => {
    it('updates a contact by ID', async () => {
      const updated = { _id: 'c1', display_name: 'Bob Updated' };
      mock.update.mockResolvedValue(updated);
      const result = await contacts.updateContact('c1', { display_name: 'Bob Updated' });
      expect(mock.update).toHaveBeenCalledWith('contacts', { _id: 'c1' }, { $set: { display_name: 'Bob Updated' } });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteContact', () => {
    it('deletes a contact by ID', async () => {
      mock.delete.mockResolvedValue(undefined);
      await contacts.deleteContact('c1');
      expect(mock.delete).toHaveBeenCalledWith('contacts', { _id: 'c1' });
    });
  });

  describe('searchContacts', () => {
    it('filters by display_name', async () => {
      mock.read.mockResolvedValue([
        { _id: 'c1', username: 'bob', provider: 'api.web10.app', display_name: 'Bob Smith' },
        { _id: 'c2', username: 'carol', provider: 'api.web10.app', display_name: 'Carol White' },
      ]);
      const result = await contacts.searchContacts('bob');
      expect(result.length).toBe(1);
      expect(result[0].display_name).toBe('Bob Smith');
    });

    it('filters by username', async () => {
      mock.read.mockResolvedValue([
        { _id: 'c1', username: 'bob', provider: 'api.web10.app', display_name: 'Bobby' },
      ]);
      const result = await contacts.searchContacts('bob');
      expect(result.length).toBe(1);
    });
  });
});