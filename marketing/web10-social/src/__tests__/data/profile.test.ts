import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as profile from '../../data/profile';

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

describe('profile data layer', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readProfile', () => {
    it('returns the profile record if exists', async () => {
      const prof = { _id: 'prof1', display_name: 'Alice', bio: 'Creator' };
      mock.read.mockResolvedValue([prof]);
      const result = await profile.readProfile();
      expect(result).toEqual(prof);
    });

    it('returns null if no profile exists', async () => {
      mock.read.mockResolvedValue([]);
      const result = await profile.readProfile();
      expect(result).toBeNull();
    });
  });

  describe('saveProfile', () => {
    it('creates a new profile when none exists', async () => {
      mock.read.mockResolvedValue([]);
      const created = { _id: 'prof1', display_name: 'Alice', updated_at: expect.any(String) };
      mock.create.mockResolvedValue(created);

      const result = await profile.saveProfile({ display_name: 'Alice' });
      expect(mock.create).toHaveBeenCalledWith('profile', expect.objectContaining({ display_name: 'Alice' }));
      expect(result).toEqual(created);
    });

    it('updates existing profile', async () => {
      const existing = { _id: 'prof1', display_name: 'Old Name' };
      mock.read.mockResolvedValue([existing]);
      const updated = { _id: 'prof1', display_name: 'New Name', updated_at: expect.any(String) };
      mock.update.mockResolvedValue(updated);

      const result = await profile.saveProfile({ display_name: 'New Name' });
      expect(mock.update).toHaveBeenCalledWith('profile', { _id: 'prof1' }, expect.objectContaining({ $set: expect.objectContaining({ display_name: 'New Name' }) }));
      expect(result).toEqual(updated);
    });
  });

  describe('readUserProfile', () => {
    it('reads another user profile', async () => {
      const prof = { _id: 'prof2', display_name: 'Bob' };
      mock.read.mockResolvedValue([prof]);
      const result = await profile.readUserProfile('bob', 'node.web10.app');
      expect(mock.read).toHaveBeenCalledWith('profile', {}, 'bob', 'node.web10.app');
      expect(result).toEqual(prof);
    });

    it('returns null for unknown user', async () => {
      mock.read.mockResolvedValue([]);
      const result = await profile.readUserProfile('unknown', 'node.web10.app');
      expect(result).toBeNull();
    });
  });
});