import React from 'react';
import { CirclePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

const CHECKBOX_CLASS =
  'h-4 w-4 rounded-sm border-border accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function PermissionCheckboxes({ permissionI, idPrefix }: { permissionI: Record<string, any>; idPrefix: string }) {
  const rows: Array<['create' | 'read' | 'update' | 'delete', (v: boolean) => void]> = [
    ['create', permissionI.setCreate],
    ['read', permissionI.setRead],
    ['update', permissionI.setUpdate],
    ['delete', permissionI.setDelete],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-4">
      {rows.map(([key, setter]) => (
        <label key={key} className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            id={`${idPrefix}-${key}`}
            type="checkbox"
            className={CHECKBOX_CLASS}
            checked={permissionI.entry[key]}
            onChange={(e) => setter(e.target.checked)}
            data-testid={`${idPrefix}-${key}-checkbox`}
          />
          {key}
        </label>
      ))}
    </div>
  );
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
    <div className="mt-3.5 rounded-sm bg-elevated p-3">
      <div className="flex items-center gap-2">
        <Input
          value={permissionI.entry.provider}
          onChange={(e) => permissionI.setProvider(e.target.value)}
          className="w-[130px]"
          placeholder="web10.app"
          aria-label="Provider to allow"
          data-testid="whitelist-provider-input"
        />
        <Input
          value={permissionI.entry.username}
          onChange={(e) => permissionI.setUsername(e.target.value)}
          className="w-[130px]"
          placeholder="username"
          aria-label="Username to allow"
          data-testid="whitelist-username-input"
        />
        <Button variant="ghost" size="sm" onClick={() => add(permissionI.entry)} data-testid="whitelist-add">
          <CirclePlus className="mr-1.5 h-4 w-4 text-brand-300" strokeWidth={1.5} />
          Allow
        </Button>
      </div>
      <PermissionCheckboxes permissionI={permissionI} idPrefix="whitelist" />
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
    <div className="mt-3.5 rounded-sm bg-elevated p-3">
      <div className="flex items-center gap-2">
        <Input
          value={permissionI.entry.provider}
          onChange={(e) => permissionI.setProvider(e.target.value)}
          className="w-[130px]"
          placeholder="web10.app"
          aria-label="Provider to block"
          data-testid="blacklist-provider-input"
        />
        <Input
          value={permissionI.entry.username}
          onChange={(e) => permissionI.setUsername(e.target.value)}
          className="w-[130px]"
          placeholder="username"
          aria-label="Username to block"
          data-testid="blacklist-username-input"
        />
        <Button variant="ghost" size="sm" onClick={() => add(permissionI.entry)} data-testid="blacklist-add">
          <CirclePlus className="mr-1.5 h-4 w-4 text-brand-300" strokeWidth={1.5} />
          Block
        </Button>
      </div>
      <PermissionCheckboxes permissionI={permissionI} idPrefix="blacklist" />
    </div>
  );
}

export { WhiteListEditor, BlackListEditor };