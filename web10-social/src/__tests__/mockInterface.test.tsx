import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMockInterface from '../interfaces/MockInterface';
import type { Post, Message } from '../types';

describe('MockInterface', () => {
  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useMockInterface());

    expect(result.current.theme).toBe('dark');
    expect(result.current.menuCollapsed).toBe(true);
    expect(result.current.mode).toBe('login');
    expect(result.current.search).toBe('');
    expect(Array.isArray(result.current.contacts)).toBe(true);
    expect(result.current.contacts.length).toBeGreaterThan(0);
    expect(Array.isArray(result.current.feedPosts)).toBe(true);
    expect(Array.isArray(result.current.wallPosts)).toBe(true);
    expect(Array.isArray(result.current.bulletin)).toBe(true);
    expect(result.current.identity).toBeDefined();
    expect(result.current.draftIdentity).toEqual(result.current.identity);
    expect(Array.isArray(result.current.currentMessages)).toBe(true);
    expect(result.current.selectedMessages).toEqual([]);
  });

  it('toggles theme between dark and light', () => {
    const { result } = renderHook(() => useMockInterface());
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('toggles menu collapsed', () => {
    const { result } = renderHook(() => useMockInterface());
    expect(result.current.menuCollapsed).toBe(true);

    act(() => result.current.toggleMenuCollapsed());
    expect(result.current.menuCollapsed).toBe(false);

    act(() => result.current.toggleMenuCollapsed());
    expect(result.current.menuCollapsed).toBe(true);
  });

  it('sets mode and resets search and menu', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.runSearch('test'));
    act(() => result.current.setMode('contacts'));

    expect(result.current.mode).toBe('contacts');
    expect(result.current.search).toBe('');
    expect(result.current.menuCollapsed).toBe(true);
  });

  it('logs in by setting mode to contacts', () => {
    const { result } = renderHook(() => useMockInterface());
    expect(result.current.mode).toBe('login');

    act(() => result.current.login());
    expect(result.current.mode).toBe('contacts');
  });

  it('logs out by setting mode to login', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setMode('contacts'));
    expect(result.current.mode).toBe('contacts');

    act(() => result.current.logout());
    expect(result.current.mode).toBe('login');
  });

  it('filters contacts by search query', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setMode('contacts'));

    const initialCount = result.current.contacts.length;
    act(() => result.current.runSearch('Emily'));

    expect(result.current.contacts.length).toBeLessThanOrEqual(initialCount);
    result.current.contacts.forEach((c) => {
      expect(c.name.toLowerCase()).toContain('emily');
    });
  });

  it('filters feed posts by search query', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setMode('feed'));

    const initialCount = result.current.feedPosts.length;
    act(() => result.current.runSearch('hike'));

    expect(result.current.feedPosts.length).toBeLessThanOrEqual(initialCount);
  });

  it('filters chat messages by search query', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setMode('chat'));

    const initialCount = result.current.currentMessages.length;
    act(() => result.current.runSearch('Hello'));

    expect(result.current.currentMessages.length).toBeLessThanOrEqual(initialCount);
  });

  it('gets posts for a specific web10 address', () => {
    const { result } = renderHook(() => useMockInterface());
    const emilyPosts = result.current.getPosts('api.web10.app/emily511');

    expect(Array.isArray(emilyPosts)).toBe(true);
    emilyPosts.forEach((p) => {
      expect(p.web10).toBe('api.web10.app/emily511');
    });
  });

  it('gets contact by web10 address', () => {
    const { result } = renderHook(() => useMockInterface());
    const contact = result.current.getContact('api.web10.app/emily511');

    expect(contact).toBeDefined();
    expect(contact?.web10).toBe('api.web10.app/emily511');
    expect(contact?.name).toBe('Emily');
  });

  it('returns undefined for unknown contact', () => {
    const { result } = renderHook(() => useMockInterface());
    const contact = result.current.getContact('unknown.provider/unknown');
    expect(contact).toBeUndefined();
  });

  it('isMe returns true for own web10', () => {
    const { result } = renderHook(() => useMockInterface());
    const myWeb10 = result.current.identity?.web10;
    expect(result.current.isMe(myWeb10 ?? '')).toBe(true);
    expect(result.current.isMe('someone.else/other')).toBe(false);
  });

  it('creates a new post', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialWallCount = result.current.wallPosts.length;
    const initialFeedCount = result.current.feedPosts.length;

    const newPost: Post = {
      html: '<p>New post</p>',
      media: [],
      time: new Date().toLocaleTimeString(),
      web10: result.current.identity?.web10 ?? '',
    };

    act(() => result.current.createPost(newPost));

    expect(result.current.wallPosts.length).toBe(initialWallCount + 1);
    expect(result.current.feedPosts.length).toBe(initialFeedCount + 1);
    expect(result.current.wallPosts[0].html).toBe('<p>New post</p>');
  });

  it('saves post changes', () => {
    const { result } = renderHook(() => useMockInterface());
    const postToEdit = result.current.wallPosts[0];
    expect(postToEdit).toBeDefined();

    const editedPost: Post = {
      ...postToEdit,
      html: '<p>Edited content</p>',
    };

    act(() => result.current.savePostChanges(editedPost));

    const updated = result.current.wallPosts.find((p) => p._id === postToEdit._id);
    expect(updated?.html).toBe('<p>Edited content</p>');
  });

  it('deletes a post by id', () => {
    const { result } = renderHook(() => useMockInterface());
    const postToDelete = result.current.wallPosts[0];
    expect(postToDelete).toBeDefined();
    const postId = postToDelete._id;

    act(() => result.current.deletePost(postId ?? ''));

    expect(result.current.wallPosts.find((p) => p._id === postId)).toBeUndefined();
    expect(result.current.feedPosts.find((p) => p._id === postId)).toBeUndefined();
  });

  it('deletes a bulletin by id', () => {
    const { result } = renderHook(() => useMockInterface());
    const bulletinId = result.current.bulletin[0]._id;

    act(() => result.current.deleteBulletin(bulletinId));

    expect(result.current.bulletin.find((b) => b._id === bulletinId)).toBeUndefined();
  });

  it('sends a message', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialCount = result.current.currentMessages.length;

    act(() => result.current.sendMessage('Hello!'));

    expect(result.current.currentMessages.length).toBe(initialCount + 1);
    const lastMsg = result.current.currentMessages[result.current.currentMessages.length - 1];
    expect(lastMsg.message).toBe('Hello!');
    expect(lastMsg.direction).toBe('out');
  });

  it('selects and deselects messages', () => {
    const { result } = renderHook(() => useMockInterface());
    const msgId = result.current.currentMessages[0]?._id;

    act(() => result.current.selectMessage(msgId));
    expect(result.current.selectedMessages.length).toBe(1);

    act(() => result.current.deSelectMessage(msgId));
    expect(result.current.selectedMessages.length).toBe(0);
  });

  it('deletes selected messages', () => {
    const { result } = renderHook(() => useMockInterface());
    const msgId = result.current.currentMessages[0]?._id;

    act(() => result.current.selectMessage(msgId));
    const initialCount = result.current.currentMessages.length;

    act(() => result.current.deleteSelectedMessages());

    expect(result.current.selectedMessages).toEqual([]);
    expect(result.current.currentMessages.length).toBeLessThan(initialCount);
  });

  it('resets selected messages', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.selectMessage(result.current.currentMessages[0]?._id));
    expect(result.current.selectedMessages.length).toBe(1);

    act(() => result.current.resetSelectedMessages());
    expect(result.current.selectedMessages).toEqual([]);
  });

  it('adds a contact', () => {
    const { result } = renderHook(() => useMockInterface());
    const newContact = result.current.contacts[0];
    act(() => result.current.setSearchContact(newContact));
    const initialCount = result.current.contacts.length;

    act(() => result.current.addContact());

    expect(result.current.contacts.length).toBeGreaterThan(initialCount);
  });

  it('deletes current contact', () => {
    const { result } = renderHook(() => useMockInterface());
    const contactId = result.current.currentContact?._id;
    const initialCount = result.current.contacts.length;

    act(() => result.current.deleteCurrentContact());

    expect(result.current.contacts.length).toBe(initialCount - 1);
    expect(result.current.mode).toBe('contacts');
  });

  it('cancels identity changes', () => {
    const { result } = renderHook(() => useMockInterface());
    const original = { ...result.current.identity! };

    act(() =>
      result.current.setDraftIdentity({
        ...result.current.identity!,
        name: 'Changed Name',
      })
    );
    expect(result.current.draftIdentity?.name).toBe('Changed Name');

    act(() => result.current.cancelIdentityChanges());
    expect(result.current.draftIdentity?.name).toBe(original.name);
  });

  it('saves identity changes', () => {
    const { result } = renderHook(() => useMockInterface());

    act(() =>
      result.current.setDraftIdentity({
        ...result.current.identity!,
        name: 'New Name',
      })
    );
    act(() => result.current.saveIdentityChanges());

    expect(result.current.identity?.name).toBe('New Name');
  });

  it('chats with a contact', () => {
    const { result } = renderHook(() => useMockInterface());
    const web10 = 'api.web10.app/emily511';

    act(() => result.current.chat(web10));

    expect(result.current.mode).toBe('chat');
    expect(result.current.currentContact?.web10).toBe(web10);
  });

  it('search updates search state', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.runSearch('test query'));
    expect(result.current.search).toBe('test query');
  });
});
