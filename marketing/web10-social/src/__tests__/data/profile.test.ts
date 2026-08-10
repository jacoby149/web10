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

    it('requests with sort by updated_at desc and limit 1', async () => {
      mock.read.mockResolvedValue([{ _id: 'prof1', display_name: 'Alice' }]);
      await profile.readProfile();
      expect(mock.read).toHaveBeenCalledWith('profile', {
        $sort: { updated_at: -1 },
        $limit: 1,
      });
    });

    it('returns the most recently updated record when duplicates exist', async () => {
      // Simulates the scenario where saveProfile updated a newer record
      // but a stale record with no media refs still exists.
      const staleRecord = { _id: 'prof-old', display_name: 'Alice', updated_at: '2025-01-01T00:00:00Z' };
      const freshRecord = { _id: 'prof-new', display_name: 'Alice', avatar_ref: 'media-123', banner_ref: 'media-456', updated_at: '2026-07-24T00:00:00Z' };
      // The API returns sorted+limited results, so only the newest arrives.
      mock.read.mockResolvedValue([freshRecord]);
      const result = await profile.readProfile();
      expect(result).toEqual(freshRecord);
      expect(result?.avatar_ref).toBe('media-123');
      expect(result?.banner_ref).toBe('media-456');
    });

    it('returns null if no profile exists', async () => {
      mock.read.mockResolvedValue([]);
      const result = await profile.readProfile();
      expect(result).toBeNull();
    });

    it('adapts legacy identity record to new profile format', async () => {
      mock.read.mockResolvedValueOnce([]); // profile empty
      mock.read.mockResolvedValueOnce([{ web10: 'web10/alice', name: 'Alice Legacy', pic: 'https://example.com/alice.jpg', bio: 'Old bio' }]); // identity
      mock.create.mockResolvedValue({ _id: 'prof1', display_name: 'Alice Legacy', bio: 'Old bio', avatar_ref: 'https://example.com/alice.jpg' });

      const result = await profile.readProfile();
      expect(result?.display_name).toBe('Alice Legacy');
      expect(result?.bio).toBe('Old bio');
      expect(result?.avatar_ref).toBe('https://example.com/alice.jpg');
      expect(mock.create).toHaveBeenCalledWith('profile', expect.objectContaining({
        display_name: 'Alice Legacy',
        bio: 'Old bio',
        avatar_ref: 'https://example.com/alice.jpg',
      }));
    });

    it('handles missing identity service gracefully', async () => {
      mock.read.mockResolvedValueOnce([]); // profile empty
      mock.read.mockImplementationOnce(() => { throw new Error('not found'); }); // identity missing
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

    it('strips _id from the $set payload', async () => {
      const existing = { _id: 'prof1', display_name: 'Alice' };
      mock.read.mockResolvedValue([existing]);
      mock.update.mockResolvedValue({ _id: 'prof1', display_name: 'Alice' });

      // Client passes the whole record back (as handleUpload does)
      await profile.saveProfile({ _id: 'prof1', display_name: 'Alice', avatar_ref: 'media-123' });
      const callArgs = (mock.update.mock.calls[0] as unknown[]);
      const setPayload = callArgs[2]?.['$set'] as Record<string, unknown>;
      expect(setPayload).not.toHaveProperty('_id');
      expect(setPayload).toHaveProperty('avatar_ref', 'media-123');
    });

    it('sets updated_at on every save', async () => {
      const existing = { _id: 'prof1', display_name: 'Alice' };
      mock.read.mockResolvedValue([existing]);
      mock.update.mockResolvedValue({ _id: 'prof1', display_name: 'Alice' });

      await profile.saveProfile({ display_name: 'Alice' });
      const callArgs = (mock.update.mock.calls[0] as unknown[]);
      const setPayload = callArgs[2]?.['$set'] as Record<string, unknown>;
      expect(setPayload).toHaveProperty('updated_at');
    });

    it('upload → save → fresh readProfile round-trip carries media refs', async () => {
      // Simulates the full refresh cycle:
      // 1. User uploads avatar, handleUpload calls saveProfile with avatar_ref
      // 2. saveProfile persists the ref
      // 3. On F5, readProfile is called fresh and returns the record WITH refs

      // Step 1: saveProfile reads existing, then updates
      const existingProfile = { _id: 'prof1', display_name: 'Alice' };
      const savedProfile = { _id: 'prof1', display_name: 'Alice', avatar_ref: 'media-avatar', banner_ref: 'media-banner', updated_at: '2026-07-24T10:00:00Z' };

      // First call to readProfile (inside saveProfile)
      mock.read.mockResolvedValueOnce([existingProfile]);
      // update returns the saved profile
      mock.update.mockResolvedValue(savedProfile);

      const saved = await profile.saveProfile({
        ...existingProfile,
        avatar_ref: 'media-avatar',
        banner_ref: 'media-banner',
      });
      expect(saved.avatar_ref).toBe('media-avatar');
      expect(saved.banner_ref).toBe('media-banner');

      // Step 2: Fresh readProfile (simulating F5) — returns the updated record
      mock.read.mockResolvedValue([savedProfile]);
      const freshRead = await profile.readProfile();
      expect(freshRead?.avatar_ref).toBe('media-avatar');
      expect(freshRead?.banner_ref).toBe('media-banner');
    });
  });

  describe('readUserProfile', () => {
    it('reads another user profile', async () => {
      const prof = { _id: 'prof2', display_name: 'Bob' };
      mock.read.mockResolvedValue([prof]);
      const result = await profile.readUserProfile('bob');
      expect(mock.read).toHaveBeenCalledWith('profile', {
        $sort: { updated_at: -1 },
        $limit: 1,
      }, 'bob');
      expect(result).toEqual(prof);
    });

    it('returns null for unknown user', async () => {
      mock.read.mockResolvedValue([]);
      const result = await profile.readUserProfile('unknown');
      expect(result).toBeNull();
    });
  });
});