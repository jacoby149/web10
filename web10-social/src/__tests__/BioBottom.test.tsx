import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BioBottom from '../components/Bio/BioBottom';
import type { AppInterface } from '../types';

const createMockI = (overrides?: Partial<AppInterface>): AppInterface => ({
  theme: 'dark',
  menuCollapsed: true,
  mode: 'bio',
  search: '',
  contacts: [],
  currentContact: null,
  searchContact: null,
  feedPosts: [],
  wallPosts: [],
  bulletin: [],
  identity: { web10: 'test/user', name: 'Test', pic: '', bio: '' },
  draftIdentity: { web10: 'test/user', name: 'Test', pic: '', bio: '' },
  currentMessages: [],
  selectedMessages: [],
  typingIndicator: '',
  setTheme: vi.fn(),
  setMenuCollapsed: vi.fn(),
  setContacts: vi.fn(),
  setCurrentContact: vi.fn(),
  setSearchContact: vi.fn(),
  setFeedPosts: vi.fn(),
  setWallPosts: vi.fn(),
  setBulletin: vi.fn(),
  setIdentity: vi.fn(),
  setDraftIdentity: vi.fn(),
  setCurrentMessages: vi.fn(),
  setSelectedMessages: vi.fn(),
  setTypingIndicator: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  runSearch: vi.fn(),
  getPosts: vi.fn(),
  getContact: vi.fn(),
  isMe: vi.fn(),
  savePostChanges: vi.fn(),
  deletePost: vi.fn(),
  createPost: vi.fn(),
  addContact: vi.fn(),
  deleteCurrentContact: vi.fn(),
  cancelIdentityChanges: vi.fn(),
  saveIdentityChanges: vi.fn(),
  deleteBulletin: vi.fn(),
  getMessages: vi.fn(),
  chat: vi.fn(),
  selectMessage: vi.fn(),
  deSelectMessage: vi.fn(),
  deleteSelectedMessages: vi.fn(),
  resetSelectedMessages: vi.fn(),
  sendMessage: vi.fn(),
  setMode: vi.fn(),
  toggleMenuCollapsed: vi.fn(),
  toggleTheme: vi.fn(),
  ...overrides,
});

describe('BioBottom', () => {
  it('shows settings and delete contact only in bio mode', () => {
    const I = createMockI({ mode: 'bio' });
    const { container } = render(<BioBottom I={I} />);
    expect(container.textContent).toContain('settings');
    expect(container.textContent).toContain('delete contact');
  });

  it('hides settings and delete contact in other modes', () => {
    const I = createMockI({ mode: 'my-bio' });
    const { container } = render(<BioBottom I={I} />);
    expect(container.textContent).not.toContain('settings');
    expect(container.textContent).not.toContain('delete contact');
  });

  it('does not delete when safety input is empty', () => {
    const deleteCurrentContact = vi.fn();
    const I = createMockI({ mode: 'bio', deleteCurrentContact });
    render(<BioBottom I={I} />);
    const link = document.querySelector('a') as HTMLElement;
    if (link) link.click();
    expect(deleteCurrentContact).not.toHaveBeenCalled();
  });

  it('does not delete when safety input is wrong value', () => {
    const deleteCurrentContact = vi.fn();
    const I = createMockI({ mode: 'bio', deleteCurrentContact });
    render(<BioBottom I={I} />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong' } });
    const link = document.querySelector('a') as HTMLElement;
    if (link) link.click();
    expect(deleteCurrentContact).not.toHaveBeenCalled();
  });

  it('calls deleteCurrentContact when safety input is "delete"', () => {
    const deleteCurrentContact = vi.fn();
    const I = createMockI({ mode: 'bio', deleteCurrentContact });
    render(<BioBottom I={I} />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'delete' } });
    const links = document.querySelectorAll('a');
    const deleteLink = Array.from(links).find((l) => l.textContent?.includes('delete contact'));
    if (deleteLink) fireEvent.click(deleteLink);
    expect(deleteCurrentContact).toHaveBeenCalled();
  });
});
