import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Contract from './Contract';

function Contracts({ I }: { I: Record<string, any> }) {
  const contract_items = I.services.map((d: any, i: number) =>
    <Contract I={I} key={i} data={d} isRequest={false} />
  );
  return (
    <>
      <div className="text-center py-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Your Contracts
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Manage which apps can access your data
        </p>
      </div>
      {contract_items}
    </>
  );
}

function ContractPage({ I }: { I: Record<string, any> }) {
  return (
    <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 p-6 overflow-auto">
          <Contracts I={I} />
        </div>
      </div>
    </div>
  );
}

export default ContractPage;