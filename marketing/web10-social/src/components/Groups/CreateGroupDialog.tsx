import { useEffect, useState } from 'react';
import { X, Users, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestGroupCreation } from '@/data';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:groups]', ...args);

type JoinPolicy = 'open' | 'request' | 'invite_only';

const POLICIES: { value: JoinPolicy; label: string; hint: string }[] = [
  { value: 'open', label: 'Open', hint: 'Anyone can join instantly.' },
  { value: 'request', label: 'Request', hint: 'Joiners wait for your approval.' },
  { value: 'invite_only', label: 'Invite only', hint: 'You add every member yourself.' },
];

/**
 * The "Create group" sheet — a bottom sheet (the `AdPicker` idiom) that
 * collects a name + join policy and sends a group contract (GCR) to the
 * authenticator. The authenticator is the trusted party: the user approves
 * there, and it creates the group with its own token (the D42 consent
 * pattern the demos run).
 */
export function CreateGroupDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState<JoinPolicy>('open');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (open) {
      setName('');
      setPolicy('open');
      setNameError(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = name.trim();

  function handleSubmit() {
    if (!trimmed) {
      setNameError('Give your group a name.');
      return;
    }
    LOG('create group — submitting', { name: trimmed, policy });
    setSubmitting(true);
    setError(null);
    const sent = requestGroupCreation(trimmed, policy, (resp) => {
      LOG('create group — result', resp.status, resp.errors ?? '');
      if (resp.status === 'approved') {
        onCreated();
        return;
      }
      setSubmitting(false);
      if (resp.status === 'denied') {
        setError('Group creation was declined in the authenticator.');
      } else {
        setError(resp.errors?.[0] || 'Group creation failed. Try again.');
      }
    });
    if (!sent) {
      setSubmitting(false);
      setError('Your session is not ready — sign in again and try.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Create a group">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-t-lg border-t border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.35)]" data-testid="groups-create-dialog">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-medium text-foreground">Create a group</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="groups-create-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Group name
            </label>
            <input
              id="groups-create-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="e.g. Synthwave Sessions"
              autoFocus
              data-testid="groups-create-name"
              className={cn(
                'w-full h-9 rounded-lg border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-colors duration-150',
                nameError ? 'border-danger focus:ring-danger/50' : 'border-input focus:ring-brand/50',
              )}
            />
            {nameError && (
              <p className="mt-1.5 text-xs text-danger" data-testid="groups-create-name-error">
                {nameError}
              </p>
            )}
          </div>

          {/* Join policy */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Who can join</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Join policy" data-testid="groups-create-policy">
              {POLICIES.map((p) => {
                const active = policy === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPolicy(p.value)}
                    data-testid={`groups-create-policy-${p.value}`}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-medium transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active
                        ? 'border-brand bg-brand-muted text-brand-300'
                        : 'border-border bg-surface text-muted-foreground hover:text-foreground hover:border-brand/40',
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {POLICIES.find((p) => p.value === policy)?.hint}
            </p>
          </div>

          {/* Contract result error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-muted/40 p-3" data-testid="groups-create-error">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} />
              <p className="text-xs text-foreground">{error}</p>
            </div>
          )}

          <Button
            variant="brand"
            size="sm"
            className="w-full gap-2"
            disabled={submitting}
            onClick={handleSubmit}
            data-testid="groups-create-submit"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                Approve in the authenticator…
              </>
            ) : (
              <>
                <Users className="h-4 w-4" strokeWidth={1.75} />
                Create group
              </>
            )}
          </Button>
          <p className="text-center text-[0.6875rem] leading-relaxed text-muted-foreground">
            Creating a group opens the web10 authenticator — you approve it there, and the group is created on your node.
          </p>
        </div>
      </div>
    </div>
  );
}
