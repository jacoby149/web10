import { R } from 'rectangles-npm';
import type { AppInterface, ChatScopeMessage } from '../../types';
import {
  ChatContainer,
  ConversationHeader,
  Avatar,
  InfoButton,
  MessageInput,
  MessageList,
  MessageSeparator,
} from '@chatscope/chat-ui-kit-react';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import { RawIcon } from '../shared/Icon';
import TSMessage from './TSMessage';

const addChatScopeMetaData = (I: AppInterface): ChatScopeMessage[] => {
  const messages = I.currentMessages;
  return messages.map((message, i) => {
    const isPrecedent = i === 0 || messages[i - 1].web10 !== message.web10;
    const isLast = i === messages.length - 1 || messages[i + 1].web10 !== message.web10;
    const position: ChatScopeMessage['position'] = isPrecedent && isLast
      ? 'single'
      : isPrecedent && !isLast
        ? 'first'
        : !isPrecedent && isLast
          ? 'last'
          : 'normal';
    const direction: ChatScopeMessage['direction'] = I.isMe(message.web10)
      ? 'outgoing'
      : 'incoming';
    return { ...message, direction, position };
  });
};

function MessageItems({ I }: { I: AppInterface }) {
  const chatScopeReadyMessages = addChatScopeMetaData(I);
  const items: React.ReactNode[] = [];
  let separatorCount = 0;

  for (const [index, model] of chatScopeReadyMessages.entries()) {
    const present = new Date(model.sentTime);
    const mostRecent = index === I.currentMessages.length - 1;

    if (index === 0) {
      items.push(
        <MessageSeparator key={`sep-${index}`} content={present.toDateString()} />
      );
      separatorCount += 1;
    } else if (index > 1) {
      const past = new Date(I.currentMessages[index - 1].sentTime);
      if (present.getDay() - past.getDay() > 0) {
        items.push(
          <MessageSeparator key={`sep-${index}`} content={present.toDateString()} />
        );
        separatorCount += 1;
      }
    }
    items.push(
      <TSMessage key={`msg-${index}`} model={model} mostRecent={mostRecent} I={I} />
    );
  }

  return <>{items}</>;
}

function Chat({ I }: { I: AppInterface }) {
  const deleteSelectedMessages = () => {
    I.deleteSelectedMessages();
    I.setMode('chat');
  };

  const resetSelectedMessages = () => {
    I.resetSelectedMessages();
    I.setMode('chat');
  };

  return (
    <R root t bt bb br bl theme={I.theme}>
      <TopBar I={I} />
      <R l tel>
        <SideBar I={I} />
        <R t ns tel>
          <div style={{ height: '100%' }}>
            <ChatContainer>
              <ConversationHeader className={I.theme}>
                <Avatar
                  onClick={() => I.setMode('bio')}
                  src={I.currentContact?.pic}
                  name={I.currentContact?.name}
                />
                <ConversationHeader.Content
                  userName={I.currentContact?.name}
                  info={`@ ${I.currentContact?.web10}`}
                />
                <ConversationHeader.Actions>
                  {I.mode === 'chat' ? (
                    <>
                      <RawIcon onClick={() => I.setMode('chat-edit')}>square-check</RawIcon>
                      <RawIcon>cube</RawIcon>
                      <RawIcon>snake</RawIcon>
                      <InfoButton onClick={() => I.setMode('bio')} />
                    </>
                  ) : (
                    <>
                      <RawIcon onClick={resetSelectedMessages}>square-x</RawIcon>
                      <div style={{ color: 'orange', marginRight: '10px' }}>
                        <i>
                          undo
                          <br />
                          changes
                        </i>
                      </div>
                      <RawIcon onClick={deleteSelectedMessages}>trash</RawIcon>
                      <div style={{ color: 'orange' }}>
                        <i>
                          delete
                          <br />
                          selected
                        </i>
                      </div>
                    </>
                  )}
                </ConversationHeader.Actions>
              </ConversationHeader>
              <MessageList className={I.theme}>
                <MessageItems I={I} />
              </MessageList>
              <MessageInput
                attachButton={false}
                onSend={(v) => I.sendMessage(v)}
                className={I.theme}
                placeholder="Type message here"
              />
            </ChatContainer>
          </div>
        </R>
      </R>
    </R>
  );
}

export default Chat;
