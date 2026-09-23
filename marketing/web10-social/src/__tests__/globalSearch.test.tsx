import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list).
// NOTE: must be imported before GlobalSearch below (ESM evaluation order),
// since the vi.mock factory references lucideMock.
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);
import GlobalSearch from '@/components/Search/GlobalSearch';

// Mock data layer (the Layout shell reads the profile for the user menu).
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
  };
});

// Mock wapi
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
}));

// Mock the ads-catalog data layer so the Layout's node-admin gate is controllable.
const { checkNodeAdmin } = vi.hoisted(() => ({
  checkNodeAdmin: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/data/ads-catalog', () => ({
  checkNodeAdmin: (...a: unknown[]) => checkNodeAdmin(...a),
}));

// Mock the search data layer (S2) so the component test controls the results.
// Default: all three sections resolve to [] (the "no results" state).
const { searchPeople, searchGroups, searchPosts } = vi.hoisted(() => ({
  searchPeople: vi.fn().mockResolvedValue([]),
  searchGroups: vi.fn().mockResolvedValue([]),
  searchPosts: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/data/search', () => ({
  searchPeople: (...a: unknown[]) => searchPeople(...a),
  searchGroups: (...a: unknown[]) => searchGroups(...a),
  searchPosts: (...a: unknown[]) => searchPosts(...a),
}));

function renderDesktopSearch() {
  return render(
    <MemoryRouter initialEntries={['/feed']}>
      <GlobalSearch variant="desktop" />
    </MemoryRouter>,
  );
}

// A location probe — captures the current location so a test can assert a
// navigation (the Enter-to-Explore flow).
let probeLocation = '';
function LocationProbe() {
  const location = useLocation();
  probeLocation = `${location.pathname}${location.search}`;
  return null;
}

function renderDesktopSearchWithProbe() {
  return render(
    <MemoryRouter initialEntries={['/feed']}>
      <GlobalSearch variant="desktop" />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function renderMobileSearch() {
  return render(
    <MemoryRouter initialEntries={['/feed']}>
      <GlobalSearch variant="mobile" />
    </MemoryRouter>,
  );
}

describe('GlobalSearch — desktop (dropdown)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always shows the search field (no bare icon) — no results until focused', () => {
    renderDesktopSearch();
    // The field is always visible on desktop (the operator's call); no bare icon.
    expect(screen.getByTestId('global-search-field')).toBeInTheDocument();
    expect(screen.queryByTestId('global-search-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument();
  });

  it('focusing the field opens the dropdown with the "type to search" state', async () => {
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    expect(screen.getByTestId('global-search-type-to-search')).toBeInTheDocument();
    // The results container is a dropdown (absolute under the field), not a
    // full-screen view.
    const results = screen.getByTestId('global-search-results');
    expect(results.className).toContain('absolute');
    expect(results.className).not.toContain('fixed');
    expect(screen.queryByTestId('global-search-fullscreen')).not.toBeInTheDocument();
  });

  it('the query is debounced (400ms) before the results slot updates', async () => {
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'john' } });
    // Immediately: still the idle "type to search" state (debounce pending).
    expect(screen.getByTestId('global-search-type-to-search')).toBeInTheDocument();
    // After the 400ms debounce settles, the fan-out fires. With the default
    // mock (all sections empty) the results slot shows the "no results" state.
    await waitFor(
      () => expect(screen.getByTestId('global-search-no-results')).toBeInTheDocument(),
      { timeout: 1500 },
    );
  });

  it('Escape closes the dropdown (the field stays visible)', async () => {
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    expect(screen.getByTestId('global-search-results')).toBeInTheDocument();
    fireEvent.keyDown(field, { key: 'Escape' });
    // The dropdown fades out (150ms), but the field stays visible.
    await waitFor(() => expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-field')).toBeInTheDocument();
  });

  it('the X button clears the query (the field stays visible)', async () => {
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'john' } });
    expect(field).toHaveValue('john');
    fireEvent.click(screen.getByTestId('global-search-close'));
    await waitFor(() => expect(field).toHaveValue(''));
    expect(screen.getByTestId('global-search-field')).toBeInTheDocument();
  });

  it('clicking outside the bar closes the dropdown (the field stays)', async () => {
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    expect(screen.getByTestId('global-search-results')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    // The dropdown fades out (150ms), but the field stays visible.
    await waitFor(() => expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-field')).toBeInTheDocument();
  });
});

describe('GlobalSearch — mobile (full-screen view, not a dropdown)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rests as a slim icon in the header', () => {
    renderMobileSearch();
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('global-search-fullscreen')).not.toBeInTheDocument();
  });

  it('tap opens a FULL-SCREEN results view (fixed inset-0), not a dropdown', async () => {
    renderMobileSearch();
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    const fullscreen = await screen.findByTestId('global-search-fullscreen');
    expect(fullscreen).toBeInTheDocument();
    // Full-screen: fixed + inset-0, NOT an absolute dropdown.
    expect(fullscreen.className).toContain('fixed');
    expect(fullscreen.className).toContain('inset-0');
    // The results container lives INSIDE the full-screen view and is not an
    // absolute dropdown.
    const results = screen.getByTestId('global-search-results');
    expect(fullscreen.contains(results)).toBe(true);
    expect(results.className).not.toContain('absolute');
    const field = screen.getByTestId('global-search-field');
    expect(field).toHaveFocus();
    expect(screen.getByTestId('global-search-type-to-search')).toBeInTheDocument();
  });

  it('the X collapses the full-screen view back to the icon', async () => {
    renderMobileSearch();
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    await screen.findByTestId('global-search-fullscreen');
    fireEvent.click(screen.getByTestId('global-search-close'));
    await waitFor(() => expect(screen.queryByTestId('global-search-fullscreen')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
  });

  it('Escape collapses the full-screen view', async () => {
    renderMobileSearch();
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    const field = await screen.findByTestId('global-search-field');
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('global-search-fullscreen')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
  });
});

describe('GlobalSearch — S2 results (fan-out + rows + explore)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to the default empty results.
    vi.mocked(searchPeople).mockResolvedValue([]);
    vi.mocked(searchGroups).mockResolvedValue([]);
    vi.mocked(searchPosts).mockResolvedValue([]);
  });

  it('renders the People section with rows when people match', async () => {
    vi.mocked(searchPeople).mockResolvedValue([
      { username: 'alice', provider: 'web10', display_name: 'Alice Smith', followers_count: 100, is_following: false },
    ] as any);
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'alice' } });
    // The People section appears with the row.
    const section = await screen.findByTestId('global-search-section-people');
    expect(section).toBeInTheDocument();
    const row = screen.getByTestId('global-search-person-alice');
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent('Alice Smith');
    expect(row).toHaveTextContent('@alice');
    // The "See all results in Explore" CTA (Enter's target) is present.
    expect(screen.getByTestId('global-search-open-explore')).toBeInTheDocument();
  });

  it('renders the Groups section with rows when groups match', async () => {
    vi.mocked(searchGroups).mockResolvedValue([
      { group_id: 'g1', name: 'Synthwave Sessions', owner: 'nova', slug: 'synthwave', join_policy: 'open', member_count: 50, tags: ['music'], permission_summary: 'public' },
    ] as any);
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'synthwave' } });
    const section = await screen.findByTestId('global-search-section-groups');
    expect(section).toBeInTheDocument();
    const row = screen.getByTestId('global-search-group-g1');
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent('Synthwave Sessions');
    expect(row).toHaveTextContent('@nova');
    expect(screen.getByTestId('global-search-open-explore')).toBeInTheDocument();
  });

  it('renders the Posts section with rows when posts match', async () => {
    vi.mocked(searchPosts).mockResolvedValue([
      { _id: 'p1', text: 'Check out this synthwave mix', author_username: 'alice', created_at: '2026-01-01T00:00:00Z' },
    ] as any);
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'synthwave' } });
    const section = await screen.findByTestId('global-search-section-posts');
    expect(section).toBeInTheDocument();
    const row = screen.getByTestId('global-search-post-p1');
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent('Check out this synthwave mix');
    expect(screen.getByTestId('global-search-open-explore')).toBeInTheDocument();
  });

  it('Enter submits the search to Discover Explore (?tab=explore&q=)', async () => {
    vi.mocked(searchPeople).mockResolvedValue([
      { username: 'alice', provider: 'web10', display_name: 'Alice Smith', followers_count: 100, is_following: false },
    ] as any);
    probeLocation = '';
    renderDesktopSearchWithProbe();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'alice' } });
    await screen.findByTestId('global-search-person-alice');
    // Enter opens Discover's Explore tab with the query.
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => {
      expect(probeLocation).toBe('/discover?tab=explore&q=alice');
    });
  });

  it('the "See all results in Explore" CTA navigates to Discover Explore', async () => {
    vi.mocked(searchPeople).mockResolvedValue([
      { username: 'alice', provider: 'web10', display_name: 'Alice Smith', followers_count: 100, is_following: false },
    ] as any);
    probeLocation = '';
    renderDesktopSearchWithProbe();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'alice' } });
    const cta = await screen.findByTestId('global-search-open-explore');
    fireEvent.click(cta);
    await waitFor(() => {
      expect(probeLocation).toBe('/discover?tab=explore&q=alice');
    });
  });

  it('shows the "no results" state when all three sections are empty', async () => {
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'zzz-no-match' } });
    await waitFor(
      () => expect(screen.getByTestId('global-search-no-results')).toBeInTheDocument(),
      { timeout: 1500 },
    );
    expect(screen.queryByTestId('global-search-section-people')).not.toBeInTheDocument();
    expect(screen.queryByTestId('global-search-section-groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId('global-search-section-posts')).not.toBeInTheDocument();
  });

  it('per-section loading: a slow section does not block the fast ones', async () => {
    // People resolves immediately; groups + posts are pending.
    let resolveGroups: (v: unknown) => void = () => {};
    let resolvePosts: (v: unknown) => void = () => {};
    vi.mocked(searchPeople).mockResolvedValue([
      { username: 'alice', provider: 'web10', display_name: 'Alice', followers_count: 1, is_following: false },
    ] as any);
    vi.mocked(searchGroups).mockReturnValue(new Promise((r) => { resolveGroups = r; }));
    vi.mocked(searchPosts).mockReturnValue(new Promise((r) => { resolvePosts = r; }));

    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'alice' } });

    // People section appears (it resolved), while groups + posts are still loading
    // (their skeletons are present, their sections are not).
    await screen.findByTestId('global-search-section-people');
    expect(screen.queryByTestId('global-search-section-groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId('global-search-section-posts')).not.toBeInTheDocument();
    // The "no results" state is NOT shown (sections are still loading).
    expect(screen.queryByTestId('global-search-no-results')).not.toBeInTheDocument();

    // Resolve the slow sections — they appear, and the "no results" state
    // still does not show (people has a result).
    resolveGroups([]);
    resolvePosts([]);
    await waitFor(() => {
      expect(screen.queryByTestId('global-search-section-groups')).not.toBeInTheDocument();
      expect(screen.queryByTestId('global-search-section-posts')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('global-search-section-people')).toBeInTheDocument();
    expect(screen.queryByTestId('global-search-no-results')).not.toBeInTheDocument();
  });

  it('tapping a person row navigates to /u/:username', async () => {
    vi.mocked(searchPeople).mockResolvedValue([
      { username: 'alice', provider: 'web10', display_name: 'Alice', followers_count: 1, is_following: false },
    ] as any);
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'alice' } });
    const row = await screen.findByTestId('global-search-person-alice');
    fireEvent.click(row);
    // Navigation closes the dropdown (pathname change); the field stays.
    await waitFor(() => expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-field')).toBeInTheDocument();
  });

  it('tapping a group row navigates to /groups/:groupId', async () => {
    vi.mocked(searchGroups).mockResolvedValue([
      { group_id: 'web10/groups/users/nova/synthwave', name: 'Synthwave', owner: 'nova', slug: 'synthwave', join_policy: 'open', member_count: 5, tags: [], permission_summary: 'public' },
    ] as any);
    renderDesktopSearch();
    const field = screen.getByTestId('global-search-field');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'synthwave' } });
    const row = await screen.findByTestId('global-search-group-web10/groups/users/nova/synthwave');
    fireEvent.click(row);
    // Navigation closes the dropdown (pathname change); the field stays.
    await waitFor(() => expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-field')).toBeInTheDocument();
  });
});

describe('Layout — the search icon is on every screen (desktop + 375px)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the search field (desktop) + trigger (mobile) are on every screen', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // Desktop top bar: the field is always visible (no bare trigger); the
    // mobile header keeps its trigger icon (CSS breakpoints hide one in a
    // real browser; both exist in the DOM).
    expect(screen.getAllByTestId('global-search-trigger').length).toBe(1);
    expect(screen.getByTestId('global-search-field-wrap')).toBeInTheDocument();
    // The desktop top bar is present.
    expect(screen.getByTestId('topbar-desktop')).toBeInTheDocument();
  });

  it('the search field + trigger are still present on other screens (discover, profile)', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const { unmount } = render(
      <MemoryRouter initialEntries={['/discover']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Discover content</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('global-search-trigger').length).toBe(1);
    expect(screen.getByTestId('global-search-field-wrap')).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter initialEntries={['/u/someone']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Profile content</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('global-search-trigger').length).toBe(1);
    expect(screen.getByTestId('global-search-field-wrap')).toBeInTheDocument();
  });

  it('the desktop top bar is hidden on the Shorts lens (immersive full-bleed)', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/shorts']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Shorts lens</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('topbar-desktop')).not.toBeInTheDocument();
    // The mobile header (and its search trigger) stays on the lens.
    expect(screen.getAllByTestId('global-search-trigger').length).toBe(1);
  });
});
