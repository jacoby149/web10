import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import MobileNav from '../shared/MobileNav';
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 overflow-auto pb-16 md:pb-0">
          <div className="mx-auto max-w-4xl p-4 sm:p-6" data-testid="contract-page">
            <Contracts I={I} />
          </div>
        </div>
      </div>
      <MobileNav I={I} />
    </div>
  );
}

export default ContractPage;