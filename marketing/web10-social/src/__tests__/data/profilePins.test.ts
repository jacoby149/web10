import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { fromV3DocToProfile, type PostRecord } from '../../data/types';
import {
  MAX_PROFILE_PINS,
  normalizePinnedPostIds,
  togglePinnedPostIds,
  orderPinnedPosts,
  readPinnedPosts,
  savePinnedPostIds,
} from '../../data/profilePins';

// savePinnedPostIds rides saveProfile → ensureFollowers (the home group).
// Mock it so the test doesn't fan out to group CRUD (the profile.test.ts idiom).
vi.mock('../../data/groups', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    ensureFollowers: vi.fn(async () => 'test.localhost/groups/users/testuser/followers'),
  };
});

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'test.localhost', username: 'testuser' })),
    create: vi.fn(),
    read: vi.fn(),
    readById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
    getProfile: vi.fn(),
    getMyGroups: vi.fn(),
    getGroupMembers: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

const POSTS: PostRecord[] = [
  { _id: 'p-1', text: 'one', created_at: '2026-11-01T00:00:00Z' },
  { _id: 'p-2', text: 'two', created_at: '2026-11-02T00:00:00Z' },
  { _id: 'p-3', text: 'three', created_at: '2026-11-03T00:00:00Z' },
  { _id: 'p-4', text: 'four', created_at: '2026-11-04T00:00:00Z' },
];

describe('profile pins (profile-pins.md) — the pure core', () => {
  it('the slots are three (the data layer is the enforcement point)', () => {
    expect(MAX_PROFILE_PINS).toBe(3);
  });

  describe('normalizePinnedPostIds', () => {
    it('is empty for anything that is not an array', () => {
      expect(normalizePinnedPostIds(undefined)).toEqual([]);
      expect(normalizePinnedPostIds(null)).toEqual([]);
      expect(normalizePinnedPostIds('a-list')).toEqual([]);
      expect(normalizePinnedPostIds({ 0: 'x' })).toEqual([]);
    });

    it('keeps string ids only, drops empties, dedupes, preserves order', () => {
      expect(normalizePinnedPostIds(['a', '', null, 7, 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('caps at the slot count (the wire is not trusted to be tidy)', () => {
      expect(normalizePinnedPostIds(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c']);
    });
  });

  describe('togglePinnedPostIds', () => {
    it('pin appends (display order = pin order; a fresh pin lands last)', () => {
      expect(togglePinnedPostIds([], 'a', true)).toEqual(['a']);
      expect(togglePinnedPostIds(['a'], 'b', true)).toEqual(['a', 'b']);
    });

    it('pin is idempotent (an already-pinned id does not move)', () => {
      expect(togglePinnedPostIds(['a', 'b'], 'a', true)).toEqual(['a', 'b']);
    });

    it('unpin removes, preserving the rest', () => {
      expect(togglePinnedPostIds(['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
      expect(togglePinnedPostIds([], 'ghost', false)).toEqual([]);
    });

    it('a fourth pin throws (the UI hides the item; this is the backstop)', () => {
      expect(() => togglePinnedPostIds(['a', 'b', 'c'], 'd', true)).toThrow(/full/);
    });
  });

  describe('orderPinnedPosts', () => {
    it('pinned posts first (in pin order), the rest in the given order', () => {
      const ordered = orderPinnedPosts(POSTS, ['p-3', 'p-1']);
      expect(ordered.map((p) => p._id)).toEqual(['p-3', 'p-1', 'p-2', 'p-4']);
    });

    it('a pinned id with no post drops out (dead / unreadable — renders nowhere)', () => {
      const ordered = orderPinnedPosts(POSTS, ['ghost', 'p-2', 'p-2']);
      expect(ordered.map((p) => p._id)).toEqual(['p-2', 'p-1', 'p-3', 'p-4']);
    });

    it('no pins: the given order, unchanged', () => {
      expect(orderPinnedPosts(POSTS, []).map((p) => p._id)).toEqual(['p-1', 'p-2', 'p-3', 'p-4']);
    });
  });

  describe('fromV3DocToProfile — the parse-side twin of normalizePinnedPostIds', () => {
    it('parses a dirty stored list into the trusted shape (string, dedupe, cap 3)', () => {
      const rec = fromV3DocToProfile({
        doc_id: 'face-1',
        body: { display_name: 'T', pinned_post_ids: ['a', 9, 'a', null, 'b', 'c', 'd'] },
      } as never);
      expect(rec.pinned_post_ids).toEqual(['a', 'b', 'c']);
    });

    it('absent / empty / malformed → no pins field (undefined, not [])', () => {
      expect(fromV3DocToProfile({ doc_id: 'f', body: {} } as never).pinned_post_ids).toBeUndefined();
      expect(fromV3DocToProfile({ doc_id: 'f', body: { pinned_post_ids: [] } } as never).pinned_post_ids).toBeUndefined();
      expect(fromV3DocToProfile({ doc_id: 'f', body: { pinned_post_ids: 'nope' } } as never).pinned_post_ids).toBeUndefined();
    });
  });
});

describe('profile pins — readPinnedPosts (the bounded exact-id D73 read)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function rows(ids: string[]) {
    return {
      rows: ids.map((id) => ({
        doc_id: id,
        author_key: 'testuser',
        body: { text: `the ${id}` },
        tags: [],
        created_at: '2026-11-01T00:00:00Z',
      })),
    };
  }

  it('no ids → no query, empty result', async () => {
    const out = await readPinnedPosts({ username: 'testuser', docIds: [], isOwn: true });
    expect(out).toEqual([]);
    expect(mock.query).not.toHaveBeenCalled();
  });

  it('owner: the query is author-filtered + exact-id, scoped to the owner groups, ad/product excluded, prepared', async () => {
    mock.query.mockResolvedValue(rows(['old-1']));
    const out = await readPinnedPosts({ username: 'testuser', docIds: ['old-1', 'old-1'], isOwn: true });

    expect(mock.query).toHaveBeenCalledTimes(1);
    const [sql, opts] = mock.query.mock.calls[0];
    expect(sql).toContain("FROM posts p WHERE p.author_key = 'testuser'");
    expect(sql).toContain("p.doc_id IN ('old-1')"); // deduped
    expect(sql).toContain("NOT has(p.tags, 'ad')");
    expect(sql).toContain("NOT has(p.tags, 'product')");
    expect(opts.groups).toEqual([
      'test.localhost/groups/users/testuser/followers',
      'test.localhost/groups/users/testuser/close-friends',
    ]);
    expect(opts.prepare).toEqual({ media: true, ads: true });
    expect(opts.surface).toBe('profile');
    expect(out.map((p: PostRecord) => p._id)).toEqual(['old-1']);
  });

  it('visitor: the query is scoped to the profile public scope (followers + discover)', async () => {
    mock.query.mockResolvedValue(rows([]));
    await readPinnedPosts({ username: 'nova', provider: 'test.localhost', docIds: ['x'], isOwn: false });
    const [, opts] = mock.query.mock.calls[0];
    expect(opts.groups[0]).toContain('/groups/users/nova/followers');
    expect(opts.groups[1]).toContain('discover');
  });

  it('the read failure returns null (unknown — the caller must not self-heal)', async () => {
    mock.query.mockRejectedValue(new Error('500'));
    await expect(readPinnedPosts({ username: 'testuser', docIds: ['x'], isOwn: true })).resolves.toBeNull();
  });

  it('a hostile id never breaks out of the literal (the defensive quoting)', async () => {
    mock.query.mockResolvedValue(rows([]));
    await readPinnedPosts({ username: "o'brien", docIds: ["x'; DELETE", 'ok'], isOwn: true });
    const [sql] = mock.query.mock.calls[0];
    // The quotes are doubled — the payload stays INSIDE the literal: the
    // author filter is exactly 'o''brien' and the IN list is exactly two
    // literals ('x''; DELETE' and 'ok') — no break-out, no third id.
    expect(sql).toContain("p.author_key = 'o''brien' AND p.doc_id IN ('x''; DELETE', 'ok')");
  });
});

describe('profile pins — savePinnedPostIds (the face-doc write)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the normalized list on the face doc via saveProfile (update-in-place)', async () => {
    mock.read.mockResolvedValue([]);
    mock.update.mockImplementation(async (_id: string, body: Record<string, unknown>) => ({
      doc_id: _id,
      body,
      updated_at: '2026-11-11T00:00:00Z',
    }));
    const face = { _id: 'face-doc-1', display_name: 'Me', bio: 'hi' };
    const out = await savePinnedPostIds(face, ['a', 'b', 'a', 'c', 'd']);

    // The face doc's update carries the pin list (normalized + capped).
    expect(mock.update).toHaveBeenCalledTimes(1);
    const [id, body] = mock.update.mock.calls[0];
    expect(id).toBe('face-doc-1');
    expect(body.pinned_post_ids).toEqual(['a', 'b', 'c']);
    // Every other face field round-trips (the full-body-replacement write).
    expect(body.display_name).toBe('Me');
    expect(body.bio).toBe('hi');
    expect(out.pinned_post_ids).toEqual(['a', 'b', 'c']);
  });

  it('no face yet → the write is refused (pins ride the face doc; a bare pin doc would be a phantom face)', async () => {
    await expect(savePinnedPostIds(null, ['a'])).rejects.toThrow(/no profile face/);
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
});
