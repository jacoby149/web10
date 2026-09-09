import { useCallback, useEffect, useState } from 'react';
import { Shield, Plus, Trash2, X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateGroup } from '@/data';
import { errorMessage } from '@/components/shared/Toast';

const LOG = (...args: unknown[]) => console.log('[social:groups:manage:roles]', ...args);

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
// legacy flat list. Normalize to the map shape on load so the editor (and the
// save) only ever speak D58.
function isRoleMap(perms: unknown): perms is Record<string, string[]> {
  return !!perms && typeof perms === 'object' && !Array.isArray(perms);
}

function normalizeRole(role: Record<string, unknown>): Record<string, unknown> {
  const perms = role.permissions;
  if (isRoleMap(perms)) return { ...role, permissions: { ...perms } };
  const services = Array.isArray((role as { services?: unknown[] }).services) && (role as { services?: unknown[] }).services!.length
    ? ((role as { services: string[] }).services)
    : ['*'];
  const flat = Array.isArray(perms) ? (perms as string[]) : [];
  const permissions: Record<string, string[]> = {};
  for (const svc of services) permissions[svc] = [...flat];
  return { ...role, permissions };
}

let _roleIdCounter = 0;

function RoleEditor({ role, onChange, onRemove }: {
  role: Record<string, unknown> & { permissions: Record<string, string[]> };
  onChange: (role: Record<string, unknown>) => void;
  onRemove?: () => void;
}) {
  const services = Object.keys(role.permissions || {});

  const togglePermission = (service: string, perm: string) => {
    const ops = role.permissions[service] || [];
    const next = ops.includes(perm) ? ops.filter((p) => p !== perm) : [...ops, perm];
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
    <div className="rounded-lg border border-border bg-surface p-3" data-testid="manage-roles-role">
      <div className="flex items-center gap-2">
        <Input
          value={(role.name as string) || ''}
          onChange={(e) => onChange({ ...role, name: e.target.value })}
          placeholder="Role name"
          className="h-8 w-40 bg-elevated"
          aria-label="Role name"
          data-testid="manage-roles-role-name"
        />
        {onRemove && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-danger hover:text-danger" onClick={onRemove} aria-label="Remove role" data-testid="manage-roles-role-remove">
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {services.map((service, i) => (
          <div key={service || `new-${i}`} className="rounded border border-border p-2.5" data-testid="manage-roles-service">
            <div className="flex items-center gap-1">
              <Input
                value={service}
                onChange={(e) => renameService(service, e.target.value)}
                placeholder="service (e.g. posts, or * for all)"
                className="h-7 w-44 bg-elevated text-xs"
                aria-label={`Service ${service || 'new'}`}
                data-testid="manage-roles-service-name"
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => removeService(service)} aria-label="Remove service">
                <X className="h-3 w-3" strokeWidth={1.5} />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {KNOWN_PERMISSIONS.map(({ key, label }) => {
                const active = (role.permissions[service] || []).includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePermission(service, key)}
                    aria-pressed={active}
                    data-testid={`manage-roles-perm-${service}-${key}`}
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active
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
        ))}
        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-foreground" onClick={addService} data-testid="manage-roles-add-service">
          <Plus className="mr-1 h-3 w-3" strokeWidth={1.5} />
          Add service
        </Button>
      </div>
    </div>
  );
}

/**
 * The Roles section of the Manage sheet — the group's per-service role maps
 * (D58) + the **Delete group** action (owner only). Ported from the
 * authenticator's `GroupRolesDialog`: each role is a named bundle of
 * per-service permission ops; the editor toggles ops per service row and saves
 * the canonical map via `updateGroup({ roles })`. The Delete action is a
 * two-tap confirm that calls `onDelete` (the detail screen deletes + navigates
 * back to `/groups`).
 */
export default function ManageRolesSection({
  groupId,
  roles,
  onSaved,
  onDelete,
}: {
  groupId: string;
  roles: Record<string, unknown>[];
  onSaved: () => void;
  onDelete: () => void;
}) {
  const parseRoles = useCallback(() => {
    const list = Array.isArray(roles) ? roles : [];
    return list.map((r) => ({ ...normalizeRole(r), _id: ++_roleIdCounter }));
  }, [roles]);

  const [roleList, setRoleList] = useState<Record<string, unknown>[]>(parseRoles);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoleList(parseRoles());
  }, [parseRoles]);

  const addRole = () => {
    setRoleList([...roleList, { _id: ++_roleIdCounter, name: '', permissions: { posts: ['readAll'] } }]);
  };

  const removeRole = (idx: number) => setRoleList(roleList.filter((_, i) => i !== idx));

  const updateRole = (idx: number, updated: Record<string, unknown>) => {
    const next = [...roleList];
    next[idx] = { ...updated, _id: roleList[idx]._id };
    setRoleList(next);
  };

  const handleSave = async () => {
    if (roleList.some((r) => !r.name || !(r.name as string).trim())) {
      setError('Role names cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rolesToSave = roleList.map(({ _id, services, ...rest }) => {
        const permissions = Object.fromEntries(
          Object.entries((rest.permissions as Record<string, string[]>) || {}).filter(([svc]) => svc.trim() !== ''),
        );
        return { ...rest, permissions };
      });
      await updateGroup(groupId, { roles: rolesToSave as Record<string, unknown>[] });
      LOG('roles saved', rolesToSave.length);
      onSaved();
    } catch (e) {
      LOG('roles — failed:', e);
      setError(errorMessage(e, 'Could not update the roles.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {roleList.map((role, idx) => (
          <RoleEditor
            key={(role._id as number) ?? idx}
            role={role as Record<string, unknown> & { permissions: Record<string, string[]> }}
            onChange={(updated) => updateRole(idx, updated)}
            onRemove={() => removeRole(idx)}
          />
        ))}
      </div>

      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={addRole} data-testid="manage-roles-add-role">
        <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
        Add role
      </Button>

      {error && (
        <div className="text-sm text-danger" role="alert" data-testid="manage-roles-error">
          {error}
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-3">
        <Button variant="brand" size="sm" onClick={handleSave} disabled={saving} data-testid="manage-roles-save">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : 'Save roles'}
        </Button>
      </div>

      {/* Delete group — two-tap confirm (owner only) */}
      <div className="rounded-lg border border-danger/30 bg-danger-muted/30 p-3" data-testid="manage-roles-delete-zone">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-danger" strokeWidth={1.75} />
          <p className="flex-1 text-sm font-medium text-danger">Delete group</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className={confirmDelete ? 'border-danger bg-danger text-white hover:bg-danger' : 'border-danger/40 text-danger'}
            data-testid="manage-roles-delete"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : confirmDelete ? (
              'Confirm delete'
            ) : (
              'Delete'
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          This removes all members and cannot be undone.
        </p>
      </div>
    </div>
  );
}
