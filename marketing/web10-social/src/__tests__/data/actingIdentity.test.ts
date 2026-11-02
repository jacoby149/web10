import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actingPostGroups, getActingAuthor, selectActingAuthor } from '@/data/actingIdentity';

const state = vi.hoisted(() => ({ token: { provider: 'node', username: 'alice' }, getMyGroups: vi.fn() }));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ readToken: () => state.token, getMyGroups: state.getMyGroups }) }));
const group = 'node/groups/users/alice/team';
const key = 'social:acting:node:alice';

describe('Remembered acting identity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    state.token = { provider: 'node', username: 'alice' };
    state.getMyGroups.mockReset();
  });

  it('restores only the confirmed principal after a browser-session reset', () => {
    selectActingAuthor(group);
    expect(localStorage.getItem(key)).toBe(group);
    sessionStorage.clear();
    expect(getActingAuthor()).toBe(group);
    expect(sessionStorage.getItem(key)).toBe(group);
    expect(localStorage.length).toBe(1);
  });

  it('snapshots personal and group choices independently of later cross-tab changes', () => {
    expect(getActingAuthor()).toBeUndefined();
    localStorage.setItem(key, group);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: group }));
    expect(getActingAuthor()).toBeUndefined();
    selectActingAuthor(group);
    localStorage.setItem(key, 'another/groups/team');
    expect(getActingAuthor()).toBe(group);
  });

  it('remembers an explicit return to personal after reopen', () => {
    selectActingAuthor(group);
    selectActingAuthor();
    sessionStorage.clear();
    expect(getActingAuthor()).toBeUndefined();
  });

  it('isolates both account and provider', () => {
    selectActingAuthor(group);
    state.token = { provider: 'node', username: 'bob' };
    expect(getActingAuthor()).toBeUndefined();
    state.token = { provider: 'other', username: 'alice' };
    expect(getActingAuthor()).toBeUndefined();
    state.token = { provider: 'node', username: 'alice' };
    expect(getActingAuthor()).toBe(group);
  });

  it('keeps the restored group on revoked grant denial, with no personal retry', async () => {
    selectActingAuthor(group);
    sessionStorage.clear();
    state.getMyGroups.mockRejectedValue(new Error('grant revoked'));
    await expect(actingPostGroups(getActingAuthor()!)).rejects.toThrow('grant revoked');
    expect(state.getMyGroups).toHaveBeenCalledExactlyOnceWith({ author_as: group, service: 'posts' });
    expect(getActingAuthor()).toBe(group);
  });

  it('uses self for a new group with no memberships after checking current posting authority', async () => {
    state.getMyGroups.mockResolvedValue([]);
    await expect(actingPostGroups(group)).resolves.toEqual([group]);
    expect(state.getMyGroups).toHaveBeenCalledExactlyOnceWith({ author_as: group, service: 'posts' });
  });

  it('includes self and deduplicates explicit memberships without adding Discover', async () => {
    state.getMyGroups.mockResolvedValue([
      { group_id: 'other-group' }, { group_id: group }, { group_id: 'other-group' },
    ]);
    await expect(actingPostGroups(group)).resolves.toEqual([group, 'other-group']);
  });

  it('retains tab selection when durable storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage) throw new Error('storage denied');
      originalSet.call(this, key, value);
    });
    selectActingAuthor(group);
    expect(getActingAuthor()).toBe(group);
  });
});

const originalSet = Storage.prototype.setItem;
