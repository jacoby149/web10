import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errorMessage';

export { errorMessage };

// ── Toast — the app-wide transient error/success surface ─────────────────────
// One idiom for every user-initiated action that can fail (like, follow, send,
// delete, save, …). Before this, those failures were swallowed (console only)
// or hard-coded — the user got no signal that anything went wrong. Now a
// failure fires a toast that carries the API's real reason (the SDK's
// Web10Error.message is the API's `detail`), auto-dismisses, and is dismissible.
//
// The bus is module-level (the p2p.ts / notifications.ts listener-set idiom)
// so any component can fire a toast without prop-drilling a provider. The
// <Toaster/> is mounted once in App.tsx (inside the ErrorBoundary) and renders
// the active toasts. Transient by design — these are "couldn't like post, try
// again" nudges, not persistent state, so they're not in the URL (the deep-link
// rule is for screen state, not transient feedback).

export type ToastKind = 'error' | 'success' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (t: ToastItem) => void;

let listeners: Set<Listener> = new Set();
let nextId = 1;

function emit(kind: ToastKind, message: string): void {
  const item: ToastItem = { id: nextId++, kind, message };
  listeners.forEach((l) => l(item));
}

/** Fire a transient toast. Call from any user-initiated action's catch. */
export const toast = {
  error: (message: string) => emit('error', message),
  success: (message: string) => emit('success', message),
  info: (message: string) => emit('info', message),
};

const ICONS = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

const KIND_STYLES: Record<ToastKind, string> = {
  error: 'border-danger/40 bg-danger-muted/80 text-danger',
  success: 'border-success/40 bg-success/10 text-success',
  info: 'border-border bg-elevated text-foreground',
};

const AUTO_DISMISS_MS = 4000;

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  // Auto-dismiss; a hover pauses it (the user is reading).
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [paused, item.id, onDismiss]);

  const Icon = ICONS[item.kind];
  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      data-testid={`toast-${item.kind}`}
      data-toast-id={item.id}
      className={cn(
        'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg',
        'animate-panel-in backdrop-blur-sm',
        KIND_STYLES[item.kind],
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <span className="min-w-0 flex-1 break-words text-sm leading-snug">{item.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="toast-dismiss"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * The toast viewport. Mount once at the app root. Renders active toasts in a
 * fixed bottom-center column (above the mobile tab bar), newest last.
 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (item) => {
      setItems((prev) => [...prev.slice(-2), item]); // cap at 3 visible
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  if (items.length === 0) return null;

  return (
    <div
      data-testid="toaster"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}
