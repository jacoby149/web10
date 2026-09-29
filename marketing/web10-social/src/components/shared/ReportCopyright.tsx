import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, X, ShieldCheck } from 'lucide-react';

// The DMCA designated-agent address (the "Post-It Note" rule): a copyright
// holder emails this address with a link to the infringing content, and the
// node operator removes it manually. The email is the whole mechanism — there
// is no in-app takedown queue, no backend, no database. The same address is
// published in the terms of service (marketing-ui /docs/dmca).
export const COPYRIGHT_EMAIL = 'copyright@web10.com';

interface ReportCopyrightProps {
  /** The infringing content's permalink (the report references it). When
   *  absent (the Settings entry point), the current page URL is used so the
   *  operator still knows where the report came from. */
  postUrl?: string;
  /** The author's display name (the report names who posted it). */
  postAuthor?: string;
  onClose: () => void;
}

/**
 * The "Report copyright" dialog (the "Post-It Note" DMCA rule).
 *
 * The mechanism is deliberately small: a copyright holder who sees infringing
 * content opens this dialog (from Settings, or a surface), and it gives them
 * the designated agent's email + a pre-filled message (a link to the content,
 * the author, and a short rights statement) to send. The node operator reads
 * the email and removes the content manually. No in-app takedown queue, no
 * backend, no database — the email IS the report, and acting on it fast is
 * what keeps the node protected while it's small.
 *
 * The dialog is a mailto: composer — it never sends anything itself, so there
 * is no data write and no node surface (D60: the node stays generic).
 */
export function ReportCopyright({ postUrl, postAuthor, onClose }: ReportCopyrightProps) {
  const [copied, setCopied] = useState(false);

  // The content link: the post's permalink when a surface passes it, otherwise
  // the page the user is on (the Settings entry point). Either way the operator
  // gets a link they can open.
  const contentUrl = postUrl || `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const isPost = Boolean(postUrl);

  const subject = isPost
    ? `Copyright infringement report — ${postUrl}`
    : 'Copyright infringement report — web10';
  const body = [
    'To the web10 designated copyright agent,',
    '',
    'I believe the following content infringes my copyright:',
    '',
    isPost ? `Post: ${postUrl}` : `Page: ${contentUrl}`,
    postAuthor ? `Author: ${postAuthor}` : null,
    '',
    'I am the rights holder (or authorized to act on the rights holder\'s behalf) for this content.',
    'Please remove it.',
    '',
    'Name:',
    'Contact:',
    'Statement of good faith:',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const mailto = `mailto:${COPYRIGHT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(COPYRIGHT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the email is still visible to copy by hand.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-overlay-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Report copyright"
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-lg p-6 space-y-4 animate-panel-in"
        onClick={(e) => e.stopPropagation()}
        data-testid="report-copyright-dialog"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-display text-lg font-semibold text-foreground">Report copyright</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            data-testid="report-copyright-close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          If you believe content on this node infringes your copyright, send it
          to our designated agent. We act on valid notices — a valid report
          gets the content removed.
        </p>

        <div className="p-3 rounded-md bg-elevated/50 border border-border space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Designated agent</span>
            <button
              type="button"
              onClick={copyEmail}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="report-copyright-copy"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <a
            href={`mailto:${COPYRIGHT_EMAIL}`}
            className="text-sm font-medium text-foreground hover:text-brand-300 transition-colors break-all"
            data-testid="report-copyright-email"
          >
            {COPYRIGHT_EMAIL}
          </a>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {isPost
            ? 'The pre-filled message includes this post’s link so we can find it. Include your name and how to reach you.'
            : 'The pre-filled message includes the page you’re on. Include a link to the specific content, your name, and how to reach you.'}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            className="flex-1 gap-2"
            onClick={() => {
              window.location.href = mailto;
              onClose();
            }}
            data-testid="report-copyright-compose"
          >
            <Mail className="w-4 h-4" />
            Compose email
          </Button>
        </div>
      </div>
    </div>
  );
}
