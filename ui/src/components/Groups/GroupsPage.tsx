import React from 'react';
import { Users, UserPlus, Shield, Plus, Lock, LockOpen, MessageSquare } from 'lucide-react';
import AppShell from '../shared/AppShell';
import RecoveryNudgeBanner from '../shared/RecoveryNudgeBanner';
import GroupCard from './GroupCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function EmptyGroups({ isManaged }: { isManaged: boolean }) {
  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
        {isManaged ? (
          <Shield className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
        ) : (
          <Users className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
        )}
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">
        {isManaged ? 'No groups managed' : 'No groups yet'}
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {isManaged
          ? 'Groups you own or have management permissions for will appear here. You can manage members, roles, and settings.'
          : 'Join a group to discover content shared by its members. Groups are how people find your content and you find theirs.'
        }
      </p>
    </div>
  );
}

function CreateGroupDialog({ open, onOpenChange, I }: { open: boolean; onOpenChange: (open: boolean) => void; I: Record<string, any> }) {
  const [name, setName] = React.useState('');
  const [joinPolicy, setJoinPolicy] = React.useState<'open' | 'request' | 'invite_only'>('invite_only');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName('');
      setJoinPolicy('invite_only');
      setSaving(false);
    }
  }, [open]);

  const decoded = I.wapi?.readToken?.();
  const username = decoded?.username || decoded?.sub || '';

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const roles = [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
        { name: 'member', services: ['posts', 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      ];
      const members = [{ member_key: username, role: 'owner' }];
      await I.v3CreateGroup?.(slug, joinPolicy, roles, members);
      I.setStatus?.(`Group "${name}" created`);
      setName('');
      I.v3GroupsLoad?.();
      I.v3GroupsManagesLoad?.();
      onOpenChange(false);
    } catch {
      I.setStatus?.('Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-brand" strokeWidth={1.5} />
            Create group
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Community"
              className="mt-1.5"
              aria-label="Group name"
            />
            {name && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                web10.app/groups/{username}/{name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Join policy</label>
            <div className="mt-1.5 flex gap-2">
              {([
                { value: 'open', label: 'Open', icon: LockOpen },
                { value: 'request', label: 'Request', icon: MessageSquare },
                { value: 'invite_only', label: 'Invite only', icon: Lock },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setJoinPolicy(value)}
                  className={`flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${joinPolicy === value
                    ? 'bg-brand-muted text-brand-300'
                    : 'bg-elevated text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? 'Creating...' : 'Create group'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JoinGroupDialog({ open, onOpenChange, I }: { open: boolean; onOpenChange: (open: boolean) => void; I: Record<string, any> }) {
  const [groupId, setGroupId] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setGroupId('');
      setSaving(false);
    }
  }, [open]);

  const handleJoin = async () => {
    if (!groupId.trim()) return;
    setSaving(true);
    try {
      await I.v3JoinGroup?.(groupId.trim());
      I.setStatus?.('Joined group');
      setGroupId('');
      I.v3GroupsLoad?.();
      onOpenChange(false);
    } catch {
      I.setStatus?.('Failed to join group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-brand" strokeWidth={1.5} />
            Join group
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Group ID</label>
            <Input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="web10.app/groups/username/slug"
              className="mt-1.5"
              aria-label="Group ID"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleJoin} disabled={saving || !groupId.trim()}>
              {saving ? 'Joining...' : 'Join'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupsManage({ I }: { I: Record<string, any> }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const groups = I.v3ManagedGroups || [];
  const query = (I.search ?? '').trim().toLowerCase();
  const filtered = query
    ? groups.filter((g: any) => (g.group_id || '').toLowerCase().includes(query))
    : groups;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Groups you own or manage — control members, roles, and settings.
        </p>
        <Button variant="brand" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
          Create group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyGroups isManaged={true} />
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No groups match "{I.search}".
        </p>
      ) : (
        filtered.map((group: any) => (
          <GroupCard key={group.group_id} I={I} group={group} isManaged={true} />
        ))
      )}

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} I={I} />
    </div>
  );
}

function GroupsBelong({ I }: { I: Record<string, any> }) {
  const [joinOpen, setJoinOpen] = React.useState(false);
  const groups = I.v3Groups || [];
  const query = (I.search ?? '').trim().toLowerCase();
  const filtered = query
    ? groups.filter((g: any) => (g.group_id || '').toLowerCase().includes(query))
    : groups;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Groups you belong to — discover content shared by members.
        </p>
        <Button variant="outline" size="sm" onClick={() => setJoinOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
          Join group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyGroups isManaged={false} />
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No groups match "{I.search}".
        </p>
      ) : (
        filtered.map((group: any) => (
          <GroupCard key={group.group_id} I={I} group={group} isManaged={false} />
        ))
      )}

      <JoinGroupDialog open={joinOpen} onOpenChange={setJoinOpen} I={I} />
    </div>
  );
}

function GroupsPage({ I }: { I: Record<string, any> }) {
  const [tab, setTab] = React.useState<'manage' | 'belong'>('manage');
  const showNudge = I.isAuthenticated?.() && !I.hasRecoveryContact?.();

  return (
    <AppShell I={I} maxWidth="max-w-4xl" testid="groups-page">
      {showNudge && (
        <div className="mb-4">
          <RecoveryNudgeBanner onNavigate={() => I.setMode('settings')} />
        </div>
      )}

      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Group Contracts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Groups are how you control who sees your content and discover content from others.
        </p>
      </div>

      <div className="mx-auto mb-6 flex max-w-xs rounded bg-elevated p-1">
        <button
          type="button"
          onClick={() => setTab('manage')}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${tab === 'manage'
            ? 'bg-brand-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
            }`}
          data-testid="groups-tab-manage"
        >
          <Shield className="mr-1.5 inline h-4 w-4" strokeWidth={1.5} />
          Manage
        </button>
        <button
          type="button"
          onClick={() => setTab('belong')}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${tab === 'belong'
            ? 'bg-brand-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
            }`}
          data-testid="groups-tab-belong"
        >
          <Users className="mr-1.5 inline h-4 w-4" strokeWidth={1.5} />
          Belong
        </button>
      </div>

      {tab === 'manage' ? <GroupsManage I={I} /> : <GroupsBelong I={I} />}
    </AppShell>
  );
}

export default GroupsPage;
