import { useCallback, useEffect, useState } from 'react';
import { UserPlus, UserMinus, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getGroupMembers,
  getJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
  inviteMember,
  removeGroupMember,
} from '@/data';

const LOG = (...args: unknown[]) => console.log('[social:groups:manage:members]', ...args);

interface MemberRow {
  member_key: string;
  role: string;
}

interface RequestRow {
  requester_key: string;
  status: string;
}

/** A reserved principal-class row (the D58 read grant) — not a real person. */
function isReservedRow(memberKey: string): boolean {
  return memberKey === 'anyone' || memberKey === 'authenticated';
}

/** A display label for a member key (strip the `web10.app/users/` prefix). */
function memberLabel(memberKey: string): string {
  if (memberKey === 'anyone') return 'Public (anyone)';
  if (memberKey === 'authenticated') return 'Signed-in users';
  const parts = memberKey.split('/');
  return parts[parts.length - 1] || memberKey;
}

/**
 * The Members section of the Manage sheet — the group's people. Two surfaces:
 * the **join-request queue** (pending requests → approve / deny) and the
 * **member list** (with remove). Plus an **add member** input (an invite).
 * Ported from the authenticator's `GroupMembersDialog`. Reserved principal
 * rows (`anyone` / `authenticated` — the who-can-read grant) are shown but not
 * removable here (that's the Settings section's control).
 */
export default function ManageMembersSection({
  groupId,
  onSaved,
}: {
  groupId: string;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [newMember, setNewMember] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([
        getGroupMembers(groupId),
        getJoinRequests(groupId).catch(() => []),
      ]);
      setMembers(Array.isArray(m) ? m : []);
      setRequests(Array.isArray(r) ? r : []);
    } catch (e) {
      LOG('load — failed:', e);
      setError('Could not load members.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = useCallback(
    async (requesterKey: string) => {
      setBusy(true);
      setError(null);
      try {
        await approveJoinRequest(groupId, requesterKey);
        LOG('approved', requesterKey);
        await load();
        onSaved();
      } catch (e) {
        LOG('approve — failed:', e);
        setError('Could not approve the request.');
      } finally {
        setBusy(false);
      }
    },
    [groupId, load, onSaved],
  );

  const handleDeny = useCallback(
    async (requesterKey: string) => {
      setBusy(true);
      setError(null);
      try {
        await denyJoinRequest(groupId, requesterKey);
        LOG('denied', requesterKey);
        await load();
        onSaved();
      } catch (e) {
        LOG('deny — failed:', e);
        setError('Could not deny the request.');
      } finally {
        setBusy(false);
      }
    },
    [groupId, load, onSaved],
  );

  const handleRemove = useCallback(
    async (memberKey: string) => {
      setBusy(true);
      setError(null);
      try {
        await removeGroupMember(groupId, memberKey);
        LOG('removed', memberKey);
        await load();
        onSaved();
      } catch (e) {
        LOG('remove — failed:', e);
        setError('Could not remove the member.');
      } finally {
        setBusy(false);
      }
    },
    [groupId, load, onSaved],
  );

  const handleAdd = useCallback(async () => {
    const key = newMember.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The node derives the member key from the username (the API's
      // `assignRoles` gate applies). Invite as a `member`.
      await inviteMember(groupId, key, 'member');
      LOG('invited', key);
      setNewMember('');
      await load();
      onSaved();
    } catch (e) {
      LOG('add — failed:', e);
      setError('Could not add the member.');
    } finally {
      setBusy(false);
    }
  }, [newMember, busy, groupId, load, onSaved]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground" data-testid="manage-members-loading">
        Loading members…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Join requests */}
      {requests.length > 0 && (
        <div data-testid="manage-members-requests">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Join requests ({requests.length})
          </span>
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.requester_key}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                data-testid="manage-members-request-row"
              >
                <span className="truncate text-sm text-foreground">{memberLabel(r.requester_key)}</span>
                <div className="flex gap-1.5">
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => handleApprove(r.requester_key)}
                    disabled={busy}
                    data-testid="manage-members-request-approve"
                    aria-label={`Approve ${r.requester_key}`}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeny(r.requester_key)}
                    disabled={busy}
                    data-testid="manage-members-request-deny"
                    aria-label={`Deny ${r.requester_key}`}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member list */}
      <div data-testid="manage-members-list">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Members ({members.length})
        </span>
        <div className="space-y-1.5">
          {members.map((m) => (
            <div
              key={m.member_key}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
              data-testid="manage-members-row"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{memberLabel(m.member_key)}</p>
                <p className="text-xs text-muted-foreground">{m.role}</p>
              </div>
              {!isReservedRow(m.member_key) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(m.member_key)}
                  disabled={busy}
                  className="text-muted-foreground hover:text-danger"
                  data-testid="manage-members-remove"
                  aria-label={`Remove ${m.member_key}`}
                >
                  <UserMinus className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add member */}
      <div data-testid="manage-members-add">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Add member</span>
        <div className="flex gap-2">
          <Input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="username"
            disabled={busy}
            data-testid="manage-members-add-input"
            className="flex-1 bg-surface"
          />
          <Button variant="brand" size="sm" onClick={handleAdd} disabled={busy || !newMember.trim()} data-testid="manage-members-add-button">
            <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Add
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger" role="alert" data-testid="manage-members-error">
          {error}
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="manage-members-busy">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Working…
        </div>
      )}
    </div>
  );
}
