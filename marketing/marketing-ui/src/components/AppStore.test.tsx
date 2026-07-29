import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('lucide-react', () => {
  const icons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
    ArrowUpRight: (props) => <svg data-testid="arrow-up-right" {...props} />,
  };
  return {
    ...icons,
    [Symbol.iterator]: function* () {
      for (const key of Object.keys(icons)) yield [key, icons[key]];
    },
  };
});

describe('AppCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders app name and description', async () => {
    const { AppCard } = await import('@/components/AppCard');
    render(
      <AppCard
        name="Test App"
        description="A test app description."
        href="https://test.web10.app"
        visits={42}
      />
    );
    expect(screen.getByText('Test App')).toBeInTheDocument();
    expect(screen.getByText('A test app description.')).toBeInTheDocument();
  });

  it('renders visit count', async () => {
    const { AppCard } = await import('@/components/AppCard');
    render(
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
    render(
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
    render(
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
    render(
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
    render(
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
    render(
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
    render(
      <AppCard
        name="Test App"
        description="Desc"
        href="https://test.web10.app"
        visits={10}
      />
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://test.web10.app');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('renders icon image when iconSrc is provided', async () => {
    const { AppCard } = await import('@/components/AppCard');
    render(
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
    render(
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
    render(
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
    render(<AppCard skeleton name="" description="" href="" />);
    expect(screen.getByTestId('app-card-skeleton')).toBeInTheDocument();
  });

  it('skeleton does not render name or description', async () => {
    const { AppCard } = await import('@/components/AppCard');
    render(<AppCard skeleton name="Hidden" description="Hidden" href="" />);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('accepts data-testid', async () => {
    const { AppCard } = await import('@/components/AppCard');
    render(
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
    render(<AppStore />);
    expect(
      screen.getByText('Apps that run on data you own.')
    ).toBeInTheDocument();
  });

  it('renders the App Store badge', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    render(<AppStore />);
    expect(screen.getByText('The web10 App Store')).toBeInTheDocument();
  });

  it('renders the subtitle about sorting by visits', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    render(<AppStore />);
    expect(
      screen.getByText(/Sorted by visits/)
    ).toBeInTheDocument();
  });

  it('renders skeleton cards while loading', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    render(<AppStore />);
    const skeletons = screen.getAllByTestId(/app-card-skeleton/);
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders first-party apps when API is unreachable', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    render(<AppStore />);
    await vi.waitFor(() => {
      expect(screen.getByText('web10 social')).toBeInTheDocument();
    });
    expect(screen.getByText('The node console')).toBeInTheDocument();
    expect(screen.getByText('The importer')).toBeInTheDocument();
  });

  it('first-party apps have correct links', async () => {
    const { default: AppStore } = await import('@/pages/AppStore');
    render(<AppStore />);
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
    render(<AppStore />);
    await vi.waitFor(() => {
      expect(screen.getByText('Flagship')).toBeInTheDocument();
    });
  });
});