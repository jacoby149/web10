import type { AppInterface } from '../../types';
import type { PostState } from '../../types';

function Content({ type, src }: { type: string; src: string }) {
  return type === 'image' ? (
    <img
      style={{ marginTop: '5px', marginRight: '5px', height: '128px' }}
      src={src}
      alt="Post media"
    />
  ) : (
    <video
      src={src}
      style={{ height: '128px', marginTop: '5px', marginRight: '5px' }}
      controls
    >
      Your browser does not support audio in video tag.
    </video>
  );
}

function Media({
  type,
  src,
  postI,
  idx,
}: {
  type: string;
  src: string;
  I: AppInterface;
  postI: PostState;
  idx?: number;
}) {
  return (
    <div style={{ display: 'inline-block' }}>
      {postI.mode !== 'view' ? (
        <i
          onClick={() => postI.deleteMedia(idx ?? 0)}
          style={{
            position: 'absolute',
            color: '#ffff77dd',
            marginTop: '8px',
            marginLeft: '5px',
            zIndex: 1,
          }}
          className="fa fa-2x fa-rectangle-xmark font-weight-bold"
        />
      ) : null}
      <Content type={type} src={src} />
    </div>
  );
}

export default Media;
