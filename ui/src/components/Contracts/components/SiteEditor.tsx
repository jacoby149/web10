import React from 'react';

function SiteEditor({ contractI }: { contractI: Record<string, any> }) {
  const [value, setValue] = React.useState("");
  const addSite = () => {
    if (value !== "") {
      contractI.addSite(value);
      setValue("");
    }
  };
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} className="w-[140px] ml-2.5 px-2 py-1 rounded border text-sm" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} placeholder="website.com" />
      <button onClick={addSite} className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }}>
        <i className="fa fa-circle-plus mr-0.5 font-weight-bold" style={{ color: '#99aacc' }}></i>add
      </button>
    </div>
  );
}

export default SiteEditor;