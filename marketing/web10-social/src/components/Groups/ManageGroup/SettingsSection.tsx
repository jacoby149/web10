import { useCallback, useEffect, useState } from 'react';
import { LockOpen, MessageSquare, Lock, Globe, UserCheck, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateGroup, addGroupMember, removeGroupMember, getGroupMembers } from '@/data';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:groups:manage:settings]', ...args);

const JOIN_POLICIES = [
  { value: 'open', label: 'Open', icon: LockOpen, hint: 'Anyone can join immediately.' },
  { value: 'request', label: 'Request', icon: MessageSquare, hint: 'Joiners ask; you approve.' },
  { value: 'invite_only', label: 'Invite only', icon: Lock, hint: 'Only people you invite can join.' },
] as const;

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe, hint: 'Anyone can read, even signed out.' },
  { value: 'signed_in', label: 'Signed-in only', icon: UserCheck, hint: 'Any web10 user can read; signed-out can’t.' },
  { value: 'private', label: 'Private', icon: Lock, hint: 'Only members can read.' },
] as const;

type Visibility = (typeof VISIBILITY_OPTIONS)[number]['value'];

/**
 * The Settings section of the Manage sheet — the group's access controls.
 * Three orthogonal controls (the KB's `groups/access.md` + `discoverability.md`
 * model): **join policy** (how a human becomes a member), **who can read**
 * (the D58 read grant — a `reader` role on the `anyone` / `authenticated`
 * reserved principal), and **list in directory** (the D53 `discoverable`
 * blasting flag — the fix for "my friend can't find my group"). Ported from
 * the authenticator's `GroupSettingsDialog`.
 */
export default function ManageSettingsSection({
  groupId,
  joinPolicy,
  discoverable,
  onSaved,
}: {
  groupId: string;
  joinPolicy: string;
  discoverable: boolean;
  onSaved: () => void;
}) {
  const [policy, setPolicy] = useState<string>(joinPolicy || 'open');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [listed, setListed] = useState<boolean>(discoverable);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the current who-can-read from the group's reserved member rows.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getGroupMembers(groupId)
      .then((members: { member_key: string; role: string }[]) => {
        if (cancelled) return;
        const anyone = members.find((m) => m.member_key === 'anyone');
        const authed = members.find((m) => m.member_key === 'authenticated');
        if (anyone?.role === 'reader') setVisibility('public');
        else if (authed?.role === 'reader') setVisibility('signed_in');
        else setVisibility('private');
      })
      .catch(() => {
        /* can't read members — leave the default */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const handlePolicyChange = useCallback(
    async (value: string) => {
      setPolicy(value);
      setSaving(true);
      setError(null);
      try {
        await updateGroup(groupId, { join_policy: value });
        LOG('join policy set to', value);
        onSaved();
      } catch (e) {
        LOG('join policy — failed:', e);
        setError('Could not update the join policy.');
      } finally {
        setSaving(false);
      }
    },
    [groupId, onSaved],
  );

  const handleVisibilityChange = useCallback(
    async (v: Visibility) => {
      setSaving(true);
      setError(null);
      try {
        if (v === 'public') {
          await addGroupMember(groupId, 'anyone', 'reader');
          await removeGroupMember(groupId, 'authenticated').catch(() => {});
        } else if (v === 'signed_in') {
          await addGroupMember(groupId, 'authenticated', 'reader');
          await removeGroupMember(groupId, 'anyone').catch(() => {});
        } else {
          await removeGroupMember(groupId, 'anyone').catch(() => {});
          await removeGroupMember(groupId, 'authenticated').catch(() => {});
        }
        setVisibility(v);
        LOG('who can read set to', v);
        onSaved();
      } catch (e) {
        LOG('who can read — failed:', e);
        setError('Could not update who can read.');
      } finally {
        setSaving(false);
      }
    },
    [groupId, onSaved],
  );

  const handleToggleListed = useCallback(async () => {
    const next = !listed;
    setListed(next);
    setSaving(true);
    setError(null);
    try {
      await updateGroup(groupId, { discoverable: next });
      LOG('list in directory →', next);
      onSaved();
    } catch (e) {
      LOG('list in directory — failed:', e);
      setListed(!next);
      setError('Could not update the directory listing.');
    } finally {
      setSaving(false);
    }
  }, [groupId, listed, onSaved]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground" data-testid="manage-settings-loading">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Join policy */}
      <div>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Join policy</span>
        <div className="space-y-2" data-testid="manage-settings-join-policy">
          {JOIN_POLICIES.map(({ value, label, icon: Icon, hint }) => {
            const active = policy === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => handlePolicyChange(value)}
                disabled={saving}
                aria-pressed={active}
                data-testid={`manage-settings-join-${value}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-brand bg-brand-muted/60' : 'border-border bg-surface hover:border-brand/40',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-300' : 'text-muted-foreground')} strokeWidth={1.75} />
                <span className="flex-1">
                  <span className={cn('block text-sm font-medium', active ? 'text-foreground' : 'text-foreground')}>{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Who can read */}
      <div>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Who can read</span>
        <div className="space-y-2" data-testid="manage-settings-visibility">
          {VISIBILITY_OPTIONS.map(({ value, label, icon: Icon, hint }) => {
            const active = visibility === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleVisibilityChange(value)}
                disabled={saving}
                aria-pressed={active}
                data-testid={`manage-settings-visibility-${value}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-brand bg-brand-muted/60' : 'border-border bg-surface hover:border-brand/40',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-300' : 'text-muted-foreground')} strokeWidth={1.75} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List in directory — the D53 blasting flag */}
      <div className="rounded-lg border border-border bg-surface px-3 py-3" data-testid="manage-settings-listed">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <div>
              <p className="text-sm font-medium text-foreground">List in directory</p>
              <p className="text-xs text-muted-foreground">
                {listed ? 'Shown in the public Discover directory.' : 'Hidden from the public directory (unlisted).'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={listed}
            aria-label="List in directory"
            onClick={handleToggleListed}
            disabled={saving}
            data-testid="manage-settings-listed-toggle"
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
              listed ? 'bg-brand' : 'bg-elevated',
            )}
          >
            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', listed ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger" role="alert" data-testid="manage-settings-error">
          {error}
        </div>
      )}

      {saving && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="manage-settings-saving">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Saving…
        </div>
      )}
    </div>
  );
}
