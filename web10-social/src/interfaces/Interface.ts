import { useEffect, useRef, useState } from 'react';
import type { AppInterface, Bulletin, Contact, Identity, Message, Mode, Post, Theme } from '../types';
import web10SocialAdapterInit from './Web10SocialAdapter';
import defaultIdentity from '../mocks/defaultIdentity';
import { onlySettled, sortSettled } from './settledHelpers';

const useInterface = (): AppInterface => {
  const _socialAdapter = useRef<ReturnType<typeof web10SocialAdapterInit> | null>(null);
  let socialAdapter = _socialAdapter.current;

  const [theme, setTheme] = useState<Theme>('dark');
  const [menuCollapsed, setMenuCollapsed] = useState(true);
  const [mode, setModeState] = useState<Mode>('login');
  const [search, setSearch] = useState('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [currentContact, setCurrentContact] = useState<Contact | null>(null);
  const currentContactRef = useRef<Contact | null>(null);
  const [searchContact, setSearchContact] = useState<Contact | null>(null);

  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [wallPosts, setWallPosts] = useState<Post[]>([]);

  const [bulletin, setBulletin] = useState<Bulletin[]>([]);

  const [identity, setIdentity] = useState<Identity | undefined>();
  const [draftIdentity, setDraftIdentity] = useState<Identity | undefined>();

  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const currentMessagesRef = useRef<Message[]>([]);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [typingIndicator, setTypingIndicator] = useState('');

  useEffect(() => { currentContactRef.current = currentContact; }, [currentContact]);
  useEffect(() => { currentMessagesRef.current = currentMessages; }, [currentMessages]);

  const setMode = (m: Mode) => {
    setMenuCollapsed(true);
    setSearch('');
    setModeState(m);
  };

  const toggleMenuCollapsed = () => setMenuCollapsed((prev) => !prev);
  const toggleTheme = () => setTheme((prev) => prev === 'dark' ? 'light' : 'dark');

  const initApp = () => {
    if (!socialAdapter) return;
    socialAdapter.initP2P((_conn, data) => {
      if (currentContactRef.current?.web10 === (data as { web10: string }).web10) {
        setCurrentMessages((s) => [...s, data as Message]);
      }
    }, 'web10-social-device');

    setMode('contacts');

    socialAdapter.loadContacts().then((c) => setContacts(c));

    socialAdapter.loadIdentity().then((response) => {
      const token = socialAdapter.readToken();
      const web10 = `${token.provider}/${token.username}`;
      const id = response.data.length > 0
        ? response.data[0]
        : defaultIdentity(web10);
      setIdentity(id);
      setDraftIdentity(id);
      return id;
    }).then((myID) => {
      socialAdapter.loadContactAddresses().then((response) => {
        const feedContacts = [...response.data, myID];
        onlySettled(
          feedContacts.map((c: { web10: string }) => socialAdapter.loadPosts(c.web10))
        ).then((contactPostsList) => {
          const sortedPosts = sortSettled<Post>(contactPostsList);
          setFeedPosts(sortedPosts);
        });
      });
    });

    socialAdapter.loadMyPosts().then((response) => {
      setWallPosts(response.data.reverse());
    });
  };

  const login = () => {
    if (!socialAdapter) return;
    socialAdapter.login();
  };

  const logout = () => {
    if (!socialAdapter) return;
    socialAdapter.signOut();
    setMode('login');
    window.location.reload();
  };

  const runSearch = (query: string) => {
    if (mode === 'contacts') {
      const web10 = query.includes('/') ? query : `api.web10.app/${query}`;
      const [provider, user] = web10.split('/');
      if (!socialAdapter) return;
      socialAdapter
        .read('identity', {}, user, provider)
        .then((r) => {
          if (r.data.length > 0) setSearchContact(r.data[0] as Contact);
          else setSearchContact(null);
        });
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
    if (!socialAdapter) return;
    socialAdapter.editPost(String(draftPost._id), draftPost.html, draftPost.media).then(() => {
      setWallPosts((prev) => prev.map((p) => draftPost._id === p._id ? draftPost : p));
      setFeedPosts((prev) => prev.map((p) => draftPost._id === p._id ? draftPost : p));
    });
  };

  const deletePost = (id: string) => {
    if (!socialAdapter) return;
    socialAdapter.deletePost(id).then(() => {
      setWallPosts((prev) => prev.filter((p) => p._id !== id));
      setFeedPosts((prev) => prev.filter((p) => p._id !== id));
    });
  };

  const createPost = (draftPost: Post) => {
    if (!socialAdapter) return;
    socialAdapter.createPost(draftPost).then((response) => {
      const IDedDraftPost = { ...draftPost, _id: response.data._id };
      setWallPosts((prev) => [IDedDraftPost, ...prev]);
      setFeedPosts((prev) => [IDedDraftPost, ...prev]);
    });
  };

  const addContact = () => {
    if (!socialAdapter || !searchContact) return;
    socialAdapter.addContact(searchContact.web10).then(() => {
      setContacts((prev) => [...prev, searchContact]);
      setSearch('');
    });
  };

  const deleteCurrentContact = () => {
    setContacts((prev) => prev.filter((c) => c._id !== currentContact?._id));
    setMode('contacts');
  };

  const cancelIdentityChanges = () => setDraftIdentity(identity);

  const saveIdentityChanges = () => {
    if (!socialAdapter || !draftIdentity) return;
    socialAdapter.editIdentity(draftIdentity);
  };

  const deleteBulletin = (id: string) =>
    setBulletin((prev) => prev.filter((b) => b._id !== id));

  const getMessages = (web10: string) => {
    if (!socialAdapter) return;
    const messageRequests = [
      socialAdapter.loadSentMessages(web10),
      socialAdapter.loadRecievedMessages(web10),
    ];
    onlySettled(messageRequests).then((messages) => {
      const sortedMessages = sortSettled<Message>(messages, 'sentTime', -1);
      setCurrentMessages(sortedMessages);
    });
  };

  const chat = (web10: string) => {
    setCurrentContact(getContact(web10) ?? null);
    setMode('chat');
    getMessages(web10);
  };

  const selectMessage = (id: string | undefined) => {
    const msg = currentMessages.find((m) => m._id === id);
    if (msg) setSelectedMessages((prev) => [...prev, msg]);
  };

  const deSelectMessage = (id: string | undefined) =>
    setSelectedMessages((prev) => prev.filter((m) => m._id !== id));

  const deleteSelectedMessages = () => {
    if (!socialAdapter) return;
    socialAdapter.deleteMessages(selectedMessages).then(() => {
      setCurrentMessages((prev) => prev.filter((m) => !selectedMessages.includes(m)));
      setSelectedMessages([]);
    });
  };

  const resetSelectedMessages = () => setSelectedMessages([]);

  const sendMessage = (messageString: string) => {
    if (!socialAdapter || !currentContact) return;
    socialAdapter.createMessage(messageString, currentContact.web10).then((m) => {
      setCurrentMessages((prev) => [...prev, m]);
    });
  };

  useEffect(() => {
    const adapter = web10SocialAdapterInit();
    _socialAdapter.current = adapter;
    socialAdapter = adapter;

    if (adapter.isSignedIn()) {
      initApp();
    } else {
      adapter.authListen(initApp);
    }
  }, []);

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

export default useInterface;
