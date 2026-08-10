import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Bug, Send, X, CheckCircle, Camera } from 'lucide-react';
import { useErrorBoundaryContext } from '@/components/shared/ErrorBoundary';
import { API_ORIGIN } from '@/lib/origins';

const APP_NAME = 'web10-social';
const APP_VERSION = import.meta.env?.VITE_GIT_COMMIT || '0.1.0';

function getApiUrl(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) {
    return 'http://api.localhost';
  }
  return API_ORIGIN;
}

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
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const { stackTrace } = useErrorBoundaryContext();

  useEffect(() => {
    if (trigger === 'error-boundary') {
      setMessage('Something broke on this page. Details captured automatically.');
    }
  }, [trigger]);

  const handleScreenshot = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const canvas = document.createElement('canvas');
      const video = document.createElement('video');
      video.srcObject = stream;
      await new Promise<void>(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });
      // Wait a frame for the screenshot
      await new Promise(resolve => setTimeout(resolve, 300));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      track.stop();
      stream.stop();
      if (screenshots.length < 5) {
        setScreenshots(prev => [...prev, dataUrl]);
      }
    } catch {
      // User cancelled or permission denied — no-op
    }
  }, [screenshots.length]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob && screenshots.length < 5) {
          const reader = new FileReader();
          reader.onload = () => {
            setScreenshots(prev => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(blob);
        }
        break;
      }
    }
  }, [screenshots.length]);

  const sendReport = useCallback(async () => {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/bug_report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: message.trim(),
          email: contact.trim() || undefined,
          page_url: window.location.pathname + window.location.search,
          app_version: APP_VERSION,
          device_info: navigator.userAgent,
          error_message: stackTrace || '',
          screenshots: screenshots,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send report');
      setSending(false);
    }
  }, [message, contact, stackTrace, screenshots]);

  if (sent) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-overlay-in"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-card border border-border rounded-lg p-6 space-y-4 animate-panel-in"
          onClick={e => e.stopPropagation()}
          data-testid="report-bug-dialog"
        >
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-success/10">
            <CheckCircle className="w-6 h-6 text-success" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground text-center">Thanks for the report</h3>
          <p className="text-sm text-muted-foreground text-center">
            We'll look into it. Your feedback helps make web10 better.
          </p>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-lg p-6 space-y-4 animate-panel-in"
        onClick={e => e.stopPropagation()}
        data-testid="report-bug-dialog"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {trigger === 'error-boundary' ? (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            ) : (
              <Bug className="w-5 h-5 text-muted-foreground" />
            )}
            <h3 className="font-display text-lg font-semibold text-foreground">
              {trigger === 'error-boundary' ? 'Something broke' : 'Report a bug'}
            </h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" data-testid="report-bug-close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {trigger === 'error-boundary' && (
          <div className="p-3 rounded-sm bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            The app crashed. Your report will include the crash details automatically.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              What happened? <span className="text-muted-foreground text-xs">(required)</span>
            </label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onPaste={handlePaste}
              placeholder="Describe what you were doing when the bug occurred..."
              rows={4}
              className="resize-none"
              data-testid="report-textarea"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Contact <span className="text-muted-foreground text-xs">(optional)</span>
            </label>
            <Input
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="email or username"
              type="text"
              data-testid="report-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Screenshots <span className="text-muted-foreground text-xs">(optional, up to 5)</span>
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleScreenshot}
                disabled={screenshots.length >= 5}
                data-testid="report-screenshot-btn"
              >
                <Camera className="w-3.5 h-3.5" />
                Capture screen
              </Button>
              <span className="text-xs text-muted-foreground self-center">
                or paste images here
              </span>
            </div>
            {screenshots.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {screenshots.map((s, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={s}
                      alt={`Screenshot ${i + 1}`}
                      className="w-20 h-20 object-cover rounded border border-border"
                    />
                    <button
                      onClick={() => setScreenshots(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove screenshot ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {stackTrace && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Crash details (auto-captured)
            </summary>
            <pre className="mt-2 p-2 rounded-sm bg-elevated/50 overflow-x-auto whitespace-pre-wrap font-mono text-[10px]">
              {stackTrace}
            </pre>
          </details>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            className="flex-1 gap-2"
            onClick={sendReport}
            disabled={sending || !message.trim()}
            data-testid="report-bug-submit"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send Report'}
          </Button>
        </div>
      </div>
    </div>
  );
}