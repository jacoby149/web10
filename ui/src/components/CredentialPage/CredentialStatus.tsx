import { AlertCircle, Loader2 } from 'lucide-react';

// Inline feedback for the credential (login/signup/forgot) screens. The
// global StatusBar is pinned to the top of the page; on these vertically
// centered, chromeless screens a failed submit left the user staring at an
// unchanged button with the only signal 400px above the fold — the button
// read as dead. Per design.md §8 (error text under the field, never silent),
// echo the status right under the submit button, where the click happened.
function isError(status: string) {
  return /failed|failure|must|cannot|invalid|wrong|incorrect|doesn't exist|does not exist|no such|already|too many|denied|expired|not found|not registered/i.test(status);
}

function CredentialStatus({ I }: { I: Record<string, any> }) {
  const status: string | null = I.status;
  if (!status) return null;

  const error = isError(status);
  const Icon = error ? AlertCircle : Loader2;

  return (
    <div
      role={error ? 'alert' : 'status'}
      data-testid="credential-status"
      className={
        'mt-4 flex items-start gap-2 rounded p-3 text-sm ' +
        (error ? 'bg-danger-muted text-danger' : 'bg-muted text-muted-foreground')
      }
    >
      <Icon
        className={'mt-0.5 h-4 w-4 shrink-0 ' + (error ? '' : 'animate-spin')}
        strokeWidth={1.5}
      />
      <span>{status}</span>
    </div>
  );
}

export default CredentialStatus;
