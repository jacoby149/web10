import React from 'react';
import { Check, ChevronDown, ChevronRight, Plus, Minus, Users, Globe } from 'lucide-react';
import Branding from '../shared/Branding';
import LoginForm from '../CredentialPage/LoginForm';
import SignupForm from '../CredentialPage/SignupForm';
import ForgotForm from '../CredentialPage/ForgotForm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PermissionSummary from './PermissionSummary';
import { groupActionDescription } from '@/lib/consentLanguage';
import { useCredentialEntry } from '@/lib/useCredentialEntry';

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
      <div className="break-all text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ tone = 'default', children }: { tone?: 'default' | 'add' | 'remove'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 break-all rounded-full px-2 py-0.5 text-xs',
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
  if (!origin) return 'Unknown app';
  try {
    const url = origin.startsWith('http') ? new URL(origin) : new URL(`https://${origin}`)
    return url.host
  } catch { return origin }
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
  const params = isGCR ? { ...contract.params, ...Object.fromEntries(Object.entries(contract).filter(([, value]) => value !== undefined)) } : {};

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
    <div className="rounded border border-border bg-card" data-testid={`consent-req-${idx}`}>
      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand-muted text-brand-300">
              {isACR ? <Globe aria-hidden="true" className="h-5 w-5" /> : <Users aria-hidden="true" className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{isACR ? 'App permissions' : 'Group permissions'}</p>
              <p className="mt-1 break-all font-semibold text-foreground">{originLabel(origin)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">This app would like to:</p>
        </div>
        {isACR ? <PermissionSummary permissions={perms} /> : (
          <p className="break-words text-sm text-foreground">{groupActionDescription(contract)}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-h-11 items-center gap-2 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`consent-details-${idx}`}
          >
            <span className="shrink-0 text-muted-foreground">
              {open ? <ChevronDown className="h-4 w-4" strokeWidth={1.5} /> : <ChevronRight className="h-4 w-4" strokeWidth={1.5} />}
            </span>
            Technical details
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="brand" size="sm" className="min-h-11" onClick={onApprove} data-testid={`consent-approve-${idx}`}>
              <Check className="mr-1 h-4 w-4" strokeWidth={2} />
              Allow
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeny}
              aria-label={`Deny ${originLabel(origin)}`}
              data-testid={`consent-deny-${idx}`}
              className="min-h-11 min-w-11 text-muted-foreground hover:text-danger"
            >
              Deny
            </Button>
          </div>
        </div>
      </div>

          {open && (
            <div className="border-t border-border px-3.5 py-3 text-sm">
              <DetailRow label="Site">
                <span className="break-all font-mono text-xs">{origin}</span>
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
              <pre className="mt-3 whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify({ group_id: params.group_id, name: params.name, join_policy: params.join_policy, roles: params.roles, members: params.members }, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ConsentView({ I }: { I: Record<string, any> }) {
  const entry = useCredentialEntry(I);
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
  // The opener tells the popup whether it is acting as someone. When it is
  // signed OUT (no ?as=), the popup must NOT auto-complete on its own restored
  // session — that is the "can't switch account" bug (sign out of the app,
  // sign back in, and the popup silently hands back the stale account). Instead
  // the user gets the login screen (with the remembered-accounts picker) and
  // either confirms the current session ("Continue as") or picks / logs in as
  // a different account.
  const openerSignedIn = !!expectedUser;
  const userConfirmed = !!I._userConfirmed;
  // "Continue as {username}" is only honest while the login form targets the
  // session's own account. Once the user picks or types a DIFFERENT account,
  // confirming "Continue as" would hand back the wrong identity — hide it and
  // let the password form be the only path for the other account.
  const formUsername = I.loginUsername;
  const formTargetsSession = formUsername == null || formUsername.trim() === '' || formUsername.trim().toLowerCase() === (username || '').toLowerCase();

  // An ACR is "already granted" when its origin holds every requested permission.
  const isAlreadyGranted = (c: any): boolean => {
    if (I.isContractGranted) return I.isContractGranted(c);
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

  // The popup would otherwise auto-complete: signed in, a contract arrived,
  // nothing left to show, no mismatch. This is the one case where a signed-out
  // opener must NOT get a silent hand-back of the stale session.
  const nothingToShow = !!(authed && I._contractReceived && displayContracts.length === 0 && !mismatch);
  // Show the login screen (with the account picker) when: not authed (old
  // behavior), OR the opener is signed out and the user hasn't confirmed their
  // identity in this session and the popup would otherwise auto-complete (the
  // fix — the user gets a chance to switch accounts). When there ARE contracts
  // to approve, the consent screen stays — the user is the popup's session
  // user, approving their own contract (which confirms them).
  const showLoginForm = !authed || (!openerSignedIn && !userConfirmed && nothingToShow);
  const canContinueAsCurrent = !!(authed && !openerSignedIn && !userConfirmed && username && nothingToShow && formTargetsSession);
  console.log('[consent] pendingContracts:', pendingContracts, 'grantedOrigins:', grantedOrigins, 'mismatch:', mismatch, 'expectedUser:', expectedUser || '(none)', 'openerSignedIn:', openerSignedIn, 'userConfirmed:', userConfirmed, 'nothingToShow:', nothingToShow, 'showLoginForm:', showLoginForm);

  // D42 auto-complete: the popup would settle (nothingToShow) AND the session
  // is one the user has either come back to (opener signed in, ?as= present) or
  // confirmed in this popup (logged in, approved/denied a contract, or tapped
  // "Continue as"). A stale restored session with a signed-out opener does NOT
  // settle here — it shows the login screen so the user can switch accounts.
  // This replaces the old "all set" screen + Close-window tap: the return run
  // (already granted) and the first login (after the user approves) both settle
  // here with zero taps.
  const allSettled = !!(nothingToShow && (openerSignedIn || userConfirmed));
  console.log('[consent] authed:', authed, 'contractReceived:', I._contractReceived, 'pending:', pendingContracts.length, 'displayContracts:', displayContracts.length, 'mismatch:', mismatch, 'username:', username || '(none)', 'allSettled:', allSettled);

  React.useEffect(() => {
    if (allSettled) {
      console.log('[consent] all settled — auto-completing (token + close, zero UI)');
      if (!I.completeConsent || I.completeConsent()) I.goToApp();
    }
  }, [allSettled, pendingContracts]);

  return (
    <div className={showLoginForm ? 'relative flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-8 text-foreground sm:py-12' : 'relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-6 text-foreground'}>
      {/* the one permitted decorative flourish (design.md §4): a soft brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]"
      />

      <div className={`relative flex w-full max-w-md flex-col ${showLoginForm ? '' : 'max-h-[calc(100dvh-3rem)]'}`}>
        <div className={`flex shrink-0 justify-center ${showLoginForm ? 'mb-8' : 'mb-6'}`}>
          <Branding I={I} size={showLoginForm ? 'sm' : 'lg'} tagline={false} />
        </div>

        <div className={`flex min-h-0 flex-col ${showLoginForm ? 'sm:rounded-lg sm:border sm:border-border sm:bg-card' : 'rounded-lg border border-border bg-card'}`}>
        {showLoginForm ? (
          <div className="py-2 sm:p-8" data-testid="consent-credential-entry">
            <div className="mb-7 text-center">
              <p className="mb-3 break-all text-xs font-medium text-muted-foreground">Continue to <span className="text-foreground">{host}</span></p>
              <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
                {entry.mode === 'signup' ? (
                  <>Create your account.</>
                ) : entry.mode === 'forgot' ? (
                  <>Find your account.</>
                ) : (
                  <>{I.rememberedAccounts?.length ? 'Welcome back.' : 'Welcome to web10.'}</>
                )}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {entry.mode === 'signup'
                  ? 'One web10 account. Your data, on your terms.'
                  : entry.mode === 'forgot'
                    ? 'Sign in with a code sent to your phone or email.'
                    : 'Sign in or create your account to continue.'}
              </p>
            </div>
            {/* The opener is signed out and this popup holds a live session —
                offer the no-password fast path to continue as the current
                account. Picking a different account (the picker) or "Use
                another account" still asks for the password. */}
            {entry.mode === 'signup' ? (
              <SignupForm I={entry} embedded />
            ) : entry.mode === 'forgot' ? (
              <ForgotForm I={entry} embedded />
            ) : (
              <LoginForm I={entry} embedded continueAction={canContinueAsCurrent ? (
                <Button variant="brand" className="h-12 w-full" onClick={() => I.setUserConfirmed(true)} data-testid="consent-continue-as">
                  Continue as {username}
                </Button>
              ) : undefined} />
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
              <div className="shrink-0 p-6 pb-2 text-center">
                <h1 className="font-display text-xl font-semibold text-foreground">
                  Allow this app access?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review what the app would like to do. Only allow apps you trust.
                </p>
              </div>

              {/* request list — scrolls internally so the actions stay visible */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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
                <Button variant="brand" className="min-h-11 w-full" onClick={() => I.approveAll()} data-testid="consent-approve-all">
                  Allow all & continue
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11 w-full text-muted-foreground hover:text-foreground"
                  onClick={() => I.skipConsent ? I.skipConsent() : I.goToApp()}
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
              className="inline-flex min-h-11 items-center rounded px-2 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
