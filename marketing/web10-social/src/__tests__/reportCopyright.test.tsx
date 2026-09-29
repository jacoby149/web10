import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

describe('ReportCopyright', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the designated agent email + compose affordance', async () => {
    const { ReportCopyright, COPYRIGHT_EMAIL } = await import('@/components/shared/ReportCopyright');
    render(<ReportCopyright postUrl="https://web10.app/u/alice/p/1" onClose={() => {}} />);
    expect(screen.getByText('Report copyright')).toBeInTheDocument();
    expect(screen.getByTestId('report-copyright-email')).toHaveTextContent(COPYRIGHT_EMAIL);
    expect(screen.getByTestId('report-copyright-compose')).toBeInTheDocument();
  });

  it('composes a mailto with the post link + author in the body', async () => {
    const { ReportCopyright, COPYRIGHT_EMAIL } = await import('@/components/shared/ReportCopyright');
    const hrefSetter = vi.fn();
    const originalHref = window.location.href;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, set href(v: string) { hrefSetter(v); } },
    });
    try {
      render(
        <ReportCopyright
          postUrl="https://web10.app/u/alice/p/1"
          postAuthor="Alice"
          onClose={() => {}}
        />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId('report-copyright-compose'));
      });
      expect(hrefSetter).toHaveBeenCalledTimes(1);
      const mailto = hrefSetter.mock.calls[0][0] as string;
      expect(mailto.startsWith(`mailto:${COPYRIGHT_EMAIL}?`)).toBe(true);
      // The subject + body are URL-encoded; decode and assert the post link +
      // author ride along so the operator can find the content.
      expect(decodeURIComponent(mailto)).toContain('https://web10.app/u/alice/p/1');
      expect(decodeURIComponent(mailto)).toContain('Author: Alice');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, href: originalHref } });
    }
  });

  it('falls back to the current page when no post is passed (the Settings entry point)', async () => {
    const { ReportCopyright, COPYRIGHT_EMAIL } = await import('@/components/shared/ReportCopyright');
    const hrefSetter = vi.fn();
    const originalHref = window.location.href;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        origin: 'https://web10.app',
        pathname: '/settings',
        search: '',
        set href(v: string) { hrefSetter(v); },
      },
    });
    try {
      render(<ReportCopyright onClose={() => {}} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('report-copyright-compose'));
      });
      const mailto = hrefSetter.mock.calls[0][0] as string;
      expect(mailto.startsWith(`mailto:${COPYRIGHT_EMAIL}?`)).toBe(true);
      expect(decodeURIComponent(mailto)).toContain('https://web10.app/settings');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, href: originalHref } });
    }
  });

  it('calls onClose when cancel is clicked', async () => {
    const { ReportCopyright } = await import('@/components/shared/ReportCopyright');
    const onClose = vi.fn();
    render(<ReportCopyright postUrl="https://web10.app/u/alice/p/1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', async () => {
    const { ReportCopyright } = await import('@/components/shared/ReportCopyright');
    const onClose = vi.fn();
    render(<ReportCopyright postUrl="https://web10.app/u/alice/p/1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('report-copyright-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
