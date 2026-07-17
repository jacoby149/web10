import { wapiInit } from 'web10-npm';
import type { Contact, Identity, Message, Post } from '../types';
import contactIco from '../assets/images/Contact.png';

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
}

const web10SocialAdapterInit = (): Web10SocialAdapter => {
  const queryParameters = new URLSearchParams(window.location.search);
  const local = queryParameters.get('local');

  const wapi = wapiInit(
    local ? 'http://auth.localhost' : 'https://auth.web10.app',
    undefined,
    local ? 'rtc.localhost' : 'rtc.web10.app'
  ) as WapiInstance;

  const adapter: Partial<Web10SocialAdapter> & WapiInstance = { ...wapi };

  adapter.login = function () {
    return adapter.openAuthPortal?.() ?? Promise.resolve();
  };

  const sirs = [
    {
      service: 'identity',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    {
      service: 'bulletin',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
      provider: '.*',
      username: '.*',
      read: true,
    },
    {
      service: 'contact-addresses',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
    },
    {
      service: 'message-inbox',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
      whitelist: [{ provider: '.*', username: '.*', create: true }],
    },
    {
      service: 'message-outbox',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
    },
    {
      service: 'posts',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    {
      service: 'crm-contacts',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
    },
    {
      service: 'crm-notes',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
    },
    {
      service: 'mail',
      cross_origins: ['localhost', 'web10social.netlify.app', 'social.web10.app'],
      whitelist: [{ username: '.*', provider: '.*', create: true }],
    },
  ];
  adapter.SMROnReady(sirs, []);

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

  return adapter as Web10SocialAdapter;
};

export default web10SocialAdapterInit;
