import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';

function RequestViewer({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
  return (
    <div className="max-w-[800px] mx-auto">
      <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="font-medium">{contractI.data.service}</span>
          <button onClick={contractI.toggleHide} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <i className={contractI.hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
          </button>
        </div>
        {!contractI.hide && (
          <div className="p-4">
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}><u>Websites/IPs</u> :</span>
            <Websites contractI={contractI} />
            <WhiteList contractI={contractI} />
            <BlackList contractI={contractI} />
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestViewer;