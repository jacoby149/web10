import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the v3 client seam (the SDK) + the groups/posts modules so we can assert
// the exact calls (the groupsCreate.test.ts idiom).
const mockReadToken = vi.fn().mockReturnValue({ provider: 'api.localhost', username: 'jacoby149' });
const mockCreateGroup = vi.fn().mockResolvedValue({ group_id: 'api.localhost/groups/users/jacoby149/saved-my-collection' });
const mockCreate = vi.fn().mockResolvedValue({ doc_id: 's1' });
const mockRead = vi.fn();
const mockDelete = vi.fn().mockResolvedValue({ doc_id: 'd1', status: 'deleted' });
const mockGetGroupMembers = vi.fn().mockResolvedValue([]);

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    readToken: () => mockReadToken(),
    createGroup: (...a: unknown[]) => mockCreateGroup(...a),
    create: (...a: unknown[]) => mockCreate(...a),
    read: (...a: unknown[]) => mockRead(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
    getGroupMembers: (...a: unknown[]) => mockGetGroupMembers(...a),
  }),
}));

const mockWriteGroupIdentity = vi.fn().mockResolvedValue(undefined);
const mockReadGroupIdentity = vi.fn().mockResolvedValue({ name: 'My Collection', kind: 'saved', visibility: 'private' });
const mockAddGroupMember = vi.fn().mockResolvedValue({});
const mockRemoveGroupMember = vi.fn().mockResolvedValue({});
const mockDeleteGroup = vi.fn().mockResolvedValue({});
const mockGetMyGroups = vi.fn().mockResolvedValue([]);

vi.mock('@/data/groups', () => ({
  slugify: (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  writeGroupIdentity: (...a: unknown[]) => mockWriteGroupIdentity(...a),
  readGroupIdentity: (...a: unknown[]) => mockReadGroupIdentity(...a),
  addGroupMember: (...a: unknown[]) => mockAddGroupMember(...a),
  removeGroupMember: (...a: unknown[]) => mockRemoveGroupMember(...a),
  deleteGroup: (...a: unknown[]) => mockDeleteGroup(...a),
  getMyGroups: (...a: unknown[]) => mockGetMyGroups(...a),
}));

const mockReadPostById = vi.fn().mockResolvedValue(null);
const mockResolveMediaRefs = vi.fn().mockResolvedValue([]);

vi.mock('@/data/posts', () => ({
  readPostById: (...a: unknown[]) => mockReadPostById(...a),
  resolveMediaRefs: (...a: unknown[]) => mockResolveMediaRefs(...a),
}));

import {
  createCollection,
  getMyCollections,
  readCollection,
  savePostToCollection,
  removePostFromCollection,
  setCollectionVisibility,
  renameCollection,
  deleteCollection,
  readSavedPostIds,
} from '@/data/saved';

const GROUP_ID = 'api.localhost/groups/users/jacoby149/saved-my-collection';

beforeEach(() => {
  vi.clearAllMocks();
  mockReadToken.mockReturnValue({ provider: 'api.localhost', username: 'jacoby149' });
  mockCreateGroup.mockResolvedValue({ group_id: GROUP_ID });
  mockCreate.mockResolvedValue({ doc_id: 's1' });
  mockRead.mockResolvedValue([]);
  mockGetGroupMembers.mockResolvedValue([]);
  mockReadGroupIdentity.mockResolvedValue({ name: 'My Collection', kind: 'saved', visibility: 'private' });
  mockReadPostById.mockResolvedValue(null);
  mockResolveMediaRefs.mockResolvedValue([]);
  mockGetMyGroups.mockResolvedValue([]);
});

describe('createCollection — private by default (the "sensitive" guard)', () => {
  it('a private collection is owner-only (no reserved reader row), invite_only, tagged, unlisted', async () => {
    const id = await createCollection('My Collection');
    expect(id).toBe(GROUP_ID);
    const [slug, joinPolicy, roles, members, opts] = mockCreateGroup.mock.calls[0];
    expect(slug).toBe('saved-my-collection');
    expect(joinPolicy).toBe('invite_only');
    // owner-only — NO `anyone` / `authenticated` row (private by default).
    expect(members).toEqual([{ member_key: 'web10.app/users/jacoby149', role: 'owner' }]);
    expect(members).not.toContainEqual({ member_key: 'anyone', role: 'reader' });
    // never discoverable + the D78 saved tag.
    expect(opts).toEqual({ discoverable: false, tags: ['web10-social-saved'] });
    // the face carries kind:'saved' + visibility:'private'.
    expect(mockWriteGroupIdentity).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ name: 'My Collection', kind: 'saved', visibility: 'private' }),
    );
    // no reader row added.
    expect(mockAddGroupMember).not.toHaveBeenCalled();
  });

  it('a public collection adds the `anyone` reader row (the D58 publicness-is-a-grant idiom)', async () => {
    await createCollection('My Collection', { visibility: 'public' });
    const [, , , members] = mockCreateGroup.mock.calls[0];
    expect(members).toContainEqual({ member_key: 'anyone', role: 'reader' });
    expect(mockWriteGroupIdentity).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ kind: 'saved', visibility: 'public' }),
    );
  });
});

describe('getMyCollections — selected by the D78 tag', () => {
  it('selects by the saved tag and resolves face + item count', async () => {
    mockGetMyGroups.mockResolvedValue([{ group_id: GROUP_ID, join_policy: 'invite_only', my_role: 'owner', member_count: 1 }]);
    mockRead.mockImplementation(async (service: string) => (service === 'saved' ? [{ doc_id: 's1', ref_value: 'p1', body: { post_id: 'p1' }, created_at: '2026-09-30T00:00:00Z' }] : []));
    const collections = await getMyCollections();
    expect(mockGetMyGroups).toHaveBeenCalledWith({ tags: ['web10-social-saved'] });
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({
      groupId: GROUP_ID,
      name: 'My Collection',
      visibility: 'private',
      itemCount: 1,
      slug: 'my-collection',
    });
  });
});

describe('readCollection — the ref_value join + dead-ref degrade', () => {
  it('resolves each saved ref to the target post; a dead ref degrades to unavailable', async () => {
    mockRead.mockResolvedValue([
      { doc_id: 's1', ref_value: 'p1', body: { post_id: 'p1', note: 'for later' }, created_at: '2026-09-30T00:00:00Z' },
      { doc_id: 's2', ref_value: 'dead', body: { post_id: 'dead' }, created_at: '2026-09-29T00:00:00Z' },
    ]);
    mockReadPostById.mockImplementation(async (id: string) =>
      id === 'p1' ? { _id: 'p1', text: 'hello', created_at: '2026-09-01T00:00:00Z' } : null,
    );
    const { face, posts } = await readCollection(GROUP_ID);
    expect(face.name).toBe('My Collection');
    // newest save first.
    expect(posts.map((p) => p.postId)).toEqual(['p1', 'dead']);
    expect(posts[0]).toMatchObject({ postId: 'p1', note: 'for later', unavailable: false });
    expect(posts[0].post?._id).toBe('p1');
    // the dead ref degrades — never throws, never leaks.
    expect(posts[1]).toMatchObject({ postId: 'dead', unavailable: true, post: null });
  });

  it('a 403 on the saved read (a private collection for a non-owner) propagates (I3)', async () => {
    mockRead.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await expect(readCollection(GROUP_ID)).rejects.toMatchObject({ status: 403 });
  });
});

describe('savePostToCollection — the self-heal no-op', () => {
  it('writes a `saved` doc with the ref_value when not already saved', async () => {
    mockRead.mockResolvedValue([]); // not saved
    const wrote = await savePostToCollection(GROUP_ID, 'p1', 'for later');
    expect(wrote).toBe(true);
    expect(mockRead).toHaveBeenCalledWith('saved', expect.objectContaining({ groups: [GROUP_ID] }));
    // the fresh save writes a `saved` doc carrying the post_id + the ref_value.
    expect(mockCreate).toHaveBeenCalledWith(
      'saved',
      expect.objectContaining({ post_id: 'p1', note: 'for later' }),
      expect.objectContaining({ groups: [GROUP_ID], ref_value: 'p1' }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('is a no-op when the post is already in the collection', async () => {
    mockRead.mockResolvedValue([{ doc_id: 's1', ref_value: 'p1', body: { post_id: 'p1' }, created_at: 'x' }]);
    const wrote = await savePostToCollection(GROUP_ID, 'p1');
    expect(wrote).toBe(false);
  });
});

describe('removePostFromCollection — delete the saved doc', () => {
  it('deletes the saved doc when present', async () => {
    mockRead.mockResolvedValue([{ doc_id: 's1', ref_value: 'p1', body: { post_id: 'p1' }, created_at: 'x' }]);
    await removePostFromCollection(GROUP_ID, 'p1');
    expect(mockDelete).toHaveBeenCalledWith('s1');
  });

  it('is a no-op when the post is not in the collection', async () => {
    mockRead.mockResolvedValue([]);
    await removePostFromCollection(GROUP_ID, 'p1');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('setCollectionVisibility — add/remove the `anyone` reader row', () => {
  it('public adds the `anyone` reader row + sets the face', async () => {
    mockGetGroupMembers.mockResolvedValue([{ member_key: 'web10.app/users/jacoby149', role: 'owner' }]);
    await setCollectionVisibility(GROUP_ID, 'public');
    expect(mockAddGroupMember).toHaveBeenCalledWith(GROUP_ID, 'anyone', 'reader');
    expect(mockRemoveGroupMember).not.toHaveBeenCalled();
    expect(mockWriteGroupIdentity).toHaveBeenCalledWith(GROUP_ID, expect.objectContaining({ visibility: 'public' }));
  });

  it('private removes the `anyone` reader row + sets the face', async () => {
    mockGetGroupMembers.mockResolvedValue([
      { member_key: 'web10.app/users/jacoby149', role: 'owner' },
      { member_key: 'anyone', role: 'reader' },
    ]);
    await setCollectionVisibility(GROUP_ID, 'private');
    expect(mockRemoveGroupMember).toHaveBeenCalledWith(GROUP_ID, 'anyone');
    expect(mockAddGroupMember).not.toHaveBeenCalled();
    expect(mockWriteGroupIdentity).toHaveBeenCalledWith(GROUP_ID, expect.objectContaining({ visibility: 'private' }));
  });

  it('is idempotent — public when the `anyone` row already exists does not re-add', async () => {
    mockGetGroupMembers.mockResolvedValue([
      { member_key: 'web10.app/users/jacoby149', role: 'owner' },
      { member_key: 'anyone', role: 'reader' },
    ]);
    await setCollectionVisibility(GROUP_ID, 'public');
    expect(mockAddGroupMember).not.toHaveBeenCalled();
  });
});

describe('renameCollection + deleteCollection', () => {
  it('rename updates the face name', async () => {
    await renameCollection(GROUP_ID, 'New Name');
    expect(mockWriteGroupIdentity).toHaveBeenCalledWith(GROUP_ID, expect.objectContaining({ name: 'New Name' }));
  });

  it('delete calls the group delete', async () => {
    await deleteCollection(GROUP_ID);
    expect(mockDeleteGroup).toHaveBeenCalledWith(GROUP_ID);
  });
});

describe('readSavedPostIds — the "I saved this" fill', () => {
  it('returns the set of saved post ids', async () => {
    mockRead.mockResolvedValue([
      { doc_id: 's1', ref_value: 'p1', body: { post_id: 'p1' }, created_at: 'x' },
      { doc_id: 's2', ref_value: 'p2', body: { post_id: 'p2' }, created_at: 'x' },
    ]);
    const ids = await readSavedPostIds(GROUP_ID);
    expect(ids).toEqual(new Set(['p1', 'p2']));
  });

  it('degrades to an empty set on failure', async () => {
    mockRead.mockRejectedValue(new Error('boom'));
    const ids = await readSavedPostIds(GROUP_ID);
    expect(ids).toEqual(new Set());
  });
});
