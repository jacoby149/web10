import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@testing-library/jest-dom';

vi.mock('lucide-react', () => ({
  ArrowUpRight: (props) => <svg data-testid="arrow-up-right" {...props} />,
  ArrowLeft: (props) => <svg data-testid="arrow-left" {...props} />,
  ExternalLink: (props) => <svg data-testid="external-link" {...props} />,
  PackageX: (props) => <svg data-testid="package-x" {...props} />,
  Star: (props) => <svg data-testid="star" {...props} />,
  LogIn: (props) => <svg data-testid="log-in" {...props} />,
  Check: (props) => <svg data-testid="check" {...props} />,
}));

const DETAIL_ROUTE = `/app-store/app/${encodeURIComponent('https://test.web10.app/')}`;

function renderWithRouter(ui: React.ReactNode, route: string = DETAIL_ROUTE) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/app-store/app/:id" element={ui} />
        <Route path="/app-store" element={<div>App Store</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockDetail(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://test.web10.app/',
    name: 'Test App',
    description: 'A wonderful test app.',
    icon_url: 'https://test.web10.app/icon.png',
    screenshots: [] as string[],
    review_state: 'approved',
    registered_at: '2026-07-30T01:29:37',
    metrics: { visits: 1337, users_1d: 4, users_30d: 128, users_90d: 301, users_1y: 512 },
    rating: { average: 4.5, count: 2 },
    ratings: [
      { author: 'alice', rating: 5, comment: 'fast.', provider: 'api.web10.app', created_at: '2026-08-01T12:00:00' },
      { author: 'bob', rating: 4, comment: '', provider: 'api.web10.app', created_at: '2026-08-02T12:00:00' },
    ],
    node: {
      users: 579,
      app_count: 12,
      active_users: { users_1d: 1, users_30d: 10, users_90d: 20, users_1y: 30 },
      storage: 1234567890,
    },
    ...overrides,
  };
}

function mockFetch(opts: { detail?: Record<string, unknown>; notFound?: boolean; manifest?: any; manifestOk?: boolean; ratingOk?: boolean } = {}) {
  (global.fetch as any).mockImplementation((url: string) => {
    if (url.includes('/v3/apps/detail')) {
      if (opts.notFound) {
        return Promise.resolve({ status: 404, ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDetail(opts.detail)) });
    }
    if (url.includes('/pwa_listing')) {
      if (opts.manifestOk === false) {
        return Promise.resolve({ status: 401, ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.manifest ?? null) });
    }
    if (url.includes('/v3/apps/rating')) {
      return Promise.resolve({ ok: opts.ratingOk !== false, status: opts.ratingOk === false ? 401 : 200, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

function fakeJwt(username: string, expires = '2099-01-01T00:00:00Z'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' })).replace(/=+$/, '');
  const payload = btoa(JSON.stringify({ username, expires })).replace(/=+$/, '');
  return `${header}.${payload}.sig`;
}

function setTokenCookie(username: string) {
  document.cookie = `token=${fakeJwt(username)};path=/`;
}

describe('AppDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    document.cookie = 'token=;path=/;max-age=-1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'token=;path=/;max-age=-1';
  });

  it('shows skeleton while loading', async () => {
    (global.fetch as any).mockReturnValue(new Promise(() => {}));
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    expect(screen.getByRole('link', { name: /back to app store/i })).toBeInTheDocument();
  });

  it('fetches the detail endpoint with the URL-decoded app url', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toBeInTheDocument();
    });
    const detailCall = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/v3/apps/detail'));
    expect(detailCall).toBeTruthy();
    expect(detailCall[0]).toContain(`/v3/apps/detail?url=${encodeURIComponent('https://test.web10.app/')}`);
  });

  it('renders app name, description, and the metric breakdown', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toHaveTextContent('Test App');
    });
    expect(screen.getByTestId('app-detail-description')).toHaveTextContent('A wonderful test app.');
    const metrics = screen.getByTestId('metrics-section');
    expect(metrics).toHaveTextContent('1,337');
    expect(metrics).toHaveTextContent('128');
    expect(metrics).toHaveTextContent('301');
    expect(metrics).toHaveTextContent('512');
    expect(metrics).toHaveTextContent('4');
    expect(metrics).toHaveTextContent('users · 30d');
    expect(metrics).toHaveTextContent('visits');
  });

  it('prefers the PWA manifest for name and description', async () => {
    mockFetch({ manifest: { name: 'Manifest Name', description: 'From the manifest.', icons: [] } });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toHaveTextContent('Manifest Name');
    });
    expect(screen.getByTestId('app-detail-description')).toHaveTextContent('From the manifest.');
  });

  it('renders the rating summary and the review list with comments', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('rating-summary')).toBeInTheDocument();
    });
    expect(screen.getByTestId('rating-summary')).toHaveTextContent('4.5');
    expect(screen.getByTestId('rating-summary')).toHaveTextContent('2 ratings');
    const list = screen.getByTestId('rating-list');
    expect(list).toHaveTextContent('alice');
    expect(list).toHaveTextContent('fast.');
    expect(list).toHaveTextContent('bob');
  });

  it('renders the no-reviews empty state', async () => {
    mockFetch({ detail: { rating: { average: null, count: 0 }, ratings: [] } });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('no-reviews')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rating-summary')).not.toBeInTheDocument();
  });

  it('shows the sign-in card when signed out', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('sign-in-to-rate')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rate-form')).not.toBeInTheDocument();
  });

  it('shows the rate form when the token cookie is present', async () => {
    setTokenCookie('alice');
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('rate-form')).toBeInTheDocument();
    });
    expect(screen.getByTestId('rate-form')).toHaveTextContent('as alice');
  });

  it('submits a rating with stars and comment to /v3/apps/rating', async () => {
    setTokenCookie('alice');
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('rate-form')).toBeInTheDocument();
    });

    // no stars yet — submit is disabled
    expect(screen.getByTestId('submit-rating')).toBeDisabled();

    fireEvent.click(screen.getByTestId('star-5'));
    fireEvent.change(screen.getByTestId('review-comment'), { target: { value: 'fast.' } });
    expect(screen.getByTestId('submit-rating')).toBeEnabled();
    fireEvent.click(screen.getByTestId('submit-rating'));

    await waitFor(() => {
      expect(screen.getByTestId('rating-success')).toBeInTheDocument();
    });
    const ratingCall = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/v3/apps/rating'));
    expect(ratingCall).toBeTruthy();
    const body = JSON.parse(ratingCall[1].body);
    expect(body.token).toBe(fakeJwt('alice'));
    expect(body.body).toEqual({ target_app_id: 'https://test.web10.app/', rating: 5, comment: 'fast.' });
  });

  it('shows the node context line', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('node-context')).toBeInTheDocument();
    });
    expect(screen.getByTestId('node-context')).toHaveTextContent('579 members');
    expect(screen.getByTestId('node-context')).toHaveTextContent('12 apps');
  });

  it('renders Open button with correct href', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      const btn = screen.getByTestId('open-app-button');
      expect(btn).toHaveAttribute('href', 'https://test.web10.app/');
      expect(btn).toHaveAttribute('target', '_blank');
    });
  });

  it('renders 404 state on 404 response', async () => {
    mockFetch({ notFound: true });
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
    mockFetch({ detail: { screenshots: ['https://test.web10.app/ss1.png', 'https://test.web10.app/ss2.png'] } });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('screenshots-section')).toBeInTheDocument();
    });
    const imgs = screen.getByTestId('screenshots-section').querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('src', 'https://test.web10.app/ss1.png');
  });

  it('does not render screenshots section when empty', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('screenshots-section')).not.toBeInTheDocument();
  });

  it('renders fallback letter when no icon', async () => {
    mockFetch({ detail: { icon_url: '' }, manifestOk: false });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByText('T')).toBeInTheDocument();
    });
  });

  it('renders back to App Store link', async () => {
    mockFetch();
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('back-to-store')).toHaveAttribute('href', '/app-store');
    });
  });

  it('does not render description when empty', async () => {
    mockFetch({ detail: { description: '' }, manifestOk: false });
    const { default: AppDetail } = await import('@/pages/AppDetail');
    renderWithRouter(<AppDetail />);
    await waitFor(() => {
      expect(screen.getByTestId('app-detail-name')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('app-detail-description')).not.toBeInTheDocument();
  });
});
