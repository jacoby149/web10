import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, Camera } from 'lucide-react';
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

const APP_VERSION = import.meta.env?.VITE_GIT_COMMIT || '0.1.0';

function getApiUrl(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) {
    return 'http://api.localhost';
  }
  return import.meta.env?.VITE_API_ORIGIN || 'https://api.web10.app';
}

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
      await new Promise(resolve => setTimeout(resolve, 300));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      stream.getTracks().forEach(t => t.stop());
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
              onPaste={handlePaste}
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

          <div className="flex flex-col gap-1.5">
            <Label>
              Screenshots <span className="text-muted-foreground">(optional, up to 5)</span>
            </Label>
            <div className="flex items-center gap-2">
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
              <span className="text-xs text-muted-foreground">or paste images in the text field</span>
            </div>
            {screenshots.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {screenshots.map((s, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={s}
                      alt={`Screenshot ${i + 1}`}
                      className="w-20 h-20 object-cover rounded border border-border"
                    />
                    <button
                      onClick={() => setScreenshots(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-danger text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove screenshot ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
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
