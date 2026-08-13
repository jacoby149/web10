import React from 'react';
import { ChevronDown, ChevronRight, Users, Shield, Lock, LockOpen, MessageSquare, UserPlus, Settings, Eye, LogOut, ShieldOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { groupDisplayName } from '@/lib/group-utils';
import GroupMembersDialog from './GroupMembersDialog';
import GroupRolesDialog from './GroupRolesDialog';

function joinPolicyBadge(policy: string) {
  switch (policy) {
    case 'open':
      return <Badge variant="success"><LockOpen className="mr-1 h-3 w-3" strokeWidth={1.5} />Open</Badge>;
    case 'request':
      return <Badge variant="warning"><Shield className="mr-1 h-3 w-3" strokeWidth={1.5} />Request</Badge>;
    case 'invite_only':
      return <Badge variant="danger"><Lock className="mr-1 h-3 w-3" strokeWidth={1.5} />Invite</Badge>;
    default:
      return <Badge variant="outline">{policy}</Badge>;
  }
}

function GroupCard({ I, group, isManaged }: { I: Record<string, any>; group: any; isManaged: boolean }) {
  const [hide, setHide] = React.useState(true);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [rolesOpen, setRolesOpen] = React.useState(false);
  const [members, setMembers] = React.useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(false);

  const name = groupDisplayName(group.group_id);
  const policy = group.join_policy || 'open';
  const myRole = group.my_role || 'member';
  const memberCount = group.member_count || 0;

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const result = await I.v3GetGroupMembers(group.group_id);
      setMembers(Array.isArray(result) ? result : []);
    } catch (e) {
      console.error('Failed to load members:', e);
      I.setStatus?.('Failed to load members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleJoin = async () => {
    try {
      await I.v3JoinGroup(group.group_id);
      I.v3GroupsLoad?.();
      I.v3GroupsManagesLoad?.();
    } catch (e: any) {
      I.setStatus?.('Failed to join group');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete this group? This will remove all members and cannot be undone.`)) return;
    try {
      await I.v3DeleteGroup(group.group_id);
      I.v3GroupsLoad?.();
      I.v3GroupsManagesLoad?.();
    } catch (e: any) {
      I.setStatus?.('Failed to delete group');
    }
  };

  const hasDeletePermission = (() => {
    // Owner role can always delete, even if legacy groups don't have deleteGroup in permissions
    if (myRole === 'owner') return true;
    const roles = group.roles || [];
    const roleDef = roles.find((r: any) => r.name === myRole);
    return roleDef?.permissions?.includes('deleteGroup') ?? false;
  })();

  const handleLeave = async () => {
    try {
      await I.v3LeaveGroup(group.group_id);
      I.v3GroupsLoad?.();
      I.v3GroupsManagesLoad?.();
    } catch (e: any) {
      I.setStatus?.('Failed to leave group');
    }
  };

  const handleSetSharing = async (enabled: boolean) => {
    try {
      await I.v3SetSharing(group.group_id, enabled);
    } catch (e: any) {
      I.setStatus?.('Failed to update sharing');
    }
  };

  return (
    <>
      <div className="mx-auto max-w-[800px]">
        <div className="mb-4 overflow-hidden rounded border border-border bg-card transition-colors hover:border-brand/40">
          <button
            type="button"
            onClick={() => setHide(!hide)}
            aria-expanded={!hide}
            className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">{name}</span>
                {joinPolicyBadge(policy)}
                {myRole !== 'member' && (
                  <Badge variant="brand">{myRole}</Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
              </div>
            </div>
            <span className="shrink-0 text-muted-foreground">
              {hide ? <ChevronRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronDown className="h-4 w-4" strokeWidth={1.5} />}
            </span>
          </button>
          {!hide && <div className="border-b border-border" />}
          {!hide && (
            <div className="p-4">
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Group ID:</span>
                  <p className="mt-1 font-mono text-xs break-all text-foreground">{group.group_id}</p>
                </div>
                {group.roles && group.roles.length > 0 && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Roles:</span>
                    <div className="mt-1.5 space-y-1.5">
                      {group.roles.map((role: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <Badge variant="brand" className="shrink-0">
                            {role.name || role}
                          </Badge>
                          <div className="flex flex-wrap gap-1">
                            {(role.permissions || []).map((perm: string, j: number) => (
                              <span key={j} className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-elevated">
                                {perm}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Join policy:</span>
                  <div className="mt-1">{joinPolicyBadge(policy)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5 mt-4">
                {isManaged ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-brand-300 hover:text-brand-300"
                      onClick={() => {
                        loadMembers();
                        setMembersOpen(true);
                      }}
                    >
                      <Users className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                      Manage members
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-brand-300 hover:text-brand-300"
                      onClick={() => setRolesOpen(true)}
                    >
                      <Shield className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                      Edit roles
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        // TODO: show join policy editor
                        I.setStatus?.('Join policy editor coming soon');
                      }}
                    >
                      <Settings className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                      Settings
                    </Button>
                    {hasDeletePermission && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger ml-auto"
                        onClick={handleDelete}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                        Delete group
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-brand-300 hover:text-brand-300"
                      onClick={() => {
                        loadMembers();
                        setMembersOpen(true);
                      }}
                    >
                      <Eye className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                      View members
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => handleSetSharing(false)}
                    >
                      <ShieldOff className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                      Block sharing
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      onClick={handleLeave}
                    >
                      <LogOut className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                      Leave
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <GroupMembersDialog
        open={membersOpen}
        onOpenChange={setMembersOpen}
        group={group}
        members={members}
        loading={loadingMembers}
        isManaged={isManaged}
        I={I}
      />
      <GroupRolesDialog
        open={rolesOpen}
        onOpenChange={setRolesOpen}
        group={group}
        I={I}
      />
    </>
  );
}

export default GroupCard;
