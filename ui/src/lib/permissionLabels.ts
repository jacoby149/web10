const labels: Record<string, string> = {
  readAll: 'Read shared data', create: 'Create data', updateOwn: 'Edit your data',
  updateAll: 'Edit shared data', deleteOwn: 'Delete your data', deleteAll: 'Delete shared data',
  hideAll: 'Hide or restore content',
};

const reservedLabels: Record<string, Record<string, string>> = {
  group: {
    createGroup: 'Create groups', manageRoles: 'Manage group roles', assignRoles: 'Assign group roles',
    revokeRoles: 'Remove group roles', deleteGroup: 'Delete groups', joinGroup: 'Join groups',
    leaveGroup: 'Leave groups', manageSharing: 'Manage group sharing', blockMembers: 'Block group members',
  },
  node: { moderate: 'Moderate the node', manageMonetization: 'Manage node monetization' },
  user: { blockUsers: 'Manage your blocked users' },
  imports: { create: 'Import your export data', read: 'Read import progress' },
};

export function permissionLabel(service: string, operation: string): string {
  const scope = Object.prototype.hasOwnProperty.call(reservedLabels, service) ? reservedLabels[service] : labels;
  return Object.prototype.hasOwnProperty.call(scope, operation) ? scope[operation] : operation;
}

export function hasManagementPermissions(permissions: Record<string, string[]>): boolean {
  return Object.entries(permissions).some(([service, ops]) =>
    Object.prototype.hasOwnProperty.call(reservedLabels, service) ? ops.length > 0 : ops.includes('hideAll'));
}

export function managementWarning(permissions: Record<string, string[]>): string {
  const warnings = ['Sensitive access: approve only an app you trust.'];
  if (permissions.user?.length) warnings.push('User blocking is account-wide.');
  if (permissions.imports?.includes('create')) warnings.push('Imports read private exports and can write posts, comments, media, profiles and group data. Matching service/group grants and target-group ownership are required.');
  if (permissions.imports?.includes('read')) warnings.push('Progress may expose private export metadata; progress-only access cannot run imports.');
  if (permissions.group?.length) warnings.push('Group actions span all groups within your authority; membership grants no management power.');
  if (permissions.node?.length) warnings.push('Node actions require current node-admin authority.');
  if (Object.values(permissions).some((ops) => ops.includes('hideAll'))) warnings.push('Moderation requires granted services and your authority.');
  warnings.push('Account credentials and authority changes stay in the authenticator.');
  return warnings.join(' ');
}
