// Pure declarations shared by login, access recovery and pre-granted E2E fixtures.
// No browser/SDK initialization: Playwright can import this without app side effects.
export const SOCIAL_SERVICES = [
  'posts', 'media', 'public_media', 'profile', 'settings',
  'comments', 'reactions', 'contacts',
  'web10-social-group-identity', 'notifications', 'saved',
  'web10-social-playlist-bookmarks',
] as const;

export const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'] as const;
