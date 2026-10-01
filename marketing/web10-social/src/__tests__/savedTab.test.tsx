import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock data layer — the saved-collection seams are the ones under test.
const mockGetMyCollections = vi.fn().mockResolvedValue([]);
const mockReadCollection = vi.fn().mockResolvedValue({ face: {}, posts: [], mediaMap: {} });

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readFeed: vi.fn().mockResolvedValue([]),
    getFeedGroups: vi.fn().mockResolvedValue([]),
    readFeedPage: vi.fn().mockResolvedValue({ posts: [], has_more: false, next_cursor: null }),
    readFeedEngagement: vi.fn().mockResolvedValue({ likes: {}, comments: {} }),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    readPost: vi.fn().mockResolvedValue(null),
    countReactions: vi.fn().mockResolvedValue(0),
    countComments: vi.fn().mockResolvedValue(0),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readUserProfile: vi.fn().mockImplementation((username: string) =>
      Promise.resolve({ display_name: 'Test User', username }),
    ),
    readProfile: vi.fn().mockResolvedValue({ display_name: 'Me' }),
    saveProfile: vi.fn().mockResolvedValue({}),
    readMyPosts: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn().mockResolvedValue({ _id: 'media-1', url: 'http://test.com/img.png' }),
    createPost: vi.fn().mockResolvedValue({ _id: 'post-1' }),
    listConversations: vi.fn().mockResolvedValue([]),
    readDms: vi.fn().mockResolvedValue([]),
    sendDm: vi.fn().mockResolvedValue({}),
    getLastDm: vi.fn().mockResolvedValue(null),
    readContacts: vi.fn().mockResolvedValue([]),
    followUser: vi.fn().mockResolvedValue({ _id: 'follow-1', status: 'active' }),
    unfollowUser: vi.fn().mockResolvedValue(undefined),
    readFollow: vi.fn().mockResolvedValue(null),
    countFollows: vi.fn().mockResolvedValue(0),
    countFollowers: vi.fn().mockResolvedValue(0),
    countUserFollowing: vi.fn().mockResolvedValue(0),
    countUserFollowingReal: vi.fn().mockResolvedValue(0),
    readUserPublicPosts: vi.fn().mockResolvedValue([]),
    readUserPublicProfile: vi.fn().mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined }),
    readReactions: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    readFollows: vi.fn().mockResolvedValue([]),
    fetchSuggestedUsers: vi.fn().mockResolvedValue([]),
    fetchDiscoveryPost: vi.fn().mockResolvedValue(null),
    countStagingPosts: vi.fn().mockResolvedValue(0),
    getMyCollections: mockGetMyCollections,
    readCollection: mockReadCollection,
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
  createWapiWrapper: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
    isSignedIn: vi.fn().mockReturnValue(false),
    signOut: vi.fn(),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
  }),
  resetWapi: vi.fn(),
  buildSocialServiceSirs: vi.fn().mockReturnValue([]),
  clearReadUrlCache: vi.fn(),
  deriveObjectKey: vi.fn().mockReturnValue(''),
  buildReactionTarget: vi.fn().mockReturnValue({}),
  buildCommentTarget: vi.fn().mockReturnValue({}),
  recordRepost: vi.fn(),
  fanOutToFollowers: vi.fn(),
  readPullFeed: vi.fn().mockResolvedValue([]),
  readUserPostsFromDiscovery: vi.fn().mockResolvedValue([]),
  updateFollowNotify: vi.fn(),
}));

globalThis.fetch = vi.fn();

function UrlProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="url-probe">{pathname}{search}</div>;
}

const OWN_COLLECTIONS = [
  { groupId: 'g1', name: 'Guitar Riffs', visibility: 'private', itemCount: 3, slug: 'guitar-riffs' },
  { groupId: 'g2', name: 'Tour Sets', visibility: 'public', itemCount: 1, slug: 'tour-sets' },
];

async function renderProfile(entry = '/u/testuser') {
  const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <UserProfileScreen username="testuser" provider="test.localhost" />
      <UrlProbe />
    </MemoryRouter>,
  );
}

describe('Saved tab (D88) — the owner\u2019s playlists on the profile', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => [] });
    const data = await import('@/data');
    vi.mocked(data.readMyPosts).mockResolvedValue([]);
    vi.mocked(data.readUserPublicProfile).mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined });
    mockGetMyCollections.mockResolvedValue([...OWN_COLLECTIONS]);
    mockReadCollection.mockResolvedValue({ face: { name: 'Guitar Riffs' }, posts: [], mediaMap: {} });
  });

  it('the owner\u2019s profile shows the Saved tab', async () => {
    await renderProfile();
    await waitFor(() => expect(screen.getByText('Me')).toBeInTheDocument());
    expect(screen.getByTestId('profile-tab-saved')).toBeInTheDocument();
  });

  it('clicking the Saved tab deep-links ?tab=saved and lists the collection cards', async () => {
    await renderProfile();
    await waitFor(() => expect(screen.getByText('Me')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('profile-tab-saved'));
    // The URL holds the tab (refresh-safe, shareable).
    await waitFor(() => expect(screen.getByTestId('url-probe').textContent).toContain('tab=saved'));
    // The cards render (name + item count).
    const cards = await screen.findAllByTestId('saved-collection-card');
    expect(cards.length).toBe(2);
    expect(screen.getByText('Guitar Riffs')).toBeInTheDocument();
    expect(screen.getByText('Tour Sets')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('an owner with no collections sees the Saved tab\u2019s empty state', async () => {
    mockGetMyCollections.mockResolvedValue([]);
    await renderProfile();
    await waitFor(() => expect(screen.getByText('Me')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('profile-tab-saved'));
    expect(await screen.findByTestId('saved-empty')).toBeInTheDocument();
    expect(screen.getByText('No collections yet')).toBeInTheDocument();
  });

  it('tapping a card navigates to the collection\u2019s deep-linkable route', async () => {
    await renderProfile();
    await waitFor(() => expect(screen.getByText('Me')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('profile-tab-saved'));
    const [card] = await screen.findAllByTestId('saved-collection-card');
    fireEvent.click(card);
    // The URL holds the open collection (the group_id, URL-encoded — the
    // group-detail idiom). The contents render in the SavedCollectionScreen
    // (a separate route, tested in savedCollection.test.tsx).
    await waitFor(() => expect(screen.getByTestId('url-probe').textContent).toContain('/u/testuser/saved/g1'));
  });

  it('tapping the second card navigates to its own route', async () => {
    await renderProfile();
    await waitFor(() => expect(screen.getByText('Me')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('profile-tab-saved'));
    const cards = await screen.findAllByTestId('saved-collection-card');
    fireEvent.click(cards[1]);
    await waitFor(() => expect(screen.getByTestId('url-probe').textContent).toContain('/u/testuser/saved/g2'));
  });
});

describe('Saved tab (D88) — the visitor\u2019s profile', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => [] });
    const data = await import('@/data');
    vi.mocked(data.readMyPosts).mockResolvedValue([]);
    vi.mocked(data.readUserPublicProfile).mockResolvedValue({ posts: [], avatarUrl: undefined, bannerUrl: undefined });
    mockGetMyCollections.mockResolvedValue([...OWN_COLLECTIONS]);
  });

  it('a visitor\u2019s profile shows NO Saved tab (collections are private by default)', async () => {
    // Render someone else\u2019s profile (the token is testuser; the profile is otheruser).
    const { default: UserProfileScreen } = await import('@/components/Bio/UserProfileScreen');
    render(
      <MemoryRouter initialEntries={['/u/otheruser']}>
        <UserProfileScreen username="otheruser" provider="test.localhost" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
    // The Saved tab is absent on a visitor\u2019s profile (the public-collections
    // case is a follow-up; a private collection must not leak).
    expect(screen.queryByTestId('profile-tab-saved')).not.toBeInTheDocument();
  });
});
