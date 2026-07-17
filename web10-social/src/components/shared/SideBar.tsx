import { R, C } from 'rectangles-npm';
import type { AppInterface } from '../../types';

function SideBar({ I }: { I: AppInterface }) {
  return (
    <R t br c={I.menuCollapsed} s="200px">
      <C onClick={() => I.setMode('contacts')} t bb h s="40px" va="center">
        Contacts
      </C>
      <C onClick={() => I.setMode('my-bio')} t bb h s="40px" va="center">
        My Bio
      </C>
      <C onClick={() => I.setMode('feed')} t bb h s="40px" va="center">
        Social Feed
      </C>
      <C onClick={() => I.setMode('crm')} t bb h s="40px" va="center">
        CRM
      </C>
      <C onClick={() => I.setMode('mail')} t bb h s="40px" va="center">
        Mail
      </C>
      <C onClick={I.logout} t bb h s="40px" va="center">
        <i style={{ color: 'orange' }}>
          <u>Log Out</u>
        </i>
      </C>
    </R>
  );
}

export default SideBar;
