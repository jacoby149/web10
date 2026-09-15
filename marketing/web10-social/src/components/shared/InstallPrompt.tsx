import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { INSTALL_PROMPT_EVENT, useInstallPrompt } from '@/lib/pwa';

/**
 * The install surface (D72, pwa.md) — one tasteful, dismissible card that
 * appears at the moment of value (Shorts on a phone, a follow), never on a
 * timer, never a modal wall. Mobile: a bottom sheet (the AdPicker idiom).
 * Desktop: a small floating card (the explicit "Install app" affordance's
 * path). iOS: Share → Add to Home Screen instructions (Safari can't be
 * triggered in code).
 *
 * `?pwa-prompt=1` forces the surface open with the Install button — the
 * screenshot-harness affordance (no real beforeinstallprompt in a dev server).
 */
export function InstallPrompt() {
  const { canInstall, isIOS, promptInstall, dismiss } = useInstallPrompt();
  const [open, setOpen] = useState(() => promptParam());

  useEffect(() => {
    const onPrompt = () => setOpen(true);
    window.addEventListener(INSTALL_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(INSTALL_PROMPT_EVENT, onPrompt);
  }, []);

  const forced = open && promptParam() && !canInstall;
  // iOS always shows Share → Add instructions (Safari can't be triggered in
  // code). Otherwise the Install button shows when the PWA is installable
  // (beforeinstallprompt fired) or forced (the ?pwa-prompt=1 screenshot path).
  const showIOSInstructions = isIOS;
  const showInstall = !isIOS && (canInstall || forced);

  const handleClose = useCallback(() => {
    // One dismissible surface, never re-nags (pwa.md): any close remembers it.
    dismiss();
    setOpen(false);
  }, [dismiss]);

  const handleInstall = useCallback(async () => {
    const outcome = await promptInstall();
    if (outcome !== 'accepted') dismiss();
    setOpen(false);
  }, [promptInstall, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-end md:justify-end md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Install web10"
    >
      {/* Backdrop — mobile only (a desktop card doesn't dim the screen). */}
      <div
        className="md:hidden absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-lg md:w-80 rounded-t-lg md:rounded-lg border-t md:border border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.35)]"
        data-testid="install-prompt"
      >
        <div className="flex items-start gap-3">
          <img
            src="/keys-mark.png"
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-base font-medium text-foreground">
              web<span className="text-brand">10</span> social
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {showIOSInstructions ? (
                <>
                  Tap <strong className="text-foreground">Share</strong>, then{' '}
                  <strong className="text-foreground">Add to Home Screen</strong> to
                  install web10 — keep your feed + go offline.
                </>
              ) : (
                'Install to keep your feed + go offline.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Dismiss"
            data-testid="install-prompt-dismiss"
            className="-m-1.5 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showInstall && (
          <Button
            variant="brand"
            size="lg"
            className="mt-4 w-full"
            onClick={handleInstall}
            data-testid="install-prompt-install"
          >
            Install
          </Button>
        )}
        {showIOSInstructions && (
          <Button
            variant="outline"
            size="lg"
            className="mt-4 w-full"
            onClick={handleClose}
            data-testid="install-prompt-done"
          >
            Got it
          </Button>
        )}
      </div>
    </div>
  );
}

function promptParam(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pwa-prompt') === '1';
}
