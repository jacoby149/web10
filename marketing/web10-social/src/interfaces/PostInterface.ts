import { useEffect, useState } from 'react';
import type { AppInterface, Post, PostState } from '../types';

const usePostInterface = (I: AppInterface, post: Post | null = null): PostState => {
  const initMode = () => (post === null ? 'create' : 'view');
  const empty: Post = { html: '', media: [], time: '', web10: '' };

  const [mode, setMode] = useState<'view' | 'edit' | 'create'>(initMode());
  const [draftPost, setDraftPost] = useState<Post>(post ?? empty);

  useEffect(() => {
    setDraftPost(post ?? empty);
    setMode(initMode());
  }, [I.feedPosts, I.wallPosts, post]);

  const toggleEditMode = () => {
    if (mode === 'edit') setMode('view');
    else if (mode === 'view') setMode('edit');
  };

  const deleteMedia = (key: number) => {
    const newMedia = draftPost.media.filter((_, i) => i !== key);
    setDraftPost({ ...draftPost, media: newMedia });
  };

  const clearChanges = () => {
    setDraftPost(post ?? empty);
    toggleEditMode();
  };

  const saveChanges = () => {
    I.savePostChanges(draftPost);
    toggleEditMode();
  };

  const createPost = () => {
    I.createPost({
      ...draftPost,
      time: new Date().toLocaleTimeString(),
      web10: I.identity?.web10 ?? '',
    });
    clearChanges();
  };

  const deletePost = () => {
    if (post?._id) I.deletePost(post._id);
  };

  return {
    post: post ?? empty,
    draftPost,
    mode,
    setDraftPost,
    setMode,
    toggleEditMode,
    deleteMedia,
    clearChanges,
    saveChanges,
    createPost,
    deletePost,
  };
};

export default usePostInterface;
