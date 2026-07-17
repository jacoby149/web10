export type Theme = "dark" | "light";

export type Mode =
  | "login"
  | "contacts"
  | "chat"
  | "chat-edit"
  | "bio"
  | "my-bio"
  | "bio-edit"
  | "bulletin-edit"
  | "feed";

export interface Identity {
  web10: string;
  pic: string;
  name: string;
  bio: string;
}

export interface Contact extends Identity {
  _id?: string;
  lastSenderName?: string;
  lastMessage?: string;
}

export interface ContactAddress {
  web10: string;
  date_added?: Date;
}

export interface Post {
  _id?: string;
  html: string;
  media: MediaItem[];
  time: string;
  web10: string;
}

export interface MediaItem {
  type: "image" | "video";
  src: string;
}

export interface Bulletin {
  _id: string;
  html: string;
  height?: string;
}

export interface Message {
  _id?: string;
  message: string;
  sentTime: string;
  web10: string;
  direction: "in" | "out";
}

export interface ChatScopeMessage {
  _id?: string;
  message: string;
  sentTime: string;
  web10: string;
  direction: "incoming" | "outgoing";
  position: "single" | "first" | "normal" | "last";
}

export interface PostState {
  post: Post;
  draftPost: Post;
  mode: "view" | "edit" | "create";
  setDraftPost: React.Dispatch<React.SetStateAction<Post>>;
  setMode: React.Dispatch<React.SetStateAction<"view" | "edit" | "create">>;
  toggleEditMode: () => void;
  deleteMedia: (key: number) => void;
  clearChanges: () => void;
  saveChanges: () => void;
  createPost: () => void;
  deletePost: () => void;
}

export interface AppInterface {
  theme: Theme;
  menuCollapsed: boolean;
  mode: Mode;
  search: string;

  contacts: Contact[];
  currentContact: Contact | null;
  searchContact: Contact | null;

  feedPosts: Post[];
  wallPosts: Post[];

  bulletin: Bulletin[];

  identity: Identity | undefined;
  draftIdentity: Identity | undefined;

  currentMessages: Message[];
  selectedMessages: Message[];
  typingIndicator: string;

  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  setMenuCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  setCurrentContact: React.Dispatch<React.SetStateAction<Contact | null>>;
  setSearchContact: React.Dispatch<React.SetStateAction<Contact | null>>;
  setFeedPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setWallPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBulletin: React.Dispatch<React.SetStateAction<Bulletin[]>>;
  setIdentity: React.Dispatch<React.SetStateAction<Identity | undefined>>;
  setDraftIdentity: React.Dispatch<React.SetStateAction<Identity | undefined>>;
  setCurrentMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSelectedMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setTypingIndicator: React.Dispatch<React.SetStateAction<string>>;

  login: () => void;
  logout: () => void;
  runSearch: (query: string) => void;
  getPosts: (web10: string) => Post[];
  getContact: (web10: string) => Contact | undefined;
  isMe: (web10: string) => boolean;
  savePostChanges: (draftPost: Post) => void;
  deletePost: (id: string) => void;
  createPost: (draftPost: Post) => void;
  addContact: () => void;
  deleteCurrentContact: () => void;
  cancelIdentityChanges: () => void;
  saveIdentityChanges: () => void;
  deleteBulletin: (id: string) => void;
  getMessages: (web10: string) => void;
  chat: (web10: string) => void;
  selectMessage: (id: string | undefined) => void;
  deSelectMessage: (id: string | undefined) => void;
  deleteSelectedMessages: () => void;
  resetSelectedMessages: () => void;
  sendMessage: (messageString: string) => void;
  setMode: (mode: Mode) => void;
  toggleMenuCollapsed: () => void;
  toggleTheme: () => void;
}
