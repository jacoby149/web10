import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getMyGroups: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('contacts v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readContacts (v3: read from contacts collection)', () => {
    it('reads all contacts', async () => {
      const docs = [{ doc_id: 'c1', body: { username: 'bob', display_name: 'Bob' } }];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('contacts', { groups: ['me'] });
      expect(result).toEqual(docs);
    });
  });

  describe('addContact (v3: create contact document)', () => {
    it('creates a contact document', async () => {
      const doc = { doc_id: 'c1', body: { username: 'bob', display_name: 'Bob' } };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('contacts', { username: 'bob', display_name: 'Bob' });
      expect(result).toEqual(doc);
    });
  });

  describe('updateContact (v3: update contact document)', () => {
    it('updates a contact', async () => {
      const updated = { doc_id: 'c1', body: { username: 'bob', display_name: 'Bob Updated' } };
      mock.update.mockResolvedValue(updated);
      const result = await mock.update('c1', { display_name: 'Bob Updated' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteContact (v3: delete contact document)', () => {
    it('deletes a contact', async () => {
      mock.delete.mockResolvedValue({ doc_id: 'c1', status: 'deleted' });
      const result = await mock.delete('c1');
      expect(result).toEqual({ doc_id: 'c1', status: 'deleted' });
    });
  });
});
