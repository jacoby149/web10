import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as contacts from '../../data/contacts';

// The mock token: provider `web10.app`, username `alice`. The API derives a
// user's followers group ID as `{provider}/groups/users/{username}/followers`
// from the token's provider claim — the tests assert the data layer targets
// exactly that, not a hardcoded phantom prefix.
const FOLLOWERS = 'web10.app/groups/users/alice/followers';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getGroup: vi.fn(),
    getMyGroups: vi.fn(),
    createGroup: vi.fn(),
    joinGroup: vi.fn(),
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

  describe('readContacts', () => {
    it('reads from the deterministic followers group (provider/users/username/followers)', async () => {
      mock.read.mockResolvedValue([]);
      await contacts.readContacts();
      expect(mock.read).toHaveBeenCalledWith('contacts', { groups: [FOLLOWERS] });
    });

    it('returns [] when the read 403s (no followers group yet)', async () => {
      mock.read.mockRejectedValue(new Error('403 Forbidden'));
      await expect(contacts.readContacts()).resolves.toEqual([]);
    });

    it('maps contact docs to ContactRecords', async () => {
      mock.read.mockResolvedValue([
        { doc_id: 'c1', author_key: 'bob', created_at: 't', body: { username: 'bob', provider: 'web10.app', display_name: 'Bob' } },
      ]);
      const result = await contacts.readContacts();
      expect(result).toEqual([
        { _id: 'c1', username: 'bob', provider: 'web10.app', display_name: 'Bob', added_at: 't' },
      ]);
    });
  });

  describe('addContact', () => {
    it('ensures the followers group exists, then attaches the contact doc to it', async () => {
      // Group exists + alice is a member → ensureFollowers returns it as-is.
      mock.getGroup.mockResolvedValue({ group_id: FOLLOWERS });
      mock.getMyGroups.mockResolvedValue([{ group_id: FOLLOWERS, my_role: 'owner' }]);
      mock.create.mockResolvedValue({ doc_id: 'c1', body: { username: 'bob' } });

      await contacts.addContact({ username: 'bob', provider: 'web10.app' });

      // The D58 write gate 403s a write to a group the user can't write — so
      // the home group must be ensured (member) before the attach.
      expect(mock.getGroup).toHaveBeenCalledWith(FOLLOWERS);
      expect(mock.create).toHaveBeenCalledWith(
        'contacts',
        expect.objectContaining({ username: 'bob' }),
        { groups: [FOLLOWERS] },
      );
    });

    it('creates the followers group when it does not exist yet', async () => {
      mock.getGroup.mockRejectedValue(new Error('not found'));
      mock.createGroup.mockResolvedValue({ group_id: FOLLOWERS });
      mock.create.mockResolvedValue({ doc_id: 'c1', body: { username: 'bob' } });

      await contacts.addContact({ username: 'bob', provider: 'web10.app' });

      expect(mock.createGroup).toHaveBeenCalledWith(
        'followers',
        'open',
        expect.anything(),
        [{ member_key: 'alice', role: 'owner' }],
      );
      expect(mock.create).toHaveBeenCalledWith(
        'contacts',
        expect.objectContaining({ username: 'bob' }),
        { groups: [FOLLOWERS] },
      );
    });
  });

  describe('updateContact / deleteContact', () => {
    it('updates a contact by id', async () => {
      mock.update.mockResolvedValue({ doc_id: 'c1', body: { display_name: 'Bob Updated' } });
      await contacts.updateContact('c1', { display_name: 'Bob Updated' });
      expect(mock.update).toHaveBeenCalledWith('c1', { display_name: 'Bob Updated' });
    });

    it('deletes a contact by id', async () => {
      mock.delete.mockResolvedValue({ doc_id: 'c1', status: 'deleted' });
      await contacts.deleteContact('c1');
      expect(mock.delete).toHaveBeenCalledWith('c1');
    });
  });
});
