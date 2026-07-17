import { useState } from 'react';
import type { AppInterface, Bulletin, Contact, Identity, Message, Mode, Post, Theme } from '../types';
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
    setMode,
    toggleMenuCollapsed,
    toggleTheme,
  };
};

export default useMockInterface;
