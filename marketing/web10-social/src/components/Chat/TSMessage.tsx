import { Message } from '@chatscope/chat-ui-kit-react';
import { useEffect, useState } from 'react';
import type { AppInterface, ChatScopeMessage, Contact } from '../../types';

function TSMessage({
  model,
  I,
  mostRecent,
}: {
  model: ChatScopeMessage;
  I: AppInterface;
  mostRecent: boolean;
}) {
  const [showTime, setShowTime] = useState(mostRecent);
  const [selected, setSelected] = useState(false);
  const contact: Contact | undefined = I.isMe(model.web10)
    ? I.identity
    : I.getContact(model.web10);

  const toggleShowTime = () => setShowTime((prev) => !prev);

  const toggleSelected = () => {
    if (selected) {
      I.deSelectMessage(model._id);
    } else {
      I.selectMessage(model._id);
    }
    setSelected((prev) => !prev);
  };

  const onClick = () => {
    if (I.mode === 'chat-edit') toggleSelected();
    else toggleShowTime();
  };

  useEffect(() => setSelected(false), [I.mode]);

  const translatedModel = { ...model };
  if (showTime && model.position === 'normal') translatedModel.position = 'first';
  else if (showTime && model.position === 'last') translatedModel.position = 'single';
  translatedModel.sentTime = new Date(model.sentTime).toLocaleTimeString();

  return (
    <Message
      onClick={onClick}
      model={translatedModel}
      className={`${I.theme} ${selected ? 'selected' : ''}`}
    >
      {(model.position === 'first' || model.position === 'single')
        ? <Message.Header sender={contact?.name} />
        : null}
      {showTime ? <Message.Footer sentTime={translatedModel.sentTime} /> : null}
    </Message>
  );
}

export default TSMessage;
