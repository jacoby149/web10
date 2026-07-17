import { R } from 'rectangles-npm';
import type { AppInterface, Post } from '../../types';
import PostMaker from './PostMaker';
import PostViewer from './PostViewer';
import usePostInterface from '../../interfaces/PostInterface';

function Posts({ I, posts }: { I: AppInterface; posts: Post[] }) {
  const final = posts.map((post) => (
    <Post key={post._id ?? post.html.substring(0, 20)} I={I} post={post} />
  ));

  return (
    <R t tel>
      {final}
    </R>
  );
}

function Post({ I, post }: { I: AppInterface; post: Post }) {
  const postI = usePostInterface(I, post);
  return postI.mode === 'edit' ? (
    <PostMaker I={I} postI={postI} />
  ) : (
    <PostViewer I={I} postI={postI} />
  );
}

export default Posts;
