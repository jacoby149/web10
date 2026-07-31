import * as React from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'recovery_nudge_dismissed_at';
const DISMISS_MS = 24 * 60 * 60 * 1000; // 24 h

function isDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch { /* quota — ignore */ }
}

interface RecoveryNudgeBannerProps {
  onNavigate: () => void;
  testid?: string;
}

function RecoveryNudgeBanner({ onNavigate, testid = 'recovery-nudge-banner' }: RecoveryNudgeBannerProps) {
  const [hidden, setHidden] = React.useState(isDismissed);

  if (hidden) return null;

  return (
    <div
      data-testid={testid}
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
    >
      <ShieldAlert
        className="mt-0.5 h-5 w-5 shrink-0 text-warning"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Your account is at risk — set a recovery contact now
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Without a recovery phone or email you could lose access to your account
          and all your data permanently.
        </p>
        <button
          type="button"
          onClick={onNavigate}
          data-testid="recovery-nudge-cta"
          className="mt-2 text-sm font-medium text-warning underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          Set recovery contact →
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          dismiss();
          setHidden(true);
        }}
        aria-label="Dismiss"
        data-testid="recovery-nudge-dismiss"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export default RecoveryNudgeBanner;