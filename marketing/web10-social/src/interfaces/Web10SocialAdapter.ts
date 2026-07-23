import { wapiInit } from 'web10-npm';
import { AUTH_ORIGIN, RTC_HOST } from '../lib/origins';
import type { Contact, Identity, Message, Post } from '../types';
import contactIco from '../assets/images/Contact.png';
import {
  createPost as dlCreatePost,
  readMyPosts as dlReadMyPosts,
  readUserPosts as dlReadUserPosts,
  updatePost as dlUpdatePost,
  deletePost as dlDeletePost,
  uploadMedia as dlUploadMedia,
  resolveMediaRefs as dlResolveMediaRefs,
  readMedia as dlReadMedia,
  readMediaRecord as dlReadMediaRecord,
  deleteMedia as dlDeleteMedia,
  readFeed as dlReadFeed,
  markInboxRead as dlMarkInboxRead,
  countUnread as dlCountUnread,
  readProfile as dlReadProfile,
  saveProfile as dlSaveProfile,
  readUserProfile as dlReadUserProfile,
  readContacts as dlReadContacts,
  readContact as dlReadContact,
  addContact as dlAddContact,
  updateContact as dlUpdateContact,
  deleteContact as dlDeleteContact,
  searchContacts as dlSearchContacts,
  conversationKey as dlConversationKey,
  readDms as dlReadDms,
  sendDm as dlSendDm,
  deleteDm as dlDeleteDm,
  listConversations as dlListConversations,
  getLastDm as dlGetLastDm,
  readComments as dlReadComments,
  readTopLevelComments as dlReadTopLevelComments,
  readReplies as dlReadReplies,
  createComment as dlCreateComment,
  updateComment as dlUpdateComment,
  deleteComment as dlDeleteComment,
  countComments as dlCountComments,
  readReactions as dlReadReactions,
  createReaction as dlCreateReaction,
  toggleReaction as dlToggleReaction,
  deleteReaction as dlDeleteReaction,
  countReactions as dlCountReactions,
  getReactionCounts as dlGetReactionCounts,
  createWapiWrapper,
  resetWapi,
  type FeedSort,
  type PostRecord,
  type MediaRecord,
  type MediaUploadRequest,
  type ProfileRecord,
  type ContactRecord,
  type DmRecord,
  type CommentRecord,
  type ReactionRecord,
  type InboxRecord,
} from '../data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WapiInstance = Record<string, any>;

interface Web10SocialAdapter {
  login: () => Promise<void>;
  isSignedIn: () => boolean;
  signOut: () => void;
  authListen: (callback: () => void) => void;
  initP2P: (onMessage: (conn: unknown, data: unknown) => void, deviceName: string) => void;
  readToken: () => { provider: string; username: string };
  SMROnReady: (sirs: unknown[], _args: unknown[]) => void;
  openAuthPortal: () => Promise<void>;
  create: (service: string, body: unknown, username?: string, provider?: string) => Promise<{ data: unknown }>;
  read: (service: string, query?: unknown, username?: string, provider?: string) => Promise<{ data: unknown[] }>;
  update: (service: string, query: unknown, update: unknown) => Promise<{ data: { matchedCount: number } }>;
  delete: (service: string, query: unknown) => Promise<unknown>;
  send: (provider: string, username: string, hostname: string, device: string, data: unknown) => void;

  loadContact: (web10: string) => Promise<Contact>;
  loadContactAddresses: () => Promise<{ data: { web10: string }[] }>;
  loadContacts: () => Promise<Contact[]>;
  addContact: (web10: string) => Promise<unknown>;
  deleteContact: (contactID: string) => Promise<unknown>;
  loadIdentity: () => Promise<{ data: Identity[] }>;
  editIdentity: (identity: Identity) => Promise<unknown>;
  createMessage: (message: string, recipient: string) => Promise<Message>;
  loadRecievedMessages: (web10: string) => Promise<Message[]>;
  loadSentMessages: (web10: string) => Promise<Message[]>;
  deleteMessages: (messages: Message[]) => Promise<unknown>;
  createPost: (post: { html: string; media: unknown[] }) => Promise<{ data: Post }>;
  loadMyPosts: () => Promise<{ data: Post[] }>;
  loadPosts: (web10: string) => Promise<Post[]>;
  editPost: (id: string, html: string, media: unknown[]) => Promise<unknown>;
  deletePost: (id: string) => Promise<unknown>;
  loadBulletins: () => Promise<{ data: unknown[] }>;
  deleteBulletin: (id: string) => Promise<unknown>;

  // ── D4 data layer: conventions-schema services ──────────────────────
  // Posts (conventions schema)
  createPostRecord: (post: Omit<PostRecord, '_id'>) => Promise<PostRecord>;
  readMyPostRecords: () => Promise<PostRecord[]>;
  readUserPostRecords: (username: string, provider: string) => Promise<PostRecord[]>;
  updatePostRecord: (id: string, updates: Partial<PostRecord>) => Promise<PostRecord>;
  deletePostRecord: (id: string) => Promise<void>;

  // Media (presigned upload via API media router)
  uploadMediaFile: (request: MediaUploadRequest) => Promise<MediaRecord>;
  readMediaRecords: (query?: Record<string, unknown>) => Promise<MediaRecord[]>;
  readMediaRecordById: (id: string) => Promise<MediaRecord | null>;
  deleteMediaRecord: (id: string) => Promise<void>;
  resolveMediaRefs: (refs: string[]) => Promise<MediaRecord[]>;

  // Feed (inbox service, chronological + sort)
  readFeed: (sort?: FeedSort) => Promise<InboxRecord[]>;
  markInboxRead: (id: string) => Promise<void>;
  countUnreadInbox: () => Promise<number>;

  // Profile
  readProfileRecord: () => Promise<ProfileRecord | null>;
  saveProfileRecord: (profile: Partial<ProfileRecord>) => Promise<ProfileRecord>;
  readUserProfileRecord: (username: string, provider: string) => Promise<ProfileRecord | null>;

  // Contacts (conventions schema)
  readContactRecords: () => Promise<ContactRecord[]>;
  readContactRecord: (username: string, provider: string) => Promise<ContactRecord | null>;
  addContactRecord: (contact: Omit<ContactRecord, '_id'>) => Promise<ContactRecord>;
  updateContactRecord: (id: string, updates: Partial<ContactRecord>) => Promise<ContactRecord>;
  deleteContactRecord: (id: string) => Promise<void>;
  searchContactRecords: (query: string) => Promise<ContactRecord[]>;

  // DMs (records-based)
  conversationKey: (
    a: { provider: string; username: string },
    b: { provider: string; username: string },
  ) => string;
  readDmMessages: (conversation: string) => Promise<DmRecord[]>;
  sendDmMessage: (conversation: string, message: string, mediaRefs?: string[]) => Promise<DmRecord>;
  deleteDmMessage: (conversation: string, id: string) => Promise<void>;
  listDmConversations: () => Promise<string[]>;
  getLastDmMessage: (conversation: string) => Promise<DmRecord | null>;

  // Comments
  readCommentsForPost: (postId: string) => Promise<CommentRecord[]>;
  readTopLevelComments: (postId: string) => Promise<CommentRecord[]>;
  readCommentReplies: (commentId: string) => Promise<CommentRecord[]>;
  createCommentRecord: (comment: Omit<CommentRecord, '_id'>) => Promise<CommentRecord>;
  updateCommentRecord: (id: string, updates: Partial<CommentRecord>) => Promise<CommentRecord>;
  deleteCommentRecord: (id: string) => Promise<void>;
  countCommentsForPost: (postId: string) => Promise<number>;

  // Reactions
  readReactionsForTarget: (targetService: 'posts' | 'comments', targetId: string) => Promise<ReactionRecord[]>;
  createReactionRecord: (reaction: Omit<ReactionRecord, '_id'>) => Promise<ReactionRecord>;
  toggleReactionOnTarget: (
    targetService: 'posts' | 'comments',
    targetId: string,
    type: string,
    authorUsername: string,
    authorProvider: string,
  ) => Promise<boolean>;
  deleteReactionRecord: (id: string) => Promise<void>;
  countReactionsForTarget: (targetService: 'posts' | 'comments', targetId: string) => Promise<number>;
  getReactionCountsForTarget: (targetService: 'posts' | 'comments', targetId: string) => Promise<Record<string, number>>;
}

const web10SocialAdapterInit = (): Web10SocialAdapter => {
  const queryParameters = new URLSearchParams(window.location.search);
  // Go local when served from any *.localhost host (so social.localhost ->
  // auth.localhost -> social.localhost works without needing ?local=true),
  // or when ?local=true is explicitly set.
  const host = window.location.hostname;
  const local =
    queryParameters.get('local') != null ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost');

  const authUrl = local ? 'http://auth.localhost' : AUTH_ORIGIN;
  const rtcHost = local ? 'rtc.localhost' : RTC_HOST;

  const wapi = wapiInit(authUrl, undefined, rtcHost) as WapiInstance;

  // Initialize the typed wapi wrapper for the data layer
  const wapiWrapper = createWapiWrapper(authUrl, rtcHost);

  // Token hand-off: `wapiWrapper` (the data layer) is a SEPARATE wapi/client
  // instance from `wapi` (auth). Both read the token cookie once at init, but a
  // FRESH login within a session sets the token only on `wapi` (+ the cookie) —
  // the already-created data-layer instance never re-reads it, so every
  // data-layer CRUD threw "not authenticated" until a page refresh. Mirror the
  // token onto the data-layer instance now (restore case) and whenever login
  // lands. authListen is additive (a window 'message' listener), so this
  // coexists with the app's own authListen, and each listener runs setToken
  // before its callback — so `wapi.token` is populated by the time this fires.
  // Purely client-side; nothing is stored server-side.
  const syncDataLayerToken = () => {
    if (wapi.token) wapiWrapper.setToken(wapi.token);
  };
  syncDataLayerToken();
  wapi.authListen(() => syncDataLayerToken());

  const adapter: Partial<Web10SocialAdapter> & WapiInstance = { ...wapi };

  adapter.login = function () {
    return adapter.openAuthPortal?.() ?? Promise.resolve();
  };

  // Sites allowed to act on these services. Including the host the app
  // is actually served from means a dev/prod deploy authorizes itself
  // without this list needing a code edit per environment.
  const crossOrigins = Array.from(
    new Set(['localhost', 'social.web10.app', window.location.hostname]),
  );

  const sirs = [
    {
      service: 'identity',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    {
      service: 'bulletin',
      cross_origins: crossOrigins,
      provider: '.*',
      username: '.*',
      read: true,
    },
    {
      service: 'contact-addresses',
      cross_origins: crossOrigins,
    },
    {
      service: 'message-inbox',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', create: true }],
    },
    {
      service: 'message-outbox',
      cross_origins: crossOrigins,
    },
    {
      service: 'posts',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    // ── Phase 5.5: public / private post split ─────────────────────────
    {
      service: 'public_posts',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }], // anon whitelisted for discovery
    },
    {
      service: 'private_posts',
      cross_origins: crossOrigins,
      // anon blocked — only token holders with explicit access
    },
    {
      service: 'crm-contacts',
      cross_origins: crossOrigins,
    },
    {
      service: 'crm-notes',
      cross_origins: crossOrigins,
    },
    {
      service: 'mail',
      cross_origins: crossOrigins,
      whitelist: [{ username: '.*', provider: '.*', create: true }],
    },
    // ── D4: conventions-schema services ──────────────────────────────
    {
      service: 'profile',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    {
      service: 'contacts',
      cross_origins: crossOrigins,
    },
    {
      service: 'inbox',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', create: true }],
    },
    {
      service: 'comments',
      cross_origins: crossOrigins,
    },
    {
      service: 'reactions',
      cross_origins: crossOrigins,
    },
    {
      service: 'media',
      cross_origins: crossOrigins,
    },
    {
      service: 'follows',
      cross_origins: crossOrigins,
    },
    {
      service: 'dms',
      cross_origins: crossOrigins,
    },
  ];
  adapter.SMROnReady(sirs, []);

  // ── Legacy adapter methods (unchanged, for backward compat) ────────

  adapter.loadContact = async (web10: string): Promise<Contact> => {
    const [provider, user] = web10.split('/');
    const response = await adapter.read('identity', {}, user, provider);
    if (response.data.length > 0) return response.data[0] as Contact;
    return { web10, name: 'anonymous', pic: contactIco, bio: 'anonymous' };
  };

  adapter.loadContactAddresses = () => adapter.read('contact-addresses') as Promise<{ data: { web10: string }[] }>;
  adapter.loadContacts = async (): Promise<Contact[]> => {
    const response = await adapter.loadContactAddresses();
    return Promise.all(response.data.map((c: { web10: string }) => adapter.loadContact(c.web10)));
  };

  adapter.addContact = (web10: string) =>
    adapter.create('contact-addresses', { web10, date_added: new Date() });

  adapter.deleteContact = (contactID: string) =>
    adapter.delete('contacts', { _id: contactID });

  adapter.loadIdentity = () => adapter.read('identity') as Promise<{ data: Identity[] }>;

  adapter.editIdentity = async ({ web10, pic, name, bio }: Identity) => {
    const newId = { web10, pic, name, bio };
    const response = await adapter.update('identity', {}, { $set: newId });
    if (response.data.matchedCount === 0) {
      adapter.create('identity', newId);
    }
  };

  adapter.createMessage = async (message: string, recipient: string): Promise<Message> => {
    const [recipientProvider, recipientUsername] = recipient.split('/');
    const token = adapter.readToken();
    const toMyOutbox = {
      message,
      sentTime: new Date(),
      web10: `${recipientProvider}/${recipientUsername}`,
    };
    const toRecipientInbox = {
      message,
      sentTime: new Date(),
      web10: `${token.provider}/${token.username}`,
    };

    const r = await adapter.create(
      'message-inbox',
      toRecipientInbox,
      recipientUsername,
      recipientProvider
    );
    adapter.send(
      recipientProvider,
      recipientUsername,
      window.location.hostname,
      'web10-social-device',
      r.data
    );
    const outR = await adapter.create('message-outbox', toMyOutbox);
    return {
      ...(outR.data as Message),
      web10: `${token.provider}/${token.username}`,
      direction: 'out',
    };
  };

  adapter.loadRecievedMessages = async (web10: string): Promise<Message[]> => {
    const r = await adapter.read('message-inbox', { web10 });
    return r.data.map((e: unknown) => ({
      ...(e as Message),
      direction: 'in' as const,
    }));
  };

  adapter.loadSentMessages = async (web10: string): Promise<Message[]> => {
    const r = await adapter.read('message-outbox', { web10 });
    const token = adapter.readToken();
    return r.data.map((e: unknown) => ({
      ...(e as Message),
      direction: 'out' as const,
      web10: `${token.provider}/${token.username}`,
    }));
  };

  adapter.deleteMessages = async (messages: Message[]) => {
    const mOut = messages.filter((m) => m.direction === 'out');
    const mIn = messages.filter((m) => m.direction === 'in');
    const responsesIn = mIn.map((m) => adapter.delete('message-inbox', { _id: m._id }));
    const responsesOut = mOut.map((m) => adapter.delete('message-outbox', { _id: m._id }));
    return Promise.allSettled([responsesIn, responsesOut]);
  };

  adapter.createPost = ({ html, media }: { html: string; media: unknown[] }) => {
    const token = adapter.readToken();
    return adapter.create('posts', {
      html,
      media,
      time: new Date(),
      web10: `${token.provider}/${token.username}`,
    }) as Promise<{ data: Post }>;
  };

  adapter.loadMyPosts = () => adapter.read('posts') as Promise<{ data: Post[] }>;

  adapter.loadPosts = async (web10: string): Promise<Post[]> => {
    const [provider, user] = web10.split('/');
    const response = await adapter.read('posts', {}, user, provider);
    return response.data as Post[];
  };

  adapter.editPost = (id: string, html: string, media: unknown[]) =>
    adapter.update('posts', { _id: id }, { $set: { html, media } });

  adapter.deletePost = (id: string) => adapter.delete('posts', { _id: id });
  adapter.loadBulletins = () => adapter.read('bulletin');
  adapter.deleteBulletin = (id: string) => adapter.delete('bulletin', { _id: id });

  // ── D4: data layer methods (conventions-schema services) ───────────

  // Posts
  adapter.createPostRecord = dlCreatePost;
  adapter.readMyPostRecords = dlReadMyPosts;
  adapter.readUserPostRecords = dlReadUserPosts;
  adapter.updatePostRecord = dlUpdatePost;
  adapter.deletePostRecord = dlDeletePost;

  // Media
  adapter.uploadMediaFile = dlUploadMedia;
  adapter.readMediaRecords = dlReadMedia;
  adapter.readMediaRecordById = dlReadMediaRecord;
  adapter.deleteMediaRecord = dlDeleteMedia;
  adapter.resolveMediaRefs = dlResolveMediaRefs;

  // Feed
  adapter.readFeed = dlReadFeed;
  adapter.markInboxRead = dlMarkInboxRead;
  adapter.countUnreadInbox = dlCountUnread;

  // Profile
  adapter.readProfileRecord = dlReadProfile;
  adapter.saveProfileRecord = dlSaveProfile;
  adapter.readUserProfileRecord = dlReadUserProfile;

  // Contacts
  adapter.readContactRecords = dlReadContacts;
  adapter.readContactRecord = dlReadContact;
  adapter.addContactRecord = dlAddContact;
  adapter.updateContactRecord = dlUpdateContact;
  adapter.deleteContactRecord = dlDeleteContact;
  adapter.searchContactRecords = dlSearchContacts;

  // DMs
  adapter.conversationKey = dlConversationKey;
  adapter.readDmMessages = dlReadDms;
  adapter.sendDmMessage = dlSendDm;
  adapter.deleteDmMessage = dlDeleteDm;
  adapter.listDmConversations = dlListConversations;
  adapter.getLastDmMessage = dlGetLastDm;

  // Comments
  adapter.readCommentsForPost = dlReadComments;
  adapter.readTopLevelComments = dlReadTopLevelComments;
  adapter.readCommentReplies = dlReadReplies;
  adapter.createCommentRecord = dlCreateComment;
  adapter.updateCommentRecord = dlUpdateComment;
  adapter.deleteCommentRecord = dlDeleteComment;
  adapter.countCommentsForPost = dlCountComments;

  // Reactions
  adapter.readReactionsForTarget = dlReadReactions;
  adapter.createReactionRecord = dlCreateReaction;
  adapter.toggleReactionOnTarget = dlToggleReaction;
  adapter.deleteReactionRecord = dlDeleteReaction;
  adapter.countReactionsForTarget = dlCountReactions;
  adapter.getReactionCountsForTarget = dlGetReactionCounts;

  return adapter as Web10SocialAdapter;
};

export default web10SocialAdapterInit;
