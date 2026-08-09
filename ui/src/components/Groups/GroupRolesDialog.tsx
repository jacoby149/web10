import React from 'react';
import { X, Shield, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function groupDisplayName(groupId: string): string {
  const parts = groupId.split('/');
  if (parts.length >= 4) return `${parts[2]}/${parts[3]}`;
  return groupId;
}

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

function RoleEditor({ role, onChange, onRemove }: {
  role: any;
  onChange: (role: any) => void;
  onRemove?: () => void;
}) {
  const togglePermission = (perm: string) => {
    const perms = role.permissions || [];
    const newPerms = perms.includes(perm)
      ? perms.filter((p: string) => p !== perm)
      : [...perms, perm];
    onChange({ ...role, permissions: newPerms });
  };

  const toggleService = (idx: number, value: string) => {
    const services = [...(role.services || ['posts', 'comments'])];
    services[idx] = value;
    onChange({ ...role, services });
  };

  const addService = () => {
    onChange({ ...role, services: [...(role.services || []), ''] });
  };

  const removeService = (idx: number) => {
    const services = [...(role.services || [])];
    services.splice(idx, 1);
    onChange({ ...role, services });
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

      <div className="mt-3">
        <span className="text-xs font-medium text-muted-foreground">Services:</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {(role.services || ['posts', 'comments']).map((service: string, idx: number) => (
            <div key={idx} className="flex items-center gap-1">
              <Input
                value={service}
                onChange={(e) => toggleService(idx, e.target.value)}
                placeholder="service"
                className="h-7 w-32 text-xs"
                aria-label={`Service ${idx + 1}`}
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => removeService(idx)}>
                <X className="h-3 w-3" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-foreground" onClick={addService}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <span className="text-xs font-medium text-muted-foreground">Permissions:</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {KNOWN_PERMISSIONS.map(({ key, label }) => {
            const active = (role.permissions || []).includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => togglePermission(key)}
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
  );
}

function GroupRolesDialog({ open, onOpenChange, group, I }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
  I: Record<string, any>;
}) {
  // Parse roles from the group — they may be stored as JSON strings or objects
  const parseRoles = () => {
    if (!group.roles) return [];
    if (Array.isArray(group.roles)) return group.roles;
    try {
      return JSON.parse(group.roles);
    } catch {
      return [];
    }
  };

  const [roles, setRoles] = React.useState<any[]>(parseRoles);
  const [saving, setSaving] = React.useState(false);

  // Reset roles when dialog opens
  React.useEffect(() => {
    if (open) setRoles(parseRoles());
  }, [open]);

  const addRole = () => {
    setRoles([...roles, { name: '', services: ['posts', 'comments'], permissions: ['readAll'] }]);
  };

  const removeRole = (idx: number) => {
    setRoles(roles.filter((_, i) => i !== idx));
  };

  const updateRole = (idx: number, updated: any) => {
    const newRoles = [...roles];
    newRoles[idx] = updated;
    setRoles(newRoles);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await I.v3UpdateGroup(group.group_id, { roles });
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
              key={idx}
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
