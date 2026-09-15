import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
// lucideMock must be imported BEFORE InstallPrompt (which transitively imports
// lucide-react) so the hoisted vi.mock factory can reference it.
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);
// The D56 line is enforced by the analytics module; spy on it (no real gtag).
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { __resetPwaForTests, INSTALL_PROMPT_EVENT } from '@/lib/pwa';

const originalUA = navigator.userAgent;

function fireBeforeInstallPrompt() {
  const evt = new Event('beforeinstallprompt');
  (evt as unknown as { preventDefault: () => void }).preventDefault = vi.fn();
  (evt as unknown as { prompt: () => Promise<void> }).prompt = vi.fn().mockResolvedValue(undefined);
  (evt as unknown as { userChoice: Promise<{ outcome: string; platform: string }> }).userChoice =
    Promise.resolve({ outcome: 'accepted', platform: 'web' });
  window.dispatchEvent(evt);
}

beforeEach(() => {
  __resetPwaForTests();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
  __resetPwaForTests();
  window.history.pushState({}, '', '/');
  Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true });
});

describe('InstallPrompt', () => {
  it('renders nothing when not triggered', () => {
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).not.toBeInTheDocument();
  });

  it('shows the Install button when forced via ?pwa-prompt=1', () => {
    window.history.pushState({}, '', '/?pwa-prompt=1');
    render(<InstallPrompt />);
    expect(screen.getByTestId('install-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('install-prompt-install')).toBeInTheDocument();
  });

  it('opens with the Install button when installable + a trigger fires', () => {
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).not.toBeInTheDocument();
    // The PWA becomes installable (beforeinstallprompt fires).
    act(() => fireBeforeInstallPrompt());
    // A trigger fires (Shorts / follow / manual).
    act(() => window.dispatchEvent(new CustomEvent(INSTALL_PROMPT_EVENT)));
    expect(screen.getByTestId('install-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('install-prompt-install')).toBeInTheDocument();
  });

  it('dismiss remembers the dismissal and closes the surface', () => {
    window.history.pushState({}, '', '/?pwa-prompt=1');
    render(<InstallPrompt />);
    fireEvent.click(screen.getByTestId('install-prompt-dismiss'));
    expect(screen.queryByTestId('install-prompt')).not.toBeInTheDocument();
    expect(localStorage.getItem('w10-pwa-dismissed')).toBe('1');
  });

  it('closes (and remembers) when the backdrop is tapped', () => {
    window.history.pushState({}, '', '/?pwa-prompt=1');
    render(<InstallPrompt />);
    // The backdrop is the dialog's first child (the dimmed layer).
    const dialog = screen.getByTestId('install-prompt').parentElement as HTMLElement;
    const backdrop = dialog.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByTestId('install-prompt')).not.toBeInTheDocument();
    expect(localStorage.getItem('w10-pwa-dismissed')).toBe('1');
  });

  it('shows iOS instructions (not the Install button) on an iPhone', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });
    window.history.pushState({}, '', '/?pwa-prompt=1');
    render(<InstallPrompt />);
    expect(screen.getByTestId('install-prompt')).toBeInTheDocument();
    // iOS: no Install button — a "Got it" button + the Share instructions.
    expect(screen.queryByTestId('install-prompt-install')).not.toBeInTheDocument();
    expect(screen.getByTestId('install-prompt-done')).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });
});
