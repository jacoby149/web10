import React from 'react';
import { ShieldCheck, ShieldAlert, Loader2, SearchCheck } from 'lucide-react';
import { findDanglingGrants } from 'web10-npm';
import { Button } from '@/components/ui/button';

/**
 * Contract health — the authenticator's "check every contract, if it is not
 * equal, surface it" surface (KB: groups/contract-healing.md). It runs the
 * GENERIC referential-integrity invariant across the groups the user manages:
 * a member row that names a role the group's contract does not define is a
 * DANGLING GRANT — it grants nothing (the read gate resolves the role by name;
 * an undefined role yields no permissions). This is the exact failure class
 * behind the "owner absent from the people directory" bug, detected with no
 * app-specific spec (D60 — the authenticator is generic and does not know
 * web10-social's canonical shape).
 *
 * The authenticator DETECTS + SURFACES. The REPAIR is the owning app's job —
 * its self-heal (reconcileGroupContract) adds the missing role definition on
 * the user's next sign-in. So the banner names the drift and points to the
 * repair, rather than trying to fix a shape it doesn't know.
 */

interface DanglingGroup {
  group_id: string;
  grants: { member_key: string; role: string }[];
}

type HealthState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; checked: number; dangling: DanglingGroup[] }
  | { status: 'error'; message: string };

export default function ContractHealth({ I, groups }: { I: Record<string, any>; groups: any[] }) {
  const [state, setState] = React.useState<HealthState>({ status: 'idle' });

  const check = async () => {
    if (groups.length === 0) return;
    setState({ status: 'checking' });
    try {
      const dangling: DanglingGroup[] = [];
      // Fan out per group (getGroup for roles + getGroupMembers for the rows).
      // A group that fails to read is skipped (degrades, never blanks the check).
      await Promise.all(
        groups.map(async (g: any) => {
          try {
            const [group, members] = await Promise.all([
              I.v3.getGroup(g.group_id),
              I.v3.getGroupMembers(g.group_id),
            ]);
            const found = findDanglingGrants(group?.roles, members);
            if (found.length > 0) {
              dangling.push({ group_id: g.group_id, grants: found });
            }
          } catch {
            // skip a group we can't read
          }
        }),
      );
      setState({ status: 'done', checked: groups.length, dangling });
    } catch (e: any) {
      setState({ status: 'error', message: e?.message || String(e) });
    }
  };

  return (
    <div className="mb-4" data-testid="contract-health">
      {state.status === 'idle' && (
        <div className="flex items-center justify-between rounded border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Check your group contracts for grants that reference a role the group doesn't define.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={check} data-testid="contract-health-check">
            <SearchCheck className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            Check health
          </Button>
        </div>
      )}

      {state.status === 'checking' && (
        <div className="flex items-center gap-2 rounded border border-border bg-card px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Checking {groups.length} group contract{groups.length === 1 ? '' : 's'}…</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="rounded border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="text-sm text-danger">Contract health check failed: {state.message}</p>
        </div>
      )}

      {state.status === 'done' && state.dangling.length === 0 && (
        <div className="flex items-center gap-2 rounded border border-border bg-card px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            All {state.checked} group contract{state.checked === 1 ? ' is' : 's are'} healthy — every grant references a defined role.
          </p>
        </div>
      )}

      {state.status === 'done' && state.dangling.length > 0 && (
        <div className="rounded border border-warning/40 bg-warning/5 px-4 py-3" data-testid="contract-health-drift">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">
              {state.dangling.length} group{state.dangling.length === 1 ? ' has' : 's have'} grants that do nothing
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            These groups carry a grant for a role the group doesn't define — the grant is inert. The app
            that owns each group repairs it on your next sign-in.
          </p>
          <ul className="mt-2 space-y-1">
            {state.dangling.map((d) => (
              <li key={d.group_id} className="text-xs text-muted-foreground">
                <span className="font-mono">{d.group_id}</span>
                {' — '}
                {d.grants.map((g) => `${g.member_key} → ${g.role}`).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
