import { beforeEach, describe, expect, it, vi } from 'vitest';

const { client, members, listFollowers, getFollowersCount } = vi.hoisted(() => ({
  client: { readToken: vi.fn(), read: vi.fn(), query: vi.fn(), getMyGroups: vi.fn() },
  members: vi.fn(),
  listFollowers: vi.fn(),
  getFollowersCount: vi.fn(),
}));
vi.mock('@/data/v3', () => ({ getV3Client: () => client }));
vi.mock('@/data/groups', () => ({
  followersGroupId: (username: string, provider = 'home.test') => `${provider}/groups/users/${username}/followers`,
  getGroupMembers: members,
}));
vi.mock('@/data/follows', () => ({ listFollowers, getFollowersCount }));

import { fetchMyFollowersCards, fetchMyFollowingCards } from '@/data/people';

describe('Followers cards use the listed person’s follower count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.readToken.mockReturnValue({ username: 'me', provider: 'home.test' });
    client.read.mockResolvedValue([]);
    client.query.mockResolvedValue({ rows: [], count: 0 });
    members.mockResolvedValue(Array.from({ length: 13 }, (_, i) => ({ member_key: `viewer-fan-${i}` })));
    listFollowers.mockResolvedValue([
      { username: 'alice', provider: 'home.test' },
      { username: 'bob', provider: 'home.test' },
      { username: 'carol', provider: 'home.test' },
    ]);
    getFollowersCount.mockImplementation(async (username: string) => ({ alice: 2, bob: 7, carol: 0 })[username]);
  });

  it('returns distinct per-person counts, including a real zero, rather than the viewer’s 13', async () => {
    const cards = await fetchMyFollowersCards();
    expect(cards.map(card => card.followers_count)).toEqual([2, 7, 0]);
    for (const username of ['alice', 'bob', 'carol']) {
      expect(getFollowersCount).toHaveBeenCalledWith(username, 'home.test');
    }
    expect(members).not.toHaveBeenCalled();
  });

  it('isolates a denied count from readable faces and other people’s counts', async () => {
    getFollowersCount.mockImplementation(async (username: string) => {
      if (username === 'bob') throw new Error('membership denied');
      return username === 'alice' ? 2 : 0;
    });
    client.read.mockImplementation(async (_service: string, { groups }: { groups: string[] }) =>
      groups[0].includes('/bob/') ? [{ body: { display_name: 'Bob' } }] : []);
    const cards = await fetchMyFollowersCards();
    expect(cards.map(card => card.followers_count)).toEqual([2, 0, 0]);
    expect(cards[1].display_name).toBe('Bob');
  });

  it('does not read memberships or counts when signed out', async () => {
    client.readToken.mockReturnValue(null);
    expect(await fetchMyFollowersCards()).toEqual([]);
    expect(listFollowers).not.toHaveBeenCalled();
    expect(getFollowersCount).not.toHaveBeenCalled();
  });

  it('retains counts when profile reads fail and forwards each card’s provider', async () => {
    listFollowers.mockResolvedValue([
      { username: 'alice', provider: 'home.test' },
      { username: 'bob', provider: 'other.test' },
    ]);
    client.read.mockRejectedValue(new Error('profile denied'));
    const cards = await fetchMyFollowersCards();
    expect(cards.map(card => card.followers_count)).toEqual([2, 7]);
    expect(cards.map(card => card.display_name)).toEqual(['alice', 'bob']);
    expect(getFollowersCount).toHaveBeenCalledWith('bob', 'other.test');
  });

  it('deduplicates repeated followers before resolving their counts and profiles', async () => {
    listFollowers.mockResolvedValue([
      { username: 'alice', provider: 'home.test' },
      { username: 'alice', provider: 'home.test' },
      { username: 'bob', provider: 'home.test' },
    ]);
    const cards = await fetchMyFollowersCards();
    expect(cards.map(card => card.username)).toEqual(['alice', 'bob']);
    expect(getFollowersCount).toHaveBeenCalledTimes(2);
    expect(client.read).toHaveBeenCalledTimes(2);
  });

  it('Following resolves each person’s own count and deduplicates group rows', async () => {
    client.getMyGroups.mockResolvedValue([
      { group_id: 'home.test/groups/users/me/followers' },
      { group_id: 'home.test/groups/users/alice/followers' },
      { group_id: 'home.test/groups/users/alice/followers' },
      { group_id: 'home.test/groups/users/bob/followers' },
      { group_id: 'home.test/groups/users/carol/followers' },
    ]);
    const cards = await fetchMyFollowingCards();
    expect(cards.map(card => [card.username, card.followers_count])).toEqual([
      ['alice', 2], ['bob', 7], ['carol', 0],
    ]);
    expect(getFollowersCount).toHaveBeenCalledTimes(3);
  });
});
