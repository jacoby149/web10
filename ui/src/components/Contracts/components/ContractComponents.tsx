function Tag({ text, color }: { text: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'var(--color-primary-100)', text: 'var(--color-primary-700)' },
    info: { bg: 'var(--color-info-bg)', text: 'var(--color-info)' },
    warning: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning)' },
    danger: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger)' },
  };
  const c = colorMap[color] || colorMap.info;
  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded-full mr-1 mb-1" style={{ backgroundColor: c.bg, color: c.text }}>
      {text}
    </span>
  );
}

function Websites({ contractI }: { contractI: Record<string, any> }) {
  const site_items = contractI.data.cross_origins.map((site: string, i: number) => (
    <span key={i} className="inline-block px-2 py-0.5 text-xs rounded-full mr-1 mb-1" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
      {site}
      {contractI.mode === "view" ? "" :
        <button style={{ marginLeft: "5px" }} onClick={() => contractI.deleteSite(i)} className="text-xs hover:opacity-70">×</button>
      }
    </span>
  ));
  return site_items.length > 0 ? <div className="ml-2 mt-1">{site_items}</div> : <></>;
}

function BlackList({ contractI }: { contractI: Record<string, any> }) {
  const permissions = contractI.data.blacklist;
  const permission_items = permissions.map((p: any, i: number) => (
    <div key={i} className="flex items-center gap-2 flex-wrap">
      <span className="ml-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{p.provider}/{p.username} :</span>
      {p.create && <Tag text="create" color="primary" />}
      {p.read && <Tag text="read" color="info" />}
      {p.update && <Tag text="update" color="warning" />}
      {p.delete && <Tag text="delete" color="danger" />}
      {contractI.mode == "view" ? "" :
        <i onClick={() => contractI.deleteBlackListEntry(i)} className="cursor-pointer hover:opacity-70" style={{ color: '#ff7e7e' }}>
          <i className="fa fa-trash font-weight-bold"></i>
        </i>
      }
    </div>
  ));
  return permissions.length > 0 ?
    <div className="mt-2.5">
      <div className="mb-1 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}><u>Blocked Users</u> :</div>
      {permission_items}
    </div> : <></>;
}

function WhiteList({ contractI }: { contractI: Record<string, any> }) {
  const permissions = contractI.data.whitelist;
  const permission_items = permissions.map((p: any, i: number) => (
    <div key={i} className="flex items-center gap-2 flex-wrap">
      <span className="ml-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{p.provider}/{p.username} :</span>
      {p.create && <Tag text="create" color="primary" />}
      {p.read && <Tag text="read" color="info" />}
      {p.update && <Tag text="update" color="warning" />}
      {p.delete && <Tag text="delete" color="danger" />}
      {contractI.mode == "view" ? "" :
        <i onClick={() => contractI.deleteWhiteListEntry(i)} className="cursor-pointer hover:opacity-70" style={{ color: '#ff7e7e' }}>
          <i className="fa fa-trash font-weight-bold"></i>
        </i>
      }
    </div>
  ));
  return permissions.length > 0 ?
    <div className="mt-2.5">
      <div className="mb-1 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}><u>Allowed Users</u> :</div>
      {permission_items}
    </div> : <></>;
}

export { Websites, BlackList, WhiteList };