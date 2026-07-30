import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@testing-library/jest-dom';

vi.mock('lucide-react', () => ({
  ArrowUpRight: (props) => <svg data-testid="arrow-up-right" {...props} />,
  ArrowLeft: (props) => <svg data-testid="arrow-left" {...props} />,
  ExternalLink: (props) => <svg data-testid="external-link" {...props} />,
  PackageX: (props) => <svg data-testid="package-x" {...props} />,
}));

function renderWithRouter(ui: React.ReactNode, route: string = '/app-store/app/test-id') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/app-store/app/:id" element={ui} />
        <Route path="/app-store" element={<div>App Store</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AppDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows skeleton while loading', async () => {
    (global.fetch as any).mockReturnValue(new Promise(() => {}));
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    // skeleton state renders pulse placeholders
    const el = screen.getByRole('link', { name: /back to app store/i });
    expect(el).toBeInTheDocument();
  });

  it('renders app name, description, and visits on success', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: 'A wonderful test app.',
      icon_url: 'https://test.web10.app/icon.png',
      screenshots: [],
      visits: 1337,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toHaveTextContent('Test App');
    });
    expect(screen.getByTestId('app-detail-description')).toHaveTextContent('A wonderful test app.');
    expect(screen.getByTestId('app-detail-visits')).toHaveTextContent('1,337 visits');
  });

  it('renders Open button with correct href', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: 'Desc',
      screenshots: [],
      visits: 10,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      const btn = screen.getByTestId('open-app-button');
      expect(btn).toHaveAttribute('href', 'https://test.web10.app');
      expect(btn).toHaveAttribute('target', '_blank');
    });
  });

  it('renders 404 state on 404 response', async () => {
    (global.fetch as any).mockResolvedValue({
      status: 404,
      ok: false,
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByText('App not found')).toBeInTheDocument();
    });
    expect(screen.getByText('Browse App Store')).toBeInTheDocument();
  });

  it('renders 404 state on network error', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network error'));
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByText('App not found')).toBeInTheDocument();
    });
  });

  it('renders screenshots when available', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: 'Desc',
      screenshots: ['https://test.web10.app/ss1.png', 'https://test.web10.app/ss2.png'],
      visits: 50,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('screenshots-section')).toBeInTheDocument();
    });
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('src', 'https://test.web10.app/ss1.png');
  });

  it('does not render screenshots section when empty', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: 'Desc',
      screenshots: [],
      visits: 50,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('screenshots-section')).not.toBeInTheDocument();
  });

  it('renders fallback letter when no icon_url', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: 'Desc',
      screenshots: [],
      visits: 50,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByText('T')).toBeInTheDocument();
    });
  });

  it('renders singular visit', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: 'Desc',
      screenshots: [],
      visits: 1,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-visits')).toHaveTextContent('1 visit');
    });
  });

  it('renders back to App Store link', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: 'Desc',
      screenshots: [],
      visits: 10,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('back-to-store')).toHaveAttribute('href', '/app-store');
    });
  });

  it('does not render description when empty', async () => {
    const mockApp = {
      url: 'https://test.web10.app',
      name: 'Test App',
      description: '',
      screenshots: [],
      visits: 10,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApp),
    });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('app-detail-description')).not.toBeInTheDocument();
  });
});