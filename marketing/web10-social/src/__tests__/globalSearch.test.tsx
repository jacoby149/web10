import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

function renderDesktopSearch() {
  return render(
    <MemoryRouter initialEntries={['/feed']}>
      <GlobalSearch variant="desktop" />
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

  it('rests as a slim icon — no field, no results', () => {
    renderDesktopSearch();
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('global-search-field')).not.toBeInTheDocument();
    expect(screen.queryByTestId('global-search-results')).not.toBeInTheDocument();
  });

  it('tap expands to a full-width field with focus + the "type to search" state', async () => {
    renderDesktopSearch();
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    const field = await screen.findByTestId('global-search-field');
    expect(field).toBeInTheDocument();
    expect(field).toHaveFocus();
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
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    const field = await screen.findByTestId('global-search-field');
    fireEvent.change(field, { target: { value: 'john' } });
    // Immediately: still the idle "type to search" state (debounce pending).
    expect(screen.getByTestId('global-search-type-to-search')).toBeInTheDocument();
    expect(screen.queryByTestId('global-search-results-placeholder')).not.toBeInTheDocument();
    // After the 400ms debounce settles, the results slot shows the (S2) placeholder.
    await waitFor(
      () => expect(screen.getByTestId('global-search-results-placeholder')).toBeInTheDocument(),
      { timeout: 1500 },
    );
  });

  it('Escape collapses back to the icon', async () => {
    renderDesktopSearch();
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    const field = await screen.findByTestId('global-search-field');
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('global-search-field')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
  });

  it('the X button collapses back to the icon', async () => {
    renderDesktopSearch();
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    await screen.findByTestId('global-search-field');
    fireEvent.click(screen.getByTestId('global-search-close'));
    await waitFor(() => expect(screen.queryByTestId('global-search-field')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
  });

  it('clicking outside the bar collapses (desktop)', async () => {
    renderDesktopSearch();
    fireEvent.click(screen.getByTestId('global-search-trigger'));
    await screen.findByTestId('global-search-field');
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByTestId('global-search-field')).not.toBeInTheDocument());
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
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

describe('Layout — the search icon is on every screen (desktop + 375px)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the search trigger is present in BOTH the desktop top bar and the mobile header', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Content</div>
        </Layout>
      </MemoryRouter>,
    );
    // One trigger in the desktop top bar + one in the mobile header
    // (CSS breakpoints hide one in a real browser; both exist in the DOM).
    const triggers = screen.getAllByTestId('global-search-trigger');
    expect(triggers.length).toBe(2);
    // The desktop top bar is present.
    expect(screen.getByTestId('topbar-desktop')).toBeInTheDocument();
  });

  it('the search trigger is still present on other screens (discover, profile)', async () => {
    const { default: Layout } = await import('@/components/Social/Layout');
    const { unmount } = render(
      <MemoryRouter initialEntries={['/discover']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Discover content</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('global-search-trigger').length).toBe(2);
    unmount();

    render(
      <MemoryRouter initialEntries={['/u/someone']}>
        <Layout onLogout={() => {}} onReportBug={() => {}}>
          <div>Profile content</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('global-search-trigger').length).toBe(2);
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
