import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePostInterface from '../interfaces/PostInterface';
import type { Post } from '../types';
import { createMockI } from './mockAppInterface';

describe('PostInterface edge cases', () => {
  it('handles null post gracefully', () => {
    const mockI = createMockI();
    const { result } = renderHook(() => usePostInterface(mockI, null));

    expect(result.current.mode).toBe('create');
    expect(result.current.post.html).toBe('');
    expect(result.current.post.media).toEqual([]);
    expect(result.current.post.web10).toBe('');
  });

  it('handles post with undefined _id for delete - skips call', () => {
    const mockI = createMockI();
    const post: Post = {
      html: '<p>Test</p>',
      media: [],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));

    act(() => result.current.deletePost());
    expect(mockI.deletePost).not.toHaveBeenCalled();
  });

  it('handles empty media array deletion', () => {
    const mockI = createMockI();
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() => result.current.deleteMedia(0));
    expect(result.current.draftPost.media).toEqual([]);
  });

  it('handles deleteMedia with out-of-bounds index', () => {
    const mockI = createMockI();
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() =>
      result.current.setDraftPost({
        ...result.current.draftPost,
        media: [{ type: 'image', src: 'a.png' }],
      })
    );

    act(() => result.current.deleteMedia(99));
    expect(result.current.draftPost.media).toHaveLength(1);
  });

  it('createPost includes correct web10 from identity', () => {
    const mockI = createMockI();
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() => result.current.createPost());
    expect(mockI.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ web10: 'test/user' })
    );
  });

  it('createPost includes timestamp', () => {
    const mockI = createMockI();
    const { result } = renderHook(() => usePostInterface(mockI));

    act(() => result.current.createPost());
    const call = (mockI.createPost as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof call.time).toBe('string');
    expect(call.time.length).toBeGreaterThan(0);
  });

  it('saveChanges calls I.savePostChanges then toggles mode', () => {
    const mockI = createMockI();
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
    expect(result.current.mode).toBe('edit');

    act(() => result.current.saveChanges());
    expect(result.current.mode).toBe('view');
    expect(mockI.savePostChanges).toHaveBeenCalled();
  });

  it('clearChanges resets draft to original post', () => {
    const mockI = createMockI();
    const post: Post = {
      _id: '1',
      html: '<p>Original</p>',
      media: [{ type: 'image', src: 'a.png' }],
      time: '10:00 AM',
      web10: 'test/user',
    };
    const { result } = renderHook(() => usePostInterface(mockI, post));

    act(() => result.current.toggleEditMode());
    act(() =>
      result.current.setDraftPost({
        html: '<p>Modified</p>',
        media: [],
        time: '10:00 AM',
        web10: 'test/user',
      })
    );

    act(() => result.current.clearChanges());
    expect(result.current.draftPost.html).toBe('<p>Original</p>');
    expect(result.current.draftPost.media).toHaveLength(1);
  });

  it('handles multiple media items', () => {
    const mockI = createMockI();
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
    expect(result.current.draftPost.media[0].type).toBe('image');
    expect(result.current.draftPost.media[1].type).toBe('image');
  });
});
