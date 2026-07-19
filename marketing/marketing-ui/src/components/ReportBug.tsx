import { useState, useCallback, useEffect } from 'react';
import { useErrorBoundaryContext } from './ErrorBoundary';

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

  if (sent) {
    return (
      <div className="modal is-active" onClick={onClose}>
        <div className="modal-background" />
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <section className="modal-card-body has-text-centered is-vcentered">
            <span className="icon is-large has-text-success mb-4">
              <i className="fas fa-check-circle fa-3x" />
            </span>
            <h2 className="title is-4">Thanks for the report</h2>
            <p className="subtitle is-6 has-text-grey">
              We'll look into it. Your feedback helps make web10 better.
            </p>
            <button className="button is-fullwidth is-light mt-4" onClick={onClose}>
              Close
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="modal is-active" onClick={onClose}>
      <div className="modal-background" />
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <header className="modal-card-head">
          <p className="modal-card-title">
            {trigger === 'error-boundary' ? 'Something broke' : 'Report a bug'}
          </p>
          <button className="delete" onClick={onClose} />
        </header>
        <section className="modal-card-body">
          {trigger === 'error-boundary' && (
            <div className="notification is-danger is-light mb-4">
              <p>The app crashed. Your report will include the crash details automatically.</p>
            </div>
          )}

          <div className="field">
            <label className="label">
              What happened? <span className="has-text-grey is-size-7">(required)</span>
            </label>
            <div className="control">
              <textarea
                className="textarea"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe what you were doing when the bug occurred..."
                data-testid="report-textarea"
              />
            </div>
          </div>

          <div className="field">
            <label className="label">
              Contact <span className="has-text-grey is-size-7">(optional)</span>
            </label>
            <div className="control">
              <input
                className="input"
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="email or username"
                data-testid="report-input"
              />
            </div>
          </div>

          {stackTrace && (
            <details className="mt-4">
              <summary className="has-text-grey-dark">Crash details (auto-captured)</summary>
              <pre className="mt-2 p-2 bg-grey-lighter rounded overflow-auto" style={{ fontSize: '10px' }}>
                {stackTrace}
              </pre>
            </details>
          )}

          {error && <p className="has-text-danger mt-2">{error}</p>}
        </section>
        <footer className="modal-card-foot is-justify-content-space-between">
          <button className="button is-light" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button is-primary"
            onClick={sendReport}
            disabled={sending || !message.trim()}
          >
            {sending ? 'Sending...' : 'Send Report'}
          </button>
        </footer>
      </div>
    </div>
  );
}