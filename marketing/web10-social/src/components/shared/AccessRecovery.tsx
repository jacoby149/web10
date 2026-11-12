import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getSocialAuth } from '@/interfaces/auth';
import { needsAppApproval } from '@/lib/accessLanguage';
import { AccessPermissionMessage } from './AccessPermissionMessage';

/** An explicit gesture, not an async/automatic popup (blocked on phones).
 * Opening consent is not approval. The creator retries the existing draft;
 * the node still decides whether the next upload/write is allowed. */
export function AccessRecovery({ error, onRetry, preservation = 'Your text and selected files are still here.' }: {
  error: string; onRetry: () => void; preservation?: string;
}) {
  const [status, setStatus] = useState<string | null>(null);

  function reviewAccess() {
    console.log('[social-composer] access review requested; retaining draft');
    try {
      const opened = getSocialAuth().login();
      console.log('[social-composer] access window result', { opened });
      setStatus(opened
        ? 'Approve the request in the window that opened, then come back and tap Try again. If you skip approval, your draft will stay open here.'
        : 'The sign-in window could not open. Allow pop-ups for this site, then tap Allow access again. Your post is still here.');
    } catch {
      console.warn('[social-composer] access window failed; retaining draft');
      setStatus('The sign-in window could not open. Tap Allow access to try again. Your post is still here.');
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-brand/30 bg-brand-muted/20 p-4 text-sm" data-testid="composer-access-recovery">
      <p role="alert" className="font-medium text-foreground">One quick step before you post</p>
      <p className="text-foreground">{needsAppApproval(error) ? <AccessPermissionMessage message={error} /> : 'Please check that you’re signed in and have permission to post here.'} {preservation}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="brand" className="min-h-11" onClick={reviewAccess}>Allow access</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>Try again</Button>
      </div>
      <p className="text-muted-foreground">Already approved? Try again. If you’re posting to a group, you may need permission from its owner.</p>
      {status && <p role="status" className="text-foreground">{status}</p>}
      <details className="text-danger">
        <summary className="cursor-pointer min-h-11 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Error details</summary>
        <p className="break-words">{error}</p>
      </details>
    </div>
  );
}
