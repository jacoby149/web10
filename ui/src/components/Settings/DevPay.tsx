import React from 'react';

function DevPay({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="font-medium">DevPay</span>
        <button onClick={() => setHide(!hide)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
        </button>
      </div>
      {!hide && (
        <div className="px-4 py-2.5 border-t flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
          <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => I.manageBusiness()}>Connect To Bank</button>
          <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => I.businessLogin()}>DevPay Stats</button>
        </div>
      )}
    </div>
  );
}

export default DevPay;