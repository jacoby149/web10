// Display-only vocabulary. Never use these labels to construct a grant.
const DATA_TYPES: Record<string, string> = {
  posts: 'posts', comments: 'comments', media: 'media files', public_media: 'public media',
  profile: 'profile information', settings: 'settings', reactions: 'reactions',
  contacts: 'contacts', notifications: 'notifications', saved: 'saved items',
  'web10-social-group-identity': 'group profiles',
  'web10-social-playlist-bookmarks': 'playlist bookmarks',
  '*': 'all data types', group: 'group administration',
};

export function dataTypeLabel(service: string): string {
  return Object.prototype.hasOwnProperty.call(DATA_TYPES, service) ? DATA_TYPES[service] : service;
}

export function permissionDescription(operation: string, subject = 'data', actor: 'you' | 'they' = 'you'): string {
  const descriptions: Record<string, string> = {
    readAll: `Read ${subject} ${actor} can access`,
    create: `Create ${subject}`,
    updateOwn: `Edit ${subject} ${actor} created`,
    deleteOwn: `Delete ${subject} ${actor} created`,
    updateAll: `Edit any ${subject} ${actor} can access`,
    deleteAll: `Delete any ${subject} ${actor} can access`,
    hideAll: `Hide ${subject} from other people`,
    manageRoles: 'Create and change group roles and their permissions',
    assignRoles: 'Give group roles to people',
    revokeRoles: 'Remove group roles from people',
    deleteGroup: 'Delete the group',
  };
  return Object.prototype.hasOwnProperty.call(descriptions, operation) ? descriptions[operation] : `Use the permission “${operation}”`;
}

// Only identical operation sets share a heading. Do not form a cross-product
// of services and operations: read-only contacts must never look writable.
export function permissionGroups(permissions: Record<string, string[]>) {
  const groups: { services: string[]; operations: string[] }[] = [];
  for (const [service, operations] of Object.entries(permissions)) {
    const unique = [...new Set(operations)];
    const existing = groups.find(group => group.operations.length === unique.length && unique.every(op => group.operations.includes(op)));
    if (existing) existing.services.push(service);
    else groups.push({ services: [service], operations: unique });
  }
  return groups;
}

export function groupActionDescription(request: any): string {
  const fields = { ...request.params, ...Object.fromEntries(Object.entries(request).filter(([, value]) => value !== undefined)) };
  const target = fields.name || fields.group_id;
  const group = target ? `the group “${target}”` : 'a group';
  const actions: Record<string, string> = {
    create_group: `Create ${group}`, update_group: `Change settings or permissions for ${group}`,
    delete_group: `Delete ${group}`, add_member: `Add a member to ${group}`,
    remove_member: `Remove a member from ${group}`, invite_member: `Invite someone to ${group}`,
    join_group: `Join ${group}`,
  };
  return Object.prototype.hasOwnProperty.call(actions, request.action) ? actions[request.action] : `Perform the group action “${request.action || 'unknown'}”`;
}
