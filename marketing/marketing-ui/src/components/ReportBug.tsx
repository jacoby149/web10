import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useErrorBoundaryContext } from './ErrorBoundary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';

const MARKETING_API =
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('marketing_api')) ||
  (import.meta.env?.VITE_MARKETING_API || 'http://marketing-api.localhost');
const APP_NAME = 'marketing-ui';
const APP_VERSION = import.meta.env?.VITE_GIT_COMMIT || '0.1.0';

const consoleErrors: string[] = [];
const origError = console.error.bind(console.error);
const origWarn = console.warn.bind(console.warn);
console.error = (...args: unknown[]) => {
  origError(...args);
  consoleErrors.push(args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
  if (consoleErrors.length > 50) consoleErrors.splice(0, consoleErrors.length - 50);
};
console.warn = (...args: unknown[]) => {
  origWarn(...args);
  consoleErrors.push('WARN: ' + args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
  if (consoleErrors.length > 50) consoleErrors.splice(0, consoleErrors.length - 50);
};

interface ReportBugProps {
  trigger: 'button' | 'error-boundary';
  onClose: () => void;
}

export function ReportBug({ trigger, onClose }: ReportBugProps) {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { stackTrace } = useErrorBoundaryContext();

  useEffect(() => {
    if (trigger === 'error-boundary') {
      setMessage('Something broke on this page. Details captured automatically.');
    }
  }, [trigger]);

  const sendReport = useCallback(async () => {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${MARKETING_API}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          contact: contact.trim() || undefined,
          app: APP_NAME,
          route: window.location.pathname + window.location.search,
          version: APP_VERSION,
          user_agent: navigator.userAgent,
          console_errors: consoleErrors.slice(-20),
          stack_trace: stackTrace,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send report');
      setSending(false);
    }
  }, [message, contact, stackTrace]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (sent) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-2">
            <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
            <h2 className="font-display text-lg font-medium">Thanks for the report</h2>
            <p className="text-sm text-muted-foreground">
              We'll look into it. Your feedback helps make web10 better.
            </p>
            <Button variant="outline" className="mt-2 w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{trigger === 'error-boundary' ? 'Something broke' : 'Report a bug'}</DialogTitle>
          {trigger === 'error-boundary' && (
            <DialogDescription className="rounded-md border border-danger-muted bg-danger-muted/40 px-3 py-2 text-danger">
              The app crashed. Your report will include the crash details automatically.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-message">
              What happened? <span className="text-muted-foreground">(required)</span>
            </Label>
            <Textarea
              id="report-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe what you were doing when the bug occurred..."
              data-testid="report-textarea"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-contact">
              Contact <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="report-contact"
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="email or username"
              data-testid="report-input"
            />
          </div>

          {stackTrace && (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Crash details (auto-captured)
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-elevated p-2 font-mono text-[11px] text-muted-foreground">
                {stackTrace}
              </pre>
            </details>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={sendReport} disabled={sending || !message.trim()}>
            {sending ? 'Sending...' : 'Send Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
