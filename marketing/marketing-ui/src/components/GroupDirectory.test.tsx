import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

vi.mock('lucide-react', () => {
  const icons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
    Users: (props) => <svg data-testid="icon-users" {...props} />,
    Lock: (props) => <svg data-testid="icon-lock" {...props} />,
    LockOpen: (props) => <svg data-testid="icon-lock-open" {...props} />,
    Shield: (props) => <svg data-testid="icon-shield" {...props} />,
    Search: (props) => <svg data-testid="icon-search" {...props} />,
  };
  return {
    ...icons,
    [Symbol.iterator]: function* () {
      for (const key of Object.keys(icons)) yield [key, icons[key]];
    },
  };
});

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// The real /v3/groups/directory response (D60): generic contract metadata only —
// name is the slug, there is NO tags field. The face (rich name + tags) comes
// from the per-group identity read, mocked separately below.
const GROUPS = [
  {
    group_id: 'web10.app/groups/users/alice/jazz',
    name: 'jazz',
    owner: 'alice',
    slug: 'jazz',
    join_policy: 'open',
    member_count: 42,
    permission_summary: 'reader: readAll',
  },
  {
    group_id: 'web10.app/groups/users/bob/chess',
    name: 'chess',
    owner: 'bob',
    slug: 'chess',
    join_policy: 'request',
    member_count: 7,
    permission_summary: 'reader: readAll',
  },
];

// Identity-service faces keyed by group_id (the `web10-social-group-identity`
// doc body the surface composes onto the directory row).
const FACES: Record<string, any> = {
  'web10.app/groups/users/alice/jazz': {
    name: 'Jazz Collectors',
    tags: ['jazz', 'vinyl'],
  },
};

function mockDirectory(groups = GROUPS, faces: Record<string, any> = FACES) {
  const fetchMock = vi.fn((input: any, init?: any) => {
    const url = String(input);
    if (url.includes('/v3/groups/directory')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ groups }) } as Response);
    }
    if (url.includes('/v3/read')) {
      const body = JSON.parse(init?.body ?? '{}');
      const face = faces[body.groups?.[0]];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(face ? [{ doc_id: 'id-1', body: face }] : []),
      } as Response);
    }
    return Promise.reject(new Error('offline'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('GroupCard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('renders name, owner, join policy, member count, and tags', async () => {
    const { GroupCard } = await import('@/components/GroupCard');
    renderWithRouter(
      <GroupCard
        groupId="web10.app/groups/users/alice/jazz"
        name="Jazz Collectors"
        owner="alice"
        joinPolicy="open"
        memberCount={42}
        tags={['jazz', 'vinyl']}
      />,
    );
    expect(screen.getByTestId('group-card-name')).toHaveTextContent('Jazz Collectors');
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('#jazz')).toBeInTheDocument();
    expect(screen.getByText('#vinyl')).toBeInTheDocument();
  });

  it('links to the detail page with the encoded group id', async () => {
    const { GroupCard } = await import('@/components/GroupCard');
    renderWithRouter(
      <GroupCard
        groupId="web10.app/groups/users/alice/jazz"
        name="Jazz Collectors"
        owner="alice"
        joinPolicy="open"
        memberCount={42}
        tags={[]}
      />,
    );
    const card = screen.getByTestId('group-card');
    expect(card).toHaveAttribute(
      'href',
      `/groups/${encodeURIComponent('web10.app/groups/users/alice/jazz')}`,
    );
  });

  it('renders a skeleton without a name', async () => {
    const { GroupCard } = await import('@/components/GroupCard');
    renderWithRouter(
      <GroupCard skeleton groupId="" name="Hidden" owner="" joinPolicy="" memberCount={0} tags={[]} />,
    );
    expect(screen.getByTestId('group-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});

describe('GroupDirectory page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the headline and badge', async () => {
    const { default: GroupDirectory } = await import('@/pages/GroupDirectory');
    renderWithRouter(<GroupDirectory />);
    expect(screen.getByText('Communities on a node you can read.')).toBeInTheDocument();
    expect(screen.getByText('The web10 Group Directory')).toBeInTheDocument();
  });

  it('renders group cards from the directory (face-composed name for jazz, slug for chess)', async () => {
    mockDirectory();
    const { default: GroupDirectory } = await import('@/pages/GroupDirectory');
    renderWithRouter(<GroupDirectory />);
    await vi.waitFor(() => {
      // jazz has a face -> rich name; chess has no face -> slug fallback.
      expect(screen.getByText('Jazz Collectors')).toBeInTheDocument();
      expect(screen.getByText('chess')).toBeInTheDocument();
    });
    expect(screen.getByText('@bob')).toBeInTheDocument();
  });

  it('renders without crashing when the directory has no face data (D60 generic rows)', async () => {
    // Regression: the API never returns `tags`; a missing/empty face must not
    // throw `g.tags is not iterable` in the tag-chip memo.
    mockDirectory(GROUPS, {});
    const { default: GroupDirectory } = await import('@/pages/GroupDirectory');
    renderWithRouter(<GroupDirectory />);
    await vi.waitFor(() => {
      expect(screen.getByText('jazz')).toBeInTheDocument();
      expect(screen.getByText('chess')).toBeInTheDocument();
    });
    // No face -> no tag chips rendered.
    expect(screen.queryByTestId('directory-tags')).not.toBeInTheDocument();
  });

  it('renders a skeleton while loading', async () => {
    const { default: GroupDirectory } = await import('@/pages/GroupDirectory');
    renderWithRouter(<GroupDirectory />);
    const skeletons = screen.getAllByTestId(/directory-card-skeleton/);
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders an empty state when no groups are listed', async () => {
    mockDirectory([]);
    const { default: GroupDirectory } = await import('@/pages/GroupDirectory');
    renderWithRouter(<GroupDirectory />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('directory-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/No groups are listed yet/)).toBeInTheDocument();
  });

  it('filters by search query', async () => {
    mockDirectory();
    const { default: GroupDirectory } = await import('@/pages/GroupDirectory');
    renderWithRouter(<GroupDirectory />);
    await vi.waitFor(() => expect(screen.getByTestId('directory-search')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('directory-search'), { target: { value: 'chess' } });
    await vi.waitFor(() => {
      expect(screen.getByText('chess')).toBeInTheDocument();
      expect(screen.queryByText('Jazz Collectors')).not.toBeInTheDocument();
    });
  });

  it('filters by tag chip', async () => {
    mockDirectory();
    const { default: GroupDirectory } = await import('@/pages/GroupDirectory');
    renderWithRouter(<GroupDirectory />);
    await vi.waitFor(() => expect(screen.getByTestId('directory-tag-jazz')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('directory-tag-jazz'));
    await vi.waitFor(() => {
      expect(screen.getByText('Jazz Collectors')).toBeInTheDocument();
      expect(screen.queryByText('chess')).not.toBeInTheDocument();
    });
  });
});
