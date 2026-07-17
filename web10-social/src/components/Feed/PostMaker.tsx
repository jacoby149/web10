import { RawIcon } from '../shared/Icon';
import type { AppInterface } from '../../types';
import type { PostState } from '../../types';
import Media from './Media';

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(file);
  });
}

function PostMaker({ I, postI }: { I: AppInterface; postI: PostState }) {
  const setHTML = (html: string) => {
    postI.setDraftPost({ ...postI.draftPost, html });
  };

  const addMedia = async (files: File[], type: 'image' | 'video') => {
    const blobs = await Promise.all(files.map(readAsDataURL));
    const links = [
      ...postI.draftPost.media,
      ...blobs.map((blob) => ({ src: blob, type })),
    ];
    postI.setDraftPost({ ...postI.draftPost, media: links });
  };

  const mediaItems = postI.draftPost.media.map((item, index) => (
    <Media
      I={I}
      postI={postI}
      type={item.type}
      src={item.src}
      key={index}
      idx={index}
    />
  ));

  return (
    <div>
      <div style={{ height: '5px' }} />
      <div className="card" style={{ marginLeft: '10px', marginRight: '5px' }}>
        <header className="card-header">
          <p className="card-header-title">
            {(postI.mode === 'edit' ||
              (postI.mode === 'create' &&
                (postI.draftPost.html || postI.draftPost.media.length > 0))) ? (
              <i
                onClick={postI.clearChanges}
                style={{ color: 'orange', marginRight: '10px' }}
                className="fa fa-2x fa-circle-xmark font-weight-bold"
              />
            ) : null}
            <img
              style={{ height: '48px', marginRight: '10px' }}
              src={I.identity?.pic}
            />
            {postI.mode === 'edit' ? 'Edit This Post' : 'Make a New Post'}
          </p>
          {postI.mode === 'edit' ? (
            <div>
              <button
                onClick={postI.saveChanges}
                style={{ margin: '15px', width: '130px' }}
                className="button is-primary"
              >
                Save Edits
                <i
                  style={{ marginLeft: '10px' }}
                  className="fa fa-check font-weight-bold"
                />
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={postI.createPost}
                style={{ margin: '15px', width: '130px' }}
                className="button is-primary"
              >
                Create Post
              </button>
            </div>
          )}
        </header>
        <div className="card-content">
          <div className="content">
            <div className="control">
              <textarea
                onChange={(e) => setHTML(e.target.value)}
                className="textarea"
                value={postI.draftPost.html}
                placeholder="What is on your mind??"
              />
            </div>
            <div>{mediaItems}</div>
          </div>
        </div>
        <footer className="card-footer">
          <label className="card-footer-item post">
            <input
              type="file"
              style={{ display: 'none' }}
              accept="video/*"
              onChange={(event) => {
                const files = Object.values(event.target.files ?? []);
                addMedia(files as File[], 'video');
              }}
              multiple
            />
            Video <RawIcon>video-plus</RawIcon>
          </label>
          <label className="card-footer-item post">
            <input
              type="file"
              style={{ display: 'none' }}
              accept="image/*"
              onChange={(event) => {
                const files = Object.values(event.target.files ?? []);
                addMedia(files as File[], 'image');
              }}
              multiple
            />
            Photo <RawIcon>photo</RawIcon>
          </label>
          {postI.mode === 'edit' ? (
            <a onClick={postI.deletePost} className="card-footer-item post">
              Delete Post <RawIcon>trash</RawIcon>
            </a>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

export default PostMaker;
