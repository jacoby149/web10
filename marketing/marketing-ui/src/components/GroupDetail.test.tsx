import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom';

vi.mock('lucide-react', () => {
  const icons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
    ArrowLeft: (props) => <svg data-testid="icon-arrow-left" {...props} />,
    Users: (props) => <svg data-testid="icon-users" {...props} />,
    Lock: (props) => <svg data-testid="icon-lock" {...props} />,
    LockOpen: (props) => <svg data-testid="icon-lock-open" {...props} />,
    Shield: (props) => <svg data-testid="icon-shield" {...props} />,
    MessageSquareLock: (props) => <svg data-testid="icon-msg-lock" {...props} />,
  };
  return {
    ...icons,
    [Symbol.iterator]: function* () {
      for (const key of Object.keys(icons)) yield [key, icons[key]];
    },
  };
});

const GROUP_ID = 'web10.app/groups/users/alice/jazz';

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/groups/${encodeURIComponent(GROUP_ID)}`]}>
      <Routes>
        <Route path="/groups/:id" element={<DetailUnderTest />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Resolved lazily so the fetch stub is in place before the component mounts.
let DetailUnderTest: React.ComponentType = () => null;

function mockDetail(data: any, status = 200) {
  const fetchMock = vi.fn((input: any) => {
    const url = String(input);
    if (url.includes('/v3/groups/detail')) {
      return Promise.resolve({
        ok: status === 200,
        status,
        json: () => Promise.resolve(data),
      } as Response);
    }
    return Promise.reject(new Error('offline'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const BASE = {
  group_id: GROUP_ID,
  name: 'Jazz Collectors',
  owner: 'alice',
  slug: 'jazz',
  join_policy: 'open',
  discoverable: true,
  member_count: 42,
  permission_summary: 'member: readAll, create',
  description: 'A vinyl-first jazz community.',
  avatar_ref: '',
  website: '',
  tags: ['jazz', 'vinyl'],
  is_member: false,
  posts_state: 'join_to_view' as const,
  posts: [] as any[],
};

describe('GroupDetail page', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/pages/GroupDetail');
    DetailUnderTest = mod.default;
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the group name, owner, description, tags, and member count', async () => {
    mockDetail(BASE);
    renderDetail();
    await vi.waitFor(() => {
      expect(screen.getByTestId('group-detail-name')).toHaveTextContent('Jazz Collectors');
    });
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByTestId('group-detail-description')).toHaveTextContent('A vinyl-first jazz community.');
    expect(screen.getByText('#jazz')).toBeInTheDocument();
    expect(screen.getByText('#vinyl')).toBeInTheDocument();
    expect(screen.getByText(/42 members/)).toBeInTheDocument();
  });

  it('shows posts when the reader is a member (posts_state ok)', async () => {
    mockDetail({
      ...BASE,
      is_member: true,
      posts_state: 'ok',
      posts: [
        { doc_id: 'p1', author_key: 'web10.app/users/alice', body: { text: 'New record drop' }, created_at: '2026-07-27T00:00:00' },
      ],
    });
    renderDetail();
    await vi.waitFor(() => {
      expect(screen.getByText('New record drop')).toBeInTheDocument();
    });
    // @alice appears in the header (owner) and the post author — at least one.
    expect(screen.getAllByText('@alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('join-to-view')).not.toBeInTheDocument();
  });

  it('shows the join-to-view state when the reader is not a member', async () => {
    mockDetail(BASE); // posts_state: join_to_view
    renderDetail();
    await vi.waitFor(() => {
      expect(screen.getByTestId('join-to-view')).toBeInTheDocument();
    });
    expect(screen.getByText('Join to view posts')).toBeInTheDocument();
    expect(screen.getByTestId('join-group-button')).toBeInTheDocument();
  });

  it('renders a not-found state when the group does not exist (404)', async () => {
    mockDetail({}, 404);
    renderDetail();
    await vi.waitFor(() => {
      expect(screen.getByText('Group not found')).toBeInTheDocument();
    });
    expect(screen.getByTestId('back-to-directory')).toBeInTheDocument();
  });

  it('renders a skeleton while loading', async () => {
    // A fetch that never resolves — the page stays in the loading state.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderDetail();
    expect(screen.getByTestId('back-to-directory')).toBeInTheDocument();
    expect(screen.queryByTestId('group-detail-name')).not.toBeInTheDocument();
  });
});
