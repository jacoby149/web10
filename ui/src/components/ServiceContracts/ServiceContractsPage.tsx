import React from 'react';
import AppShell from '../shared/AppShell';
import RecoveryNudgeBanner from '../shared/RecoveryNudgeBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Globe, Trash2, Shield, Plus, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function EmptyContracts() {
  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
        <Shield className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">No app contracts</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        An app contract appears here when an app asks to access your data. One contract per app, per-service permissions. No app touches your node without one.
      </p>
    </div>
  );
}

function AddContractDialog({ open, onOpenChange, I }: { open: boolean; onOpenChange: (open: boolean) => void; I: Record<string, any> }) {
  const [origin, setOrigin] = React.useState('');
  const [service, setService] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleAdd = async () => {
    if (!origin.trim() || !service.trim()) return;
    setSaving(true);
    try {
      const permissions: Record<string, string[]> = {
        [service.trim()]: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
      };
      await I.addV3Contract(origin.trim(), permissions);
      setOrigin('');
      setService('');
      onOpenChange(false);
    } catch {
      I.setStatus?.('Failed to add contract');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-brand" strokeWidth={1.5} />
            Add app contract
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">App origin</label>
            <Input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="https://myapp.web10.com"
              className="mt-1.5"
              aria-label="App origin"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Service</label>
            <Input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="posts"
              className="mt-1.5"
              aria-label="Service name"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Default permissions: readAll, create, updateOwn, deleteOwn
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleAdd} disabled={saving || !origin.trim() || !service.trim()}>
              {saving ? 'Adding...' : 'Add contract'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevokeAllDialog({ open, onOpenChange, I, count }: { open: boolean; onOpenChange: (open: boolean) => void; I: Record<string, any>; count: number }) {
  const [confirm, setConfirm] = React.useState('');

  const handleRevoke = async () => {
    if (confirm !== 'revoke all') return;
    try {
      await I.revokeV3Contract();
      I.setStatus?.('All contracts revoked');
      setConfirm('');
      onOpenChange(false);
    } catch {
      I.setStatus?.('Failed to revoke contracts');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <Shield className="h-5 w-5" strokeWidth={1.5} />
            Kill switch — revoke all contracts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This revokes all {count} app contract{count === 1 ? '' : 's'}. No website will be able to access your data until you add contracts again.
          </p>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Type "revoke all" to confirm</label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="revoke all"
              className="mt-1.5"
              aria-label="Confirm revoke all"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleRevoke} disabled={confirm !== 'revoke all'}>
              Revoke all
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContractCard({ contract, I, expanded, onToggle }: { contract: any; I: Record<string, any>; expanded: boolean; onToggle: () => void }) {
  const permissions = contract.permissions || {};
  const services = Object.keys(permissions);

  return (
    <div className="mx-auto max-w-[800px]">
      <div className="mb-4 overflow-hidden rounded border border-border bg-card transition-colors hover:border-brand/40">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <span className="truncate font-medium text-foreground">{contract.allowed_origin}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{services.length} {services.length === 1 ? 'service' : 'services'}</span>
              <span>·</span>
              <span className="truncate">{services.join(', ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-muted-foreground">
              {expanded ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
            </span>
          </div>
        </button>
        {expanded && <div className="border-b border-border" />}
        {expanded && (
          <div className="p-4">
            <div className="space-y-3">
              {services.map((svc: string) => (
                <div key={svc}>
                  <span className="text-sm font-medium text-muted-foreground">{svc}:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {permissions[svc].map((perm: string) => (
                      <Badge key={perm} variant="outline">{perm}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-border px-4 py-2.5 mt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={async () => {
                  try {
                    await I.revokeV3Contract(contract.allowed_origin);
                  } catch {
                    I.setStatus?.('Failed to revoke contract');
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                Revoke
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceContractsPage({ I }: { I: Record<string, any> }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const showNudge = I.isAuthenticated?.() && !I.hasRecoveryContact?.();

  const contracts = I.v3Contracts || [];
  const query = (I.search ?? '').trim().toLowerCase();
  const filtered = query
    ? contracts.filter((c: any) =>
        (c.allowed_origin || '').toLowerCase().includes(query) ||
        Object.keys(c.permissions || {}).some((s: string) => s.toLowerCase().includes(query))
      )
    : contracts;

  return (
    <AppShell I={I} maxWidth="max-w-4xl" testid="service-contracts-page">
      {showNudge && (
        <div className="mb-4">
          <RecoveryNudgeBanner onNavigate={() => I.setMode('settings')} />
        </div>
      )}

      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">App contracts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Which apps can access your data — one contract per app, per-service permissions.
        </p>
      </div>

      {contracts.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <Button variant="brand" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            Add contract
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:text-danger"
            onClick={() => setRevokeAllOpen(true)}
          >
            <Shield className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            Revoke all ({contracts.length})
          </Button>
        </div>
      )}

      {contracts.length === 0 ? (
        <EmptyContracts />
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No contracts match "{I.search}".
        </p>
      ) : (
        <div className="space-y-0">
          {filtered.map((contract: any, i: number) => (
            <ContractCard
              key={contract.allowed_origin || i}
              contract={contract}
              I={I}
              expanded={expandedId === contract.allowed_origin}
              onToggle={() => setExpandedId(expandedId === contract.allowed_origin ? null : contract.allowed_origin)}
            />
          ))}
        </div>
      )}

      <AddContractDialog open={addOpen} onOpenChange={setAddOpen} I={I} />
      <RevokeAllDialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen} I={I} count={contracts.length} />
    </AppShell>
  );
}

export default ServiceContractsPage;
