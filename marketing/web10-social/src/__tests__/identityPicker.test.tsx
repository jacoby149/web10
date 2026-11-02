import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActingIdentitySwitcher from '@/components/Social/ActingIdentitySwitcher';
import { getActingAuthor, selectActingAuthor } from '@/data/actingIdentity';
import { typeInComposer } from './helpers/tiptap';
import * as data from '@/data';

const mock = vi.hoisted(() => ({
  token: { provider: 'test.localhost', username: 'testuser' },
  getMyGroups: vi.fn(),
  getGroup: vi.fn(),
}));
const group = 'test.localhost/groups/users/testuser/team';
vi.mock('@/data/v3', async (original) => ({ ...await original<typeof import('@/data/v3')>(), getV3Client: () => ({ readToken: () => mock.token, getMyGroups: mock.getMyGroups, getGroup: mock.getGroup }) }));
vi.mock('@/data/groups', async (original) => ({ ...await original<typeof import('@/data/groups')>(), readGroupIdentity: vi.fn().mockResolvedValue({ name: 'Team' }) }));
vi.mock('@/data', async (original) => ({
  ...await original<typeof import('@/data')>(),
  createPost: vi.fn().mockResolvedValue({ _id: 'post' }),
  createRepost: vi.fn().mockResolvedValue({ _id: 'repost' }),
  readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
  readProfile: vi.fn().mockResolvedValue({ display_name: 'Personal' }),
  resolveMediaRefs: vi.fn().mockResolvedValue([]),
  fanOutToFollowers: vi.fn(),
}));
vi.mock('@/data/settings', () => ({ readSettings: vi.fn().mockResolvedValue({}) }));
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: () => mock.token }), resetWapi: vi.fn() }));

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mock.getMyGroups.mockResolvedValue([{ group_id: group, my_role: 'custom-writer' }]);
  mock.getGroup.mockResolvedValue({ group_id: group, roles: [{ name: 'custom-writer', permissions: { posts: ['create'] } }] });
});

describe('App-wide acting identity', () => {
  it('lists personal first, filters by permissions rather than managing-role names, and selects a group', async () => {
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    await screen.findByText('Team');
    const buttons = screen.getByRole('dialog').querySelectorAll('button');
    expect(buttons[1]).toHaveTextContent('testuser');
    fireEvent.click(screen.getByText('Team'));
    expect(getActingAuthor()).toBe(group);
    expect(screen.getByTestId('acting-identity-trigger')).toHaveTextContent('Acting as');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not select identities from a cross-tab local-storage event', () => {
    render(<ActingIdentitySwitcher />);
    window.dispatchEvent(new StorageEvent('storage', { key: 'acting', newValue: group }));
    expect(getActingAuthor()).toBeUndefined();
  });

  it('shows a load error without changing the selected identity', async () => {
    mock.getMyGroups.mockRejectedValueOnce(new Error('offline'));
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(getActingAuthor()).toBeUndefined();
  });

  it('retains a post draft identity across navigation selection, keeps explicit targets and never fans out personally', async () => {
    selectActingAuthor(group);
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer groups={['destination']} />);
    expect(screen.queryByTestId('identity-picker-button')).not.toBeInTheDocument();
    await typeInComposer('A group draft');
    act(() => selectActingAuthor());
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(data.createPost).toHaveBeenCalled());
    expect(vi.mocked(data.createPost).mock.calls[0].slice(1)).toEqual([['destination'], undefined, group]);
    expect(data.fanOutToFollowers).not.toHaveBeenCalled();
  });

  it('uses group memberships instead of Discover when no destination was supplied', async () => {
    selectActingAuthor(group);
    mock.getMyGroups.mockResolvedValue([{ group_id: 'team-destination' }]);
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    await typeInComposer('For the team');
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(data.createPost).toHaveBeenCalled());
    expect(mock.getMyGroups).toHaveBeenCalledWith({ author_as: group, service: 'posts' });
    expect(vi.mocked(data.createPost).mock.calls[0][1]).toEqual(['team-destination']);
  });

  it('reposts under the draft identity without personal follower fan-out', async () => {
    selectActingAuthor(group);
    const original = { _id: 'original', text: 'Original', created_at: '2026-11-01' };
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer repostingTo={original} groups={['explicit-destination']} />);
    await typeInComposer('A group repost');
    act(() => selectActingAuthor());
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(data.createRepost).toHaveBeenCalledWith(original, 'A group repost', group, ['explicit-destination']));
    expect(data.fanOutToFollowers).not.toHaveBeenCalled();
  });
});
