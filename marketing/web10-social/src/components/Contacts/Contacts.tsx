import { R } from 'rectangles-npm';
import type { AppInterface } from '../../types';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import { Conversation, Avatar, ConversationList } from '@chatscope/chat-ui-kit-react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import '../Components.css';
import ContactAdder from './ContactAdder';

function Contacts({ I }: { I: AppInterface }) {
  const contactItems = I.contacts.map((contact) => (
    <Conversation
      key={contact._id ?? contact.web10}
      onClick={() => I.chat(contact.web10)}
      name={contact.name}
      className={`contacts ${I.theme}`}
      lastSenderName={contact.lastSenderName}
      info={contact.lastMessage}
    >
      <Avatar src={contact.pic} name={contact.name} />
    </Conversation>
  ));

  return (
    <R root t bt bb br bl onClick={I.toggleTheme} theme={I.theme}>
      <TopBar I={I} />
      <R l tel>
        <SideBar I={I} />
        <R t tel>
          <div>
            <ConversationList>
              <ContactAdder I={I} />
              {contactItems}
            </ConversationList>
          </div>
        </R>
      </R>
    </R>
  );
}

export default Contacts;
