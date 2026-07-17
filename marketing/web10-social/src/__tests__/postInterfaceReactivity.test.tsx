import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePostInterface from '../interfaces/PostInterface';
import type { Post } from '../types';
import { createMockI } from './mockAppInterface';

describe('PostInterface reactivity', () => {
  it('resets draft when post changes', () => {
    const mockI = createMockI();
    const post1: Post = {
      _id: '1',
      html: '<p>Post 1</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const post2: Post = {
      _id: '2',
      html: '<p>Post 2</p>',
      media: [],
      time: '11:00 AM',
      web10: 'test/user',
    };

    const { result, rerender } = renderHook(
      ({ post }) => usePostInterface(mockI, post),
      { initialProps: { post: post1 } }
    );

    expect(result.current.post.html).toBe('<p>Post 1</p>');

    rerender({ post: post2 });
    expect(result.current.post.html).toBe('<p>Post 2</p>');
  });

  it('resets mode when post changes from null to post', () => {
    const mockI = createMockI();
    const post: Post = {
      _id: '1',
      html: '<p>Post</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };

    const { result, rerender } = renderHook(
      ({ post }) => usePostInterface(mockI, post),
      { initialProps: { post: null } }
    );

    expect(result.current.mode).toBe('create');

    rerender({ post });
    expect(result.current.mode).toBe('view');
  });

  it('resets mode when post changes from post to null', () => {
    const mockI = createMockI();
    const post: Post = {
      _id: '1',
      html: '<p>Post</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };

    const { result, rerender } = renderHook(
      ({ post }) => usePostInterface(mockI, post),
      { initialProps: { post } }
    );

    expect(result.current.mode).toBe('view');

    rerender({ post: null });
    expect(result.current.mode).toBe('create');
  });

  it('handles rapid mode toggles', () => {
    const mockI = createMockI();
    const post: Post = {
      _id: '1',
      html: '<p>Post</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));

    act(() => {
      result.current.toggleEditMode();
      result.current.toggleEditMode();
      result.current.toggleEditMode();
    });

    expect(result.current.mode).toBe('edit');
  });

  it('handles rapid media deletions', () => {
    const mockI = createMockI();
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        media: [
          { type: 'image', src: 'a.png' },
          { type: 'image', src: 'b.png' },
          { type: 'image', src: 'c.png' },
          { type: 'image', src: 'd.png' },
        ],
      })
    );

    act(() => result.current.deleteMedia(0));
    expect(result.current.draftPost.media).toHaveLength(3);

    act(() => result.current.deleteMedia(1));
    expect(result.current.draftPost.media).toHaveLength(2);
  });

  it('createPost then clearChanges resets to empty', () => {
    const mockI = createMockI();
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        html: '<p>New</p>',
      })
    );

    act(() => result.current.createPost());

    expect(result.current.draftPost.html).toBe('');
    expect(result.current.draftPost.media).toEqual([]);
  });
});
