import React from 'react';
import { X, Shield, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { groupDisplayName, isRoleMap } from '@/lib/group-utils';

let _roleIdCounter = 0;

const KNOWN_PERMISSIONS = [
  { key: 'readAll', label: 'Read all' },
  { key: 'create', label: 'Create' },
  { key: 'updateOwn', label: 'Update own' },
  { key: 'deleteOwn', label: 'Delete own' },
  { key: 'hideAll', label: 'Hide all (mod)' },
  { key: 'manageRoles', label: 'Manage roles' },
  { key: 'assignRoles', label: 'Assign roles' },
  { key: 'revokeRoles', label: 'Revoke roles' },
  { key: 'deleteGroup', label: 'Delete group' },
];

// Roles arrive in two shapes: the D58 per-service map (canonical) and the
// legacy flat list (the retired `services` array scoped it). Normalize to the
// map shape on load so the editor (and the save) only ever speak D58.
function normalizeRole(role: any): any {
  if (isRoleMap(role?.permissions)) return { ...role, permissions: { ...role.permissions } };
  const services = Array.isArray(role?.services) && role.services.length ? role.services : ['*'];
  const flat = Array.isArray(role?.permissions) ? role.permissions : [];
  const permissions: Record<string, string[]> = {};
  for (const svc of services) permissions[svc] = [...flat];
  return { ...role, permissions };
}

function RoleEditor({ role, onChange, onRemove }: {
  role: any;
  onChange: (role: any) => void;
  onRemove?: () => void;
}) {
  const services = Object.keys(role.permissions || {});

  const togglePermission = (service: string, perm: string) => {
    const ops: string[] = role.permissions[service] || [];
    const next = ops.includes(perm) ? ops.filter((p: string) => p !== perm) : [...ops, perm];
    onChange({ ...role, permissions: { ...role.permissions, [service]: next } });
  };

  const renameService = (oldService: string, value: string) => {
    const permissions: Record<string, string[]> = {};
    for (const [svc, ops] of Object.entries(role.permissions || {})) {
      permissions[svc === oldService ? value : svc] = Array.isArray(ops) ? ops : [];
    }
    onChange({ ...role, permissions });
  };

  const addService = () => {
    onChange({ ...role, permissions: { ...role.permissions, '': [] } });
  };

  const removeService = (service: string) => {
    const permissions = { ...role.permissions };
    delete permissions[service];
    onChange({ ...role, permissions });
  };

  return (
    <div className="rounded border border-border bg-elevated p-4">
      <div className="flex items-center gap-2">
        <Input
          value={role.name || ''}
          onChange={(e) => onChange({ ...role, name: e.target.value })}
          placeholder="Role name"
          className="h-8 w-40"
          aria-label="Role name"
        />
        {onRemove && (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger h-8 w-8 p-0" onClick={onRemove}>
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {services.map((service: string) => (
          <div key={service || `new-${services.indexOf(service)}`} className="rounded border border-border p-3">
            <span className="text-xs font-medium text-muted-foreground">Service:</span>
            <div className="mt-1 flex items-center gap-1">
              <Input
                value={service}
                onChange={(e) => renameService(service, e.target.value)}
                placeholder="service (e.g. posts, or * for all)"
                className="h-7 w-48 text-xs"
                aria-label={`Service ${service || 'new'}`}
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => removeService(service)}>
                <X className="h-3 w-3" strokeWidth={1.5} />
              </Button>
            </div>
            <div className="mt-2">
              <span className="text-xs font-medium text-muted-foreground">Permissions:</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {KNOWN_PERMISSIONS.map(({ key, label }) => {
                  const active = (role.permissions[service] || []).includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePermission(service, key)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${active
                        ? 'bg-brand-muted text-brand-300'
                        : 'bg-elevated text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-foreground" onClick={addService}>
          <Plus className="mr-1 h-3 w-3" strokeWidth={1.5} />
          Add service
        </Button>
      </div>
    </div>
  );
}

function GroupRolesDialog({ open, onOpenChange, group, I }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
  I: Record<string, any>;
}) {
  // Parse roles from the group — they may be stored as JSON strings or objects,
  // in either shape (D58 map or legacy flat). Normalize to the D58 map shape.
  const parseRoles = () => {
    if (!group.roles) return [];
    const list = Array.isArray(group.roles)
      ? group.roles
      : (() => { try { return JSON.parse(group.roles); } catch { return []; } })();
    return list.map((r: any) => ({ ...normalizeRole(r), _id: r._id || ++_roleIdCounter }));
  };

  const [roles, setRoles] = React.useState<any[]>(parseRoles);
  const [saving, setSaving] = React.useState(false);

  // Reset roles when dialog opens
  React.useEffect(() => {
    if (open) setRoles(parseRoles());
  }, [open]);

  const addRole = () => {
    setRoles([...roles, { _id: ++_roleIdCounter, name: '', permissions: { posts: ['readAll'] } }]);
  };

  const removeRole = (idx: number) => {
    setRoles(roles.filter((_, i) => i !== idx));
  };

  const updateRole = (idx: number, updated: any) => {
    const newRoles = [...roles];
    newRoles[idx] = { ...updated, _id: roles[idx]._id };
    setRoles(newRoles);
  };

  const handleSave = async () => {
    const hasEmptyName = roles.some((r) => !r.name || !r.name.trim());
    if (hasEmptyName) {
      I.setStatus?.('Role names cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const rolesToSave = roles.map(({ _id, services, ...rest }: any) => {
        // Drop unnamed service keys (a half-typed row) before they persist.
        const permissions = Object.fromEntries(
          Object.entries(rest.permissions || {}).filter(([svc]) => svc.trim() !== ''),
        );
        return { ...rest, permissions };
      });
      await I.v3UpdateGroup(group.group_id, { roles: rolesToSave });
      I.setStatus?.('Roles updated');
      I.v3GroupsManagesLoad?.();
      onOpenChange(false);
    } catch {
      I.setStatus?.('Failed to update roles');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-brand" strokeWidth={1.5} />
            Roles — {groupDisplayName(group.group_id)}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {roles.map((role, idx) => (
            <RoleEditor
              key={role._id ?? idx}
              role={role}
              onChange={(updated) => updateRole(idx, updated)}
              onRemove={() => removeRole(idx)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={addRole}>
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            Add role
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save roles'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GroupRolesDialog;
