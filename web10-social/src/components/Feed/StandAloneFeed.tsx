import { R } from 'rectangles-npm';
import type { AppInterface } from '../../types';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Feed from './Feed';

function StandAloneFeed({ I }: { I: AppInterface }) {
  return (
    <R root t bt bb br bl theme={I.theme}>
      <TopBar I={I} />
      <R l tel>
        <SideBar I={I} />
        <R t tel>
          <Feed I={I} />
        </R>
      </R>
    </R>
  );
}

export default StandAloneFeed;
