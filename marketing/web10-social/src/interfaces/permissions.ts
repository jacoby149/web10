// D89: app grants are explicit and still intersect with the person's authority.
const CRUD = ['create', 'readAll', 'updateOwn', 'deleteOwn'];
export const SOCIAL_PERMISSIONS: Record<string, string[]> = Object.fromEntries(
  ['posts', 'media', 'media_metadata', 'public_media', 'profile', 'settings', 'comments',
    'reactions', 'contacts', 'staging_posts', 'web10-social-group-identity',
    'notifications', 'saved'].map((service) => [service, [...CRUD]]),
);
SOCIAL_PERMISSIONS.posts.push('hideAll');
SOCIAL_PERMISSIONS.comments.push('hideAll');
SOCIAL_PERMISSIONS.group = ['createGroup', 'manageRoles', 'assignRoles',
  'revokeRoles', 'deleteGroup', 'joinGroup', 'leaveGroup', 'manageSharing', 'blockMembers'];
SOCIAL_PERMISSIONS.node = ['moderate', 'manageMonetization'];
SOCIAL_PERMISSIONS.imports = ['create', 'read'];
SOCIAL_PERMISSIONS.user = ['blockUsers'];

// verifyAccess accepts one operation set per batch, not a permission map.
export const SOCIAL_ACCESS_CHECKS: { services: string[]; operations: string[] }[] = [];
for (const [service, operations] of Object.entries(SOCIAL_PERMISSIONS)) {
  const batch = SOCIAL_ACCESS_CHECKS.find((check) =>
    check.operations.join(',') === operations.join(','));
  if (batch) batch.services.push(service);
  else SOCIAL_ACCESS_CHECKS.push({ services: [service], operations: [...operations] });
}
