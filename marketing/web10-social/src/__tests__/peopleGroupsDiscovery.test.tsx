import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';
import DiscoverExploreTab from '@/components/Discover/DiscoverExploreTab';
import { resolveGroupFace } from '@/components/Discover/DiscoverGroupsTab';

vi.mock('@/data', async (original) => ({
  ...await original<typeof import('@/data')>(),
  fetchPeoplePage: vi.fn().mockResolvedValue({ people: [], hasMore: false }),
  readGroupDirectory: vi.fn(),
  getMyCommunityGroups: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
}));
vi.mock('@/components/Discover/DiscoverGroupsTab', async (original) => ({
  ...await original<typeof import('@/components/Discover/DiscoverGroupsTab')>(),
  resolveGroupFace: vi.fn(),
}));

const own = (slug: string) => ({
  group_id: `test.localhost/groups/users/creator/${slug}`,
  join_policy: 'invite_only' as const, my_role: 'owner', member_count: 1,
  tags: ['community'], discoverable: false,
});
const listed = (slug: string) => ({
  group_id: own(slug).group_id, name: slug, slug, owner: 'creator', permission_summary: '',
  join_policy: 'open' as const, member_count: 2, tags: ['community'],
});

function Browser() {
  const location = useLocation();
  return <><output data-testid="location">{location.pathname}{location.search}</output>
    <DiscoverExploreTab query={new URLSearchParams(location.search).get('q') ?? ''} /></>;
}
function open(params = '') {
  return render(<MemoryRouter initialEntries={[`/people?section=groups${params}`]}><Browser /></MemoryRouter>);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(data.fetchPeoplePage).mockResolvedValue({ people: [], hasMore: false });
  vi.mocked(data.readGroupDirectory).mockResolvedValue([]);
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([]);
  vi.mocked(resolveGroupFace).mockImplementation(async (id) => ({
    name: id.endsWith('/draft-id') ? 'Century Club Draft' : 'Century Club',
    status: id.endsWith('/draft-id') ? 'draft' : 'published',
  }));
});

it('All and My Groups include own unlisted and draft memberships; Discover stays directory-only', async () => {
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([own('opaque-id'), own('draft-id')]);
  open();
  await screen.findByText('Century Club Draft');
  expect(screen.getAllByTestId('groups-my-row')).toHaveLength(2);
  expect(screen.getAllByTestId('groups-my-role-owner')).toHaveLength(2);
  expect(screen.getByTestId('groups-my-draft')).toHaveTextContent('Draft');
  expect(screen.queryByTestId('groups-leave-button')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('explore-groups-filter-mine'));
  expect(screen.getAllByTestId('groups-my-row')).toHaveLength(2);
  fireEvent.click(screen.getByTestId('explore-groups-filter-discover'));
  expect(screen.queryByTestId('groups-my-row')).not.toBeInTheDocument();
  expect(screen.queryByText('Century Club')).not.toBeInTheDocument();
  expect(data.getMyCommunityGroups).toHaveBeenCalledTimes(1);
});

it('deduplicates memberships and listed IDs with membership controls taking precedence', async () => {
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([own('shared'), own('shared')]);
  vi.mocked(data.readGroupDirectory).mockResolvedValue([listed('shared'), listed('public'), listed('public')]);
  open();
  await screen.findByTestId('groups-my-row');
  await screen.findByTestId('groups-discover-card');
  expect(screen.getAllByTestId('groups-my-row')).toHaveLength(1);
  expect(screen.getAllByTestId('groups-discover-card')).toHaveLength(1);
});

it.each(['', '&groupFilter=mine'])('matches resolved membership names and navigates directly (%s)', async (filter) => {
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([own('opaque-id')]);
  open(`${filter}&q=century%20club`);
  const row = await screen.findByTestId('groups-my-row');
  expect(within(row).getByText('Century Club')).toBeInTheDocument();
  fireEvent.click(row);
  expect(screen.getByTestId('location')).toHaveTextContent(`/groups/${encodeURIComponent(own('opaque-id').group_id)}`);
});

it('matches directory identity names and preserves pagination through zero matches', async () => {
  vi.mocked(data.readGroupDirectory).mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => listed(`id-${i}`)))
    .mockResolvedValueOnce([listed('later')]);
  vi.mocked(resolveGroupFace).mockImplementation(async (id) => ({ name: id.endsWith('/later') ? 'Century Club' : 'Other' }));
  open('&groupFilter=discover&q=century');
  await screen.findByTestId('explore-groups-no-results');
  fireEvent.click(screen.getByTestId('explore-groups-view-more'));
  await screen.findByText('Century Club');
  expect(data.readGroupDirectory).toHaveBeenLastCalledWith(20, 20);
  fireEvent.click(screen.getByTestId('groups-discover-card'));
  expect(screen.getByTestId('location')).toHaveTextContent(encodeURIComponent(own('later').group_id));
});

it('settles empty membership reads without retrying on rerender or filter changes', async () => {
  open('&groupFilter=mine');
  await screen.findByTestId('explore-groups-mine-empty');
  fireEvent.click(screen.getByTestId('explore-groups-filter-all'));
  fireEvent.click(screen.getByTestId('explore-groups-filter-mine'));
  await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  expect(data.getMyCommunityGroups).toHaveBeenCalledTimes(1);
});

it('keeps own memberships reachable when the public directory fails and identity has no name', async () => {
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([own('slug-fallback')]);
  vi.mocked(data.readGroupDirectory).mockRejectedValue(new Error('offline'));
  vi.mocked(resolveGroupFace).mockResolvedValue({});
  open('&q=slug-fallback');
  const row = await screen.findByTestId('groups-my-row');
  expect(row).toHaveTextContent('slug-fallback');
  expect(screen.getByTestId('explore-groups-error')).toBeInTheDocument();
});

it('filters My Groups to a stable no-match state', async () => {
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([own('opaque-id')]);
  open('&groupFilter=mine&q=unmatched');
  expect(await screen.findByTestId('explore-groups-mine-empty')).toHaveTextContent('No groups match');
  expect(screen.queryByTestId('groups-my-row')).not.toBeInTheDocument();
  expect(data.getMyCommunityGroups).toHaveBeenCalledTimes(1);
});

it('settles errors until explicit retry, showing loading then recovered memberships', async () => {
  vi.mocked(data.getMyCommunityGroups).mockRejectedValueOnce(new Error('offline'));
  open();
  await screen.findByTestId('explore-groups-mine-error');
  fireEvent.click(screen.getByTestId('explore-groups-filter-mine'));
  expect(data.getMyCommunityGroups).toHaveBeenCalledTimes(1);
  let finish!: (groups: Awaited<ReturnType<typeof data.getMyCommunityGroups>>) => void;
  vi.mocked(data.getMyCommunityGroups).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByTestId('explore-groups-mine-retry'));
  expect(screen.getByTestId('explore-groups-mine-skeleton')).toBeInTheDocument();
  await act(async () => finish([own('draft-id')]));
  await screen.findByText('Century Club Draft');
  expect(data.getMyCommunityGroups).toHaveBeenCalledTimes(2);
});

it('ignores membership completion after unmount before resolving identities', async () => {
  let finish!: (groups: Awaited<ReturnType<typeof data.getMyCommunityGroups>>) => void;
  vi.mocked(data.getMyCommunityGroups).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const view = open();
  view.unmount();
  await act(async () => finish([own('opaque-id')]));
  await waitFor(() => expect(resolveGroupFace).not.toHaveBeenCalled());
});

it('paints My Groups before faces settle and enriches each row independently', async () => {
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([own('first'), own('slow')]);
  let finishFirst!: (face: { name: string }) => void;
  let finishSlow!: (face: { name: string }) => void;
  vi.mocked(resolveGroupFace).mockImplementation((id) => new Promise((resolve) => {
    if (id.endsWith('/first')) finishFirst = resolve;
    else finishSlow = resolve;
  }));
  open('&groupFilter=mine');
  await waitFor(() => expect(resolveGroupFace).toHaveBeenCalledTimes(2));
  expect(screen.queryByTestId('explore-groups-mine-skeleton')).not.toBeInTheDocument();
  expect(screen.getAllByTestId('groups-my-row')).toHaveLength(2);
  await act(async () => finishFirst({ name: 'First resolved' }));
  expect(screen.getByText('First resolved')).toBeInTheDocument();
  expect(screen.getAllByTestId('groups-my-row')).toHaveLength(2);
  await act(async () => finishSlow({ name: 'Slow resolved' }));
  expect(screen.getByText('Slow resolved')).toBeInTheDocument();
});

it('retains My Groups rows when optional face resolution fails', async () => {
  vi.mocked(data.getMyCommunityGroups).mockResolvedValue([own('face-unavailable')]);
  vi.mocked(resolveGroupFace).mockRejectedValueOnce(new Error('face unavailable'));
  open('&groupFilter=mine');
  expect(await screen.findByTestId('groups-my-row')).toBeInTheDocument();
  expect(screen.queryByTestId('explore-groups-mine-error')).not.toBeInTheDocument();
});

it('paints directory cards while their faces are pending', async () => {
  vi.mocked(data.readGroupDirectory).mockResolvedValue([listed('public')]);
  let finish!: (face: { name: string }) => void;
  vi.mocked(resolveGroupFace).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  open('&groupFilter=discover');
  expect(await screen.findByTestId('groups-discover-card')).toBeInTheDocument();
  expect(screen.queryByTestId('explore-groups-skeleton')).not.toBeInTheDocument();
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await act(async () => finish({ name: 'Resolved directory name' }));
  expect(await screen.findByText('Resolved directory name')).toBeInTheDocument();
});

it('starts only the visible browser, keeping both browsers loaded on return visits', async () => {
  render(<MemoryRouter initialEntries={['/people']}><Browser /></MemoryRouter>);
  await waitFor(() => expect(data.fetchPeoplePage).toHaveBeenCalledTimes(1));
  expect(data.readGroupDirectory).not.toHaveBeenCalled();
  expect(data.getMyCommunityGroups).not.toHaveBeenCalled();
  expect(resolveGroupFace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('explore-tab-groups'));
  await waitFor(() => expect(data.readGroupDirectory).toHaveBeenCalledTimes(1));
  expect(data.getMyCommunityGroups).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId('explore-tab-profiles'));
  fireEvent.click(screen.getByTestId('explore-tab-groups'));
  expect(data.readGroupDirectory).toHaveBeenCalledTimes(1);
  expect(data.fetchPeoplePage).toHaveBeenCalledTimes(1);
});

it('does not fetch profiles on a direct Groups link', async () => {
  open();
  await waitFor(() => expect(data.readGroupDirectory).toHaveBeenCalledTimes(1));
  expect(data.fetchPeoplePage).not.toHaveBeenCalled();
});

it('paints progressive cards, gates unknown follow state and preserves actions/pages on late enrichment', async () => {
  type Page = Awaited<ReturnType<typeof data.fetchPeoplePage>>;
  const base = { username: 'alice', provider: 'test.localhost', followers_count: 3, mutuals: 0,
    is_following: false, follow_pending: true, mutuals_pending: true };
  let progress!: (page: Page) => void;
  let finish!: (page: Page) => void;
  vi.mocked(data.fetchPeoplePage).mockImplementationOnce(({ onProgress }) => {
    progress = onProgress!;
    onProgress?.({ people: [base], hasMore: true });
    return new Promise((resolve) => { finish = resolve; });
  }).mockResolvedValueOnce({ people: [{ ...base, username: 'bob', follow_pending: false }], hasMore: false });
  render(<MemoryRouter initialEntries={['/people']}><Browser /></MemoryRouter>);
  expect(await screen.findByText('@alice')).toBeInTheDocument();
  expect(screen.queryByTestId('explore-people-skeleton')).not.toBeInTheDocument();
  expect(screen.getByTestId('people-follow-button')).toBeDisabled();
  const ready = { ...base, is_following: true, follow_pending: false };
  await act(async () => progress({ people: [ready], hasMore: true }));
  vi.mocked(data.unfollowUser).mockResolvedValue(undefined);
  fireEvent.click(screen.getByTestId('people-follow-button'));
  await waitFor(() => expect(screen.getByTestId('people-follow-button')).toHaveAttribute('aria-label', 'Follow alice'));
  expect(data.unfollowUser).toHaveBeenCalledWith('alice', 'test.localhost');
  fireEvent.click(screen.getByTestId('explore-people-view-more'));
  await screen.findByText('@bob');
  await act(async () => finish({ people: [{ ...ready, mutuals: 2, mutuals_pending: false }], hasMore: true }));
  expect(screen.getAllByTestId('people-card')).toHaveLength(2);
  expect(screen.getByTestId('people-mutuals')).toHaveTextContent('2 mutuals');
  expect(screen.getAllByTestId('people-follow-button')[0]).toHaveAttribute('aria-label', 'Follow alice');
  expect(screen.queryByTestId('explore-people-view-more')).not.toBeInTheDocument();
});

it('ignores old progressive callbacks after unmount and shows a loading state for pending mutuals', async () => {
  let progress!: NonNullable<Parameters<typeof data.fetchPeoplePage>[0]['onProgress']>;
  vi.mocked(data.fetchPeoplePage).mockImplementationOnce((opts) => {
    progress = opts.onProgress!;
    progress({ people: [{ username: 'alice', provider: 'test', followers_count: 1,
      mutuals: 0, is_following: false, mutuals_pending: true }], hasMore: false });
    return new Promise(() => {});
  });
  const view = render(<MemoryRouter initialEntries={['/people?personFilter=mutuals']}><Browser /></MemoryRouter>);
  expect(screen.getByTestId('explore-people-skeleton')).toBeInTheDocument();
  view.unmount();
  render(<MemoryRouter initialEntries={['/people']}><Browser /></MemoryRouter>);
  await act(async () => progress({ people: [{ username: 'obsolete', provider: 'test', followers_count: 1,
    mutuals: 9, is_following: true }], hasMore: false }));
  expect(screen.queryByText('@obsolete')).not.toBeInTheDocument();
});
