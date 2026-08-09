import React from 'react';
import { X, UserPlus, UserX, Mail, Phone, Check, X as XIcon, MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function groupDisplayName(groupId: string): string {
  const parts = groupId.split('/');
  if (parts.length >= 4) return `${parts[2]}/${parts[3]}`;
  return groupId;
}

function MemberRow({ member, isManaged, I, group }: { member: any; isManaged: boolean; I: Record<string, any>; group: any }) {
  const [showContact, setShowContact] = React.useState(false);

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-border bg-elevated/50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{member.member_key}</span>
          <Badge variant="outline">{member.role}</Badge>
        </div>
        {showContact && (
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {member.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" strokeWidth={1.5} />
                {member.email}
              </span>
            )}
            {member.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" strokeWidth={1.5} />
                {member.phone}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {isManaged && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:text-danger h-7 px-2"
            onClick={async () => {
              try {
                await I.v3RemoveGroupMember(group.group_id, member.member_key);
                I.setStatus?.(`${member.member_key} removed`);
                I.v3GroupsManagesLoad?.();
              } catch {
                I.setStatus?.('Failed to remove member');
              }
            }}
          >
            <UserX className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-7 px-2"
          onClick={() => setShowContact(!showContact)}
        >
          {showContact ? <XIcon className="h-4 w-4" strokeWidth={1.5} /> : <Mail className="h-4 w-4" strokeWidth={1.5} />}
        </Button>
      </div>
    </div>
  );
}

function AddMemberForm({ group, I }: { group: any; I: Record<string, any> }) {
  const [memberKey, setMemberKey] = React.useState('');
  const [role, setRole] = React.useState('member');
  const [mode, setMode] = React.useState<'add' | 'invite'>('add');

  const roles = group.roles?.map((r: any) => r.name || r) || ['member'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberKey.trim()) return;
    try {
      if (mode === 'invite') {
        await I.v3InviteMember(group.group_id, memberKey.trim(), role);
        I.setStatus?.(`Invite sent to ${memberKey}`);
      } else {
        await I.v3AddGroupMember(group.group_id, memberKey.trim(), role);
        I.setStatus?.(`${memberKey} added`);
      }
      setMemberKey('');
      I.v3GroupsManagesLoad?.();
    } catch {
      I.setStatus?.(`Failed to ${mode === 'invite' ? 'invite' : 'add'} member`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={memberKey}
          onChange={(e) => setMemberKey(e.target.value)}
          placeholder="web10 username"
          className="flex-1"
          aria-label="Member username"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded border border-border bg-elevated px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Role"
        >
          {roles.map((r: string) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <Button type="submit" variant="brand" size="sm">
          <UserPlus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
          {mode === 'invite' ? 'Invite' : 'Add'}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={mode === 'add' ? 'text-brand-300' : 'text-muted-foreground'}
          onClick={() => setMode('add')}
        >
          <Check className="mr-1 h-3 w-3" strokeWidth={1.5} />
          Add directly
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={mode === 'invite' ? 'text-brand-300' : 'text-muted-foreground'}
          onClick={() => setMode('invite')}
        >
          <MessageSquare className="mr-1 h-3 w-3" strokeWidth={1.5} />
          Send invite
        </Button>
      </div>
    </form>
  );
}

function GroupMembersDialog({ open, onOpenChange, group, members, loading, isManaged, I }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
  members: any[];
  loading: boolean;
  isManaged: boolean;
  I: Record<string, any>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand" strokeWidth={1.5} />
            {groupDisplayName(group.group_id)}
            <span className="text-sm font-normal text-muted-foreground">
              ({members.length} {members.length === 1 ? 'member' : 'members'})
            </span>
          </DialogTitle>
        </DialogHeader>

        {isManaged && <AddMemberForm group={group} I={I} />}

        <div className="max-h-96 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="py-6 text-center text-muted-foreground">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">No members yet</div>
          ) : (
            members.map((member, i) => (
              <MemberRow key={i} member={member} isManaged={isManaged} I={I} group={group} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GroupMembersDialog;