import { FileText, Globe, Shield, ShieldX } from 'lucide-react';
import AppShell from '../shared/AppShell';
import RecoveryNudgeBanner from '../shared/RecoveryNudgeBanner';
import { Button } from '@/components/ui/button';
import React from 'react';

// ── App contract card (v3: one row per origin, permissions is JSON) ──

function AppContractCard({ I, contract }: { I: Record<string, any>; contract: { allowed_origin: string; permissions: Record<string, string[]> } }) {
  const [open, setOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);
  const [showRevoke, setShowRevoke] = React.useState(false);

  const origin = contract.allowed_origin;
  const perms = contract.permissions || {};
  const services = Object.keys(perms).sort();
  const totalOps = services.reduce((sum, s) => sum + (perms[s] || []).length, 0);

  // Derive a readable label from the origin (strip protocol, keep hostname)
  const label = (() => {
    if (!origin) return '(no origin)';
    try {
      const hostname = new URL(`https://${origin}`).hostname;
      if (hostname && hostname !== '') return hostname;
    } catch { /* fall through to raw origin */ }
    return origin;
  })();

  const handleRevoke = () => {
    setRevoking(true);
    I.revokeV3Contract?.(origin).then(() => {
      I.setStatus?.(`Revoked contract for ${label}`);
      I.v3ContractsLoad?.();
    }).catch(() => {
      I.setStatus?.('Failed to revoke contract');
    }).finally(() => {
      setRevoking(false);
      setShowRevoke(false);
    });
  };

  return (
    <div className="mb-3 overflow-hidden rounded border border-border bg-card transition-colors hover:border-brand/40">
      {/* Collapsed row — origin, service count, expand */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-testid="app-contract-toggle"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <span className="truncate font-medium text-foreground">{label}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {services.length} {services.length === 1 ? 'service' : 'services'} · {totalOps} {totalOps === 1 ? 'permission' : 'permissions'}
          </div>
        </div>
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
      </button>

      {open && (
        <>
          <div className="border-b border-border" />
          <div className="px-4 py-3">
            {/* Permissions breakdown — service → operations */}
            {services.map((service) => (
              <div key={service} className="mb-2 last:mb-0">
                <div className="text-xs font-medium text-muted-foreground">{service}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(perms[service] || []).map((op) => (
                    <span
                      key={op}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-muted px-2 py-0.5 text-[11px] font-medium text-brand-300"
                    >
                      <Shield className="h-3 w-3" strokeWidth={2} />
                      {op}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => setShowRevoke(!showRevoke)}
              data-testid="contract-revoke-toggle"
            >
              <ShieldX className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
              Revoke contract
            </Button>
          </div>
        </>
      )}

      {/* Revoke confirmation */}
      {showRevoke && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-sm text-danger">
            Revoke access for <strong className="text-foreground">{label}</strong>?
            This app will lose all data access immediately.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRevoke}
              disabled={revoking}
              data-testid="contract-revoke-confirm"
            >
              {revoking ? 'Revoking...' : 'Revoke'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRevoke(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Empty state ──

function EmptyContracts() {
  return (
    <div
      className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center"
      data-testid="contracts-empty"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
        <FileText className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">No app contracts yet</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        An app contract appears here when a website or app asks to access your data.
        You approve each one — and can revoke it any time. Nothing touches your node
        until you say so.
      </p>
    </div>
  );
}

// ── Contracts list ──

function AppContracts({ I }: { I: Record<string, any> }) {
  const contracts = I.v3Contracts || [];
  const query = (I.search ?? '').trim().toLowerCase();
  const filtered = query
    ? contracts.filter((c: any) =>
        String(c?.allowed_origin ?? '').toLowerCase().includes(query) ||
        Object.keys(c?.permissions ?? {}).some((s) => s.toLowerCase().includes(query)),
      )
    : contracts;

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">App Contracts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage which apps can access your data — one contract per app, with per-service permissions.
        </p>
      </div>
      {contracts.length === 0 ? (
        <EmptyContracts />
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground" data-testid="contracts-no-match">
          No app contracts match "{I.search}".
        </p>
      ) : (
        filtered.map((c: any, i: number) => (
          <AppContractCard key={i} I={I} contract={c} />
        ))
      )}
    </>
  );
}

// ── Page ──

function ContractPage({ I }: { I: Record<string, any> }) {
  const showNudge = I.isAuthenticated?.() && !I.hasRecoveryContact?.();

  return (
    <AppShell I={I} maxWidth="max-w-4xl" testid="contract-page">
      {showNudge && (
        <div className="mb-4">
          <RecoveryNudgeBanner onNavigate={() => I.setMode('settings')} />
        </div>
      )}
      <AppContracts I={I} />
    </AppShell>
  );
}

export default ContractPage;