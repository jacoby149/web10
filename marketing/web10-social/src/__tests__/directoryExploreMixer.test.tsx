import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import DiscoverExploreTab from '@/components/Discover/DiscoverExploreTab';
import * as data from '@/data';

const source = vi.hoisted(() => ({ home: 'https://home.example', scope: 'synthetic-account', credential: 'synthetic-token',
  sources: [{ origin: 'https://home.example', weight: 100 }, { origin: 'https://foreign.example', weight: 100 }],
  approved: new Set(['https://home.example', 'https://foreign.example']), ready: true, busy: false, error: '',
  live: () => true, save: vi.fn(), approve: vi.fn(), reload: vi.fn(),
}));
vi.mock('@/components/Feed/useFeedSources', () => ({ useFeedSources: () => source }));
vi.mock('@/data', async original => ({ ...await original<typeof import('@/data')>(),
  fetchPeoplePage: vi.fn(), readGroupDirectory: vi.fn().mockResolvedValue([]), getMyCommunityGroups: vi.fn().mockResolvedValue([]),
  followUser: vi.fn().mockResolvedValue(undefined), unfollowUser: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(() => {
  vi.clearAllMocks();
  source.approved = new Set([source.home, 'https://foreign.example']);
  vi.mocked(data.fetchPeoplePage).mockResolvedValue({ people: [{ username: 'same', provider: 'home.example', display_name: 'Home Person', followers_count: 10, mutuals: 0, is_following: false }], hasMore: false });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/query')) return Response.json({ rows: [] });
    if (String(input).includes('/groups/directory')) return Response.json({ groups: [{ group_id: 'foreign.example/groups/users/curator/club', name: 'Foreign Club', owner: 'curator', member_count: 8, join_policy: 'open' }], sort: 'popular' });
    return Response.json({ users: [{ username: 'same', follower_count: 5, profile: { display_name: 'Foreign Person' } }], sort: 'popular' });
  }));
});
afterEach(() => vi.unstubAllGlobals());

it('mixes source-qualified profile cards but only home cards keep home Follow actions', async () => {
  render(<MemoryRouter initialEntries={['/people']}><DiscoverExploreTab query="" /></MemoryRouter>);
  await screen.findByText('Home Person');
  await screen.findByText('Foreign Person');
  const foreignCard = screen.getByTestId('source-person-card');
  expect(within(foreignCard).queryByRole('button')).not.toBeInTheDocument();
  expect(foreignCard.closest('a')).toBeNull();
  expect(screen.getByText('foreign.example · read-only')).toBeInTheDocument();
  fireEvent.click(within(screen.getByTestId('people-card')).getByTestId('people-follow-button'));
  await waitFor(() => expect(data.followUser).toHaveBeenCalledWith('same', 'home.example'));
  await waitFor(() => expect(within(screen.getByTestId('people-card')).getByLabelText('Unfollow Home Person')).toBeInTheDocument());
  expect(data.fetchPeoplePage).toHaveBeenCalledWith({ limit: 10, offset: 0, sort: 'popular' });
});

it('unapproved origins are not contacted and groups reuse the rack without home Join callbacks', async () => {
  source.approved = new Set([source.home]);
  const view = render(<MemoryRouter initialEntries={['/people?section=groups&groupFilter=discover']}><DiscoverExploreTab query="" /></MemoryRouter>);
  await waitFor(() => expect(data.readGroupDirectory).toHaveBeenCalled());
  expect(fetch).not.toHaveBeenCalled();
  source.approved = new Set([source.home, 'https://foreign.example']);
  view.rerender(<MemoryRouter initialEntries={['/people?section=groups&groupFilter=discover']}><DiscoverExploreTab query="" /></MemoryRouter>);
  await screen.findByText('Foreign Club');
  expect(within(screen.getByTestId('source-group-card')).queryByTestId('groups-join-button')).not.toBeInTheDocument();
  expect(screen.getByTestId('source-group-card').closest('a')).toBeNull();
});
