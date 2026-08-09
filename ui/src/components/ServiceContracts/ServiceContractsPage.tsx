import React from 'react';
import AppShell from '../shared/AppShell';
import RecoveryNudgeBanner from '../shared/RecoveryNudgeBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Globe, Trash2, Shield, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function EmptyContracts() {
  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
        <Shield className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">No service contracts</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        A service contract appears here when an app asks to access your data. It's a simple CORS toggle — the app can't talk to your node without it.
      </p>
    </div>
  );
}

function AddContractDialog({ open, onOpenChange, I }: { open: boolean; onOpenChange: (open: boolean) => void; I: Record<string, any> }) {
  const [service, setService] = React.useState('');
  const [origin, setOrigin] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleAdd = async () => {
    if (!service.trim() || !origin.trim()) return;
    setSaving(true);
    try {
      await I.addV3Contract(service.trim(), origin.trim());
      setService('');
      setOrigin('');
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
            Add service contract
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Service</label>
            <Input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="posts"
              className="mt-1.5"
              aria-label="Service name"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Allowed origin</label>
            <Input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="https://myapp.web10.com"
              className="mt-1.5"
              aria-label="Allowed origin"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleAdd} disabled={saving || !service.trim() || !origin.trim()}>
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
            This revokes all {count} service contract{count === 1 ? '' : 's'}. No website will be able to access your data until you add contracts again.
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

function ServiceContractsPage({ I }: { I: Record<string, any> }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = React.useState(false);
  const showNudge = I.isAuthenticated?.() && !I.hasRecoveryContact?.();

  const contracts = I.v3Contracts || [];
  const query = (I.search ?? '').trim().toLowerCase();
  const filtered = query
    ? contracts.filter((c: any) =>
      (c.service_name || '').toLowerCase().includes(query) ||
      (c.allowed_origin || '').toLowerCase().includes(query)
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
        <h1 className="font-display text-2xl font-bold text-foreground">Service contracts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Which websites can access your data — simple CORS toggles.
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
        <div className="mx-auto space-y-2 max-w-[800px]">
          {filtered.map((contract: any, i: number) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded border border-border bg-card px-4 py-3 transition-colors hover:border-brand/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{contract.service_name}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{contract.allowed_origin}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger h-8 px-2 shrink-0"
                onClick={async () => {
                  try {
                    await I.revokeV3Contract(contract.service_name, contract.allowed_origin);
                  } catch {
                    I.setStatus?.('Failed to revoke contract');
                  }
                }}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddContractDialog open={addOpen} onOpenChange={setAddOpen} I={I} />
      <RevokeAllDialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen} I={I} count={contracts.length} />
    </AppShell>
  );
}

export default ServiceContractsPage;
