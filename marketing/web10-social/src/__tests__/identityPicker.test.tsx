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
  query: vi.fn(),
  readGroupIdentity: vi.fn(),
}));
const group = 'test.localhost/groups/users/testuser/team';
vi.mock('@/data/v3', async (original) => ({ ...await original<typeof import('@/data/v3')>(), getV3Client: () => ({ readToken: () => mock.token, getMyGroups: mock.getMyGroups, getGroup: mock.getGroup, query: mock.query }) }));
vi.mock('@/data/groups', async (original) => ({ ...await original<typeof import('@/data/groups')>(), readGroupIdentity: mock.readGroupIdentity }));vi.mock('@/data', async (original) => ({
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
vi.mock('@/lib/mediaProcessing', async original => ({
  ...await original<typeof import('@/lib/mediaProcessing')>(),
  getVideoInfo: vi.fn().mockResolvedValue({ duration: 5514, width: 640, height: 480 }),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  mock.getMyGroups.mockResolvedValue([{ group_id: group, my_role: 'custom-writer' }]);
  mock.getGroup.mockResolvedValue({ group_id: group, roles: [{ name: 'custom-writer', permissions: { posts: ['create'] } }] });
  mock.query.mockResolvedValue({ rows: [] });
  mock.readGroupIdentity.mockResolvedValue({ name: 'Team' });
});

describe('App-wide acting identity', () => {
  it.each([false, true].flatMap((mobile) => ['close', 'escape', 'outside', 'trigger'].map((dismissal) => ({ mobile, dismissal }))))('discards a provisional group choice on $dismissal dismissal (mobile=$mobile)', async ({ mobile, dismissal }) => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    fireEvent.click(await screen.findByText('Team'));
    expect(getActingAuthor()).toBeUndefined();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    if (dismissal === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close identities' }));
    else if (dismissal === 'escape') fireEvent.keyDown(document, { key: 'Escape' });
    else if (dismissal === 'outside') fireEvent.mouseDown(document.body);
    else fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getActingAuthor()).toBeUndefined();
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    expect(screen.getByRole('button', { name: /testuser\s*Personal identity/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Use identity' })).toBeDisabled();
  });

  it('preserves an active group when a personal preview is cancelled, and applies personal only on confirmation', async () => {
    selectActingAuthor(group);
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    await screen.findByRole('button', { name: /^Team\s*Group$/ });
    fireEvent.click(screen.getByRole('button', { name: /testuser\s*Personal identity/ }));
    expect(getActingAuthor()).toBe(group);
    fireEvent.click(screen.getByRole('button', { name: 'Close identities' }));
    expect(getActingAuthor()).toBe(group);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    expect(screen.getByRole('button', { name: /^Team\s*Group$/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /testuser\s*Personal identity/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use identity' }));
    expect(getActingAuthor()).toBeUndefined();
  });

  it('lists personal first, filters by permissions rather than managing-role names, and selects a group', async () => {
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    await screen.findByText('Team');
    const buttons = screen.getByRole('dialog').querySelectorAll('button');
    expect(buttons[1]).toHaveTextContent('testuser');
    fireEvent.click(screen.getByText('Team'));
    fireEvent.click(screen.getByRole('button', { name: 'Use identity' }));
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

  it('keeps group memberships alongside Discover for a public draft without explicit destinations', async () => {
    selectActingAuthor(group);
    mock.getMyGroups.mockResolvedValue([{ group_id: 'team-destination' }]);
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    await typeInComposer('For the team');
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(data.createPost).toHaveBeenCalled());
    expect(mock.getMyGroups).toHaveBeenCalledWith({ author_as: group, service: 'posts' });
    expect(vi.mocked(data.createPost).mock.calls[0][1]).toEqual([group, 'team-destination', data.getDiscoverGroupId()]);
  });

  it('hands a video draft to the queue as its original group after a real picker change; a new composer uses personal', async () => {
    selectActingAuthor(group);
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    const queue = vi.fn();
    const first = render(<><ActingIdentitySwitcher /><PostComposer groups={['destination']} onQueueMediaPost={queue} /></>);
    await screen.findByTestId('composer-author-name');
    await waitFor(() => expect(screen.getByTestId('composer-author-name')).toHaveTextContent('Team'));
    const file = new File(['film'], 'movie.mp4', { type: 'video/mp4' });
    fireEvent.change(first.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByTestId('media-tray');
    await waitFor(() => expect(screen.getByTestId('media-tray').querySelector('.animate-spin')).toBeNull());
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: /testuser\s*Personal identity/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use identity' }));
    expect(getActingAuthor()).toBeUndefined();
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(1));
    expect(queue.mock.calls[0][0]).toMatchObject({ authorAs: group, authorLabel: 'Team', groups: ['destination'] });
    expect(data.createPost).not.toHaveBeenCalled();
    first.unmount();
    const second = render(<PostComposer onQueueMediaPost={queue} />);
    fireEvent.change(second.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByTestId('media-tray');
    await waitFor(() => expect(screen.getByTestId('media-tray').querySelector('.animate-spin')).toBeNull());
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2));
    expect(queue.mock.calls[1][0].authorAs).toBeUndefined();
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
