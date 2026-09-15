import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useInstallPrompt,
  requestInstallPrompt,
  isIOSDevice,
  isMobile,
  INSTALL_PROMPT_EVENT,
  __resetPwaForTests,
} from '@/lib/pwa';

// The D56 line is enforced by the analytics module; here we spy on it so a
// test can assert the content-free event (a count + trigger context) fired.
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));
import { trackEvent } from '@/lib/analytics';

const originalUA = navigator.userAgent;

/** Fire a synthetic beforeinstallprompt (Chrome/Android path). */
function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const evt = new Event('beforeinstallprompt');
  (evt as unknown as { preventDefault: () => void }).preventDefault = vi.fn();
  (evt as unknown as { prompt: () => Promise<void> }).prompt = vi.fn().mockResolvedValue(undefined);
  (evt as unknown as { userChoice: Promise<{ outcome: string; platform: string }> }).userChoice =
    Promise.resolve({ outcome, platform: 'web' });
  window.dispatchEvent(evt);
}

beforeEach(() => {
  __resetPwaForTests();
  vi.mocked(trackEvent).mockClear();
});

afterEach(() => {
  __resetPwaForTests();
  Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true });
});

describe('isIOSDevice', () => {
  it('is false for a desktop user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      configurable: true,
    });
    expect(isIOSDevice()).toBe(false);
  });

  it('is true for an iPhone user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });
    expect(isIOSDevice()).toBe(true);
  });
});

describe('isMobile', () => {
  it('is false when matchMedia is unavailable (jsdom)', () => {
    // jsdom does not implement matchMedia — the guard returns false.
    expect(isMobile()).toBe(false);
  });
});

describe('requestInstallPrompt', () => {
  it('is a no-op when the PWA is not installable (no beforeinstallprompt, not iOS)', () => {
    const onPrompt = vi.fn();
    window.addEventListener(INSTALL_PROMPT_EVENT, onPrompt);
    requestInstallPrompt('shorts');
    expect(onPrompt).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
    window.removeEventListener(INSTALL_PROMPT_EVENT, onPrompt);
  });

  it('dispatches the prompt event + tracks the content-free event when installable', () => {
    // The first call wires the beforeinstallprompt listener (a no-op while
    // not yet installable).
    requestInstallPrompt('shorts');
    act(() => fireBeforeInstallPrompt());
    const onPrompt = vi.fn();
    window.addEventListener(INSTALL_PROMPT_EVENT, onPrompt);
    requestInstallPrompt('shorts');
    expect(onPrompt).toHaveBeenCalledTimes(1);
    // D56: a count + the trigger context — no user content.
    expect(trackEvent).toHaveBeenCalledWith('pwa_install_prompt_shown', { trigger: 'shorts' });
    window.removeEventListener(INSTALL_PROMPT_EVENT, onPrompt);
  });

  it('is a no-op once the user has dismissed it', () => {
    requestInstallPrompt('shorts');
    act(() => fireBeforeInstallPrompt());
    localStorage.setItem('w10-pwa-dismissed', '1');
    const onPrompt = vi.fn();
    window.addEventListener(INSTALL_PROMPT_EVENT, onPrompt);
    requestInstallPrompt('shorts');
    expect(onPrompt).not.toHaveBeenCalled();
    window.removeEventListener(INSTALL_PROMPT_EVENT, onPrompt);
  });

  it('is a no-op once the app is installed', () => {
    requestInstallPrompt('shorts');
    act(() => fireBeforeInstallPrompt());
    act(() => window.dispatchEvent(new Event('appinstalled')));
    const onPrompt = vi.fn();
    window.addEventListener(INSTALL_PROMPT_EVENT, onPrompt);
    requestInstallPrompt('shorts');
    expect(onPrompt).not.toHaveBeenCalled();
    window.removeEventListener(INSTALL_PROMPT_EVENT, onPrompt);
  });
});

describe('useInstallPrompt', () => {
  it('reports canInstall=false until beforeinstallprompt fires', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
    act(() => fireBeforeInstallPrompt());
    expect(result.current.canInstall).toBe(true);
  });

  it('promptInstall fires the stashed prompt and returns the outcome', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => fireBeforeInstallPrompt('accepted'));
    let outcome: 'accepted' | 'dismissed' | 'unavailable' | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe('accepted');
    // An accepted install flips canInstall back to false (the prompt is done).
    expect(result.current.canInstall).toBe(false);
  });

  it('promptInstall is unavailable when no prompt was captured', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let outcome: 'accepted' | 'dismissed' | 'unavailable' | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe('unavailable');
  });

  it('dismiss persists to localStorage so it never re-nags', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => result.current.dismiss());
    expect(localStorage.getItem('w10-pwa-dismissed')).toBe('1');
  });
});
