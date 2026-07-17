import { Conversation, Avatar } from '@chatscope/chat-ui-kit-react';
import type { AppInterface } from '../../types';
import contactIco from '../../assets/images/Contact.png';

function ContactAdder({ I }: { I: AppInterface }) {
  const user = I.search.includes('/') ? I.search : `api.web10.app/${I.search}`;
  const toAdd = I.search ? `add ${user}` : 'add a contact';
  const label = I.search ? 'on web10 social?' : 'To Add A Contact';
  const status = I.search ? 'no.' : 'Type In The Search Bar!';
  const contactName = I.searchContact === null ? '' : I.searchContact.name;
  const contactPic = I.searchContact === null ? contactIco : I.searchContact.pic;

  return (
    <div onClick={I.addContact}>
      <Conversation
        name={toAdd}
        className={`contacts ${I.theme}`}
        lastSenderName={label}
        info={status}
      >
        <Avatar src={contactPic} name={contactName} />
      </Conversation>
    </div>
  );
}

export default ContactAdder;
