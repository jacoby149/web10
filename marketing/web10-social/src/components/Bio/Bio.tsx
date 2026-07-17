import { R } from 'rectangles-npm';
import type { AppInterface } from '../../types';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Identity from './Identity';
import Bulletin from './Bulletin';
import BioBottom from './BioBottom';
import Feed from '../Feed/Feed';

function Bio({ I }: { I: AppInterface }) {
  return (
    <R root t bt bb br bl theme={I.theme}>
      <TopBar I={I} />
      <R l tel>
        <SideBar I={I} />
        <R t tel>
          <Identity I={I} />
          <Bulletin I={I} />
          <BioBottom I={I} />
          <Feed I={I} />
        </R>
      </R>
    </R>
  );
}

export default Bio;
