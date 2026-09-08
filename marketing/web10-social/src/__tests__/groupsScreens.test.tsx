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
    writeGroupIdentity: vi.fn().mockResolvedValue(undefined),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    getGroupsManages: vi.fn().mockResolvedValue([]),
    updateGroup: vi.fn().mockResolvedValue({}),
    addGroupMember: vi.fn().mockResolvedValue({}),
    removeGroupMember: vi.fn().mockResolvedValue({}),
    getGroupMembers: vi.fn().mockResolvedValue([]),
    getJoinRequests: vi.fn().mockResolvedValue([]),
    approveJoinRequest: vi.fn().mockResolvedValue({ status: 'approved' }),
    denyJoinRequest: vi.fn().mockResolvedValue({ status: 'declined' }),
    inviteMember: vi.fn().mockResolvedValue({ status: 'invited' }),
    deleteGroup: vi.fn().mockResolvedValue({ status: 'deleted' }),
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
  writeGroupIdentity,
  resolveMediaRefs,
  getGroupsManages,
  updateGroup,
  addGroupMember,
  removeGroupMember,
  getGroupMembers,
  getJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
  inviteMember,
  deleteGroup,
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

  it('the New group button opens the create-group sheet', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    const btn = screen.getByTestId('groups-new-button');
    expect(btn).toBeInTheDocument();
    // The sheet is not open yet
    expect(screen.queryByTestId('create-group-sheet')).not.toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByTestId('create-group-sheet')).toBeInTheDocument();
    });
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
    // Default: the current user manages no groups (the Manage entry point is
    // hidden). Tests that need the manager view override this.
    vi.mocked(getGroupsManages).mockResolvedValue([]);
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
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
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

  it('a member sees the group composer (feed-forward)', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-posts')).toBeInTheDocument();
    });
    // The composer is present for a member (the feed is the dominant surface)
    expect(screen.getByTestId('group-composer')).toBeInTheDocument();
    expect(screen.getByTestId('group-composer-input')).toBeInTheDocument();
    // The Post button is disabled until there's text
    expect(screen.getByTestId('group-composer-post')).toBeDisabled();
    fireEvent.change(screen.getByTestId('group-composer-input'), { target: { value: 'Hello group' } });
    expect(screen.getByTestId('group-composer-post')).toBeEnabled();
  });

  it('renders post media (image) when the group feed carries media', async () => {
    vi.mocked(readGroupDetail).mockResolvedValue({
      ...mockDetailMember,
      posts: [
        {
          doc_id: 'doc-media',
          author_key: 'carol',
          collection_name: 'posts',
          body: { text: 'Look at this', media_refs: ['media-doc-1'] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    } as never);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'media-doc-1', url: 'http://x/img.png', mime_type: 'image/png', created_at: '' },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-post-image')).toBeInTheDocument();
    });
    expect((screen.getByTestId('group-post-image') as HTMLImageElement).src).toBe('http://x/img.png');
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
    expect(screen.getByText('Request')).toBeInTheDocument();
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
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
  });

  it('a manager sees the Manage entry point (the group is in getGroupsManages)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
  });

  it('a non-manager member does NOT see the Manage entry point', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([]);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('group-detail-manage')).not.toBeInTheDocument();
  });

  it('clicking Manage opens the management sheet with its tabs', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    expect(screen.getByTestId('manage-tab-profile')).toBeInTheDocument();
    expect(screen.getByTestId('manage-tab-settings')).toBeInTheDocument();
    expect(screen.getByTestId('manage-tab-members')).toBeInTheDocument();
    expect(screen.getByTestId('manage-tab-roles')).toBeInTheDocument();
    // The active tab (Profile) renders the face editor (it loads the current
    // face on mount); the not-yet-built tabs (Settings/Members/Roles) show the
    // placeholder when selected.
    await waitFor(() => {
      expect(screen.getByTestId('manage-profile-name')).toBeInTheDocument();
    });
  });

  it('the Profile section loads the face and saves it (writeGroupIdentity)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    // Profile is the default tab; the form loads the current face (mockIdentity)
    await waitFor(() => {
      expect(screen.getByTestId('manage-profile-name')).toBeInTheDocument();
    });
    expect((screen.getByTestId('manage-profile-name') as HTMLInputElement).value).toBe('Gaming Night');
    expect(screen.getByTestId('manage-profile-about')).toBeInTheDocument();
    expect(screen.getByTestId('manage-profile-website')).toBeInTheDocument();
    expect(screen.getByTestId('manage-profile-banner-button')).toBeInTheDocument();
    expect(screen.getByTestId('manage-profile-avatar-button')).toBeInTheDocument();
    // Edit the name + save → writeGroupIdentity is called with the new face
    fireEvent.change(screen.getByTestId('manage-profile-name'), { target: { value: 'Gaming Night 2.0' } });
    fireEvent.click(screen.getByTestId('manage-profile-save'));
    await waitFor(() => {
      expect(writeGroupIdentity).toHaveBeenCalledWith(GROUP_ID, expect.objectContaining({ name: 'Gaming Night 2.0' }));
    });
  });

  it('switching tabs in the Manage sheet changes the active section', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    expect(screen.getByTestId('manage-tab-profile')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('manage-tab-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-tab-settings')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('the Settings section: flipping "List in directory" calls updateGroup with discoverable', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-settings-listed-toggle')).toBeInTheDocument();
    });
    // mockDetail has discoverable: true → the toggle starts checked
    expect(screen.getByTestId('manage-settings-listed-toggle')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('manage-settings-listed-toggle'));
    await waitFor(() => {
      expect(updateGroup).toHaveBeenCalledWith(GROUP_ID, { discoverable: false });
    });
  });

  it('the Settings section: changing join policy calls updateGroup with join_policy', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-settings-join-request')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-settings-join-request'));
    await waitFor(() => {
      expect(updateGroup).toHaveBeenCalledWith(GROUP_ID, { join_policy: 'request' });
    });
  });

  it('the Settings section: who-can-read reflects the reserved rows and updates them', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    // The group is public (an `anyone` reader row)
    vi.mocked(getGroupMembers).mockResolvedValue([
      { member_key: 'anyone', role: 'reader' },
      { member_key: 'carol', role: 'owner' },
    ]);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-settings-visibility-public')).toBeInTheDocument();
    });
    // The public option is active (the `anyone` reader row)
    expect(screen.getByTestId('manage-settings-visibility-public')).toHaveAttribute('aria-pressed', 'true');
    // Switch to private → removes both reserved rows
    fireEvent.click(screen.getByTestId('manage-settings-visibility-private'));
    await waitFor(() => {
      expect(removeGroupMember).toHaveBeenCalledWith(GROUP_ID, 'anyone');
    });
    await waitFor(() => {
      expect(removeGroupMember).toHaveBeenCalledWith(GROUP_ID, 'authenticated');
    });
  });

  it('the Members section lists members and removes one (removeGroupMember)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 3 },
    ] as never);
    vi.mocked(getGroupMembers).mockResolvedValue([
      { member_key: 'web10.app/users/carol', role: 'owner' },
      { member_key: 'web10.app/users/bob', role: 'member' },
    ]);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-members'));
    await waitFor(() => {
      expect(screen.getAllByTestId('manage-members-row').length).toBe(2);
    });
    expect(screen.getByText('carol')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    // Remove bob → removeGroupMember is called
    const removeBtns = screen.getAllByTestId('manage-members-remove');
    fireEvent.click(removeBtns[1]);
    await waitFor(() => {
      expect(removeGroupMember).toHaveBeenCalledWith(GROUP_ID, 'web10.app/users/bob');
    });
  });

  it('the Members section shows the join-request queue and approves one', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'request', my_role: 'owner', member_count: 3 },
    ] as never);
    vi.mocked(getGroupMembers).mockResolvedValue([{ member_key: 'web10.app/users/carol', role: 'owner' }]);
    vi.mocked(getJoinRequests).mockResolvedValue([{ requester_key: 'web10.app/users/ada', status: 'pending' }] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-members'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-members-request-row')).toBeInTheDocument();
    });
    expect(screen.getByText('ada')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('manage-members-request-approve'));
    await waitFor(() => {
      expect(approveJoinRequest).toHaveBeenCalledWith(GROUP_ID, 'web10.app/users/ada');
    });
  });

  it('the Members section adds a member (inviteMember)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 1 },
    ] as never);
    vi.mocked(getGroupMembers).mockResolvedValue([{ member_key: 'web10.app/users/carol', role: 'owner' }]);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-members'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-members-add-input')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('manage-members-add-input'), { target: { value: 'dave' } });
    fireEvent.click(screen.getByTestId('manage-members-add-button'));
    await waitFor(() => {
      expect(inviteMember).toHaveBeenCalledWith(GROUP_ID, 'dave', 'member');
    });
  });

  it('the Roles section renders the role maps and saves them (updateGroup roles)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 3 },
    ] as never);
    vi.mocked(readGroupDetail).mockResolvedValue({
      ...mockDetailMember,
      roles: [
        { name: 'owner', permissions: { '*': ['readAll', 'create'], group: ['manageRoles', 'deleteGroup'] } },
        { name: 'member', permissions: { posts: ['readAll'] } },
      ],
    } as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-roles'));
    await waitFor(() => {
      expect(screen.getAllByTestId('manage-roles-role').length).toBe(2);
    });
    // The owner role's name is pre-filled
    expect(screen.getByDisplayValue('owner')).toBeInTheDocument();
    // Save → updateGroup is called with the roles
    fireEvent.click(screen.getByTestId('manage-roles-save'));
    await waitFor(() => {
      expect(updateGroup).toHaveBeenCalledWith(GROUP_ID, expect.objectContaining({ roles: expect.any(Array) }));
    });
  });

  it('the Roles section: deleting the group is a two-tap confirm (deleteGroup)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 3 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-manage')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-manage'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-roles'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-roles-delete')).toBeInTheDocument();
    });
    // First tap arms the confirm (no delete yet)
    fireEvent.click(screen.getByTestId('manage-roles-delete'));
    expect(deleteGroup).not.toHaveBeenCalled();
    expect(screen.getByTestId('manage-roles-delete')).toHaveTextContent('Confirm delete');
    // Second tap deletes
    fireEvent.click(screen.getByTestId('manage-roles-delete'));
    await waitFor(() => {
      expect(deleteGroup).toHaveBeenCalledWith(GROUP_ID);
    });
  });

  it('renders the face hero (banner + about) when the group has a face', async () => {
    vi.mocked(readGroupIdentity).mockResolvedValue({
      name: 'Gaming Night',
      description: 'Weekly gaming sessions.',
      banner_ref: 'banner-1',
      avatar_ref: 'avatar-1',
      tags: ['gaming'],
      website: 'https://gaming.example.com',
    });
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'banner-1', url: 'http://x/banner.png', mime_type: 'image/png', created_at: '' },
      { _id: 'avatar-1', url: 'http://x/avatar.png', mime_type: 'image/png', created_at: '' },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-detail-banner-img')).toBeInTheDocument();
    expect(screen.getByTestId('group-detail-avatar-img')).toBeInTheDocument();
    expect(screen.getByTestId('group-detail-description')).toBeInTheDocument();
    // A face-present group does NOT show the empty-hero state
    expect(screen.queryByTestId('group-detail-hero-empty')).not.toBeInTheDocument();
  });

  it('shows the empty-hero state when the group has no face', async () => {
    vi.mocked(readGroupIdentity).mockResolvedValue({});
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('group-detail-hero')).not.toBeInTheDocument();
    // A non-manager sees no "add a face" CTA
    expect(screen.queryByTestId('group-detail-add-face')).not.toBeInTheDocument();
  });

  it('a manager on a face-less group sees the "Add a cover & about" CTA', async () => {
    vi.mocked(readGroupIdentity).mockResolvedValue({});
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-detail-add-face')).toBeInTheDocument();
    // Clicking it opens the Manage sheet
    fireEvent.click(screen.getByTestId('group-detail-add-face'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
  });
});
