import { R, C, pass } from "rectangles-npm"
import Branding from "./Branding"
import { Icon } from "./Icon"
import { Search } from '@chatscope/chat-ui-kit-react'

function EditButton() {
    return <i style={{ color: "orange", margin: "10px" }} className={"fa fa-pencil fa-2x font-weight-bold"}></i>
}

function BackButton() {
    return <i style={{ color: "orange", margin: "10px" }} className={"fa fa-arrow-rotate-left fa-2z  font-weight-bold"}></i>
}


function EditBulletin() {
    return <i style={{ color: "pink", margin: "10px" }} className={"fa fa-trash fa-2x font-weight-bold"}></i>
}

/* Top Bar of web10 social */
function TopBar(props) {
    const I = props.I;

    function saveBioChanges(){
        I.saveIdentityChanges();
        I.setMode("my-bio");
    }

    function cancelIdentityChanges(){
        I.cancelIdentityChanges();
        I.setMode("my-bio");
    }

    return (
        <R l bb s={"55px"} {...pass(props)}>
            <Branding />
            <R l s={"110px"}>
                <Icon onClick={I.toggleMenuCollapsed}>bars</Icon>
                <Icon onClick={I.toggleTheme}>moon</Icon>
            </R>
            <C l tel>
            
                    <Search onClearClick={() => I.runSearch("")} onChange={(v) => I.runSearch(v)} style={{ width: "100%", marginRight: "30px" }} placeholder="Search..." />

            </C>
            {I.mode === "bio" ?
                <C r s={"110px"} onClick={() => I.setMode("chat")}>
                    <BackButton></BackButton><i style={{ color: "orange", }}><u>Go Back</u></i>
                </C> : <C r s={"0px"}></C>
            }
            {I.mode === "chat" ?
                <C r s={"110px"} onClick={() => I.setMode("contacts")}>
                    <BackButton></BackButton><i style={{ color: "orange", }}><u>Go Back</u></i>
                </C> : <C r s={"0px"}></C>
            }

            {I.mode === "my-bio" ?
                <C r h s={"110px"} onClick={() => I.setMode("bio-edit")}>
                    <i style={{ color: "orange", }}><u>Edit Bio</u></i> <EditButton></EditButton>
                </C> : <C r s={"0px"}></C>
            }
            {I.mode === "my-bio" ?
                <C h r s={"110px"} onClick={() => I.setMode("bulletin-edit")}>
                    <i style={{ color: "pink", }}><u>Edit Bulletin</u></i> <EditBulletin></EditBulletin>
                </C> : <C r s={"0px"}></C>
            }
            {I.mode === "bio-edit" ?
                <C r s={"240px"}>
                    <button onClick={saveBioChanges} className="button is-primary is-small" style={{ marginRight: "20px", width: "100px" }}>save</button>
                    <button style={{ width: "100px" }} onClick={cancelIdentityChanges} className="button is-danger is-small">cancel</button>
                </C> : <C r s={"0px"}></C>
            }

            {I.mode === "bulletin-edit" ?
                <C r s={"120px"}>
                    <button onClick={() => I.setMode("my-bio")} className="button is-warning is-small" style={{ marginRight: "20px", width: "100px" }}>go back</button>
                </C> : <C r s={"0px"}></C>
            }


            <R t s={"20px"}></R>
        </R>
    )
}

export default TopBar;