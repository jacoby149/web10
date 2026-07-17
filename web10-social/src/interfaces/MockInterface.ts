import { useState } from 'react';
import type { AppInterface, Bulletin, Contact, CrmContact, CrmNote, Identity, MailMessage, Message, Mode, Post, Theme } from '../types';
import mockContacts from '../mocks/MockContacts';
import mockFeed from '../mocks/MockFeed';
import mockWall from '../mocks/MockWall';
import mockChat from '../mocks/MockChat';
import mockIdentity from '../mocks/MockIdentity';
import mockBulletin from '../mocks/MockBulletin';

const generateId = () => Math.random().toString(36).substring(2, 11);

const useMockInterface = (): AppInterface => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [menuCollapsed, setMenuCollapsed] = useState(true);
  const [mode, setModeState] = useState<Mode>('login');
  const [search, setSearch] = useState('');

  const [contacts, setContacts] = useState<Contact[]>(mockContacts);
  const [currentContact, setCurrentContact] = useState<Contact | null>(mockContacts[0] ?? null);
  const [searchContact, setSearchContact] = useState<Contact | null>(null);

  const [feedPosts, setFeedPosts] = useState<Post[]>(mockFeed);
  const [wallPosts, setWallPosts] = useState<Post[]>(mockWall);

  const [bulletin, setBulletin] = useState<Bulletin[]>(mockBulletin);

  const [identity, setIdentity] = useState<Identity>(mockIdentity);
  const [draftIdentity, setDraftIdentity] = useState<Identity>(mockIdentity);

  const [currentMessages, setCurrentMessages] = useState<Message[]>(mockChat);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [typingIndicator, setTypingIndicator] = useState('');

  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([
    { _id: 'mock1', name: 'Alice Johnson', company: 'TechCorp', phone: '+1-555-0101', email: 'alice@techcorp.com', web10: 'api.web10.app/alice', color: 'green' },
    { _id: 'mock2', name: 'Bob Smith', company: 'DesignHub', phone: '+1-555-0102', email: 'bob@designhub.com', color: 'yellow' },
    { _id: 'mock3', name: 'Carol White', company: 'DataFlow', phone: '+1-555-0103', email: 'carol@dataflow.io', web10: 'api.web10.app/carol', color: 'red' },
  ]);
  const [crmSearch, setCrmSearch] = useState('');
  const [crmColorFilter, setCrmColorFilter] = useState<{ green: boolean; yellow: boolean; red: boolean }>({ green: true, yellow: true, red: true });
  const [crmSelectedContact, setCrmSelectedContact] = useState<CrmContact | null>(null);
  const [crmNotes, setCrmNotes] = useState<CrmNote[]>([
    { _id: 'note1', note: 'Met at conference, interested in partnership', id: 'mock1', date: '2024-01-15T10:30:00Z' },
    { _id: 'note2', note: 'Follow up on Q2 proposal', id: 'mock1', date: '2024-02-01T14:00:00Z' },
  ]);

  const [mailMessages, setMailMessages] = useState<MailMessage[]>([
    { _id: 'mail1', mail: 'Hey, great meeting you at the conference!', date: '2024-03-01T09:00:00Z', provider: 'api.web10.app', username: 'alice' },
    { _id: 'mail2', mail: 'Can we schedule a call next week to discuss the project?', date: '2024-03-05T11:30:00Z', provider: 'api.web10.app', username: 'bob' },
  ]);

  const setMode = (m: Mode) => {
    setMenuCollapsed(true);
    setSearch('');
    setModeState(m);
  };

  const toggleMenuCollapsed = () => setMenuCollapsed((prev) => !prev);
  const toggleTheme = () => setTheme((prev) => prev === 'dark' ? 'light' : 'dark');

  const login = () => setMode('contacts');
  const logout = () => setMode('login');

  const runSearch = (query: string) => {
    const chatFilter = (m: Message) => m.message.toLowerCase().includes(query.toLowerCase());
    const contactFilter = (c: Contact) => c.name.toLowerCase().includes(query.toLowerCase());
    const postFilter = (p: Post) => p.html.toLowerCase().includes(query.toLowerCase());

    switch (mode) {
      case 'chat':
      case 'chat-edit':
        setCurrentMessages(mockChat.filter(chatFilter));
        break;
      case 'bio':
        setFeedPosts(mockFeed.filter(postFilter));
        break;
      case 'my-bio':
      case 'bio-edit':
      case 'bulletin-edit':
        setWallPosts(mockWall.filter(postFilter));
        break;
      case 'feed':
        setFeedPosts(mockFeed.filter(postFilter));
        break;
      case 'contacts':
        setContacts(mockContacts.filter(contactFilter));
        break;
    }
    setSearch(query);
  };

  const getPosts = (web10: string) => feedPosts.filter((p) => p.web10 === web10);

  const getContact = (web10: string) => {
    const cMap = contacts.reduce<Record<string, Contact>>((acc, c) => {
      acc[c.web10] = c;
      return acc;
    }, {});
    return cMap[web10];
  };

  const isMe = (web10: string) => web10 === identity?.web10;

  const savePostChanges = (draftPost: Post) => {
    setWallPosts((prev) => prev.map((p) => draftPost._id === p._id ? draftPost : p));
    setFeedPosts((prev) => prev.map((p) => draftPost._id === p._id ? draftPost : p));
  };

  const deletePost = (id: string) => {
    setWallPosts((prev) => prev.filter((p) => p._id !== id));
    setFeedPosts((prev) => prev.filter((p) => p._id !== id));
  };

  const createPost = (draftPost: Post) => {
    const newPost = { ...draftPost, _id: generateId() };
    setWallPosts((prev) => [newPost, ...prev]);
    setFeedPosts((prev) => [newPost, ...prev]);
  };

  const addContact = () => {
    if (!searchContact) return;
    setContacts((prev) => [...prev, searchContact]);
    setSearch('');
  };

  const deleteCurrentContact = () => {
    setContacts((prev) => prev.filter((c) => c._id !== currentContact?._id));
    setMode('contacts');
  };

  const cancelIdentityChanges = () => setDraftIdentity(identity);
  const saveIdentityChanges = () => setIdentity(draftIdentity);

  const deleteBulletin = (id: string) =>
    setBulletin((prev) => prev.filter((b) => b._id !== id));

  const getMessages = (_web10: string) => { /* no-op in mock */ };

  const chat = (web10: string) => {
    setCurrentContact(getContact(web10) ?? null);
    setMode('chat');
  };

  const selectMessage = (id: string | undefined) => {
    const msg = currentMessages.find((m) => m._id === id);
    if (msg) setSelectedMessages((prev) => [...prev, msg]);
  };

  const deSelectMessage = (id: string | undefined) =>
    setSelectedMessages((prev) => prev.filter((m) => m._id !== id));

  const deleteSelectedMessages = () => {
    setCurrentMessages((prev) => prev.filter((m) => !selectedMessages.includes(m)));
    setSelectedMessages([]);
  };

  const resetSelectedMessages = () => setSelectedMessages([]);

  const sendMessage = (messageString: string) => {
    const message: Message = {
      _id: generateId(),
      message: messageString,
      sentTime: String(new Date()),
      web10: identity.web10,
      direction: 'out',
    };
    setCurrentMessages((prev) => [...prev, message]);
  };

  // CRM mock actions
  const crmAddContact = (contact: CrmContact) => {
    const newContact = { ...contact, _id: generateId(), color: 'green' as const };
    setCrmContacts((prev) => [...prev, newContact]);
  };
  const crmUpdateContact = (contact: CrmContact) => {
    setCrmContacts((prev) => prev.map((c) => c._id === contact._id ? contact : c));
  };
  const crmDeleteContact = (contact: CrmContact) => {
    setCrmContacts((prev) => prev.filter((c) => c._id !== contact._id));
    setCrmNotes((prev) => prev.filter((n) => n.id !== contact._id));
  };
  const crmIncrementColor = (contact: CrmContact) => {
    const colorOrder = ['green', 'yellow', 'red'] as const;
    const next = colorOrder[(colorOrder.indexOf(contact.color) + 1) % 3];
    crmUpdateContact({ ...contact, color: next });
  };
  const crmAddNote = (noteText: string) => {
    if (!crmSelectedContact?._id) return;
    const note: CrmNote = { _id: generateId(), note: noteText, id: crmSelectedContact._id, date: new Date().toISOString() };
    setCrmNotes((prev) => [...prev, note]);
  };
  const crmDeleteNote = (noteId: string) => {
    setCrmNotes((prev) => prev.filter((n) => n._id !== noteId));
  };
  const crmLoadNotes = (contactId?: string) => {
    const id = contactId || crmSelectedContact?._id;
    setCrmNotes(id ? (mockContacts as unknown as CrmNote[]).filter((n: CrmNote) => n.id === id) : []);
  };

  // Mail mock actions
  const mailSend = (_recipient: string, _server: string, message: string) => {
    const msg: MailMessage = { _id: generateId(), mail: message, date: String(new Date()), provider: 'api.web10.app', username: identity.web10.split('/')[1] };
    setMailMessages((prev) => [...prev, msg]);
  };
  const mailDelete = (id: string) => {
    setMailMessages((prev) => prev.filter((m) => m._id !== id));
  };
  const mailLoad = () => {};

  return {
    theme,
    menuCollapsed,
    mode,
    search,
    contacts,
    currentContact,
    searchContact,
    feedPosts,
    wallPosts,
    bulletin,
    identity,
    draftIdentity,
    currentMessages,
    selectedMessages,
    typingIndicator,
    setTheme,
    setMenuCollapsed,
    setContacts,
    setCurrentContact,
    setSearchContact,
    setFeedPosts,
    setWallPosts,
    setBulletin,
    setIdentity,
    setDraftIdentity,
    setCurrentMessages,
    setSelectedMessages,
    setTypingIndicator,
    login,
    logout,
    runSearch,
    getPosts,
    getContact,
    isMe,
    savePostChanges,
    deletePost,
    createPost,
    addContact,
    deleteCurrentContact,
    cancelIdentityChanges,
    saveIdentityChanges,
    deleteBulletin,
    getMessages,
    chat,
    selectMessage,
    deSelectMessage,
    deleteSelectedMessages,
    resetSelectedMessages,
    sendMessage,
    crmAddContact,
    crmUpdateContact,
    crmDeleteContact,
    crmIncrementColor,
    crmAddNote,
    crmDeleteNote,
    crmLoadNotes,
    mailSend,
    mailDelete,
    mailLoad,
    setMode,
    toggleMenuCollapsed,
    toggleTheme,
    // CRM state
    crmContacts,
    crmSearch,
    crmColorFilter,
    crmSelectedContact,
    crmNotes,
    setCrmContacts,
    setCrmSearch,
    setCrmColorFilter,
    setCrmSelectedContact,
    setCrmNotes,
    // Mail state
    mailMessages,
    setMailMessages,
  };
};

export default useMockInterface;
