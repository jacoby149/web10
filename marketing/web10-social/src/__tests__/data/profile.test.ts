import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { setProfilePublic, ensureProfileDirectoryGroup, saveProfile } from '../../data/profile';
import { ensureFollowers } from '../../data/groups';

// Mock followers-group setup so the tests can separate it from profile CRUD.
vi.mock('../../data/groups', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    ensureFollowers: vi.fn(async () => 'web10.app/groups/users/alice/followers'),
  };
});

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
    getProfile: vi.fn(),
    getMyGroups: vi.fn(),
    getGroupMembers: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('profile v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProfile (v3: read user profile)', () => {
    it('returns the user profile', async () => {
      const profile = { username: 'alice', phone: '+1234567890' };
      mock.getProfile.mockResolvedValue(profile);
      const result = await mock.getProfile();
      expect(result).toEqual(profile);
    });
  });

  describe('create profile document (v3)', () => {
    it('creates a profile document', async () => {
      const doc = { doc_id: 'prof1', body: { display_name: 'Alice', bio: 'Creator' } };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('profile', { display_name: 'Alice', bio: 'Creator' });
      expect(result).toEqual(doc);
    });
  });

  describe('update profile document (v3)', () => {
    it('updates a profile document', async () => {
      const updated = { doc_id: 'prof1', body: { display_name: 'Alice Updated' } };
      mock.update.mockResolvedValue(updated);
      const result = await mock.update('prof1', { display_name: 'Alice Updated' });
      expect(result).toEqual(updated);
    });
  });

  describe('setProfilePublic (D58 point 7: the anyone read-grant on the followers group)', () => {
    const FG = 'web10.app/groups/users/alice/followers';

    it('makes a private profile public — adds the anyone reader row', async () => {
      mock.getGroupMembers.mockResolvedValue([{ member_key: 'alice', role: 'owner' }]);
      mock.addGroupMember.mockResolvedValue({ member_key: 'anyone', role: 'reader' });
      const result = await setProfilePublic(true);
      expect(mock.addGroupMember).toHaveBeenCalledWith(FG, 'anyone', 'reader');
      expect(mock.removeGroupMember).not.toHaveBeenCalled();
      expect(result).toEqual({ username: 'alice', public: true });
    });

    it('makes a public profile private — removes the anyone row', async () => {
      mock.getGroupMembers.mockResolvedValue([
        { member_key: 'alice', role: 'owner' },
        { member_key: 'anyone', role: 'reader' },
      ]);
      mock.removeGroupMember.mockResolvedValue({ member_key: 'anyone', role: 'reader' });
      const result = await setProfilePublic(false);
      expect(mock.removeGroupMember).toHaveBeenCalledWith(FG, 'anyone');
      expect(mock.addGroupMember).not.toHaveBeenCalled();
      expect(result).toEqual({ username: 'alice', public: false });
    });

    it('is idempotent — public when already public (no add)', async () => {
      mock.getGroupMembers.mockResolvedValue([
        { member_key: 'alice', role: 'owner' },
        { member_key: 'anyone', role: 'reader' },
      ]);
      await setProfilePublic(true);
      expect(mock.addGroupMember).not.toHaveBeenCalled();
    });

    it('requires a token', async () => {
      mock.readToken.mockReturnValue(null);
      await expect(setProfilePublic(true)).rejects.toThrow('not authenticated');
    });
  });

  describe('sign-in directory setup', () => {
    it('ensures the followers group without reading or writing a profile document', async () => {
      mock.read.mockResolvedValue([]);
      await ensureProfileDirectoryGroup();
      expect(ensureFollowers).toHaveBeenCalledWith('alice', 'web10.app');
      expect(mock.read).not.toHaveBeenCalled();
      expect(mock.create).not.toHaveBeenCalled();
      expect(mock.update).not.toHaveBeenCalled();
    });

    it('is a no-op when not signed in', async () => {
      mock.readToken.mockReturnValue(null);
      vi.mocked(ensureFollowers).mockClear();
      await ensureProfileDirectoryGroup();
      expect(ensureFollowers).not.toHaveBeenCalled();
      expect(mock.read).not.toHaveBeenCalled();
      expect(mock.create).not.toHaveBeenCalled();
    });
  });

  describe('saveProfile document selection', () => {
    it.each([403, 503])('surfaces a failed lookup (%i) instead of creating a second profile', async (status) => {
      const error = new Error(String(status));
      mock.read.mockRejectedValue(error);
      await expect(saveProfile({ bio: 'Updated bio' })).rejects.toBe(error);
      expect(mock.create).not.toHaveBeenCalled();
      expect(mock.update).not.toHaveBeenCalled();
    });

    it('changes the display name in place without changing the account, document, or avatar', async () => {
      mock.read.mockResolvedValue([{ doc_id: 'prof1', body: { display_name: 'Old Name', avatar_ref: 'avatar1' } }]);
      mock.update.mockResolvedValue({ doc_id: 'prof1', body: { display_name: 'New Name', avatar_ref: 'avatar1' } });
      const saved = await saveProfile({ display_name: 'New Name' });
      expect(mock.read).toHaveBeenCalledWith('profile', { groups: ['web10.app/groups/users/alice/followers'] });
      expect(mock.update).toHaveBeenCalledWith('prof1', expect.objectContaining({ display_name: 'New Name' }));
      expect(JSON.parse(JSON.stringify(mock.update.mock.calls[0][1]))).not.toHaveProperty('avatar_ref');
      expect(saved.avatar_ref).toBe('avatar1');
      expect(mock.create).not.toHaveBeenCalled();
    });

    it('still creates a first profile after a successful empty read', async () => {
      mock.read.mockResolvedValue([]);
      mock.create.mockResolvedValue({ doc_id: 'prof1', body: { display_name: 'Alice' } });
      await saveProfile({ display_name: 'Alice' });
      expect(mock.create).toHaveBeenCalledWith('profile', expect.objectContaining({ display_name: 'Alice' }), {
        groups: ['web10.app/groups/users/alice/followers'],
      });
    });
  });
});
