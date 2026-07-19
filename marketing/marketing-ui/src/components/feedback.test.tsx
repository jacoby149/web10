import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when no error', async () => {
    const { ErrorBoundary } = await import('@/components/ErrorBoundary');
    render(
      <ErrorBoundary fallback={() => <div>Error fallback</div>}>
        <div>Happy path</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Happy path')).toBeInTheDocument();
  });

  it('renders fallback when child throws', async () => {
    const { ErrorBoundary } = await import('@/components/ErrorBoundary');
    const ThrowChild = () => {
      throw new Error('boom');
    };
    render(
      <ErrorBoundary fallback={() => <div data-testid="error-fallback">Something went wrong</div>}>
        <ThrowChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
  });

  it('provides error info to fallback', async () => {
    const { ErrorBoundary } = await import('@/components/ErrorBoundary');
    const ThrowChild = () => {
      throw new Error('test-error');
    };
    const Fallback = ({ error, stackTrace }: { error: Error; stackTrace: string | null }) => (
      <div data-testid="error-info">{error.message}</div>
    );
    render(
      <ErrorBoundary fallback={Fallback}>
        <ThrowChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-info')).toHaveTextContent('test-error');
  });
});

describe('ReportBug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders bug report form with button trigger', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    render(<ReportBug trigger="button" onClose={() => {}} />);
    expect(screen.getByText('Report a bug')).toBeInTheDocument();
    expect(screen.getByTestId('report-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('report-input')).toBeInTheDocument();
  });

  it('renders error boundary message for error-boundary trigger', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    render(<ReportBug trigger="error-boundary" onClose={() => {}} />);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(screen.getByText(/The app crashed/)).toBeInTheDocument();
  });

  it('disables send button when message is empty', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    render(<ReportBug trigger="button" onClose={() => {}} />);
    const sendBtn = screen.getByRole('button', { name: /send report/i });
    expect(sendBtn).toBeDisabled();
  });

  it('enables send button when message is entered', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Something is broken' },
    });
    const sendBtn = screen.getByRole('button', { name: /send report/i });
    expect(sendBtn).not.toBeDisabled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    const onClose = vi.fn();
    render(<ReportBug trigger="button" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits feedback to marketing-api', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Test bug report' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/feedback'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Test bug report'),
        }),
      );
    });
  });

  it('shows success state after sending', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Test bug report' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => {
      expect(screen.getByText(/Thanks for the report/)).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    const { ReportBug } = await import('@/components/ReportBug');
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Test bug report' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => {
      expect(screen.getByText('network error')).toBeInTheDocument();
    });
  });
});