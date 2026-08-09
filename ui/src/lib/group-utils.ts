export function groupDisplayName(groupId: string): string {
  const parts = groupId.split('/');
  if (parts.length >= 4) return `${parts[2]}/${parts[3]}`;
  return groupId;
}
