import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import {
  createCommunityGroup,
  slugTaken,
  saveGroup,
  publishGroup,
  deleteGroup,
  communityGroupId,
  slugify,
} from '../../data/groups';

// Mock the v3 client seam (the SDK) so we can assert the exact calls the
// draft-state / slug-guard / atomic-commit logic makes.
function mockV3Client() {
  const mock = {
    readToken: vi.fn(() => ({ provider: 'api.localhost', username: 'jacoby149' })),
    createGroup: vi.fn().mockResolvedValue({ group_id: 'g' }),
    create: vi.fn().mockResolvedValue({ doc_id: 'doc-1' }),
    read: vi.fn().mockResolvedValue([]),
    getGroup: vi.fn(),
    getMyGroups: vi.fn().mockResolvedValue([]),
    updateGroup: vi.fn().mockResolvedValue({}),
    getGroupMembers: vi.fn().mockResolvedValue([]),
    addGroupMember: vi.fn().mockResolvedValue({}),
    removeGroupMember: vi.fn().mockResolvedValue({}),
    deleteGroup: vi.fn().mockResolvedValue({ status: 'deleted' }),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('createCommunityGroup draft mode (G0)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('draft: discoverable=false, owner-only members, face status=draft + staged settings in face', async () => {
    const mock = mockV3Client();
    const groupId = await createCommunityGroup(
      { name: 'My Draft', visibility: 'public', join_policy: 'request', draft: true },
      'jacoby149',
    );
    expect(groupId).toBe('web10.app/groups/jacoby149/my-draft');
    const [slug, joinPolicy, , members, opts] = mock.createGroup.mock.calls[0];
    expect(slug).toBe('my-draft');
    expect(joinPolicy).toBe('request');
    // A draft is inert: unlisted + owner-only (no reserved reader row yet).
    expect(opts).toEqual({ discoverable: false, tags: ['web10-social-group'] });
    expect(members).toEqual([{ member_key: 'web10.app/users/jacoby149', role: 'owner' }]);
    // The face carries status=draft + the staged settings (decision 2).
    const [, faceBody] = mock.create.mock.calls[0];
    expect(faceBody).toEqual(
      expect.objectContaining({
        name: 'My Draft',
        status: 'draft',
        visibility: 'public',
        join_policy: 'request',
        discoverable: false,
      }),
    );
  });

  it('non-draft (default): unchanged — public is discoverable + anyone reader, face status=published', async () => {
    const mock = mockV3Client();
    await createCommunityGroup({ name: 'Live Group', visibility: 'public' }, 'jacoby149');
    const [, , , members, opts] = mock.createGroup.mock.calls[0];
    expect(opts).toEqual({ discoverable: true, tags: ['web10-social-group'] });
    expect(members).toContainEqual({ member_key: 'anyone', role: 'reader' });
    const [, faceBody] = mock.create.mock.calls[0];
    expect(faceBody.status).toBe('published');
  });

  it('draft is absent from the directory + others lists, present to the owner', async () => {
    const mock = mockV3Client();
    await createCommunityGroup({ name: 'Secret Draft', visibility: 'private', draft: true }, 'jacoby149');
    const [, , , members, opts] = mock.createGroup.mock.calls[0];
    // Directory safe: discoverable=false → list_discoverable_groups filters discoverable=1.
    expect(opts.discoverable).toBe(false);
    // Others' lists safe: owner-only, no reserved reader row, no other members.
    expect(members).toHaveLength(1);
    expect(members[0].member_key).toBe('web10.app/users/jacoby149');
    // Owner's list: the community tag is present, so getMyCommunityGroups
    // (server-side tag filter) returns it to the owner.
    expect(opts.tags).toContain('web10-social-group');
  });
});

describe('slugTaken (create-time slug guard, decision 1)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('true when an active group exists at the slug', async () => {
    const mock = mockV3Client();
    mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/jacoby149/my-group' });
    expect(await slugTaken('my-group', 'jacoby149')).toBe(true);
    expect(mock.getGroup).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-group');
  });

  it('false when the group is a tombstone (get_group 404s)', async () => {
    const mock = mockV3Client();
    const err = new Error('not found');
    (err as any).status = 404;
    mock.getGroup.mockRejectedValue(err);
    expect(await slugTaken('my-group', 'jacoby149')).toBe(false);
  });

  it('false when getGroup resolves null/absent', async () => {
    const mock = mockV3Client();
    mock.getGroup.mockResolvedValue(null as any);
    expect(await slugTaken('my-group', 'jacoby149')).toBe(false);
  });

  it('the slug is namespaced under the owner (communityGroupId)', () => {
    expect(communityGroupId('jacoby149', 'my-group')).toBe('web10.app/groups/jacoby149/my-group');
    expect(slugify('My Group!')).toBe('my-group');
  });
});

describe('saveGroup / publishGroup (atomic commit, decision 2)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('publish: face→published, then update_group, then read-grant — one ordered sequence', async () => {
    const mock = mockV3Client();
    // The draft currently has no reserved reader rows (owner-only).
    mock.getGroupMembers.mockResolvedValue([
      { member_key: 'web10.app/users/jacoby149', role: 'owner' },
    ]);

    await publishGroup('web10.app/groups/jacoby149/my-group', {
      face: { name: 'My Group', description: 'd' },
      visibility: 'public',
      joinPolicy: 'open',
      discoverable: true,
    });

    // 1) The face goes live with status=published.
    const [, faceBody] = mock.create.mock.calls[0];
    expect(faceBody).toEqual(expect.objectContaining({ name: 'My Group', status: 'published' }));
    expect(mock.create).toHaveBeenCalledWith('web10-social-group-identity', faceBody, {
      groups: ['web10.app/groups/jacoby149/my-group'],
    });
    // 2) The group contract gets join policy + directory listing.
    expect(mock.updateGroup).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-group', {
      join_policy: 'open',
      discoverable: true,
    });
    // 3) The read grant is reconciled: public → add the `anyone` reader row.
    expect(mock.addGroupMember).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-group', 'anyone', 'reader');
    // Ordering: face before contract before read-grant (the atomic go).
    const faceOrder = mock.create.mock.invocationCallOrder.slice(-1)[0];
    const contractOrder = mock.updateGroup.mock.invocationCallOrder.slice(-1)[0];
    const grantOrder = mock.addGroupMember.mock.invocationCallOrder.slice(-1)[0];
    expect(faceOrder).toBeLessThan(contractOrder);
    expect(contractOrder).toBeLessThan(grantOrder);
  });

  it('save (published group): signed_in visibility adds authenticated and removes anyone', async () => {
    const mock = mockV3Client();
    // The group was public before (has an `anyone` reader row).
    mock.getGroupMembers.mockResolvedValue([
      { member_key: 'web10.app/users/jacoby149', role: 'owner' },
      { member_key: 'anyone', role: 'reader' },
    ]);
    await saveGroup('web10.app/groups/jacoby149/my-group', {
      face: { name: 'My Group' },
      visibility: 'signed_in',
      joinPolicy: 'request',
      discoverable: false,
    });
    expect(mock.updateGroup).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-group', {
      join_policy: 'request',
      discoverable: false,
    });
    expect(mock.addGroupMember).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-group', 'authenticated', 'reader');
    expect(mock.removeGroupMember).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-group', 'anyone');
    const [, faceBody] = mock.create.mock.calls[0];
    expect(faceBody.status).toBe('published');
  });

  it('private visibility removes all reserved reader rows', async () => {
    const mock = mockV3Client();
    mock.getGroupMembers.mockResolvedValue([
      { member_key: 'web10.app/users/jacoby149', role: 'owner' },
      { member_key: 'anyone', role: 'reader' },
      { member_key: 'authenticated', role: 'reader' },
    ]);
    await saveGroup('g', { face: { name: 'X' }, visibility: 'private', joinPolicy: 'invite_only', discoverable: false });
    expect(mock.addGroupMember).not.toHaveBeenCalled();
    expect(mock.removeGroupMember).toHaveBeenCalledWith('g', 'anyone');
    expect(mock.removeGroupMember).toHaveBeenCalledWith('g', 'authenticated');
  });
});

describe('deleteGroup (draft discard)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('delegates to the node delete (tombstone)', async () => {
    const mock = mockV3Client();
    await deleteGroup('web10.app/groups/jacoby149/my-draft');
    expect(mock.deleteGroup).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-draft');
  });
});
