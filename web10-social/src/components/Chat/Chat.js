// see private messages between you and a friend / group.

import { R, C } from 'rectangles-npm'
import { ChatContainer, ConversationHeader, Avatar, InfoButton, TypingIndicator, MessageInput, MessageList, MessageSeparator } from '@chatscope/chat-ui-kit-react';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar'
import { RawIcon } from '../shared/Icon'
import TSMessage from './TSMessage';
import React from 'react'

function addChatScopeMetaData(I) {
    const messages = I.currentMessages
    return messages.map(
        (message, i) => {
            // direction -> incoming or outgoing
            // position -> single, first, normal, last
            const isPrecedent = i === 0 || messages[i - 1].web10 !== message.web10;
            const isLast = i === messages.length - 1 || messages[i + 1].web10 !== message.web10;
            const position = isPrecedent && isLast ? "single" :
                isPrecedent && !isLast ? "first" :
                    !isPrecedent && isLast ? "last" :
                        "normal";
            const direction = I.isMe(message.web10) ? "outgoing" : "incoming";
            return { ...message, direction: direction, position: position };
        }
    );
}

function MessageItems({ I }) {
    // doing the work of adding separators, and position calculating of messages.
    var messageItems = [];
    var separatorCount = 0

    const chatScopeReadyMessages = addChatScopeMetaData(I)

    for (const [index, model] of chatScopeReadyMessages.entries()) {
        const present = new Date(model["sentTime"]);
        const mostRecent = index === I.currentMessages.length - 1;
        if (index == 0) {
            messageItems.push(
                <MessageSeparator key={index + separatorCount} content={present.toDateString()} />
            )
            separatorCount += 1;
        }
        else if (index > 1) {
            const past = new Date(I.currentMessages[index - 1]["sentTime"]);
            if (present.getDay() - past.getDay() > 0) {
                messageItems.push(
                    <MessageSeparator key={index + separatorCount} content={present.toDateString()} />
                )
                separatorCount += 1;
            }
        }
        messageItems.push(
            <TSMessage key={index + separatorCount} model={model} mostRecent={mostRecent} I={I} />
        )
    }
    return (
        <>
            {messageItems}
        </>
    )
}

function Chat({ I }) {

    function deleteSelectedMessages() {
        I.deleteSelectedMessages();
        I.setMode("chat")
    }

    function resetSelectedMessages() {
        I.resetSelectedMessages();
        I.setMode("chat")
    }

    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I} />
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t ns tel>
                    <div style={{
                        height: "100%"
                    }}>
                        <ChatContainer>
                            <ConversationHeader className={I.theme}>
                                <Avatar onClick={() => I.setMode("bio")} src={I.currentContact.pic} name="Emily" />
                                <ConversationHeader.Content userName={I.currentContact.name} info={`@ ${I.currentContact.web10}`} />
                                <ConversationHeader.Actions>

                                    {I.mode === "chat" ?
                                        <>
                                            <RawIcon onClick={() => I.setMode("chat-edit")}>square-check</RawIcon>
                                            <RawIcon>cube</RawIcon>
                                            <RawIcon>snake</RawIcon>
                                            <InfoButton onClick={() => I.setMode("bio")} />
                                        </> :
                                        <>
                                            <RawIcon onClick={resetSelectedMessages}>square-x</RawIcon>
                                            <div style={{ color: "orange", marginRight: "10px" }}>
                                                <i>undo<br />changes</i>
                                            </div>

                                            <RawIcon onClick={deleteSelectedMessages} >trash</RawIcon>
                                            <div style={{ color: "orange" }}>
                                                <i>delete<br />selected</i>
                                            </div>
                                        </>
                                    }

                                </ConversationHeader.Actions>
                            </ConversationHeader>
                            {/* TODO add typing indication.... */}
                            <MessageList
                                className={I.theme}
                                typingIndicator={true?"":<TypingIndicator content={I.typingIndicator} />}>
                                <MessageItems I={I} ></MessageItems>
                            </MessageList>
                            <MessageInput attachButton={false} onSend={(v) => I.sendMessage(v)} className={I.theme} placeholder="Type message here" />
                        </ChatContainer>
                    </div>
                </R>
            </R>
        </R>
    );
}

export default Chat;
