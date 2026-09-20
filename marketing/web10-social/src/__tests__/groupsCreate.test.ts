import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the v3 client seam (the SDK) so we can assert the exact createGroup call.
const mockCreateGroup = vi.fn().mockResolvedValue({ group_id: 'g1' });
const mockCreate = vi.fn().mockResolvedValue({ _id: 'doc-1' });
const mockGetGroup = vi.fn();
const mockReadToken = vi.fn().mockReturnValue({ provider: 'api.localhost', username: 'jacoby149' });

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    createGroup: (...args: unknown[]) => mockCreateGroup(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    getGroup: (...args: unknown[]) => mockGetGroup(...args),
    readToken: () => mockReadToken(),
  }),
}));

import { createCommunityGroup, createDraftGroup } from '@/data/groups';

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
    expect(opts).toEqual({ discoverable: true, tags: ['web10-social-group'] });
  });

  it('a signed-in group is NOT listed (discoverable: false)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'signed_in' }, 'jacoby149');
    const [, , , members, opts] = mockCreateGroup.mock.calls[0];
    expect(members).toContainEqual({ member_key: 'authenticated', role: 'reader' });
    expect(opts).toEqual({ discoverable: false, tags: ['web10-social-group'] });
  });

  it('a private group is NOT listed (discoverable: false)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'private' }, 'jacoby149');
    const [, , , members, opts] = mockCreateGroup.mock.calls[0];
    // No reserved reader row for private
    expect(members).not.toContainEqual({ member_key: 'anyone', role: 'reader' });
    expect(members).not.toContainEqual({ member_key: 'authenticated', role: 'reader' });
    expect(opts).toEqual({ discoverable: false, tags: ['web10-social-group'] });
  });

  it('an explicit discoverable: true lists a private group (override the default)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'private', discoverable: true }, 'jacoby149');
    const [, , , members, opts] = mockCreateGroup.mock.calls[0];
    // Still private (no reserved reader row) but listed in the directory
    expect(members).not.toContainEqual({ member_key: 'anyone', role: 'reader' });
    expect(members).not.toContainEqual({ member_key: 'authenticated', role: 'reader' });
    expect(opts).toEqual({ discoverable: true, tags: ['web10-social-group'] });
  });

  it('an explicit discoverable: false unlists a public group (override the default)', async () => {
    await createCommunityGroup({ name: 'My Group', visibility: 'public', discoverable: false }, 'jacoby149');
    const [, , , members, opts] = mockCreateGroup.mock.calls[0];
    // Still public (the `anyone` reader row) but hidden from the directory
    expect(members).toContainEqual({ member_key: 'anyone', role: 'reader' });
    expect(opts).toEqual({ discoverable: false, tags: ['web10-social-group'] });
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

  it('an explicit slug override is used for the group_id (the display name stays free)', async () => {
    await createCommunityGroup(
      { name: 'My Group', visibility: 'private', slug: 'my-group-2' },
      'jacoby149',
    );
    const [slug] = mockCreateGroup.mock.calls[0];
    expect(slug).toBe('my-group-2');
    // The face keeps the pretty display name — the slug is the identity, not the name.
    const [, faceBody] = mockCreate.mock.calls[0];
    expect(faceBody.name).toBe('My Group');
  });
});

describe('createDraftGroup — the create entry point (G4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateGroup.mockResolvedValue({ group_id: 'g1' });
    mockCreate.mockResolvedValue({ _id: 'doc-1' });
    // Default: the slug is free.
    mockGetGroup.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
  });

  it('creates an inert draft (unlisted, owner-only, face status=draft) and returns the id', async () => {
    const groupId = await createDraftGroup('jacoby149');
    expect(groupId).toBe('web10.app/groups/jacoby149/new-group');
    const [slug, , , members, opts] = mockCreateGroup.mock.calls[0];
    expect(slug).toBe('new-group');
    // Inert: unlisted + owner-only (no reserved reader row) — the directory and
    // everyone's lists are safe (G0).
    expect(opts).toEqual({ discoverable: false, tags: ['web10-social-group'] });
    expect(members).toEqual([{ member_key: 'web10.app/users/jacoby149', role: 'owner' }]);
    // The face is a draft with the placeholder name.
    const [, faceBody] = mockCreate.mock.calls[0];
    expect(faceBody).toEqual(
      expect.objectContaining({ name: 'New group', status: 'draft', discoverable: false }),
    );
  });

  it('the slug guard is live at create: a taken slug gets a numeric suffix', async () => {
    // `new-group` is taken, `new-group-2` is free.
    mockGetGroup.mockImplementation((groupId: string) => {
      if (groupId === 'web10.app/groups/jacoby149/new-group') {
        return Promise.resolve({ group_id: groupId });
      }
      return Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
    });
    const groupId = await createDraftGroup('jacoby149');
    expect(groupId).toBe('web10.app/groups/jacoby149/new-group-2');
    const [slug] = mockCreateGroup.mock.calls[0];
    expect(slug).toBe('new-group-2');
    // The guard checked both slugs (the create-time get_group check, decision 1).
    expect(mockGetGroup).toHaveBeenCalledWith('web10.app/groups/jacoby149/new-group');
    expect(mockGetGroup).toHaveBeenCalledWith('web10.app/groups/jacoby149/new-group-2');
  });

  it('a tombstoned slug does not count (delete-then-recreate is safe, G0)', async () => {
    // get_group 404s (the group was deleted → tombstone) → the slug is free.
    mockGetGroup.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    const groupId = await createDraftGroup('jacoby149');
    expect(groupId).toBe('web10.app/groups/jacoby149/new-group');
  });
});
