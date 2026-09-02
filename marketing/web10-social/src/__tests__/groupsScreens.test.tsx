import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getMyCommunityGroups: vi.fn().mockResolvedValue([]),
    readGroupDirectory: vi.fn().mockResolvedValue([]),
    readGroupDetail: vi.fn().mockResolvedValue(null),
    readGroupIdentity: vi.fn().mockResolvedValue({}),
    joinGroup: vi.fn().mockResolvedValue({ status: 'joined' }),
    requestJoinGroup: vi.fn().mockResolvedValue({ status: 'pending' }),
    leaveGroup: vi.fn().mockResolvedValue({ status: 'left' }),
  };
});

import {
  getMyCommunityGroups,
  readGroupDirectory,
  readGroupDetail,
  readGroupIdentity,
  joinGroup,
  requestJoinGroup,
  leaveGroup,
} from '@/data';

const mockMyGroups = [
  {
    group_id: 'api.localhost/groups/users/alice/gaming',
    join_policy: 'open',
    my_role: 'member',
    member_count: 42,
  },
  {
    group_id: 'api.localhost/groups/users/bob/photography',
    join_policy: 'request',
    my_role: 'owner',
    member_count: 7,
  },
];

const mockDirectory = [
  {
    group_id: 'api.localhost/groups/users/carol/gaming',
    name: 'Gaming Night',
    owner: 'carol',
    slug: 'gaming',
    join_policy: 'open',
    member_count: 128,
    tags: ['gaming', 'retro'],
    permission_summary: 'member: readAll, create',
  },
  {
    group_id: 'api.localhost/groups/users/dave/photography',
    name: 'Photography Club',
    owner: 'dave',
    slug: 'photography',
    join_policy: 'request',
    member_count: 56,
    tags: ['photography'],
    permission_summary: 'member: readAll',
  },
  {
    group_id: 'api.localhost/groups/users/erin/inner-circle',
    name: 'Inner Circle',
    owner: 'erin',
    slug: 'inner-circle',
    join_policy: 'invite_only',
    member_count: 12,
    tags: [],
    permission_summary: 'member: readAll',
  },
];

const mockDetailMember = {
  group_id: 'api.localhost/groups/users/carol/gaming',
  name: 'Gaming Night',
  owner: 'carol',
  slug: 'gaming',
  join_policy: 'open',
  discoverable: true,
  member_count: 128,
  roles: [],
  permission_summary: 'member: readAll, create',
  is_member: true,
  posts_state: 'ok',
  posts: [
    {
      doc_id: 'doc-1',
      author_key: 'carol',
      collection_name: 'posts',
      body: { text: 'Who is in for Friday?' },
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};

const mockIdentity = {
  name: 'Gaming Night',
  description: 'Weekly gaming sessions and tournament talk.',
  banner_ref: '',
  avatar_ref: '',
  website: 'https://gaming.example.com',
  tags: ['gaming', 'retro'],
};

const mockDetailNonMember = {
  ...mockDetailMember,
  is_member: false,
  posts_state: 'join_to_view',
  posts: [],
};

describe('GroupsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyCommunityGroups).mockResolvedValue(mockMyGroups as never);
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
  });

  it('defaults to the My Groups tab and renders the community groups', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-my-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('groups-tab-my')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('groups-my-row').length).toBe(2);
    expect(screen.getByText('gaming')).toBeInTheDocument();
    expect(screen.getByText('photography')).toBeInTheDocument();
  });

  it('shows the owner badge for owned groups and a Leave button for member groups', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-my-list')).toBeInTheDocument();
    });
    // bob owns photography → owner badge, no leave button for it
    expect(screen.getByTestId('groups-my-role-owner')).toBeInTheDocument();
    // alice is a member of gaming → leave button present
    expect(screen.getByTestId('groups-leave-button')).toBeInTheDocument();
  });

  it('leaving a group removes it from the list', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-my-list')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('groups-leave-button'));
    await waitFor(() => {
      expect(leaveGroup).toHaveBeenCalledWith('api.localhost/groups/users/alice/gaming');
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('groups-my-row').length).toBe(1);
    });
  });

  it('shows the empty state with a Discover CTA when in no groups', async () => {
    vi.mocked(getMyCommunityGroups).mockResolvedValue([]);
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-my-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/not in any groups yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('groups-my-empty-cta'));
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-view')).toBeInTheDocument();
    });
  });

  it('restores the Discover tab from ?tab=discover (deep link)', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('groups-tab-discover')).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the directory grid with names, owners, and member counts', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('groups-discover-card').length).toBe(3);
    expect(screen.getByText('Gaming Night')).toBeInTheDocument();
    expect(screen.getByText('by @carol')).toBeInTheDocument();
    expect(screen.getByText('128 members')).toBeInTheDocument();
  });

  it('joining an open group calls joinGroup and flips the button to Joined', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('groups-discover-card');
    // First card is the open group (Gaming Night)
    fireEvent.click(within(cards[0]).getByTestId('groups-join-button'));
    await waitFor(() => {
      expect(joinGroup).toHaveBeenCalledWith('api.localhost/groups/users/carol/gaming');
    });
    await waitFor(() => {
      expect(within(cards[0]).getByText('Joined')).toBeInTheDocument();
    });
  });

  it('requesting a request-policy group calls requestJoinGroup and flips to Requested', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('groups-discover-card');
    // Second card is the request group (Photography Club)
    fireEvent.click(within(cards[1]).getByTestId('groups-join-button'));
    await waitFor(() => {
      expect(requestJoinGroup).toHaveBeenCalledWith('api.localhost/groups/users/dave/photography');
    });
    await waitFor(() => {
      expect(within(cards[1]).getByText('Requested')).toBeInTheDocument();
    });
  });

  it('invite-only groups show a disabled Invite only button', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('groups-discover-card');
    // Third card is invite-only (Inner Circle)
    const btn = within(cards[2]).getByTestId('groups-join-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Invite only');
  });

  it('filters the directory by search query (?q= deep link)', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover&q=photo']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    // Only Photography Club matches "photo"
    expect(screen.getAllByTestId('groups-discover-card').length).toBe(1);
    expect(screen.getByText('Photography Club')).toBeInTheDocument();
  });

  it('filters the directory by tag chip (?tag= deep link)', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover&tag=retro']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    // Only Gaming Night has the retro tag
    expect(screen.getAllByTestId('groups-discover-card').length).toBe(1);
    expect(screen.getByText('Gaming Night')).toBeInTheDocument();
  });

  it('shows the no-match empty state when a search filters everything out', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover&q=zzzzz']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No groups match')).toBeInTheDocument();
  });

  it('shows the error state with retry when the directory read fails', async () => {
    vi.mocked(readGroupDirectory).mockRejectedValue(new Error('boom'));
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-error')).toBeInTheDocument();
    });
    // Retry re-fires the read
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    fireEvent.click(screen.getByTestId('groups-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
  });
});

describe('GroupDetailScreen', () => {
  const GROUP_ID = 'api.localhost/groups/users/carol/gaming';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGroupDetail).mockResolvedValue(mockDetailMember as never);
    vi.mocked(readGroupIdentity).mockResolvedValue(mockIdentity);
  });

  function renderDetail(GroupDetailScreen: React.ComponentType<{ groupId: string }>) {
    return render(
      <MemoryRouter initialEntries={['/groups/x']}>
        <GroupDetailScreen groupId={GROUP_ID} />
      </MemoryRouter>,
    );
  }

  async function loadDetail() {
    const { default: GroupDetailScreen } = await import('@/components/Groups/GroupDetailScreen');
    return renderDetail(GroupDetailScreen);
  }

  it('renders the group identity (name, owner, members, description, tags)', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-detail-name')).toHaveTextContent('Gaming Night');
    expect(screen.getByText('by @carol')).toBeInTheDocument();
    expect(screen.getByText('128 members')).toBeInTheDocument();
    expect(screen.getByTestId('group-detail-description')).toHaveTextContent(
      'Weekly gaming sessions',
    );
    expect(screen.getByText('#gaming')).toBeInTheDocument();
    expect(screen.getByText('#retro')).toBeInTheDocument();
  });

  it('renders the posts for a member', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-posts')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-post-card')).toBeInTheDocument();
    expect(screen.getByText('Who is in for Friday?')).toBeInTheDocument();
    // A member sees the Leave button, not Join
    expect(screen.getByTestId('group-detail-leave')).toBeInTheDocument();
  });

  it('shows join-to-view for a non-member and a Join button', async () => {
    vi.mocked(readGroupDetail).mockResolvedValue(mockDetailNonMember as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-join-to-view')).toBeInTheDocument();
    });
    expect(screen.getByText('Join to view posts')).toBeInTheDocument();
    expect(screen.getByTestId('group-detail-join')).toBeInTheDocument();
  });

  it('joining an open group calls joinGroup', async () => {
    vi.mocked(readGroupDetail).mockResolvedValue(mockDetailNonMember as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-join')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-join'));
    await waitFor(() => {
      expect(joinGroup).toHaveBeenCalledWith(GROUP_ID);
    });
  });

  it('requesting a request-policy group calls requestJoinGroup', async () => {
    vi.mocked(readGroupDetail).mockResolvedValue({
      ...mockDetailNonMember,
      join_policy: 'request',
    } as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-join')).toBeInTheDocument();
    });
    expect(screen.getByText('Request to join')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('group-detail-join'));
    await waitFor(() => {
      expect(requestJoinGroup).toHaveBeenCalledWith(GROUP_ID);
    });
  });

  it('leaving calls leaveGroup', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-leave')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-leave'));
    await waitFor(() => {
      expect(leaveGroup).toHaveBeenCalledWith(GROUP_ID);
    });
  });

  it('shows the invite-only notice for invite_only groups', async () => {
    vi.mocked(readGroupDetail).mockResolvedValue({
      ...mockDetailNonMember,
      join_policy: 'invite_only',
    } as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-invite-only')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('group-detail-join')).not.toBeInTheDocument();
  });

  it('shows the not-found state when the group 404s', async () => {
    vi.mocked(readGroupDetail).mockRejectedValue(new Error('Group detail read failed: 404'));
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-notfound')).toBeInTheDocument();
    });
    expect(screen.getByText('Group not found')).toBeInTheDocument();
  });

  it('shows the error state with retry when the read fails (non-404)', async () => {
    vi.mocked(readGroupDetail).mockRejectedValue(new Error('Group detail read failed: 500'));
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-error')).toBeInTheDocument();
    });
    vi.mocked(readGroupDetail).mockResolvedValue(mockDetailMember as never);
    fireEvent.click(screen.getByTestId('group-detail-error-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-card')).toBeInTheDocument();
    });
  });
});
