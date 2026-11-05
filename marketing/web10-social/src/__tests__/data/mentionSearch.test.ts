import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchMentionPeople } from '@/data/mentionSearch';
const { directory, query } = vi.hoisted(() => ({ directory: vi.fn(), query: vi.fn() }));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ readToken: () => ({ provider: 'node', username: 'me' }), listPeopleDirectory: directory, query }) }));
vi.mock('@/data/groups', () => ({ followersGroupId: (username: string, provider: string) => `${provider}/groups/users/${username}/followers` }));
beforeEach(() => { vi.resetAllMocks(); query.mockResolvedValue({ rows: [] }); });

describe('mention directory search', () => {
  it('finds people beyond the first directory page and paints before optional faces', async () => {
    directory.mockResolvedValueOnce({ users: Array.from({ length: 100 }, (_, i) => ({ username: `user${i}`, profile: {} })) })
      .mockResolvedValueOnce({ users: [{ username: 'nova', profile: { display_name: 'Nova Lane' } }] });
    let finish!: (value: unknown) => void;
    query.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const progress = vi.fn();
    const result = searchMentionPeople('Nova', new AbortController().signal, progress);
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith([{ username: 'nova', displayName: 'Nova Lane' }]));
    expect(directory).toHaveBeenNthCalledWith(2, { limit: 100, offset: 100 });
    finish({ rows: [{ author_key: 'nova', avatar_url: 'https://face.test/nova' }] });
    expect(await result).toEqual([{ username: 'nova', displayName: 'Nova Lane', avatarUrl: 'https://face.test/nova' }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("author_key IN ('nova')"), expect.objectContaining({ groups: ['node/groups/users/nova/followers'] }));
  });

  it('supports display names and empty @ suggestions, with exact handles ranked first and a six-row budget', async () => {
    directory.mockResolvedValue({ users: [{ username: 'northern', profile: { display_name: 'Nova Sound' } }, { username: 'nova', profile: { display_name: 'Other Name' } }, ...Array.from({ length: 10 }, (_, i) => ({ username: `nova${i}` }))] });
    const result = await searchMentionPeople('nova', new AbortController().signal, () => {});
    expect(result).toHaveLength(6); expect(result[0].username).toBe('nova');
    expect(await searchMentionPeople('', new AbortController().signal, () => {})).toHaveLength(6);
  });

  it('cancels obsolete pagination and retains names when optional face reads fail', async () => {
    const controller = new AbortController();
    directory.mockImplementationOnce(async () => { controller.abort(); return { users: Array.from({ length: 100 }, () => ({ username: 'someone' })) }; });
    const progress = vi.fn();
    expect(await searchMentionPeople('no', controller.signal, progress)).toEqual([]);
    expect(directory).toHaveBeenCalledOnce(); expect(progress).not.toHaveBeenCalled();
    directory.mockResolvedValue({ users: [{ username: 'nova' }] }); query.mockRejectedValue(new Error('face unavailable'));
    expect(await searchMentionPeople('nova', new AbortController().signal, progress)).toEqual([{ username: 'nova', displayName: 'nova' }]);
  });
});
