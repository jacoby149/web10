import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const jsonResponse = (body: unknown) => ({
  ok: true,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve(body),
});

describe('DeployStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders nothing when the status feed is absent', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('404'));
    const { default: DeployStatus } = await import('@/components/DeployStatus');
    render(<DeployStatus />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/status.json', expect.anything()));
    expect(screen.queryByTestId('deploy-status')).not.toBeInTheDocument();
  });

  it('renders nothing when the SPA fallback answers with HTML', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);
    const { default: DeployStatus } = await import('@/components/DeployStatus');
    render(<DeployStatus />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('deploy-status')).not.toBeInTheDocument();
  });

  it('shows the version pill and expands to deployment details', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      version: '1.0.95',
      commit: 'c0f4929',
      commitTitle: 'ops: reset Portainer creds',
      deployedAt: '2026-07-22T10:00:00Z',
    }) as unknown as Response);
    const { default: DeployStatus } = await import('@/components/DeployStatus');
    render(<DeployStatus />);

    const toggle = await screen.findByTestId('deploy-status-toggle');
    expect(toggle).toHaveTextContent('v1.0.95');
    expect(screen.queryByTestId('deploy-status-panel')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const panel = screen.getByTestId('deploy-status-panel');
    expect(panel).toHaveTextContent('1.0.95');
    expect(panel).toHaveTextContent('c0f4929');
    expect(screen.getByRole('link', { name: /full status/i })).toHaveAttribute('href', '/status/');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('deploy-status-panel')).not.toBeInTheDocument();
  });

  it('falls back to the commit when the version is unknown', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      version: 'unknown',
      commit: 'c0f4929',
    }) as unknown as Response);
    const { default: DeployStatus } = await import('@/components/DeployStatus');
    render(<DeployStatus />);
    const toggle = await screen.findByTestId('deploy-status-toggle');
    expect(toggle).toHaveTextContent('c0f4929');
  });
});
