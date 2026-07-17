import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMockInterface from '../interfaces/MockInterface';
import type { Post, Message } from '../types';

describe('MockInterface edge cases', () => {
  it('handles search with special characters', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setMode('contacts'));

    act(() => result.current.runSearch('@#$%'));
    expect(result.current.search).toBe('@#$%');
  });

  it('handles search with empty string', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setMode('contacts'));

    act(() => result.current.runSearch(''));
    expect(result.current.search).toBe('');
  });

  it('handles search with unicode characters', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setMode('contacts'));

    act(() => result.current.runSearch('你好'));
    expect(result.current.search).toBe('你好');
  });

  it('handles creating post with empty html', () => {
    const { result } = renderHook(() => useMockInterface());
    const newPost: Post = {
      html: '',
      media: [],
      time: new Date().toLocaleTimeString(),
      web10: result.current.identity?.web10 ?? '',
    };

    act(() => result.current.createPost(newPost));
    expect(result.current.wallPosts[0].html).toBe('');
  });

  it('handles creating post with media only', () => {
    const { result } = renderHook(() => useMockInterface());
    const newPost: Post = {
      html: '',
      media: [{ type: 'image', src: 'data:image/png;base64,abc' }],
      time: new Date().toLocaleTimeString(),
      web10: result.current.identity?.web10 ?? '',
    };

    act(() => result.current.createPost(newPost));
    expect(result.current.wallPosts[0].media).toHaveLength(1);
  });

  it('handles deleting post that does not exist', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialCount = result.current.wallPosts.length;

    act(() => result.current.deletePost('nonexistent-id'));

    expect(result.current.wallPosts.length).toBe(initialCount);
  });

  it('handles deleting bulletin that does not exist', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialCount = result.current.bulletin.length;

    act(() => result.current.deleteBulletin('nonexistent-id'));

    expect(result.current.bulletin.length).toBe(initialCount);
  });

  it('handles selecting message that does not exist', () => {
    const { result } = renderHook(() => useMockInterface());

    act(() => result.current.selectMessage('nonexistent-id'));

    expect(result.current.selectedMessages).toEqual([]);
  });

  it('handles deselecting message that does not exist', () => {
    const { result } = renderHook(() => useMockInterface());
    const msgId = result.current.currentMessages[0]?._id;
    act(() => result.current.selectMessage(msgId));
    expect(result.current.selectedMessages.length).toBe(1);

    act(() => result.current.deSelectMessage('nonexistent-id'));

    expect(result.current.selectedMessages.length).toBe(1);
  });

  it('handles sending empty message', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialCount = result.current.currentMessages.length;

    act(() => result.current.sendMessage(''));

    expect(result.current.currentMessages.length).toBe(initialCount + 1);
    expect(result.current.currentMessages[result.current.currentMessages.length - 1].message).toBe('');
  });

  it('handles sending message with special characters', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialCount = result.current.currentMessages.length;

    act(() => result.current.sendMessage('<script>alert("xss")</script>'));

    expect(result.current.currentMessages.length).toBe(initialCount + 1);
  });

  it('handles multiple messages in quick succession', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialCount = result.current.currentMessages.length;

    act(() => {
      result.current.sendMessage('msg1');
      result.current.sendMessage('msg2');
      result.current.sendMessage('msg3');
    });

    expect(result.current.currentMessages.length).toBe(initialCount + 3);
  });

  it('handles chat with unknown contact', () => {
    const { result } = renderHook(() => useMockInterface());

    act(() => result.current.chat('unknown/provider'));

    expect(result.current.mode).toBe('chat');
    expect(result.current.currentContact).toBeNull();
  });

  it('handles addContact when searchContact is null', () => {
    const { result } = renderHook(() => useMockInterface());
    const initialCount = result.current.contacts.length;

    act(() => result.current.setSearchContact(null));
    act(() => result.current.addContact());

    expect(result.current.contacts.length).toBe(initialCount);
  });

  it('handles deleteCurrentContact when currentContact is null', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setCurrentContact(null));
    const initialCount = result.current.contacts.length;

    act(() => result.current.deleteCurrentContact());

    expect(result.current.contacts.length).toBe(initialCount);
    expect(result.current.mode).toBe('contacts');
  });

  it('handles saveIdentityChanges when draftIdentity is undefined', () => {
    const { result } = renderHook(() => useMockInterface());

    act(() => result.current.setDraftIdentity(undefined));
    act(() => result.current.saveIdentityChanges());

    expect(result.current.identity).toBeUndefined();
  });

  it('handles getPosts with empty feed', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setFeedPosts([]));

    const posts = result.current.getPosts('anyone/provider');
    expect(posts).toEqual([]);
  });

  it('handles getContact with empty contacts', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setContacts([]));

    const contact = result.current.getContact('anyone/provider');
    expect(contact).toBeUndefined();
  });

  it('handles isMe with undefined identity', () => {
    const { result } = renderHook(() => useMockInterface());
    act(() => result.current.setIdentity(undefined));

    expect(result.current.isMe('anyone/provider')).toBe(false);
  });

  it('handles mode transitions from all modes', () => {
    const { result } = renderHook(() => useMockInterface());
    const modes: Array<'login' | 'contacts' | 'chat' | 'chat-edit' | 'bio' | 'my-bio' | 'bio-edit' | 'bulletin-edit' | 'feed'> = [
      'login', 'contacts', 'chat', 'chat-edit', 'bio', 'my-bio', 'bio-edit', 'bulletin-edit', 'feed',
    ];

    modes.forEach((mode) => {
      act(() => result.current.setMode(mode));
      expect(result.current.mode).toBe(mode);
      expect(result.current.search).toBe('');
    });
  });

  it('handles search in all modes', () => {
    const { result } = renderHook(() => useMockInterface());
    const modes: Array<'login' | 'contacts' | 'chat' | 'chat-edit' | 'bio' | 'my-bio' | 'bio-edit' | 'bulletin-edit' | 'feed'> = [
      'chat', 'bio', 'my-bio', 'bio-edit', 'bulletin-edit', 'feed', 'contacts',
    ];

    modes.forEach((mode) => {
      act(() => result.current.setMode(mode));
      act(() => result.current.runSearch('test'));
      expect(result.current.search).toBe('test');
    });
  });
});
