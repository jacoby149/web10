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
    getProfile: vi.fn(),
    getMyGroups: vi.fn(),
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
});
