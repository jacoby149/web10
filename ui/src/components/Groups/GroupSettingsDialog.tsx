import React from 'react';
import { Settings, Lock, LockOpen, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { groupDisplayName } from '@/lib/group-utils';

const JOIN_POLICIES = [
  { value: 'open', label: 'Open', icon: LockOpen, hint: 'Anyone can join immediately.' },
  { value: 'request', label: 'Request', icon: MessageSquare, hint: 'Joiners ask; you approve.' },
  { value: 'invite_only', label: 'Invite only', icon: Lock, hint: 'Only people you invite can join.' },
] as const;

type JoinPolicy = (typeof JOIN_POLICIES)[number]['value'];

function GroupSettingsDialog({ open, onOpenChange, group, I }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
  I: Record<string, any>;
}) {
  const [joinPolicy, setJoinPolicy] = React.useState<JoinPolicy>('open');
  const [saving, setSaving] = React.useState(false);

  // Reset to the group's current policy each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      const current = group.join_policy || 'open';
      setJoinPolicy(JOIN_POLICIES.some((p) => p.value === current) ? (current as JoinPolicy) : 'open');
      setSaving(false);
    }
  }, [open, group.join_policy]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await I.v3UpdateGroup(group.group_id, { join_policy: joinPolicy });
      I.setStatus?.(`Join policy set to ${joinPolicy}`);
      I.v3GroupsManagesLoad?.();
      onOpenChange(false);
    } catch {
      I.setStatus?.('Failed to update join policy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand" strokeWidth={1.5} />
            Settings — {groupDisplayName(group.group_id)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Join policy</label>
            <div className="mt-1.5 space-y-2">
              {JOIN_POLICIES.map(({ value, label, icon: Icon, hint }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setJoinPolicy(value)}
                  aria-pressed={joinPolicy === value}
                  data-testid={`join-policy-${value}`}
                  className={`flex w-full items-center gap-3 rounded border px-3 py-2.5 text-left transition-colors ${joinPolicy === value
                    ? 'border-brand bg-brand-muted'
                    : 'border-border bg-elevated hover:border-brand/40'
                    }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${joinPolicy === value ? 'text-brand-300' : 'text-muted-foreground'}`} strokeWidth={1.5} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GroupSettingsDialog;