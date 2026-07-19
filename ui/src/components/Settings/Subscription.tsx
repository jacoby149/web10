import React from 'react';

function Subscription({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(false);
  const [plan, setPlan] = React.useState("MB/mo. 0, Credits/mo. 0");
  const [util, setUtil] = React.useState("Storage Utilization: _ / 0 MB");

  React.useEffect(() => {
    if (I.isAuthenticated()) {
      I.getPlan()
        .then((response: any) => {
          const data = response.data;
          const [space, credit, used] = [
            parseFloat(data["space"]).toFixed(2),
            parseFloat(data["credits"]).toFixed(2),
            parseFloat(data["used_space"]).toFixed(4),
          ];
          setPlan(`MB/mo. ${space}, Credits/mo. ${credit}`);
          setUtil(`Storage Utilization: ${used} / ${space} MB`);
        })
        .catch(() => { });
    }
  }, [I.auth]);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="font-medium">Subscription Details</span>
        <button onClick={() => setHide(!hide)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
        </button>
      </div>
      {!hide && (
        <>
          <div className="p-4">
            <input size={plan.length} placeholder={plan} readOnly className="w-full px-3 py-1.5 rounded-lg border text-sm mb-1" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} />
            <p className="text-xs ml-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{util}</p>
          </div>
          <div className="px-4 py-2.5 border-t flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => I.manageSpace()}>Space Plan</button>
            <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => I.manageCredits()}>Credit Plan</button>
            <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => I.manageSubscriptions()}>Subscriptions</button>
          </div>
        </>
      )}
    </div>
  );
}

export default Subscription;