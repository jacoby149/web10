import { R, C } from 'rectangles-npm'
import { Search, ChatContainer, ConversationHeader, Avatar, VoiceCallButton, VideoCallButton, InfoButton, MessageList, TypingIndicator, MessageSeparator, Message, MessageInput } from '@chatscope/chat-ui-kit-react'
import styles from '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import emilyIco from "../../assets/images/avatar1.svg"


function Identity({ I }) {
    const identity = I.mode === "bio" ? I.currentContact : I.draftIdentity;
    function setName(name) {
        I.setDraftIdentity({
            name: name,
            web10: I.draftIdentity.web10,
            pic: I.draftIdentity.pic,
            bio: I.draftIdentity.bio
        })
    }
    function setPic(pic) {
        let reader = new FileReader();
        reader.readAsDataURL(pic);
        reader.onload = function () {
            I.setDraftIdentity({
                name: I.draftIdentity.name,
                web10: I.draftIdentity.web10,
                pic: reader.result,
                bio: I.draftIdentity.bio
            })
        };
    }
    function setBio(bio) {
        I.setDraftIdentity({
            name: I.draftIdentity.name,
            web10: I.draftIdentity.web10,
            pic: I.draftIdentity.pic,
            bio: bio
        })
    }
    return (
        <R t theme={I.theme}>
            <C t ha="center" va="center">
                <Avatar style={{ margin: "20px" }} size={"lg"} src={identity.pic} name="Emily" />
                {
                    I.mode === "bio-edit" ?
                        <label>
                            <input
                                type="file"
                                style={{ display: "none" }}
                                accept="image/*"
                                onChange={(event) => {
                                    const selectedImage = event.target.files[0]
                                    setPic(selectedImage);
                                }}
                            />
                            <a className="button is-warning is-small">upload photo</a>
                        </label>

                        : ""
                }
            </C>
            <R t ns s={"24px"} h>
                <div className="columns is-centered">
                    <div className="column has-text-centered is-4">
                        {
                            I.mode === "bio-edit" ?
                                <i>[
                                    <input
                                        onChange={(e) => setName(e.target.value)}
                                        size="22" style={{ color: "gold" }}
                                        defaultValue={identity.name}>
                                    </input>
                                    ]
                                </i> :
                                <i>name : {identity.name}</i>
                        }
                    </div>
                </div>
            </R>
            <R t bb ns s={"30px"} h>
                <div className="columns is-centered">
                    <div className="column has-text-centered is-4">
                        {
                            I.mode === "bio-edit" ?
                                <i>[
                                    <input
                                        onChange={(e) => setBio(e.target.value)}
                                        size="32" style={{ color: "gold" }}
                                        defaultValue={identity.bio}>
                                    </input>]</i> :
                                <i>bio : {identity.bio}</i>
                        }
                    </div>
                </div>
            </R>
        </R>)
}

export default Identity;