// Barrel export for the v3 data layer.
export * from './v3';
export * from './types';
export * from './groups';
export * from './posts';
export * from './comments';
export * from './reactions';
export * from './follows';
export * from './profile';
export * from './dms';
export * from './settings';
export * from './staging';
export * from './feed';
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
  type ContactRecord,
  type CrmStatus,
} from './contacts';
export {
  getWapi,
  resetWapi,
  clearReadUrlCache,
  deriveObjectKey,
  buildReactionTarget,
  registerDefaultSchemas,
  clearSchemaCache,
  getCachedSchema,
  createPublicEntry,
  queryPublicEntries,
  deletePublicEntry,
  markInboxRead,
  countUnread,
  readDiscoverFeed,
  fetchSuggestedUsers,
  recordRepost,
  createWapiWrapper,
  buildSocialServiceSirs,
  fanOutToFollowers,
  readPullFeed,
  buildCommentTarget,
  readFollow,
  countFollows,
  countFollowers,
  countUserFollowing,
  readFollows,
  readFollowsByStatus,
  blockUser,
  deleteFollow,
  updateFollowNotify,
  readUserPublicPosts,
  readUserPostsFromDiscovery,
  refreshMediaUrls,
  refreshMediaUrl,
  resolveMediaRefs,
  sendDmMulti,
  replyAllTargets,
  classifyThread,
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
} from './wapi';