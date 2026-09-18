import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the seams lookupUserProfile talks to: the v3 client (profile read),
// the followers-group id derivation, and the cross-user media resolver.
const mockReadToken = vi.fn().mockReturnValue({ provider: 'api.localhost', username: 'me' });
const mockRead = vi.fn();
const mockFollowersGroupId = vi.fn(
  (username: string, provider?: string) =>
    `${provider || 'api.localhost'}/groups/users/${username}/followers`,
);
const mockResolveMediaRefs = vi.fn().mockResolvedValue([]);

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    readToken: () => mockReadToken(),
    read: (...args: unknown[]) => mockRead(...args),
  }),
}));

vi.mock('@/data/groups', () => ({
  followersGroupId: (...args: [string, string?]) => mockFollowersGroupId(...args),
}));

vi.mock('@/data/posts', () => ({
  resolveMediaRefs: (...args: unknown[]) => mockResolveMediaRefs(...args),
}));

import { lookupUserProfile } from '@/data/profile';

describe('lookupUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadToken.mockReturnValue({ provider: 'api.localhost', username: 'me' });
    mockResolveMediaRefs.mockResolvedValue([]);
  });

  it('returns the user face with the resolved avatar url', async () => {
    mockRead.mockResolvedValue([
      { doc_id: 'd1', body: { display_name: 'Alice', avatar_ref: 'av-1', bio: 'hi' } },
    ]);
    mockResolveMediaRefs.mockResolvedValue([{ _id: 'av-1', url: 'http://x/avatar.png' }]);

    const face = await lookupUserProfile('alice');
    expect(face).not.toBeNull();
    expect(face!.username).toBe('alice');
    expect(face!.provider).toBe('api.localhost');
    expect(face!.display_name).toBe('Alice');
    expect(face!.bio).toBe('hi');
    expect(face!.avatar_url).toBe('http://x/avatar.png');
    // The profile read is scoped to the user's own followers group.
    expect(mockRead).toHaveBeenCalledWith('profile', {
      groups: ['api.localhost/groups/users/alice/followers'],
    });
  });

  it('passes an explicit provider through to the followers group id', async () => {
    mockRead.mockResolvedValue([{ doc_id: 'd1', body: { display_name: 'Bob' } }]);
    await lookupUserProfile('bob', 'other.node');
    expect(mockFollowersGroupId).toHaveBeenCalledWith('bob', 'other.node');
  });

  it('returns null when the user has no profile doc', async () => {
    mockRead.mockResolvedValue([]);
    const face = await lookupUserProfile('ghost');
    expect(face).toBeNull();
  });

  it('returns null when the profile read throws (unknown account / not a member)', async () => {
    mockRead.mockRejectedValue(new Error('403 not a member'));
    const face = await lookupUserProfile('ghost');
    expect(face).toBeNull();
  });

  it('degrades gracefully when media resolution fails (keeps the name, drops the url)', async () => {
    mockRead.mockResolvedValue([
      { doc_id: 'd1', body: { display_name: 'Carol', avatar_ref: 'av-9' } },
    ]);
    mockResolveMediaRefs.mockRejectedValue(new Error('presign failed'));

    const face = await lookupUserProfile('carol');
    expect(face).not.toBeNull();
    expect(face!.display_name).toBe('Carol');
    expect(face!.avatar_url).toBeUndefined();
  });
});
