import { FileText } from 'lucide-react';
import AppShell from '../shared/AppShell';
import RecoveryNudgeBanner from '../shared/RecoveryNudgeBanner';
import Contract from './Contract';

function EmptyContracts() {
  return (
    <div
      className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center"
      data-testid="contracts-empty"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
        <FileText className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">No contracts yet</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        A contract appears here the first time an app asks to read or write your
        data. You approve each one — and can revoke it any time. Nothing touches
        your node until you say so.
      </p>
    </div>
  );
}

function Contracts({ I }: { I: Record<string, any> }) {
  // the "*" star record is never a contract (ContractViewer hides it); don't
  // let it count toward "you have contracts"
  const all = (I.services as any[]).filter((d) => d?.service !== '*');
  const query = (I.search ?? '').trim().toLowerCase();
  const contracts = query
    ? all.filter((d) => {
        const inName = String(d?.service ?? '').toLowerCase().includes(query);
        const inSites = (d?.cross_origins ?? []).some((s: string) =>
          String(s).toLowerCase().includes(query),
        );
        return inName || inSites;
      })
    : all;

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Your contracts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage which apps can access your data — these are your contracts.
        </p>
      </div>
      {all.length === 0 ? (
        <EmptyContracts />
      ) : contracts.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground" data-testid="contracts-no-match">
          No contracts match "{I.search}".
        </p>
      ) : (
        contracts.map((d: any, i: number) => (
          <Contract I={I} key={i} data={d} isRequest={false} />
        ))
      )}
    </>
  );
}

function ContractPage({ I }: { I: Record<string, any> }) {
  const showNudge = I.isAuthenticated?.() && !I.hasRecoveryContact?.();

  return (
    <AppShell I={I} maxWidth="max-w-4xl" testid="contract-page">
      {showNudge && (
        <div className="mb-4">
          <RecoveryNudgeBanner onNavigate={() => I.setMode('settings')} />
        </div>
      )}
      <Contracts I={I} />
    </AppShell>
  );
}

export default ContractPage;