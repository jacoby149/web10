import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useInterface from '../interfaces/Interface';
import type { AppInterface } from '../types';

vi.mock('../interfaces/Web10SocialAdapter', () => ({
  default: vi.fn(() => ({
    isSignedIn: vi.fn(() => false),
    authListen: vi.fn((cb) => cb()),
    initP2P: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'test', username: 'user' })),
    SMROnReady: vi.fn(),
    login: vi.fn(),
    signOut: vi.fn(),
    loadContacts: vi.fn(() => Promise.resolve([])),
    loadIdentity: vi.fn(() => Promise.resolve({ data: [] })),
    loadContactAddresses: vi.fn(() => Promise.resolve({ data: [] })),
    loadMyPosts: vi.fn(() => Promise.resolve({ data: [] })),
    loadPosts: vi.fn(() => Promise.resolve([])),
    read: vi.fn(() => Promise.resolve({ data: [] })),
    create: vi.fn(() => Promise.resolve({ data: {} })),
    update: vi.fn(() => Promise.resolve({ data: { matchedCount: 1 } })),
    delete: vi.fn(() => Promise.resolve({})),
    send: vi.fn(),
    loadContact: vi.fn(() => Promise.resolve({ web10: 'test/user', name: 'Test', pic: '', bio: '' })),
    addContact: vi.fn(() => Promise.resolve({})),
    deleteContact: vi.fn(() => Promise.resolve({})),
    editIdentity: vi.fn(() => Promise.resolve({})),
    createMessage: vi.fn(() => Promise.resolve({ message: 'test', sentTime: '', web10: '', direction: 'out' })),
    loadRecievedMessages: vi.fn(() => Promise.resolve([])),
    loadSentMessages: vi.fn(() => Promise.resolve([])),
    deleteMessages: vi.fn(() => Promise.resolve({})),
    createPost: vi.fn(() => Promise.resolve({ data: { _id: '1' } })),
    editPost: vi.fn(() => Promise.resolve({})),
    deletePost: vi.fn(() => Promise.resolve({})),
    loadBulletins: vi.fn(() => Promise.resolve({ data: [] })),
    deleteBulletin: vi.fn(() => Promise.resolve({})),
  })),
}));

describe('Interface', () => {
  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useInterface());

    expect(result.current.theme).toBe('dark');
    expect(result.current.menuCollapsed).toBe(true);
    expect(Array.isArray(result.current.contacts)).toBe(true);
    expect(Array.isArray(result.current.feedPosts)).toBe(true);
    expect(Array.isArray(result.current.wallPosts)).toBe(true);
    expect(Array.isArray(result.current.bulletin)).toBe(true);
    expect(Array.isArray(result.current.currentMessages)).toBe(true);
    expect(result.current.selectedMessages).toEqual([]);
  });

  it('toggles theme between dark and light', () => {
    const { result } = renderHook(() => useInterface());
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('toggles menu collapsed', () => {
    const { result } = renderHook(() => useInterface());
    expect(result.current.menuCollapsed).toBe(true);

    act(() => result.current.toggleMenuCollapsed());
    expect(result.current.menuCollapsed).toBe(false);
  });

  it('sets mode and resets search and menu', () => {
    const { result } = renderHook(() => useInterface());
    act(() => result.current.setMode('contacts'));

    expect(result.current.mode).toBe('contacts');
    expect(result.current.search).toBe('');
    expect(result.current.menuCollapsed).toBe(true);
  });

  it('handles runSearch in contacts mode', () => {
    const { result } = renderHook(() => useInterface());
    act(() => result.current.setMode('contacts'));

    act(() => result.current.runSearch('test'));
    expect(result.current.search).toBe('test');
  });

  it('handles runSearch in non-contacts mode', () => {
    const { result } = renderHook(() => useInterface());
    act(() => result.current.setMode('feed'));

    act(() => result.current.runSearch('test'));
    expect(result.current.search).toBe('test');
  });

  it('handles getPosts with empty feed', () => {
    const { result } = renderHook(() => useInterface());
    const posts = result.current.getPosts('anyone/provider');
    expect(posts).toEqual([]);
  });

  it('handles getContact with empty contacts', () => {
    const { result } = renderHook(() => useInterface());
    const contact = result.current.getContact('anyone/provider');
    expect(contact).toBeUndefined();
  });

  it('handles isMe with undefined identity', () => {
    const { result } = renderHook(() => useInterface());
    expect(result.current.isMe('anyone/provider')).toBe(false);
  });

  it('handles deleteBulletin', () => {
    const { result } = renderHook(() => useInterface());
    act(() => result.current.setBulletin([
      { _id: '1', html: '<p>Test</p>' },
      { _id: '2', html: '<p>Test2</p>' },
    ]));

    act(() => result.current.deleteBulletin('1'));
    expect(result.current.bulletin).toHaveLength(1);
    expect(result.current.bulletin[0]._id).toBe('2');
  });

  it('handles selectMessage and deSelectMessage', () => {
    const { result } = renderHook(() => useInterface());
    act(() => result.current.setCurrentMessages([
      { message: 'test', sentTime: '2024-01-01', web10: 'test/user', direction: 'in', _id: '1' },
    ]));

    act(() => result.current.selectMessage('1'));
    expect(result.current.selectedMessages).toHaveLength(1);

    act(() => result.current.deSelectMessage('1'));
    expect(result.current.selectedMessages).toHaveLength(0);
  });

  it('handles resetSelectedMessages', () => {
    const { result } = renderHook(() => useInterface());
    act(() => result.current.setSelectedMessages([
      { message: 'test', sentTime: '2024-01-01', web10: 'test/user', direction: 'in', _id: '1' },
    ]));

    act(() => result.current.resetSelectedMessages());
    expect(result.current.selectedMessages).toEqual([]);
  });

  it('handles cancelIdentityChanges', () => {
    const { result } = renderHook(() => useInterface());
    act(() => result.current.setIdentity({ web10: 'test/user', name: 'Original', pic: '', bio: '' }));
    act(() => result.current.setDraftIdentity({ web10: 'test/user', name: 'Modified', pic: '', bio: '' }));

    act(() => result.current.cancelIdentityChanges());
    expect(result.current.draftIdentity?.name).toBe('Original');
  });
});
