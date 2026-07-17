import { R } from 'rectangles-npm';
import { useState } from 'react';
import type { AppInterface } from '../../types';

function BioBottom({ I }: { I: AppInterface }) {
  const [safetyInput, setSafetyInput] = useState('');

  const safeDelete = () => {
    if (safetyInput === 'delete') I.deleteCurrentContact();
  };

  return (
    <R t theme={I.theme}>
      <R t ns bb s="24px">
        <div className="columns is-centered">
          <div className="column has-text-centered is-4">
            <i>
              add personal flare to your bio with -&gt;{' '}
              <a href="https://web10.app">web10 apps!</a>
            </i>
          </div>
        </div>
      </R>
      {I.mode === 'bio' ? (
        <R t ns bb s="24px">
          <div className="columns is-centered">
            <div className="column has-text-centered is-4">
              <i>settings [modify below]</i>
            </div>
          </div>
        </R>
      ) : (
        <R t s="0px" />
      )}
      {I.mode === 'bio' ? (
        <R t ns bb s="24px" h>
          <div className="columns is-centered">
            <div className="column has-text-centered is-4">
              <i>
                {' '}
                <a onClick={safeDelete}>delete contact</a> || [{' '}
                <input
                  size={17}
                  value={safetyInput}
                  onChange={(e) => setSafetyInput(e.target.value)}
                  placeholder={"type &quot;delete&quot; here"}
                />
                {' '}]
              </i>
            </div>
          </div>
        </R>
      ) : (
        <R t s="0px" />
      )}
    </R>
  );
}

export default BioBottom;
