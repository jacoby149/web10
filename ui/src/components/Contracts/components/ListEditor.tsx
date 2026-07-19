import React from 'react';

function usePermission() {
  const permissionI = {} as Record<string, any>;
  [permissionI.entry, permissionI.setEntry] = React.useState({
    provider: "",
    username: "",
    create: false,
    read: false,
    update: false,
    delete: false
  });
  permissionI.setCreate = function (create: boolean) {
    const newEntry = { ...permissionI.entry, create: create };
    permissionI.setEntry(newEntry);
  };
  permissionI.setRead = function (read: boolean) {
    const newEntry = { ...permissionI.entry, read: read };
    permissionI.setEntry(newEntry);
  };
  permissionI.setUpdate = function (update: boolean) {
    const newEntry = { ...permissionI.entry, update: update };
    permissionI.setEntry(newEntry);
  };
  permissionI.setDelete = function (d: boolean) {
    const newEntry = { ...permissionI.entry, delete: d };
    permissionI.setEntry(newEntry);
  };
  permissionI.setProvider = function (p: string) {
    const newEntry = { ...permissionI.entry, provider: p };
    permissionI.setEntry(newEntry);
  };
  permissionI.setUsername = function (u: string) {
    const newEntry = { ...permissionI.entry, username: u };
    permissionI.setEntry(newEntry);
  };
  permissionI.reset = function () {
    permissionI.setEntry({
      provider: "",
      username: "",
      create: false,
      read: false,
      update: false,
      delete: false
    });
  };
  return permissionI;
}

function WhiteListEditor({ contractI }: { contractI: Record<string, any> }) {
  const permissionI = usePermission();
  function add(entry: any) {
    if (entry.create || entry.read || entry.update || entry.delete) {
      if (entry.provider !== "" && entry.username !== "") {
        contractI.addWhiteList(entry);
        permissionI.reset();
      }
    }
  }
  return (
    <div className="mt-3.5">
      <div className="flex items-center gap-2">
        <input value={permissionI.entry.provider} onChange={(e) => permissionI.setProvider(e.target.value)} className="w-[120px] px-2 py-1 rounded border text-sm" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} placeholder="web10.app" />
        <input value={permissionI.entry.username} onChange={(e) => permissionI.setUsername(e.target.value)} className="w-[120px] px-2 py-1 rounded border text-sm" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} placeholder="jacoby149" />
        <button onClick={() => add(permissionI.entry)} className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }}>
          <i className="fa fa-circle-plus mr-0.5 font-weight-bold" style={{ color: '#99aacc' }}></i>allow
        </button>
      </div>
      <div className="flex gap-4 mt-1.5">
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.create} onChange={(e) => permissionI.setCreate(e.target.checked)} />
          create
        </label>
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.read} onChange={(e) => permissionI.setRead(e.target.checked)} />
          read
        </label>
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.update} onChange={(e) => permissionI.setUpdate(e.target.checked)} />
          update
        </label>
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.delete} onChange={(e) => permissionI.setDelete(e.target.checked)} />
          delete
        </label>
      </div>
    </div>
  );
}

function BlackListEditor({ contractI }: { contractI: Record<string, any> }) {
  const permissionI = usePermission();
  function add(entry: any) {
    if (entry.create || entry.read || entry.update || entry.delete) {
      if (entry.provider !== "" && entry.username !== "") {
        contractI.addBlackList(entry);
        permissionI.reset();
      }
    }
  }
  return (
    <div className="mt-3.5">
      <div className="flex items-center gap-2">
        <input value={permissionI.entry.provider} onChange={(e) => permissionI.setProvider(e.target.value)} className="w-[120px] px-2 py-1 rounded border text-sm" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} placeholder="web10.app" />
        <input value={permissionI.entry.username} onChange={(e) => permissionI.setUsername(e.target.value)} className="w-[120px] px-2 py-1 rounded border text-sm" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} placeholder="jacoby149" />
        <button onClick={() => add(permissionI.entry)} className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }}>
          <i className="fa fa-circle-plus mr-0.5 font-weight-bold" style={{ color: '#99aacc' }}></i>block
        </button>
      </div>
      <div className="flex gap-4 mt-1.5">
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.create} onChange={(e) => permissionI.setCreate(e.target.checked)} />
          create
        </label>
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.read} onChange={(e) => permissionI.setRead(e.target.checked)} />
          read
        </label>
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.update} onChange={(e) => permissionI.setUpdate(e.target.checked)} />
          update
        </label>
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={permissionI.entry.delete} onChange={(e) => permissionI.setDelete(e.target.checked)} />
          delete
        </label>
      </div>
    </div>
  );
}

export { WhiteListEditor, BlackListEditor };