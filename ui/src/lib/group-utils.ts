export function groupDisplayName(groupId: string): string {
  // The group_id is `{provider}/groups/users/{creator}/{slug}` — the slug (the
  // last segment) is the group's human-readable name. Fall back to the full id
  // when there's no slug to show.
  const parts = (groupId || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : (groupId || '');
}

// ── Role permission shapes (D58) ───────────────────────────────────────────
//
// A role's `permissions` has two shapes in the wild:
//   D58 (canonical): { service: [ops] }  — e.g. { '*': [...], group: [...] }
//   legacy:          [ops]               — a flat list (the retired `services`
//                                           array scoped it)
// The node normalizes both on read, and the UI must too — treat an object
// `permissions` as an array and it throws at render (the "Something went
// wrong" crash on the groups page). These helpers are the one seam.

export function isRoleMap(perms: unknown): perms is Record<string, string[]> {
  return !!perms && typeof perms === 'object' && !Array.isArray(perms);
}

// The ops a role grants, across every service key (D58) or the flat list
// (legacy). Unknown/missing → [].
export function roleOps(role: any): string[] {
  const perms = role?.permissions;
  if (Array.isArray(perms)) return perms;
  if (isRoleMap(perms)) {
    const ops = new Set<string>();
    for (const list of Object.values(perms)) {
      if (Array.isArray(list)) for (const op of list) ops.add(op);
    }
    return [...ops];
  }
  return [];
}

// Does the role grant `op` anywhere (any service, the `*` wildcard, or the
// reserved `group` key)?
export function hasRoleOp(role: any, op: string): boolean {
  return roleOps(role).includes(op);
}
