import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the v3 client seam (the group list, the member fan-out, and the posts
// read) + the groups module's getMyGroups (dms.ts imports it from ./groups).
const mockReadToken = vi.fn();
const mockGetMyGroups = vi.fn();
const mockGetGroupMembers = vi.fn();
const mockRead = vi.fn();

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    readToken: () => mockReadToken(),
    getMyGroups: (...args: unknown[]) => mockGetMyGroups(...args),
    getGroupMembers: (...args: unknown[]) => mockGetGroupMembers(...args),
    read: (...args: unknown[]) => mockRead(...args),
  }),
}));

vi.mock('@/data/groups', () => ({
  getMyGroups: (...args: unknown[]) => mockGetMyGroups(...args),
}));

import { listConversations, getLastDm } from '@/data/dms';

// A DM group as the node returns it: the creator is embedded in the group_id
// (NOT symmetric), the deterministic name is the slug (dm-{sorted}), and the
// other party is resolved from membership (bare-username member keys).
function dmGroup(creator: string, other: string, me: string): { group_id: string; member_count: number } {
  const name = `dm-${[me, other].sort().join('-')}`;
  return { group_id: `api.localhost/groups/users/${creator}/${name}`, member_count: 2 };
}

describe('dms v3 data layer — paint-on-read (3.225.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadToken.mockReturnValue({ provider: 'api.localhost', username: 'me' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listConversations', () => {
    it('resolves the other party from membership (the creator-embedded id is not derivable)', async () => {
      const g1 = dmGroup('alice', 'bob', 'me');
      const g2 = dmGroup('carol', 'dave', 'me');
      mockGetMyGroups.mockResolvedValue([
        g1,
        g2,
        // Not a DM (the slug is not dm-) — skipped.
        { group_id: 'api.localhost/groups/users/me/followers', member_count: 10 },
        // Not a DM (member_count !== 2) — skipped.
        { group_id: 'api.localhost/groups/users/me/dm-x-y-z', member_count: 3 },
      ]);
      mockGetGroupMembers.mockImplementation(async (groupId: string) => {
        if (groupId === g1.group_id) return [{ member_key: 'me' }, { member_key: 'bob' }];
        return [{ member_key: 'me' }, { member_key: 'dave' }];
      });

      const convs = await listConversations();
      expect(convs).toHaveLength(2);
      expect(convs).toContain('api.localhost/bob--api.localhost/me');
      expect(convs).toContain('api.localhost/dave--api.localhost/me');
    });

    it('runs the member fan-out in PARALLEL (not a serial round-trip per conversation)', async () => {
      const g1 = dmGroup('alice', 'bob', 'me');
      const g2 = dmGroup('carol', 'dave', 'me');
      const g3 = dmGroup('erin', 'frank', 'me');
      mockGetMyGroups.mockResolvedValue([g1, g2, g3]);
      // Gate every member read behind a shared promise that is released AFTER
      // listConversations' getMyGroups returns. If the fan-out were SERIAL,
      // each getGroupMembers would only start after the previous one resolved
      // — but they all start before any of them resolves (the gate is still
      // closed when all three are in flight).
      let release: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let inFlight = 0;
      let maxInFlight = 0;
      mockGetGroupMembers.mockImplementation(async (groupId: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gate;
        inFlight--;
        const other = groupId === g1.group_id ? 'bob' : groupId === g2.group_id ? 'dave' : 'frank';
        return [{ member_key: 'me' }, { member_key: other }];
      });

      const p = listConversations();
      // All three member reads are in flight before any resolves.
      await vi.waitFor(() => expect(inFlight).toBe(3));
      release!();
      const convs = await p;
      expect(convs).toHaveLength(3);
      expect(maxInFlight).toBe(3);
    });

    it('a failed member read degrades that one conversation to skipped (never a throw)', async () => {
      const g1 = dmGroup('alice', 'bob', 'me');
      const g2 = dmGroup('carol', 'dave', 'me');
      mockGetMyGroups.mockResolvedValue([g1, g2]);
      mockGetGroupMembers.mockImplementation(async (groupId: string) => {
        if (groupId === g1.group_id) throw new Error('boom');
        return [{ member_key: 'me' }, { member_key: 'dave' }];
      });

      const convs = await listConversations();
      // The failed one is skipped; the other still resolves.
      expect(convs).toEqual(['api.localhost/dave--api.localhost/me']);
    });
  });

  describe('getLastDm (paint-on-read, 3.225.0)', () => {
    it('is a SINGLE read (limit 1 — the server orders created_at DESC, so [0] is the last)', async () => {
      const g = dmGroup('alice', 'bob', 'me');
      mockGetMyGroups.mockResolvedValue([g]);
      mockRead.mockResolvedValue([
        { doc_id: 'dm2', author_key: 'api.localhost/bob', body: { message: 'world' }, created_at: '2026-07-18T00:01:00Z' },
      ]);

      const last = await getLastDm('api.localhost/bob--api.localhost/me');
      // One round-trip, one doc — NOT the full history (the old path read
      // every message and took the tail).
      expect(mockRead).toHaveBeenCalledWith('posts', { groups: [g.group_id], limit: 1 });
      expect(mockRead).toHaveBeenCalledTimes(1);
      expect(last?.message).toBe('world');
    });

    it('returns null when no DM group exists yet (an empty conversation, not an error)', async () => {
      mockGetMyGroups.mockResolvedValue([]);
      const last = await getLastDm('api.localhost/bob--api.localhost/me');
      expect(last).toBeNull();
      expect(mockRead).not.toHaveBeenCalled();
    });

    it('returns null for a conversation with no messages', async () => {
      const g = dmGroup('alice', 'bob', 'me');
      mockGetMyGroups.mockResolvedValue([g]);
      mockRead.mockResolvedValue([]);
      const last = await getLastDm('api.localhost/bob--api.localhost/me');
      expect(last).toBeNull();
    });
  });
});
