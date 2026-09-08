import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the v3 client seam (the SDK) so we can assert the exact createGroup call.
const mockCreateGroup = vi.fn().mockResolvedValue({ group_id: 'g1' });
const mockCreate = vi.fn().mockResolvedValue({ _id: 'doc-1' });
const mockReadToken = vi.fn().mockReturnValue({ provider: 'api.localhost', username: 'jacoby149' });

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    createGroup: (...args: unknown[]) => mockCreateGroup(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    readToken: () => mockReadToken(),
  }),
}));

import { createCommunityGroup } from '@/data/groups';

describe('createCommunityGroup — the discoverable (D53) fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateGroup.mockResolvedValue({ group_id: 'g1' });
    mockCreate.mockResolvedValue({ _id: 'doc-1' });
  });

  it('a public group is listed in the directory (discoverable: true)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'public' }, 'jacoby149');
    expect(mockCreateGroup).toHaveBeenCalledTimes(1);
    const [slug, joinPolicy, roles, members, opts] = mockCreateGroup.mock.calls[0];
    expect(slug).toBe('my-group');
    expect(joinPolicy).toBe('open');
    // The public read grant (the `anyone` reader row)
    expect(members).toContainEqual({ member_key: 'anyone', role: 'reader' });
    // The D53 blasting flag — public means findable
    expect(opts).toEqual({ discoverable: true });
  });

  it('a signed-in group is NOT listed (discoverable: false)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'signed_in' }, 'jacoby149');
    const [, , , members, opts] = mockCreateGroup.mock.calls[0];
    expect(members).toContainEqual({ member_key: 'authenticated', role: 'reader' });
    expect(opts).toEqual({ discoverable: false });
  });

  it('a private group is NOT listed (discoverable: false)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'private' }, 'jacoby149');
    const [, , , members, opts] = mockCreateGroup.mock.calls[0];
    // No reserved reader row for private
    expect(members).not.toContainEqual({ member_key: 'anyone', role: 'reader' });
    expect(members).not.toContainEqual({ member_key: 'authenticated', role: 'reader' });
    expect(opts).toEqual({ discoverable: false });
  });

  it('the join policy is threaded to createGroup (default open)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'private' }, 'jacoby149');
    const [, joinPolicy] = mockCreateGroup.mock.calls[0];
    expect(joinPolicy).toBe('open');
  });

  it('a request join policy is threaded to createGroup', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'private', join_policy: 'request' }, 'jacoby149');
    const [, joinPolicy] = mockCreateGroup.mock.calls[0];
    expect(joinPolicy).toBe('request');
  });

  it('an invite-only join policy is threaded to createGroup', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'private', join_policy: 'invite_only' }, 'jacoby149');
    const [, joinPolicy] = mockCreateGroup.mock.calls[0];
    expect(joinPolicy).toBe('invite_only');
  });
});
