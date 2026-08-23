import React from 'react';
import { Globe, Check, X, ChevronDown, ChevronRight, ArrowRight, Plus, Minus, Users } from 'lucide-react';
import Branding from '../shared/Branding';
import LoginForm from '../CredentialPage/LoginForm';
import SignupForm from '../CredentialPage/SignupForm';
import ForgotForm from '../CredentialPage/ForgotForm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// diff two string lists → {added, removed, same}
function diffStrings(current: string[], next: string[]) {
  const c = new Set(current || []);
  const n = new Set(next || []);
  return {
    added: [...n].filter((x) => !c.has(x)),
    removed: [...c].filter((x) => !n.has(x)),
    same: [...n].filter((x) => c.has(x)),
  };
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ tone = 'default', children }: { tone?: 'default' | 'add' | 'remove'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
        tone === 'add'
          ? 'bg-success/15 text-success'
          : tone === 'remove'
            ? 'bg-danger-muted text-danger line-through'
            : 'border border-border bg-secondary text-secondary-foreground',
      )}
    >
      {tone === 'add' && <Plus className="h-3 w-3" strokeWidth={2} />}
      {tone === 'remove' && <Minus className="h-3 w-3" strokeWidth={2} />}
      {children}
    </span>
  );
}

// Derive a readable origin label — handle both "dev.web10.app" and "https://dev.web10.app"
function originLabel(origin: string): string {
  try {
    const url = origin.startsWith('http') ? new URL(origin) : new URL(`https://${origin}`)
    return url.hostname
  } catch { return origin }
}

// Build a one-line summary of what an ACR grants.
function summarizeACR(acr: any): string {
  const perms = acr.permissions || {};
  const services = Object.keys(perms);
  const actions = new Set<string>();
  Object.values(perms).forEach((ops: string[]) => ops.forEach((a) => actions.add(a)));
  const verbs = actions.size ? Array.from(actions).join('/') : 'access';
  return `${verbs} on ${services.join(', ')}`;
}

// Build a one-line summary of what a group CR requests.
function summarizeGCR(gcr: any): string {
  const action = gcr.action || 'group operation';
  // Support both new typed fields and old params bag
  const params = gcr.params || {};
  const name = gcr.name || params.name || '';
  const groupId = gcr.group_id || params.group_id || '';
  if (action === 'create_group') {
    return `create group "${name}"`;
  }
  if (action === 'update_group') {
    const changes = Object.keys(params).filter(k => k !== 'group_id').join(', ');
    return `update group "${groupId}" — ${changes || 'settings'}`;
  }
  return `${action}${name ? ` "${name}"` : ''}`;
}

function RequestRow({
  contract,
  current,
  onApprove,
  onDeny,
  idx,
}: {
  contract: any;
  current: any | undefined;
  onApprove: () => void;
  onDeny: () => void;
  idx: number;
}) {
  const [open, setOpen] = React.useState(false);
  const isACR = contract.kind === 'app';
  const isGCR = contract.kind === 'group';
  const origin = contract.app_origin || contract.allowed_origin;
  const perms = isACR ? (contract.permissions || {}) : {};
  const services = Object.keys(perms);
  const action = isGCR ? (contract.action || '') : '';
  const params = isGCR ? (contract.params || {}) : {};

  // Diff permissions against existing contract for each service (ACR only)
  const permDiffs: Record<string, { added: string[]; removed: string[]; same: string[] }> = {};
  if (isACR && current) {
    const currentPerms = current.permissions || {};
    for (const svc of services) {
      const currentOps = currentPerms[svc] || [];
      const nextOps = perms[svc] || [];
      permDiffs[svc] = diffStrings(currentOps, nextOps);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-elevated" data-testid={`consent-req-${idx}`}>
      <div className="flex items-center gap-3 p-3.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`consent-details-${idx}`}
        >
          <span className="shrink-0 text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" strokeWidth={1.5} /> : <ChevronRight className="h-4 w-4" strokeWidth={1.5} />}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">{originLabel(origin)}</span>
              <span className="shrink-0 rounded-full bg-brand-muted px-2 py-0.5 text-[11px] font-medium text-brand-300">
                {isACR ? 'access request' : 'group request'}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {isACR ? summarizeACR(contract) : summarizeGCR(contract)}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="brand" size="sm" onClick={onApprove} data-testid={`consent-approve-${idx}`}>
            <Check className="mr-1 h-4 w-4" strokeWidth={2} />
            Allow
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeny}
            aria-label={`Deny ${originLabel(origin)}`}
            data-testid={`consent-deny-${idx}`}
            className="text-muted-foreground hover:text-danger"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </Button>
        </div>
      </div>

          {open && (
            <div className="border-t border-border px-3.5 py-3 text-sm">
              <DetailRow label="Site">
                <Chip><Globe className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />{originLabel(origin)}</Chip>
              </DetailRow>

          {isACR && services.map((svc) => (
            <DetailRow key={svc} label={`Permissions (${svc})`}>
              {current && permDiffs[svc] ? (
                <>
                  {permDiffs[svc].same.map((p, i) => (
                    <Chip key={`s${i}`}>{p}</Chip>
                  ))}
                  {permDiffs[svc].added.map((p, i) => (
                    <Chip key={`a${i}`} tone="add">{p}</Chip>
                  ))}
                  {permDiffs[svc].removed.map((p, i) => (
                    <Chip key={`r${i}`} tone="remove">{p}</Chip>
                  ))}
                  {permDiffs[svc].same.length + permDiffs[svc].added.length + permDiffs[svc].removed.length === 0 && (
                    <span className="text-xs text-muted-foreground">No permissions</span>
                  )}
                </>
              ) : (
                (perms[svc] || []).map((p: string, i: number) => (
                  <Chip key={i} tone="add">{p}</Chip>
                ))
              )}
            </DetailRow>
          ))}

          {isGCR && (
            <>
              <DetailRow label="Action">
                <Chip><Users className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />{action}</Chip>
              </DetailRow>
              {params.name && (
                <DetailRow label="Group name">
                  <Chip>{params.name}</Chip>
                </DetailRow>
              )}
              {params.join_policy && (
                <DetailRow label="Join policy">
                  <Chip>{params.join_policy}</Chip>
                </DetailRow>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ConsentView({ I }: { I: Record<string, any> }) {
  const host = React.useMemo(() => {
    try {
      return I._referrerHost || (document.referrer ? new URL(document.referrer).hostname : 'this app');
    } catch {
      return 'this app';
    }
  }, [I._referrerHost]);

  const authed = I.isAuthenticated?.();
  const v3Contracts: any[] = I.v3Contracts || [];
  const grantedOrigins = new Set(v3Contracts.map((c: any) => c.allowed_origin));
  // Unified pending list — ACRs and GCRs together
  const pendingContracts: any[] = I.pendingContracts || [];
  const username = I.v3?.readToken?.()?.username as string | undefined;
  const expectedUser = I._expectedUser as string | undefined;
  // D42 identity: the popup's session user ≠ the user the opener is acting for.
  // On mismatch the popup must not treat "already granted" as "all set" (the
  // grant is for the wrong user) and must not auto-complete.
  const mismatch = !!(expectedUser && authed && username && username !== expectedUser);
  console.log('[consent] pendingContracts:', pendingContracts, 'grantedOrigins:', grantedOrigins, 'mismatch:', mismatch, 'expectedUser:', expectedUser || '(none)');

  // An ACR is "already granted" when its origin holds every requested permission.
  const isAlreadyGranted = (c: any): boolean => {
    if (c.kind !== 'app') return false;
    const origin = c.app_origin || c.allowed_origin;
    const existing = v3Contracts.find((vc: any) => vc.allowed_origin === origin);
    if (!existing) return false;
    const reqPerms = c.permissions || {};
    for (const service of Object.keys(reqPerms)) {
      const existingPerms = existing.permissions?.[service] || [];
      for (const perm of reqPerms[service]) {
        if (!existingPerms.includes(perm)) return false;
      }
    }
    return true;
  };
  // On mismatch, show the requests unfiltered — "already granted" is for the
  // wrong user, so presenting it as a request (not "all set") is the honest
  // state. (The SDK rejects the returned token as a backstop.)
  const displayContracts = mismatch
    ? pendingContracts
    : pendingContracts.filter((c: any) => c.kind !== 'app' || !isAlreadyGranted(c));

  // D42 auto-complete: signed in, a contract was received, nothing is left to
  // show (every contract is either already granted — filtered out — or already
  // resolved by the user), and no identity mismatch → hand back the token and
  // close, zero UI. This replaces the old "all set" screen + Close-window tap:
  // the return run (already granted) and the first login (after the user
  // approves) both settle here with zero taps.
  const allSettled = !!(authed && I._contractReceived && displayContracts.length === 0 && !mismatch);
  console.log('[consent] authed:', authed, 'contractReceived:', I._contractReceived, 'pending:', pendingContracts.length, 'displayContracts:', displayContracts.length, 'mismatch:', mismatch, 'username:', username || '(none)', 'allSettled:', allSettled);

  React.useEffect(() => {
    if (allSettled) {
      console.log('[consent] all settled — auto-completing (token + close, zero UI)');
      I.goToApp();
    }
  }, [allSettled]);

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground">
      {/* the one permitted decorative flourish (design.md §4): a soft brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]"
      />

      <div className="relative flex w-full max-w-md flex-col" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
        <div className="mb-6 flex shrink-0 justify-center">
          <Branding I={I} size="lg" tagline={false} />
        </div>

        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
          {!authed ? (
            <div className="p-6 sm:p-8">
              <div className="mb-6 text-center">
                <h1 className="font-display text-xl font-semibold text-foreground">
                  {I.mode === 'signup' ? (
                    <>Create your node to connect <span className="text-brand-300">{host}</span></>
                  ) : I.mode === 'forgot' ? (
                    <>Recover your account</>
                  ) : (
                    <>Log in to connect <span className="text-brand-300">{host}</span></>
                  )}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {I.mode === 'signup'
                    ? 'Own your data from the first record — then choose what to share.'
                    : I.mode === 'forgot'
                      ? 'Enter your web10 provider and mobile number to recover your account.'
                      : 'Sign in to your node, then choose what to share.'}
                </p>
              </div>
              {I.mode === 'signup' ? (
                <SignupForm I={I} embedded />
              ) : I.mode === 'forgot' ? (
                <ForgotForm I={I} embedded />
              ) : (
                <LoginForm I={I} embedded />
              )}
            </div>
          ) : allSettled ? (
            // D42: nothing to review, no mismatch — the auto-complete effect
            // hands back the token and closes the window. Brief "connecting"
            // state until it does. (The old "You're all set" + Close-window
            // button is gone: that tap asked the user to do the one thing the
            // popup already knew how to do.)
            <div className="flex flex-col items-center p-8 text-center" data-testid="consent-connecting">
              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-brand-300 border-t-transparent" />
              <div className="text-sm text-muted-foreground">Connecting…</div>
            </div>
          ) : (
            <>
              {mismatch && (
                <div className="shrink-0 border-b border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger" data-testid="consent-mismatch">
                  This window is signed in as <span className="font-medium text-foreground">{username}</span>,
                  but {host} is asking on behalf of <span className="font-medium text-foreground">{expectedUser}</span>.
                  If that&apos;s not right, use "Not you? Log out" below.
                </div>
              )}
              {/* header — fixed */}
              <div className="shrink-0 border-b border-border p-5 text-center">
                <h1 className="font-display text-xl font-semibold text-foreground">
                  Connect <span className="text-brand-300">{host}</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Requesting {displayContracts.length} access {displayContracts.length === 1 ? 'request' : 'requests'}. Tap any to see details.
                </p>
              </div>

              {/* request list — scrolls internally so the actions stay visible */}
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                {displayContracts.map((contract: any, idx: number) => (
                  <RequestRow
                    key={(contract.app_origin || contract.allowed_origin) + '-' + idx}
                    contract={contract}
                    idx={idx}
                    current={contract.kind === 'app' ? v3Contracts.find((c: any) => c.allowed_origin === (contract.app_origin || contract.allowed_origin)) : undefined}
                    onApprove={() => I.approveContract(contract)}
                    onDeny={() => I.denyContract(contract)}
                  />
                ))}
              </div>

              {/* actions — always visible, no scrolling required */}
              <div className="shrink-0 space-y-2 border-t border-border p-4">
                {I.status && (
                  <p className="text-center text-sm text-muted-foreground" role="status">{I.status}</p>
                )}
                <Button variant="brand" className="w-full" onClick={() => I.approveAll()} data-testid="consent-approve-all">
                  Approve all & continue
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={() => I.goToApp()}
                  data-testid="consent-skip"
                >
                  Continue without sharing
                </Button>
              </div>
            </>
          )}
        </div>

        {authed && (
          <p className="mt-4 shrink-0 text-center text-xs text-muted-foreground">
            Signed in as <span className="text-foreground">{username}</span>
            {' · '}
            <button
              type="button"
              onClick={() => I.logout()}
              className="rounded underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="consent-logout"
            >
              Not you? Log out
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default ConsentView;