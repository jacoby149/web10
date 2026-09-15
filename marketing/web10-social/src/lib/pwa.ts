// PWA install-prompt management (D72, pwa.md).
//
// The browser fires `beforeinstallprompt` (Chrome/Edge, desktop + Android)
// once the PWA meets the installability bar — which requires the functioning
// service worker (public/serviceWorker.js). We intercept that event, stash it,
// and decide WHEN to surface the install surface — because the moment matters
// more than the mechanism. The prompt fires at the moment of value (Shorts on
// a phone, a follow), never on a timer, never a modal wall.
//
// iOS is the special case: Safari does not fire `beforeinstallprompt` (install
// is Share → "Add to Home Screen", not triggerable in code). On iOS the surface
// shows instructions instead of a button that does nothing.
//
// The D56 line: the "shown" / "installed" events are content-free GA4 actions —
// a count + the trigger context (shorts / engagement / manual). No user content.

import { useCallback, useEffect, useState } from 'react';
import { trackEvent } from './analytics';

export type InstallPromptTrigger = 'shorts' | 'engagement' | 'manual';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'w10-pwa-dismissed';
/** The window event that makes the mounted <InstallPrompt> surface appear. */
export const INSTALL_PROMPT_EVENT = 'w10-install-prompt';

// ── Module-level singleton state ──────────────────────────────────────────────
// Lives outside React so requestInstallPrompt() (called from any screen) can
// read the live installability state, and so the beforeinstallprompt event is
// captured as soon as the module is imported — not only while a hook is mounted.

let storedEvent: BeforeInstallPromptEvent | null = null;
let installed = false;
let canInstall = false;
let initialized = false;
const listeners = new Set<(v: boolean) => void>();
let onBeforeInstall: ((e: Event) => void) | null = null;
let onAppInstalled: (() => void) | null = null;

function emitCanInstall(v: boolean): void {
  canInstall = v;
  listeners.forEach((fn) => fn(v));
}

/**
 * Detect an iPhone/iPad. iPadOS 13+ reports `platform === 'MacIntel'` with a
 * user-agent that says "Macintosh" — the `maxTouchPoints > 1` check is the
 * tell that distinguishes a touch iPad from a real Mac.
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPadOS =
    navigator.platform === 'MacIntel' &&
    (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

/**
 * True on a phone-width viewport (the automatic install triggers are mobile-
 * only — a desktop user gets the explicit "Install app" affordance, not a nag).
 * Reads the live matchMedia so it tracks resizes; safe in jsdom (no matchMedia
 * → false).
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

function isDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode / storage disabled — the dismissal just won't persist.
  }
}

/** Idempotently wire the beforeinstallprompt / appinstalled listeners. */
function ensureInitialized(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  onBeforeInstall = (e) => {
    // Suppress the browser's built-in install UI — we surface our own at the
    // moment of value. Stash the event so promptInstall() can fire it later.
    e.preventDefault();
    storedEvent = e as BeforeInstallPromptEvent;
    emitCanInstall(true);
  };
  onAppInstalled = () => {
    installed = true;
    storedEvent = null;
    emitCanInstall(false);
    trackEvent('pwa_installed');
  };
  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onAppInstalled);
}

/**
 * Test-only: tear down the listeners and reset all module state so each test
 * starts from a clean slate. Never called in production.
 */
export function __resetPwaForTests(): void {
  if (typeof window !== 'undefined') {
    if (onBeforeInstall) window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    if (onAppInstalled) window.removeEventListener('appinstalled', onAppInstalled);
  }
  onBeforeInstall = null;
  onAppInstalled = null;
  storedEvent = null;
  installed = false;
  canInstall = false;
  initialized = false;
  listeners.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DISMISS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Request the install surface be shown. Dispatches INSTALL_PROMPT_EVENT, which
 * the <InstallPrompt> mounted in App listens for. No-op when the PWA isn't
 * installable (no beforeinstallprompt fired, and not iOS) or already dismissed
 * or installed. Tracks the content-free pwa_install_prompt_shown event.
 */
export function requestInstallPrompt(trigger: InstallPromptTrigger): void {
  ensureInitialized();
  if (typeof window === 'undefined') return;
  if (installed) return;
  if (isDismissed()) return;
  if (!canInstall && !isIOSDevice()) return;
  trackEvent('pwa_install_prompt_shown', { trigger });
  window.dispatchEvent(new CustomEvent(INSTALL_PROMPT_EVENT, { detail: { trigger } }));
}

/**
 * The install-prompt state, for the <InstallPrompt> surface.
 *
 * - `canInstall` — beforeinstallprompt fired and hasn't been consumed
 *   (Chrome/Android/desktop with a functioning SW).
 * - `isIOS` — the device is an iPhone/iPad (show Share → Add instructions).
 * - `promptInstall()` — fire the stashed browser prompt; returns the outcome.
 * - `dismiss()` — remember the dismissal so it never re-nags.
 */
export function useInstallPrompt() {
  const [installable, setInstallable] = useState(canInstall);
  const [ios] = useState(isIOSDevice());

  useEffect(() => {
    ensureInitialized();
    const fn = (v: boolean) => setInstallable(v);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!storedEvent) return 'unavailable';
    try {
      await storedEvent.prompt();
      const choice = await storedEvent.userChoice;
      if (choice.outcome === 'accepted') {
        // appinstalled will also fire; clear the stashed event now so a second
        // tap can't re-prompt.
        storedEvent = null;
        emitCanInstall(false);
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed();
  }, []);

  return { canInstall: installable, isIOS: ios, promptInstall, dismiss };
}
