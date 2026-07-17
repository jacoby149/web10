import DOMPurify from 'dompurify';
import type { AppInterface, Post } from '../../types';
import type { PostState } from '../../types';
import Media from './Media';

function PostViewer({ I, postI }: { I: AppInterface; postI: PostState }) {
  const post: Post = postI.post;
  const mediaItems = post.media.map((item, index) => (
    <Media
      type={item.type}
      src={item.src}
      I={I}
      postI={postI}
      key={index}
    />
  ));
  const identity = I.isMe(post.web10) ? I.identity : I.getContact(post.web10);
  const config = { ADD_TAGS: ['iframe'], KEEP_CONTENT: false };

  return (
    <div className="box" style={{ margin: '5px', marginLeft: '10px' }}>
      <article className="media">
        <div className="media-left">
          <figure className="image is-48x48">
            <img src={identity?.pic} alt="Profile" />
          </figure>
        </div>
        <div className="media-content">
          <div className="content">
            <p>
              <strong>
                {identity?.name}{' '}
                {I.isMe(post.web10) ? (
                  <i
                    onClick={postI.toggleEditMode}
                    style={{ color: 'orange' }}
                    className="fa fa-pencil font-weight-bold"
                  />
                ) : null}
              </strong>
              <br />
              [ <small style={{ color: 'teal' }}><u>{post.web10}</u></small> ]{' '}
              <small>{post.time}</small>
            </p>
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(post.html, config),
              }}
            />
            <div>{mediaItems}</div>
          </div>
        </div>
      </article>
    </div>
  );
}

export default PostViewer;
