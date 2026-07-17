import { R, C } from 'rectangles-npm';
import { Avatar } from '@chatscope/chat-ui-kit-react';
import type { AppInterface } from '../../types';

function Identity({ I }: { I: AppInterface }) {
  const identity = I.mode === 'bio' ? I.currentContact : I.draftIdentity;

  const setName = (name: string) => {
    if (!I.draftIdentity) return;
    I.setDraftIdentity({
      name,
      web10: I.draftIdentity.web10,
      pic: I.draftIdentity.pic,
      bio: I.draftIdentity.bio,
    });
  };

  const setPic = (pic: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(pic);
    reader.onload = () => {
      if (!I.draftIdentity) return;
      I.setDraftIdentity({
        name: I.draftIdentity.name,
        web10: I.draftIdentity.web10,
        pic: reader.result as string,
        bio: I.draftIdentity.bio,
      });
    };
  };

  const setBio = (bio: string) => {
    if (!I.draftIdentity) return;
    I.setDraftIdentity({
      name: I.draftIdentity.name,
      web10: I.draftIdentity.web10,
      pic: I.draftIdentity.pic,
      bio,
    });
  };

  return (
    <R t theme={I.theme}>
      <C t ha="center" va="center">
        <Avatar style={{ margin: '20px' }} size="lg" src={identity?.pic} name={identity?.name} />
        {I.mode === 'bio-edit' ? (
          <label>
            <input
              type="file"
              style={{ display: 'none' }}
              accept="image/*"
              onChange={(event) => {
                const selectedImage = event.target.files?.[0];
                if (selectedImage) setPic(selectedImage);
              }}
            />
            <a className="button is-warning is-small">upload photo</a>
          </label>
        ) : null}
      </C>
      <R t ns s="24px" h>
        <div className="columns is-centered">
          <div className="column has-text-centered is-4">
            {I.mode === 'bio-edit' ? (
              <i>
                [
                <input
                  onChange={(e) => setName(e.target.value)}
                  size={22}
                  style={{ color: 'gold' }}
                  value={identity?.name}
                />
                ]
              </i>
            ) : (
              <i>name : {identity?.name}</i>
            )}
          </div>
        </div>
      </R>
      <R t bb ns s="30px" h>
        <div className="columns is-centered">
          <div className="column has-text-centered is-4">
            {I.mode === 'bio-edit' ? (
              <i>
                [
                <input
                  onChange={(e) => setBio(e.target.value)}
                  size={32}
                  style={{ color: 'gold' }}
                  value={identity?.bio}
                />
                ]
              </i>
            ) : (
              <i>bio : {identity?.bio}</i>
            )}
          </div>
        </div>
      </R>
    </R>
  );
}

export default Identity;
