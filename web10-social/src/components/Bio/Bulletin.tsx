import { R, C } from 'rectangles-npm';
import DOMPurify from 'dompurify';
import { useEffect, useState } from 'react';
import type { AppInterface, Bulletin as BulletinType } from '../../types';
import { RawIcon } from '../shared/Icon';

function BulletinItem({ I, bulletin }: { I: AppInterface; bulletin: BulletinType }) {
  const config = { ADD_TAGS: ['iframe'], KEEP_CONTENT: false };
  const [edit, setEdit] = useState(false);

  useEffect(() => setEdit(false), [I.mode]);

  const toggleEdit = () => setEdit((prev) => !prev);

  const deleteBulletin = (id: string) => {
    I.deleteBulletin(id);
    setEdit(false);
  };

  return (
    <R l bb s={bulletin.height} theme={edit ? 'brick' : I.theme}>
      {edit ? (
        <C
          onClick={() => deleteBulletin(bulletin._id)}
          t
          br
          h
          ha="center"
          p="0px"
          s="30px"
        >
          <i style={{ color: 'pink' }} className="fa fa-trash font-weight-bold" />
        </C>
      ) : (
        <C s="0px" />
      )}
      <R
        t
        ns
        tel
        h
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bulletin.html, config) }}
      />
      {I.mode === 'bulletin-edit' ? (
        <C onClick={toggleEdit} t bl h ha="center" p="0px" s="30px">
          <i style={{ color: 'yellow' }} className="fa fa-pencil font-weight-bold" />
        </C>
      ) : (
        <C s="0px" />
      )}
    </R>
  );
}

function Bulletin({ I }: { I: AppInterface }) {
  const bulletinItems = I.bulletin.map((bulletin) => (
    <BulletinItem
      key={bulletin._id}
      I={I}
      bulletin={bulletin}
    />
  ));

  return (
    <R t theme={I.theme}>
      {bulletinItems}
    </R>
  );
}

export default Bulletin;
