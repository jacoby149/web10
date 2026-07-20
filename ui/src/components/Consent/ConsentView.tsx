import React from 'react';
import { Globe, ShieldCheck, Check, X, ChevronDown, ChevronRight, ArrowRight, Plus, Minus } from 'lucide-react';
import Branding from '../shared/Branding';
import LoginForm from '../CredentialPage/LoginForm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// A whitelist/blacklist entry is {username, provider, <action>: true}. Render a
// readable anchor + granted actions defensively (never throw on odd shapes).
function entryAnchor(e: any): string {
  if (!e || typeof e !== 'object') return String(e);
  const u = e.username === '.*' || e.username == null ? 'anyone' : e.username;
  const p = e.provider && e.provider !== '.*' ? `@${e.provider}` : '';
  return `${u}${p}`;
}
function entryActions(e: any): string[] {
  if (!e || typeof e !== 'object') return [];
  const meta = new Set(['username', 'provider', 'anchor', 'allowed', 'denied']);
  return Object.keys(e).filter((k) => !meta.has(k) && e[k] === true);
}
function entryLabel(e: any): string {
  const a = entryActions(e);
  return `${entryAnchor(e)}${a.length ? ` · ${a.join(', ')}` : ''}`;
}

// A one-line plain-English summary of what a request grants.
function summarize(req: any): string {
  const actions = new Set<string>();
  (Array.isArray(req.whitelist) ? req.whitelist : []).forEach((w: any) =>
    entryActions(w).forEach((a) => actions.add(a)),
  );
  const verbs = actions.size ? Array.from(actions).join('/') : 'access';
  const sites = Array.isArray(req.cross_origins) ? req.cross_origins.length : 0;
  return `${verbs} · ${sites} ${sites === 1 ? 'site' : 'sites'}`;
}

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

function RequestRow({
  req,
  kind,
  current,
  onApprove,
  onDeny,
  idx,
}: {
  req: any;
  kind: 'new' | 'change';
  current: any | undefined;
  onApprove: () => void;
  onDeny: () => void;
  idx: number;
}) {
  const [open, setOpen] = React.useState(false);
  const sites: string[] = Array.isArray(req.cross_origins) ? req.cross_origins : [];
  const allows: any[] = Array.isArray(req.whitelist) ? req.whitelist : [];
  const blocks: any[] = Array.isArray(req.blacklist) ? req.blacklist : [];
  const siteDiff = kind === 'change' && current ? diffStrings(current.cross_origins || [], sites) : null;

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
              <span className="truncate font-medium text-foreground">{req.service}</span>
              <span className="shrink-0 rounded-full bg-brand-muted px-2 py-0.5 text-[11px] font-medium text-brand-300">
                {kind === 'new' ? 'new access' : 'change'}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summarize(req)}</span>
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
            aria-label={`Deny ${req.service}`}
            data-testid={`consent-deny-${idx}`}
            className="text-muted-foreground hover:text-danger"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-3.5 py-3 text-sm">
          <DetailRow label={kind === 'change' ? 'Sites (changes highlighted)' : 'Sites with access'}>
            {siteDiff ? (
              <>
                {siteDiff.same.map((s, i) => (
                  <Chip key={`s${i}`}><Globe className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />{s}</Chip>
                ))}
                {siteDiff.added.map((s, i) => (
                  <Chip key={`a${i}`} tone="add">{s}</Chip>
                ))}
                {siteDiff.removed.map((s, i) => (
                  <Chip key={`r${i}`} tone="remove">{s}</Chip>
                ))}
                {siteDiff.same.length + siteDiff.added.length + siteDiff.removed.length === 0 && (
                  <span className="text-xs text-muted-foreground">No sites</span>
                )}
              </>
            ) : sites.length ? (
              sites.map((s, i) => (
                <Chip key={i}><Globe className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />{s}</Chip>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No sites</span>
            )}
          </DetailRow>

          {allows.length > 0 && (
            <DetailRow label="Allowed">
              {allows.map((w, i) => <Chip key={i} tone="add">{entryLabel(w)}</Chip>)}
            </DetailRow>
          )}
          {blocks.length > 0 && (
            <DetailRow label="Blocked">
              {blocks.map((w, i) => <Chip key={i} tone="remove">{entryLabel(w)}</Chip>)}
            </DetailRow>
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
  const services: any[] = I.services || [];
  const grantedNames = new Set(services.map((s) => s.service));
  const sirs: any[] = I.SMR?.sirs || [];
  const scrs: any[] = I.SMR?.scrs || [];

  // Only ask for what's actually new. A SIR for a service you've already
  // granted isn't re-asked (re-approving it just makes a duplicate); it's
  // shown as "already shared". Changes (SCRs) are always something to review.
  const alreadyShared: string[] = sirs.filter((s) => grantedNames.has(s.service)).map((s) => s.service);
  const requests = [
    ...sirs.filter((s) => !grantedNames.has(s.service)).map((s) => ({ req: s, kind: 'new' as const })),
    ...scrs.map((s) => ({ req: s, kind: 'change' as const })),
  ];
  const username = I.wapi?.readToken?.()?.username as string | undefined;

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
                  Log in to connect <span className="text-brand-300">{host}</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">Sign in to your node, then choose what to share.</p>
              </div>
              <LoginForm I={I} embedded />
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center p-8 text-center" data-testid="consent-allset">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
                <ShieldCheck className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
              </div>
              <h1 className="font-display text-xl font-semibold text-foreground">You're all set</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {alreadyShared.length > 0 ? (
                  <>
                    <span className="text-foreground">{host}</span> already has access to{' '}
                    <span className="text-foreground">{alreadyShared.join(', ')}</span>. Nothing new to review.
                  </>
                ) : (
                  <>Nothing left to review. Head back to <span className="text-foreground">{host}</span>.</>
                )}
              </p>
              <Button variant="brand" className="mt-6 w-full" onClick={() => I.goToApp()} data-testid="consent-goto-app">
                Go to {host}
                <ArrowRight className="ml-1.5 h-4 w-4" strokeWidth={2} />
              </Button>
            </div>
          ) : (
            <>
              {/* header — fixed */}
              <div className="shrink-0 border-b border-border p-5 text-center">
                <h1 className="font-display text-xl font-semibold text-foreground">
                  Connect <span className="text-brand-300">{host}</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Requesting {requests.length} new {requests.length === 1 ? 'service' : 'services'}. Tap any to see details.
                </p>
                {alreadyShared.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    Already shared: <span className="text-muted-foreground">{alreadyShared.join(', ')}</span>
                  </p>
                )}
              </div>

              {/* request list — scrolls internally so the actions stay visible */}
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                {requests.map(({ req, kind }, idx) => (
                  <RequestRow
                    key={`${req.service}-${idx}`}
                    req={req}
                    kind={kind}
                    idx={idx}
                    current={services.find((s) => s.service === req.service)}
                    onApprove={() => (kind === 'new' ? I.submitSIR(req) : I.changeTerms(req))}
                    onDeny={() => I.purgeSMR(req)}
                  />
                ))}
              </div>

              {/* actions — always visible, no scrolling required */}
              <div className="shrink-0 space-y-2 border-t border-border p-4">
                {I.status && (
                  <p className="text-center text-sm text-muted-foreground" role="status">{I.status}</p>
                )}
                <Button variant="brand" className="w-full" onClick={() => I.approveAll()} data-testid="consent-approve-all">
                  Approve all &amp; continue
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
