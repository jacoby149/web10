import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePostInterface from '../interfaces/PostInterface';
import type { AppInterface, Post } from '../types';

const createMockI = (): Partial<AppInterface> => {
  const savedPosts: Post[] = [];
  const createdPosts: Post[] = [];

  return {
    feedPosts: [],
    wallPosts: [],
    identity: { web10: 'test/user', name: 'Test', pic: '', bio: '' },
    savePostChanges: vi.fn((post) => savedPosts.push(post)),
    deletePost: vi.fn((id) => {}),
    createPost: vi.fn((post) => createdPosts.push(post)),
  };
};

describe('PostInterface', () => {
  it('initializes in create mode when no post provided', () => {
    const mockI = createMockI() as AppInterface;
    const { result } = renderHook(() => usePostInterface(mockI));

    expect(result.current.mode).toBe('create');
    expect(result.current.post.html).toBe('');
    expect(result.current.post.media).toEqual([]);
  });

  it('initializes in view mode when post is provided', () => {
    const mockI = createMockI() as AppInterface;
    const post: Post = {
      _id: '1',
      html: '<p>Hello</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));

    expect(result.current.mode).toBe('view');
    expect(result.current.post.html).toBe('<p>Hello</p>');
  });

  it('toggles between view and edit mode', () => {
    const mockI = createMockI() as AppInterface;
    const post: Post = {
      _id: '1',
      html: '<p>Hello</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));
    expect(result.current.mode).toBe('view');

    act(() => result.current.toggleEditMode());
    expect(result.current.mode).toBe('edit');

    act(() => result.current.toggleEditMode());
    expect(result.current.mode).toBe('view');
  });

  it('does not toggle from create mode', () => {
    const mockI = createMockI() as AppInterface;
    const { result } = renderHook(() => usePostInterface(mockI));
    expect(result.current.mode).toBe('create');

    act(() => result.current.toggleEditMode());
    expect(result.current.mode).toBe('create');
  });

  it('updates draft post html', () => {
    const mockI = createMockI() as AppInterface;
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        html: '<p>New content</p>',
      })
    );

    expect(result.current.draftPost.html).toBe('<p>New content</p>');
  });

  it('deletes media by index', () => {
    const mockI = createMockI() as AppInterface;
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        media: [
          { type: 'image', src: 'a.png' },
          { type: 'video', src: 'b.mp4' },
          { type: 'image', src: 'c.png' },
        ],
      })
    );

    act(() => result.current.deleteMedia(1));

    expect(result.current.draftPost.media).toHaveLength(2);
    expect(result.current.draftPost.media[0].src).toBe('a.png');
    expect(result.current.draftPost.media[1].src).toBe('c.png');
  });

  it('clears changes and toggles back to view', () => {
    const mockI = createMockI() as AppInterface;
    const post: Post = {
      _id: '1',
      html: '<p>Original</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));

    act(() => result.current.toggleEditMode());
    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        html: '<p>Modified</p>',
      })
    );
    expect(result.current.draftPost.html).toBe('<p>Modified</p>');

    act(() => result.current.clearChanges());

    expect(result.current.draftPost.html).toBe('<p>Original</p>');
    expect(result.current.mode).toBe('view');
  });

  it('saves changes and toggles back to view', () => {
    const mockI = createMockI() as AppInterface;
    const post: Post = {
      _id: '1',
      html: '<p>Original</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));

    act(() => result.current.toggleEditMode());
    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        html: '<p>Saved</p>',
      })
    );

    act(() => result.current.saveChanges());

    expect(mockI.savePostChanges).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<p>Saved</p>' })
    );
    expect(result.current.mode).toBe('view');
  });

  it('creates a post with correct metadata', () => {
    const mockI = createMockI() as AppInterface;
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        html: '<p>New</p>',
      })
    );

    act(() => result.current.createPost());

    expect(mockI.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<p>New</p>',
        web10: 'test/user',
      })
    );
  });

  it('deletes a post by id', () => {
    const mockI = createMockI() as AppInterface;
    const post: Post = {
      _id: 'abc123',
      html: '<p>Delete me</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));

    act(() => result.current.deletePost());

    expect(mockI.deletePost).toHaveBeenCalledWith('abc123');
  });
});
