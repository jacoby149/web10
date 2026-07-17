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
  | "feed"
  | "crm"
  | "mail";

export type CrmColor = "green" | "yellow" | "red";

export interface CrmContact {
  _id?: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  web10?: string;
  color: CrmColor;
}

export interface CrmNote {
  _id?: string;
  note: string;
  id: string;
  date: string;
}

export interface MailMessage {
  _id?: string;
  mail: string;
  date: string;
  provider: string;
  username: string;
}

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

  // CRM state
  crmContacts: CrmContact[];
  crmSearch: string;
  crmColorFilter: { green: boolean; yellow: boolean; red: boolean };
  crmSelectedContact: CrmContact | null;
  crmNotes: CrmNote[];

  // Mail state
  mailMessages: MailMessage[];

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

  // CRM setters
  setCrmContacts: React.Dispatch<React.SetStateAction<CrmContact[]>>;
  setCrmSearch: React.Dispatch<React.SetStateAction<string>>;
  setCrmColorFilter: React.Dispatch<React.SetStateAction<{ green: boolean; yellow: boolean; red: boolean }>>;
  setCrmSelectedContact: React.Dispatch<React.SetStateAction<CrmContact | null>>;
  setCrmNotes: React.Dispatch<React.SetStateAction<CrmNote[]>>;

  // Mail setters
  setMailMessages: React.Dispatch<React.SetStateAction<MailMessage[]>>;

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

  // CRM actions
  crmAddContact: (contact: CrmContact) => void;
  crmUpdateContact: (contact: CrmContact) => void;
  crmDeleteContact: (contact: CrmContact) => void;
  crmIncrementColor: (contact: CrmContact) => void;
  crmAddNote: (note: string) => void;
  crmDeleteNote: (noteId: string) => void;
  crmLoadNotes: (contactId: string) => void;

  // Mail actions
  mailSend: (recipient: string, server: string, message: string) => void;
  mailDelete: (id: string) => void;
  mailLoad: () => void;

  setMode: (mode: Mode) => void;
  toggleMenuCollapsed: () => void;
  toggleTheme: () => void;
}
