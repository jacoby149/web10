import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('Exporter /import page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the headline', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByText('Bring your social life to web10.')).toBeInTheDocument();
  });

  it('renders the subtitle', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByText(/Export your posts, photos, comments, and contacts/)).toBeInTheDocument();
  });

  it('renders the overline', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByText('Import Your Life')).toBeInTheDocument();
  });

  it('renders five platform export buttons', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-platform-facebook')).toBeInTheDocument();
    expect(screen.getByTestId('import-platform-youtube')).toBeInTheDocument();
    expect(screen.getByTestId('import-platform-x')).toBeInTheDocument();
    expect(screen.getByTestId('import-platform-instagram')).toBeInTheDocument();
    expect(screen.getByTestId('import-platform-tiktok')).toBeInTheDocument();
  });

  it('platform buttons open in new tab', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    for (const platform of ['facebook', 'youtube', 'x', 'instagram', 'tiktok']) {
      const btn = screen.getByTestId(`import-platform-${platform}`);
      expect(btn).toHaveAttribute('target', '_blank');
      expect(btn).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('Facebook button links to Facebook data export page', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-platform-facebook')).toHaveAttribute(
      'href',
      'https://www.facebook.com/help/2128567812917891',
    );
  });

  it('YouTube button links to Google Takeout', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-platform-youtube')).toHaveAttribute(
      'href',
      'https://takeout.google.com/settings/takeout',
    );
  });

  it('X button links to X data export page', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-platform-x')).toHaveAttribute(
      'href',
      expect.stringContaining('help.x.com'),
    );
  });

  it('Instagram button links to Instagram data export page', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-platform-instagram')).toHaveAttribute(
      'href',
      expect.stringContaining('help.instagram.com'),
    );
  });

  it('TikTok button links to TikTok data export page', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-platform-tiktok')).toHaveAttribute(
      'href',
      expect.stringContaining('tiktok.com'),
    );
  });

  it('renders the web10 export note', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-web10-export-note')).toBeInTheDocument();
    expect(
      screen.getByText(/Yes, you can export from your current web10 node and import somewhere else/),
    ).toBeInTheDocument();
  });

  it('renders the full 5-step journey', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByTestId('import-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('import-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('import-step-3')).toBeInTheDocument();
    expect(screen.getByTestId('import-step-4')).toBeInTheDocument();
    expect(screen.getByTestId('import-step-5')).toBeInTheDocument();
  });

  it('step 1 is the export step (no coming soon)', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    const step1 = screen.getByTestId('import-step-1');
    expect(step1).toHaveTextContent('Export your data');
    expect(step1).not.toHaveTextContent('Coming Soon');
  });

  it('steps 2-5 are marked coming soon', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    for (let i = 2; i <= 5; i++) {
      const step = screen.getByTestId(`import-step-${i}`);
      expect(step).toHaveTextContent('Coming Soon');
    }
  });

  it('step 2 is log in to authenticator', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    const step2 = screen.getByTestId('import-step-2');
    expect(step2).toHaveTextContent('Log in to the authenticator');
  });

  it('step 3 is upload the ZIP', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    const step3 = screen.getByTestId('import-step-3');
    expect(step3).toHaveTextContent('Upload the ZIP');
  });

  it('step 4 is we process it', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    const step4 = screen.getByTestId('import-step-4');
    expect(step4).toHaveTextContent('We process it');
  });

  it('step 5 is review and publish', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    const step5 = screen.getByTestId('import-step-5');
    expect(step5).toHaveTextContent('Review & publish');
  });

  it('renders nav links in footer', async () => {
    const { default: Exporter } = await import('@/pages/Exporter');
    render(<Exporter />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trending' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
  });
});