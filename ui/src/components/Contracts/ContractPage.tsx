import AppShell from '../shared/AppShell';
import Contract from './Contract';

function Contracts({ I }: { I: Record<string, any> }) {
  const contract_items = I.services.map((d: any, i: number) =>
    <Contract I={I} key={i} data={d} isRequest={false} />
  );
  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Your contracts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage which apps can access your data — these are your contracts.
        </p>
      </div>
      {contract_items}
    </>
  );
}

function ContractPage({ I }: { I: Record<string, any> }) {
  return (
    <AppShell I={I} maxWidth="max-w-4xl" testid="contract-page">
      <Contracts I={I} />
    </AppShell>
  );
}

export default ContractPage;