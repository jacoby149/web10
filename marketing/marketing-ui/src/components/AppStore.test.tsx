import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

vi.mock('lucide-react', () => {
  const icons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
    ArrowUpRight: (props) => <svg data-testid="arrow-up-right" {...props} />,
    Search: (props) => <svg data-testid="search-icon" {...props} />,
  };
  return {
    ...icons,
    [Symbol.iterator]: function* () {
      for (const key of Object.keys(icons)) yield [key, icons[key]];
    },
  };
});

function renderWithRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
}

describe('AppCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders app name and description', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="A test app description."
        href="https://test.web10.app"
        visits={42}
        size="default"
      />
    );
    expect(screen.getByText('Test App')).toBeInTheDocument();
    expect(screen.getByText('A test app description.')).toBeInTheDocument();
  });

  it('browse size renders name and visits but no description', async () => {
    const { AppCard } = await import('@/components/AppCard');
    render(
      <AppCard
        name="Test App"
        description="Should not appear."
        href="https://test.web10.app"
        visits={42}
        size="browse"
      />
    );
    expect(screen.getByText('Test App')).toBeInTheDocument();
    expect(screen.getByText('42 visits')).toBeInTheDocument();
    expect(screen.queryByText('Should not appear.')).not.toBeInTheDocument();
  });

  it('renders visit count', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={1234}
      />
    );
    expect(screen.getByText('1,234 visits')).toBeInTheDocument();
  });

  it('renders singular visit', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={1}
      />
    );
    expect(screen.getByText('1 visit')).toBeInTheDocument();
  });

  it('does not render visits when undefined', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
      />
    );
    expect(screen.queryByText(/visit/)).not.toBeInTheDocument();
  });

  it('does not render visits when negative', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={-1}
      />
    );
    expect(screen.queryByText(/visit/)).not.toBeInTheDocument();
  });

  it('renders flagship badge when flagship is true', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="web10 social"
        description="The flagship."
        href="https://social.web10.app"
        visits={100}
        flagship
      />
    );
    expect(screen.getByText('Flagship')).toBeInTheDocument();
  });

  it('does not render flagship badge when not flagship', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
      />
    );
    expect(screen.queryByText('Flagship')).not.toBeInTheDocument();
  });

  it('renders Open link with correct href', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
      />
    );
    const openLinks = screen.getAllByText('Open');
    expect(openLinks.length).toBeGreaterThan(0);
    const openBtn = openLinks[0].closest('a');
    expect(openBtn).toHaveAttribute('href', 'https://test.web10.app');
    expect(openBtn).toHaveAttribute('target', '_blank');
  });

  it('renders icon image when iconSrc is provided', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
        iconSrc="/brand/icon-192.png"
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/brand/icon-192.png');
    expect(img).toHaveAttribute('alt', 'Test App');
  });

  it('renders fallback letter when no iconSrc', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
      />
    );
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('renders custom iconLetter when provided', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
        iconLetter="X"
      />
    );
    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('renders skeleton state', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(<AppCard skeleton name="" description="" href="" />);
    expect(screen.getByTestId('app-card-skeleton')).toBeInTheDocument();
  });

  it('skeleton does not render name or description', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(<AppCard skeleton name="Hidden" description="Hidden" href="" />);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('accepts data-testid', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
        data-testid="my-app-card"
      />
    );
    expect(screen.getByTestId('my-app-card')).toBeInTheDocument();
  });

  it('navigates to product page when appId is provided', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
        appId="app-123"
      />
    );
    const card = screen.getByTestId('app-card');
    expect(card).toHaveAttribute('href', '/app-store/app/app-123');
  });

  it('opens externally when no appId is provided', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
      />
    );
    const card = screen.getByTestId('app-card');
    expect(card).toHaveAttribute('href', 'https://test.web10.app');
    expect(card).toHaveAttribute('target', '_blank');
  });

  it('renders plug size with appId', async () => {
    const { AppCard } = await import('@/components/AppCard');
    renderWithRouter(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
        size="plug"
        badge="Flagship"
        appId="app-456"
      />
    );
    const card = screen.getByTestId('app-card');
    expect(card).toHaveAttribute('href', '/app-store/app/app-456');
    expect(screen.getByText('Flagship')).toBeInTheDocument();
  });
});

describe('AppStore page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the headline', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    renderWithRouter(<AppStore />);
    expect(
      screen.getByText('Apps that run on data you own.')
    ).toBeInTheDocument();
  });

  it('renders the App Store badge', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    renderWithRouter(<AppStore />);
    expect(screen.getByText('The web10 App Store')).toBeInTheDocument();
  });

  it('renders the subtitle about sorting by visits', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    renderWithRouter(<AppStore />);
    expect(
      screen.getByText(/Sorted by visits/)
    ).toBeInTheDocument();
  });

  it('renders skeleton cards while loading', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    renderWithRouter(<AppStore />);
    const skeletons = screen.getAllByTestId(/browse-card-skeleton/);
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders first-party apps when API is unreachable', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    renderWithRouter(<AppStore />);
    await vi.waitFor(() => {
      // web10 social appears in the plug slot
      expect(screen.getByTestId('plug-slot-0')).toHaveAttribute('href', 'https://social.web10.app');
    });
    // The node console and The importer appear in the grid (plug slots only show flagship + most popular)
    expect(screen.getByText('The node console')).toBeInTheDocument();
    expect(screen.getByText('The importer')).toBeInTheDocument();
  });

  it('first-party apps have correct links', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    renderWithRouter(<AppStore />);
    await vi.waitFor(() => {
      expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
    });
    const links = screen.getAllByRole('link');
    const socialLink = links.find(
      (l) => l.getAttribute('href')?.includes('social.web10')
    );
    const authLink = links.find(
      (l) => l.getAttribute('href')?.includes('auth.web10')
    );
    expect(socialLink).toBeTruthy();
    expect(authLink).toBeTruthy();
  });

  it('web10 social has flagship badge', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    renderWithRouter(<AppStore />);
    await vi.waitFor(() => {
      // Flagship badge appears in the plug slot for web10 social
      const plugSlot = screen.getByTestId('plug-slot-0');
      expect(plugSlot).toHaveAttribute('href', 'https://social.web10.app');
      expect(plugSlot.textContent).toContain('Flagship');
    });
  });

  it('renders browse search bar', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    render(<AppStore />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('browse-search')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Search apps…')).toBeInTheDocument();
  });

  it('browse section renders', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    render(<AppStore />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('browse-section')).toBeInTheDocument();
    });
  });

  it('renders a registered app icon from its PWA manifest — SVG preferred over raster', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    // The demos carry their own icon (icon.svg + 192/512 PNGs for PWA
    // install). The store picks the SVG — it scales crisply to any card
    // size — and resolves it against the app's URL.
    const fetchMock = vi.fn((input: any) => {
      const url = String(input);
      if (url.includes('/v3/stats')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              users: 3,
              storage: 1024,
              apps: [
                {
                  url: 'https://www.web10.app/docs/hello/',
                  name: '',
                  description: '',
                  icon_url: '',
                  screenshots: [],
                  visits: 5,
                  review_state: 'approved',
                  web10apps_post_id: '',
                },
              ],
            }),
        } as Response);
      }
      if (url.includes('/pwa_listing')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: 'Hello — web10 Demo',
              short_name: 'Hello',
              icons: [
                { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              ],
            }),
        } as Response);
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithRouter(<AppStore />);
    await vi.waitFor(() => {
      // short_name wins for the card label (constrained display)
      expect(screen.getByAltText('Hello')).toBeInTheDocument();
    });
    const img = screen.getByAltText('Hello');
    expect(img).toHaveAttribute('src', 'https://www.web10.app/docs/hello/icon.svg');
  });
});