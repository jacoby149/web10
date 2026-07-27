import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, variant, size, className, disabled, onClick, ...props }: Record<string, any>) => (
    <button
      data-variant={variant}
      data-size={size}
      className={className}
      disabled={disabled}
      onClick={onClick as (() => void) | undefined}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, rows, className }: Record<string, any>) => (
    <textarea
      data-testid="report-textarea"
      value={value as string}
      onChange={onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
      placeholder={placeholder}
      rows={rows as number}
      className={className}
    />
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, type }: Record<string, any>) => (
    <input
      data-testid="report-input"
      value={value as string}
      onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
      placeholder={placeholder}
      type={type as string}
    />
  ),
}));

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when no error', async () => {
    const { ErrorBoundary } = await import('@/components/shared/ErrorBoundary');
    render(
      <ErrorBoundary fallback={() => <div>Error fallback</div>}>
        <div>Happy path</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Happy path')).toBeInTheDocument();
  });

  it('renders fallback when child throws', async () => {
    const { ErrorBoundary } = await import('@/components/shared/ErrorBoundary');
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
    const { ErrorBoundary } = await import('@/components/shared/ErrorBoundary');
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
    const { ReportBug } = await import('@/components/shared/ReportBug');
    const onClose = vi.fn();
    render(<ReportBug trigger="button" onClose={onClose} />);
    expect(screen.getByText('Report a bug')).toBeInTheDocument();
    expect(screen.getByTestId('report-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('report-input')).toBeInTheDocument();
  });

  it('renders error boundary message for error-boundary trigger', async () => {
    const { ReportBug } = await import('@/components/shared/ReportBug');
    render(<ReportBug trigger="error-boundary" onClose={() => {}} />);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(screen.getByText(/The app crashed/)).toBeInTheDocument();
  });

  it('disables send button when message is empty', async () => {
    const { ReportBug } = await import('@/components/shared/ReportBug');
    render(<ReportBug trigger="button" onClose={() => {}} />);
    const sendBtn = screen.getByRole('button', { name: /send report/i });
    expect(sendBtn).toBeDisabled();
  });

  it('enables send button when message is entered', async () => {
    const { ReportBug } = await import('@/components/shared/ReportBug');
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Something is broken' },
    });
    const sendBtn = screen.getByRole('button', { name: /send report/i });
    expect(sendBtn).not.toBeDisabled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const { ReportBug } = await import('@/components/shared/ReportBug');
    const onClose = vi.fn();
    render(<ReportBug trigger="button" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits feedback to marketing-api', async () => {
    const { ReportBug } = await import('@/components/shared/ReportBug');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Test bug report' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
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
    const { ReportBug } = await import('@/components/shared/ReportBug');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Test bug report' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Thanks for the report/)).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    const { ReportBug } = await import('@/components/shared/ReportBug');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    render(<ReportBug trigger="button" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('report-textarea'), {
      target: { value: 'Test bug report' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('network error')).toBeInTheDocument();
    });
  });
});