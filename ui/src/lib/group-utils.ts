export function groupDisplayName(groupId: string): string {
  // The group_id is `{provider}/groups/users/{creator}/{slug}` — the slug (the
  // last segment) is the group's human-readable name. Fall back to the full id
  // when there's no slug to show.
  const parts = groupId.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : groupId;
}
