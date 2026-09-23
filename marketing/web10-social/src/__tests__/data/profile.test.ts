import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { setProfilePublic } from '../../data/profile';

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
});
