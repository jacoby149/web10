import type { AppInterface } from '../../types';
import Posts from './Posts';
import PostMaker from './PostMaker';
import usePostInterface from '../../interfaces/PostInterface';

function Feed({ I }: { I: AppInterface }) {
  const postCreatorI = usePostInterface(I);
  const posts =
    I.mode === 'feed'
      ? I.feedPosts
      : I.mode === 'bio' && I.currentContact
        ? I.getPosts(I.currentContact.web10)
        : I.wallPosts;

  return (
    <div className={`post-container ${I.theme}`}>
      <div style={{ maxWidth: '768px', margin: 'auto' }}>
        <div style={{ height: '20px' }} />
        {I.mode === 'bio' ? null : <PostMaker I={I} postI={postCreatorI} />}
        <Posts I={I} posts={posts} />
        <div style={{ height: '20px' }} />
      </div>
    </div>
  );
}

export default Feed;
