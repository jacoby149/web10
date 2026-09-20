import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the v3 client seam (the screen reads the token for ownership + the
// group-scoped engagement writes). A signed-in reader ("me") so the like tap
// path is driven.
vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    readToken: () => ({ provider: 'api.localhost', username: 'me' }),
  }),
  resetV3Client: () => {},
}));

// Mock data layer
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getMyCommunityGroups: vi.fn().mockResolvedValue([]),
    readGroupDirectory: vi.fn().mockResolvedValue([]),
    readGroupDetail: vi.fn().mockResolvedValue(null),
    readGroupIdentity: vi.fn().mockResolvedValue({}),
    readGroupMediaPage: vi.fn().mockResolvedValue({ posts: [], hasMore: false, total: 0 }),
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
    countComments: vi.fn().mockResolvedValue(0),
    readReactions: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    saveGroup: vi.fn().mockResolvedValue(undefined),
    publishGroup: vi.fn().mockResolvedValue(undefined),
    // G4: the create entry point (the "New group" button creates a draft and
    // navigates to the group page in edit mode).
    createDraftGroup: vi.fn().mockResolvedValue('web10.app/groups/me/new-group'),
    // G4: the create-time slug guard (live in edit mode for a draft).
    slugTaken: vi.fn().mockResolvedValue(false),
  };
});

// Mock the media upload seam (the edit mode's cover/avatar upload, decision 3).
vi.mock('@/data/posts', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'uploaded-media-1' }),
  };
});

import {
  getMyCommunityGroups,
  readGroupDirectory,
  readGroupDetail,
  readGroupIdentity,
  readGroupMediaPage,
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
    toggleReactionKind,
    saveGroup,
    publishGroup,
    createDraftGroup,
    slugTaken,
} from '@/data';
import { uploadMedia } from '@/data/posts';

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

// A location probe — renders the current pathname + search so a redirect can
// be asserted (the /groups?tab=discover → /discover?tab=groups hand-off).
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}{location.search}</div>;
}

describe('GroupsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyCommunityGroups).mockResolvedValue(mockMyGroups as never);
  });

  it('renders the My Groups list (the Discover tab is gone)', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <GroupsScreen />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-my-list')).toBeInTheDocument();
    });
    // No tab toggle anymore — /groups is My Groups only.
    expect(screen.queryByTestId('groups-tab-my')).not.toBeInTheDocument();
    expect(screen.queryByTestId('groups-tab-discover')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('groups-my-row').length).toBe(2);
    expect(screen.getByText('gaming')).toBeInTheDocument();
    expect(screen.getByText('photography')).toBeInTheDocument();
  });

  it('the New group button creates a draft and opens the group page in edit mode (G4)', async () => {
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <Routes>
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/groups/:groupId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    const btn = screen.getByTestId('groups-new-button');
    expect(btn).toBeInTheDocument();
    // The create sheet is retired — creating a group is configuring a page.
    expect(screen.queryByTestId('create-group-sheet')).not.toBeInTheDocument();
    fireEvent.click(btn);
    // The draft is created for the token's owner…
    await waitFor(() => {
      expect(createDraftGroup).toHaveBeenCalledWith('me');
    });
    // …and the group page opens in edit mode (?edit=1).
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/groups/web10.app%2Fgroups%2Fme%2Fnew-group?edit=1',
      );
    });
  });

  it('a failed draft create shows an error and stays on the list (G4)', async () => {
    vi.mocked(createDraftGroup).mockRejectedValueOnce(new Error('boom'));
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups']}>
        <Routes>
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/groups/:groupId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('groups-new-button'));
    // No navigation — the list stays.
    await waitFor(() => {
      expect(createDraftGroup).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('location-probe')).not.toBeInTheDocument();
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
        <Routes>
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/discover" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('groups-my-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/not in any groups yet/i)).toBeInTheDocument();
    // The CTA now points at the Discover/Groups subtab (the directory's new home).
    fireEvent.click(screen.getByTestId('groups-my-empty-cta'));
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?tab=groups');
    });
  });

  it('redirects /groups?tab=discover to /discover?tab=groups (carrying the filters)', async () => {
    vi.mocked(getMyCommunityGroups).mockResolvedValue([]);
    const { default: GroupsScreen } = await import('@/components/Groups/GroupsScreen');
    render(
      <MemoryRouter initialEntries={['/groups?tab=discover&q=photo&tag=retro']}>
        <Routes>
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/discover" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?tab=groups&q=photo&tag=retro');
    });
    // The my-groups fetch is skipped while redirecting.
    expect(getMyCommunityGroups).not.toHaveBeenCalled();
  });
});

describe('DiscoverGroupsTab', () => {
  // 25 groups — more than one PAGE_SIZE (20) so "view more" has a second page
  // to append, then a short final page that exhausts the directory.
  const ALL_GROUPS = Array.from({ length: 25 }, (_, i) => ({
    group_id: `api.localhost/groups/users/user${i}/group${i}`,
    name: `Group ${i}`,
    owner: `user${i}`,
    slug: `group${i}`,
    join_policy: 'open',
    member_count: i,
    tags: i % 2 === 0 ? ['even'] : ['odd'],
    permission_summary: 'member: readAll',
  }));

  function pagedDirectory(limit: number, offset: number) {
    return ALL_GROUPS.slice(offset, offset + limit);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGroupDirectory).mockImplementation(
      (limit: number, offset: number) => Promise.resolve(pagedDirectory(limit, offset) as never),
    );
  });

  function renderTab(initialEntry = '/discover?tab=groups', query = '') {
    return import('@/components/Discover/DiscoverGroupsTab').then(({ default: DiscoverGroupsTab }) =>
      render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <DiscoverGroupsTab query={query} />
        </MemoryRouter>,
      ),
    );
  }

  it('renders the directory grid with names, owners, and member counts', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('groups-discover-card').length).toBe(3);
    expect(screen.getByText('Gaming Night')).toBeInTheDocument();
    expect(screen.getByText('by @carol')).toBeInTheDocument();
    expect(screen.getByText('128 members')).toBeInTheDocument();
  });

  it('joining an open group calls joinGroup and flips the button to Joined', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab();
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
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab();
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
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('groups-discover-card');
    // Third card is invite-only (Inner Circle)
    const btn = within(cards[2]).getByTestId('groups-join-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Invite only');
  });

  it('filters the directory by the ?q= query (name/owner/tags) and shows the chip', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab('/discover?tab=groups', 'photo');
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    // The active query chip is shown (no search field of its own).
    expect(screen.getByTestId('discover-groups-tab-query')).toHaveTextContent('photo');
    // Only Photography Club matches "photo" (name + tag)
    expect(screen.getAllByTestId('groups-discover-card').length).toBe(1);
    expect(screen.getByText('Photography Club')).toBeInTheDocument();
  });

  it('filters the directory by tag chip (?tag= deep link)', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab('/discover?tab=groups&tag=retro');
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-grid')).toBeInTheDocument();
    });
    // Only Gaming Night has the retro tag
    expect(screen.getAllByTestId('groups-discover-card').length).toBe(1);
    expect(screen.getByText('Gaming Night')).toBeInTheDocument();
  });

  it('shows the no-match state when a query filters everything out', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab('/discover?tab=groups', 'zzzzz');
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-no-results')).toBeInTheDocument();
    });
    expect(screen.getByText('No groups match')).toBeInTheDocument();
  });

  it('shows the empty state when the directory has no groups', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue([]);
    await renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('groups-discover-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No groups listed yet')).toBeInTheDocument();
  });

  it('shows the error state with retry when the directory read fails', async () => {
    vi.mocked(readGroupDirectory).mockRejectedValue(new Error('boom'));
    await renderTab();
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

  it('"view more" appends the next page (offset threaded) and hides when exhausted', async () => {
    await renderTab();
    // First page: a full PAGE_SIZE (20) → "view more" is visible.
    await waitFor(() => {
      expect(screen.getAllByTestId('groups-discover-card').length).toBe(20);
    });
    expect(screen.getByTestId('groups-view-more')).toBeInTheDocument();
    // Click "view more" → the next page (offset 20) appends the final 5.
    fireEvent.click(screen.getByTestId('groups-view-more'));
    await waitFor(() => {
      expect(screen.getAllByTestId('groups-discover-card').length).toBe(25);
    });
    // The read was called with the threaded offset.
    expect(readGroupDirectory).toHaveBeenLastCalledWith(20, 20);
    // A short final page exhausts the directory → "view more" hides.
    expect(screen.queryByTestId('groups-view-more')).not.toBeInTheDocument();
  });

  it('hides "view more" when the directory is a single short page', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(mockDirectory as never);
    await renderTab();
    await waitFor(() => {
      expect(screen.getAllByTestId('groups-discover-card').length).toBe(3);
    });
    expect(screen.queryByTestId('groups-view-more')).not.toBeInTheDocument();
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
    // The engagement row (post-actions.md): group posts get the reaction pair
    // + comment entry via the reference PostCard (group-scoped via `groups`).
    expect(screen.getByTestId('post-actions')).toBeInTheDocument();
    expect(screen.getByTestId('like-button')).toBeInTheDocument();
    expect(screen.getByTestId('dislike-button')).toBeInTheDocument();
    expect(screen.getByTestId('comment-button')).toBeInTheDocument();
    // A member sees the Leave button, not Join
    expect(screen.getByTestId('group-detail-leave')).toBeInTheDocument();
  });

  it('liking a group post writes the reaction to the group (group-scoped engagement)', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-post-card')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('like-button'));
    await waitFor(() => {
      // The reaction attaches to the group, not the discover board
      // (post-actions.md) — the reference PostCard threads `groups` through.
      expect(toggleReactionKind).toHaveBeenCalledWith('doc-1', 'like', [GROUP_ID]);
    });
  });

  it('a member sees the group composer (the feed composer, group-scoped)', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-posts')).toBeInTheDocument();
    });
    // The composer is the feed's PostComposer (the group feed looks like the
    // feed) — present for a member, absent for non-members.
    expect(screen.getByTestId('group-composer')).toBeInTheDocument();
    expect(screen.getByTestId('post-composer')).toBeInTheDocument();
    expect(screen.getByTestId('composer-textarea')).toBeInTheDocument();
    // The Post button is disabled until there's text
    expect(screen.getByTestId('post-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('composer-textarea'), { target: { value: 'Hello group' } });
    expect(screen.getByTestId('post-submit')).toBeEnabled();
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
      // The reference PostCard renders media through the feed's MediaGrid
      // (media-image), not a group-specific img.
      expect(screen.getByTestId('media-image')).toBeInTheDocument();
    });
    expect((screen.getByTestId('media-image').querySelector('img') as HTMLImageElement).src).toBe('http://x/img.png');
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

  it('a manager sees the kebab entry point (the group is in getGroupsManages)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-kebab')).toBeInTheDocument();
    });
  });

  it('a non-manager member does NOT see the kebab entry point', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([]);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('group-detail-kebab')).not.toBeInTheDocument();
  });

  it('clicking the kebab opens the management sheet with its tabs (Members + Roles — Profile/Settings retired)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-kebab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-kebab'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    // G2: Profile + Settings fold into the inline edit mode — the sheet is now
    // the secondary surface for the list ops (Members + Roles).
    expect(screen.queryByTestId('manage-tab-profile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manage-tab-settings')).not.toBeInTheDocument();
    expect(screen.getByTestId('manage-tab-members')).toBeInTheDocument();
    expect(screen.getByTestId('manage-tab-roles')).toBeInTheDocument();
    // The active tab is Members (the first section now that Profile is retired).
    expect(screen.getByTestId('manage-tab-members')).toHaveAttribute('aria-selected', 'true');
  });

  it('the Edit pencil (manager-only) opens the inline edit mode with face + settings', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // The face fields load the current face (mockIdentity).
    expect((screen.getByTestId('group-edit-name') as HTMLInputElement).value).toBe('Gaming Night');
    expect(screen.getByTestId('group-edit-about')).toBeInTheDocument();
    expect(screen.getByTestId('group-edit-website')).toBeInTheDocument();
    expect(screen.getByTestId('group-edit-banner-button')).toBeInTheDocument();
    expect(screen.getByTestId('group-edit-avatar-button')).toBeInTheDocument();
    // The settings (who-can-read / how-join / list-in-directory) are inline too.
    expect(screen.getByTestId('group-edit-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('group-edit-join-policy')).toBeInTheDocument();
    expect(screen.getByTestId('group-edit-listed-toggle')).toBeInTheDocument();
  });

  it('a non-manager does NOT see the Edit pencil', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([]);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('group-detail-edit')).not.toBeInTheDocument();
  });

  it('the edit mode commit is atomic — face + settings land together (saveGroup)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // Stage a face change + a settings change.
    fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'Gaming Night 2.0' } });
    fireEvent.click(screen.getByTestId('group-edit-join-request'));
    // Save → the atomic commit: saveGroup is called with BOTH the face and the settings.
    fireEvent.click(screen.getByTestId('group-edit-save'));
    await waitFor(() => {
      expect(saveGroup).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({
          face: expect.objectContaining({ name: 'Gaming Night 2.0' }),
          joinPolicy: 'request',
        }),
      );
    });
  });

  it('a draft group commits via publishGroup (the same atomic commit)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    // The group is a draft (G0: status:'draft' on the face).
    vi.mocked(readGroupIdentity).mockResolvedValue({ ...mockIdentity, status: 'draft' });
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // The save button reads "Publish group" for a draft.
    expect(screen.getByTestId('group-edit-save')).toHaveTextContent('Publish group');
    fireEvent.click(screen.getByTestId('group-edit-save'));
    await waitFor(() => {
      expect(publishGroup).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({ face: expect.objectContaining({ name: 'Gaming Night' }) }),
      );
    });
    // A published group uses saveGroup, not publishGroup.
    expect(saveGroup).not.toHaveBeenCalled();
  });

  it('nav-away mid-upload shows the warning (decision 3)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    // The upload never resolves (in flight).
    vi.mocked(uploadMedia).mockImplementation(
      () => new Promise(() => {}) as unknown as ReturnType<typeof uploadMedia>,
    );
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // Pick a cover → the upload starts (in flight).
    fireEvent.change(screen.getByTestId('group-edit-banner-input'), {
      target: { files: [new File(['x'], 'cover.png', { type: 'image/png' })] },
    });
    // Nav away (back) while the upload is in flight → the warning shows.
    fireEvent.click(screen.getByTestId('group-detail-back'));
    await waitFor(() => {
      expect(screen.getByTestId('group-upload-warning')).toBeInTheDocument();
    });
    expect(screen.getByText('Your upload will be canceled if you leave.')).toBeInTheDocument();
    // "Stay" dismisses the warning (no navigation).
    fireEvent.click(screen.getByTestId('group-upload-warning-stay'));
    await waitFor(() => {
      expect(screen.queryByTestId('group-upload-warning')).not.toBeInTheDocument();
    });
  });

  it('no auto-save mid-upload (Save disabled) + Cancel restores the live state', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    vi.mocked(uploadMedia).mockImplementation(
      () => new Promise(() => {}) as unknown as ReturnType<typeof uploadMedia>,
    );
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // Pick a cover → the upload is in flight → Save is disabled (no auto-save mid-upload).
    fireEvent.change(screen.getByTestId('group-edit-banner-input'), {
      target: { files: [new File(['x'], 'cover.png', { type: 'image/png' })] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-save')).toBeDisabled();
    });
    // Stage a name change, then Cancel → the live state is restored (the hero
    // shows the original name; the stage is discarded).
    fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByTestId('group-edit-cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('group-edit-mode')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('group-detail-name')).toHaveTextContent('Gaming Night');
    // Cancel never commits.
    expect(saveGroup).not.toHaveBeenCalled();
    expect(publishGroup).not.toHaveBeenCalled();
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
      expect(screen.getByTestId('group-detail-kebab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-kebab'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('manage-tab-members'));
    await waitFor(() => {
      expect(screen.getAllByTestId('manage-members-row').length).toBe(2);
    });
    // Scoped to the sheet — the group feed's post card (author "carol") is
    // still mounted behind it.
    const sheet = screen.getByTestId('manage-group-sheet');
    expect(within(sheet).getByText('carol')).toBeInTheDocument();
    expect(within(sheet).getByText('bob')).toBeInTheDocument();
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
      expect(screen.getByTestId('group-detail-kebab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-kebab'));
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
      expect(screen.getByTestId('group-detail-kebab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-kebab'));
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
      expect(screen.getByTestId('group-detail-kebab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-kebab'));
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
      expect(screen.getByTestId('group-detail-kebab')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-kebab'));
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
    // A face-present group does NOT show the "add a face" CTA
    expect(screen.queryByTestId('group-detail-add-face')).not.toBeInTheDocument();
  });

  it('the hero is profile-shaped even when the group has no face (banner + avatar fallbacks)', async () => {
    vi.mocked(readGroupIdentity).mockResolvedValue({});
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    // The banner is always present (the brand gradient fallback) — the page
    // never collapses to a bare header.
    expect(screen.getByTestId('group-detail-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('group-detail-banner-img')).not.toBeInTheDocument();
    // The avatar is always present (the hash-color initial fallback)
    expect(screen.queryByTestId('group-detail-avatar-img')).not.toBeInTheDocument();
    expect(screen.getByTestId('group-detail-name')).toHaveTextContent('Gaming Night');
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
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-detail-add-face')).toBeInTheDocument();
    // Clicking it opens the Manage sheet
    fireEvent.click(screen.getByTestId('group-detail-add-face'));
    await waitFor(() => {
      expect(screen.getByTestId('manage-group-sheet')).toBeInTheDocument();
    });
  });

  // ── G1: the group page tabs (Feed | Media) ────────────────────────────────

  function renderDetailAt(path: string) {
    return import('@/components/Groups/GroupDetailScreen').then(({ default: GroupDetailScreen }) =>
      render(
        <MemoryRouter initialEntries={[path]}>
          <GroupDetailScreen groupId={GROUP_ID} />
        </MemoryRouter>,
      ),
    );
  }

  it('renders the Feed tab by default (bare URL) with the tab row', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-tabs')).toBeInTheDocument();
    });
    // Feed is the default (bare URL) — the media tab is not current.
    expect(screen.getByTestId('group-tab-feed')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('group-tab-media')).not.toHaveAttribute('aria-current');
    // The feed is the default surface.
    expect(screen.getByTestId('group-detail-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('group-detail-media')).not.toBeInTheDocument();
  });

  it('clicking the Media tab switches to the media grid and sets ?tab=media', async () => {
    vi.mocked(readGroupMediaPage).mockResolvedValue({
      posts: [
        { _id: 'mp1', text: 'p1', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m1'] },
      ],
      hasMore: false,
      total: 1,
    } as never);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'm1', url: 'http://x/m1.png', mime_type: 'image/png', created_at: '' },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-tab-media')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-tab-media'));
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-media')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-tab-media')).toHaveAttribute('aria-current', 'true');
    // The media read fired for the group (page one, offset 0).
    expect(readGroupMediaPage).toHaveBeenCalledWith(GROUP_ID, 24, 0);
  });

  it('restores the Media tab from ?tab=media (deep link)', async () => {
    vi.mocked(readGroupMediaPage).mockResolvedValue({
      posts: [
        { _id: 'mp1', text: 'p1', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m1'] },
      ],
      hasMore: false,
      total: 1,
    } as never);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'm1', url: 'http://x/m1.png', mime_type: 'image/png', created_at: '' },
    ] as never);
    await renderDetailAt('/groups/x?tab=media');
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-media')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-tab-media')).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByTestId('group-detail-posts')).not.toBeInTheDocument();
  });

  it('the media grid renders media cells + the total count', async () => {
    vi.mocked(readGroupMediaPage).mockResolvedValue({
      posts: [
        { _id: 'mp1', text: 'p1', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m1'] },
        { _id: 'mp2', text: 'p2', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m2'] },
      ],
      hasMore: false,
      total: 2,
    } as never);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'm1', url: 'http://x/m1.png', mime_type: 'image/png', created_at: '' },
      { _id: 'm2', url: 'http://x/m2.png', mime_type: 'image/png', created_at: '' },
    ] as never);
    await renderDetailAt('/groups/x?tab=media');
    await waitFor(() => {
      expect(screen.getAllByTestId('group-media-cell').length).toBe(2);
    });
    // The count shows the total media posts.
    expect(screen.getByTestId('group-media-count')).toHaveTextContent('2 photos');
  });

  it('infinite scroll: the sentinel loads the next page and appends', async () => {
    vi.mocked(readGroupMediaPage)
      .mockResolvedValueOnce({
        posts: [
          { _id: 'mp1', text: 'p1', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m1'] },
          { _id: 'mp2', text: 'p2', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m2'] },
        ],
        hasMore: true,
        total: 4,
      } as never)
      .mockResolvedValueOnce({
        posts: [
          { _id: 'mp3', text: 'p3', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m3'] },
          { _id: 'mp4', text: 'p4', author_username: 'carol', created_at: new Date().toISOString(), media_refs: ['m4'] },
        ],
        hasMore: false,
        total: 4,
      } as never);
    vi.mocked(resolveMediaRefs).mockResolvedValue([
      { _id: 'm1', url: 'http://x/m1.png', mime_type: 'image/png', created_at: '' },
      { _id: 'm2', url: 'http://x/m2.png', mime_type: 'image/png', created_at: '' },
      { _id: 'm3', url: 'http://x/m3.png', mime_type: 'image/png', created_at: '' },
      { _id: 'm4', url: 'http://x/m4.png', mime_type: 'image/png', created_at: '' },
    ] as never);
    await renderDetailAt('/groups/x?tab=media');
    await waitFor(() => {
      expect(screen.getAllByTestId('group-media-cell').length).toBe(2);
    });
    // The sentinel is visible → the observer fires → loadMoreMedia appends page 2.
    (globalThis as unknown as Record<string, () => void>).fireIntersectionObservers();
    await waitFor(() => {
      expect(screen.getAllByTestId('group-media-cell').length).toBe(4);
    });
    // Page 2 was fetched at offset 2 (page one's length).
    expect(readGroupMediaPage).toHaveBeenLastCalledWith(GROUP_ID, 24, 2);
  });

  it('the media grid shows the empty state when the group has no media posts', async () => {
    vi.mocked(readGroupMediaPage).mockResolvedValue({ posts: [], hasMore: false, total: 0 } as never);
    await renderDetailAt('/groups/x?tab=media');
    await waitFor(() => {
      expect(screen.getByTestId('group-media-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No media yet')).toBeInTheDocument();
  });

  it('the hero name row sits above the banner (the Edit pencil must be clickable — G5 hit-test fix)', async () => {
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    // The name row overlaps the banner (-mt-14). It must be positioned
    // (relative) so it paints ABOVE the banner's absolute <img> — otherwise
    // the img intercepts pointer events and the Edit pencil is unclickable in
    // a real browser (fireEvent doesn't hit-test, so only the Playwright
    // capture catches this).
    const nameRow = screen.getByTestId('group-detail-name').closest('[class*="-mt-14"]');
    expect(nameRow).toHaveClass('relative');
  });

  // ── G4: create = the group page in edit mode (draft) ──────────────────────

  // A draft detail render with the manager view (the draft's owner manages it).
  // The detail is inert like a real draft: unlisted, owner-only.
  function renderDraftAt(path: string) {
    vi.mocked(readGroupDetail).mockResolvedValue({
      ...mockDetailMember,
      discoverable: false,
      member_count: 1,
    } as never);
    vi.mocked(readGroupIdentity).mockResolvedValue({ ...mockIdentity, status: 'draft' });
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 1 },
    ] as never);
    return renderDetailAt(path);
  }

  it('a draft opens in edit mode with ?edit=1 (the create flow)', async () => {
    await renderDraftAt('/groups/x?edit=1');
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // The draft's face loads into the form.
    expect((screen.getByTestId('group-edit-name') as HTMLInputElement).value).toBe('Gaming Night');
    // The create flow's action row: Publish group / Delete (no Cancel — the
    // draft auto-saves, so leaving loses nothing).
    expect(screen.getByTestId('group-edit-save')).toHaveTextContent('Publish group');
    expect(screen.getByTestId('group-edit-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('group-edit-cancel')).not.toBeInTheDocument();
  });

  it('a draft with no staged name opens in edit mode even without ?edit=1', async () => {
    vi.mocked(readGroupIdentity).mockResolvedValue({ status: 'draft' });
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 1 },
    ] as never);
    await renderDetailAt('/groups/x');
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
  });

  it('a named draft WITHOUT ?edit=1 opens in view mode (Draft badge + Edit pencil)', async () => {
    await renderDraftAt('/groups/x');
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-hero')).toBeInTheDocument();
    });
    // Not in edit mode — the page is the profile, marked Draft.
    expect(screen.queryByTestId('group-edit-mode')).not.toBeInTheDocument();
    expect(screen.getByTestId('group-detail-draft')).toHaveTextContent('Draft');
    // The pencil re-opens edit mode.
    fireEvent.click(screen.getByTestId('group-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
  });

  it('draft auto-save: typing the name persists the face (status stays draft)', async () => {
    await renderDraftAt('/groups/x?edit=1');
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'My New Group' } });
    // The auto-save is debounced (600ms) — the face doc is written with the
    // staged name and status still 'draft' (nothing is live).
    await waitFor(() => {
      expect(writeGroupIdentity).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({ name: 'My New Group', status: 'draft' }),
      );
    }, { timeout: 3000 });
    // The auto-save status shows the draft was saved.
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-autosave')).toHaveTextContent('All changes saved');
    });
  });

  it('published groups do NOT auto-save (the live face is frozen until Save)', async () => {
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 128 },
    ] as never);
    await loadDetail();
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-edit')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('group-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'Changed' } });
    // Give any (wrong) auto-save a chance to fire — it must not.
    await new Promise((r) => setTimeout(r, 900));
    expect(writeGroupIdentity).not.toHaveBeenCalled();
  });

  it('the name-taken guard blocks Publish (decision 1, live in edit mode)', async () => {
    vi.mocked(slugTaken).mockResolvedValue(true);
    await renderDraftAt('/groups/x?edit=1');
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // The slug guard resolves (debounced) → the "name already taken" state.
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-slug-taken')).toBeInTheDocument();
    });
    // Publish is blocked while the slug is taken.
    expect(screen.getByTestId('group-edit-save')).toBeDisabled();
    expect(publishGroup).not.toHaveBeenCalled();
  });

  it('a free slug shows the slug preview and Publish stays enabled', async () => {
    vi.mocked(slugTaken).mockResolvedValue(false);
    await renderDraftAt('/groups/x?edit=1');
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-mode')).toBeInTheDocument();
    });
    // The slug preview shows the derived slug (the group's identity).
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-slug')).toHaveTextContent('gaming-night');
    });
    expect(screen.queryByTestId('group-edit-slug-taken')).not.toBeInTheDocument();
    expect(screen.getByTestId('group-edit-save')).toBeEnabled();
  });

  it('draft delete discards the draft (lightweight, one tap) and leaves the page', async () => {
    vi.mocked(readGroupDetail).mockResolvedValue({
      ...mockDetailMember,
      discoverable: false,
      member_count: 1,
    } as never);
    vi.mocked(readGroupIdentity).mockResolvedValue({ ...mockIdentity, status: 'draft' });
    vi.mocked(getGroupsManages).mockResolvedValue([
      { group_id: GROUP_ID, join_policy: 'open', my_role: 'owner', member_count: 1 },
    ] as never);
    const { default: GroupDetailScreen } = await import('@/components/Groups/GroupDetailScreen');
    render(
      <MemoryRouter initialEntries={['/groups/x?edit=1']}>
        <Routes>
          <Route path="/groups" element={<LocationProbe />} />
          <Route path="/groups/:groupId" element={<GroupDetailScreen groupId={GROUP_ID} />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('group-edit-delete')).toBeInTheDocument();
    });
    // One tap — the lightweight draft-delete has no confirm (the group is inert).
    fireEvent.click(screen.getByTestId('group-edit-delete'));
    await waitFor(() => {
      expect(deleteGroup).toHaveBeenCalledWith(GROUP_ID);
    });
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/groups');
    });
  });
});
