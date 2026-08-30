// Barrel export for the v3 data layer.
export * from './v3';
export * from './types';
export * from './groups';
export * from './posts';
export * from './ads';
export * from './comments';
export * from './reactions';
export * from './follows';
export * from './profile';
export * from './dms';
export * from './settings';
export * from './staging';
export * from './feed';
export * from './session';

// contacts — re-export from contacts.ts (types ContactRecord/CrmStatus already
// exported via types.ts, so we only re-export the functions)
export {
  readContacts,
  readContact,
  addContact,
  updateContact,
  deleteContact,
  searchContacts,
  updateContactNote,
  updateContactStatus,
  toggleSpamFlag,
  readSpamFlaggedContacts,
  readContactsForCrm,
  spamFlagUser,
  unspamFlagUser,
} from './contacts';

// Wapi shim exports — only items NOT already covered by the export * above
export {
  getWapi,
  resetWapi,
  clearReadUrlCache,
  deriveObjectKey,
  buildReactionTarget,
  buildCommentTarget,
  recordRepost,
  createWapiWrapper,
  buildSocialServiceSirs,
  fanOutToFollowers,
  readPullFeed,
  readUserPostsFromDiscovery,
  updateFollowNotify,
} from './wapi';
