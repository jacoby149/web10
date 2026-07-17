import { Search, ChatContainer, ConversationHeader, Avatar, VoiceCallButton, VideoCallButton, InfoButton, TypingIndicator, MessageInput, MessageList, Message, MessageSeparator } from '@chatscope/chat-ui-kit-react';
import emilyIco from "../../assets/images/avatar1.svg"
import React from 'react';

function TSMessage({ model, I, mostRecent }) {
    const [showTime, setShowTime] = React.useState(mostRecent);
    const [selected, setSelected] = React.useState(false)
    const contact = I.isMe(model.web10) ? I.identity : I.getContact(model.web10)

    function toggleShowTime() {
        setShowTime(!showTime);
    }
    function toggleSelected() {
        selected ? I.deSelectMessage(model._id) : I.selectMessage(model._id)
        setSelected(!selected);
    }
    function onClick() {
        if (I.mode === "chat-edit") toggleSelected();
        else toggleShowTime();
    }

    React.useEffect(() => setSelected(false), [I.mode])

    // normal and last should look like first and single when time is expanded.
    const translatedModel = { ...model };
    if (showTime && model.position === "normal") translatedModel.position = "first";
    else if (showTime && model.position === "last") translatedModel.position = "single";
    translatedModel.sentTime = new Date(model.sentTime).toLocaleTimeString();

    return (
        <Message onClick={onClick} model={translatedModel} className={`${I.theme} ${selected ? "selected" : ""}`} >
            {
                (model.position === "first" || model.position === "single") ?
                    <Message.Header sender={contact.name} /> :
                    ""
            }
            {showTime ? <Message.Footer sentTime={translatedModel.sentTime} /> : ""}
        </Message>
    );
}

export default TSMessage;